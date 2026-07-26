const express = require("express");
const router = express.Router();
const db = require("../db");

// Stripe подключается лениво и только если задан STRIPE_SECRET_KEY.
// Без ключа сервер работает в mock-режиме: заказ сразу помечается оплаченным.
// Это удобно для локальной разработки/демо без реальной оплаты.
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
}

async function getCartItemsWithProducts(sessionId) {
  const cart = await db.getCart(sessionId);
  const rawItems = await Promise.all(
    cart.items.map(async (item) => {
      const product = await db.getProductById(item.productId);
      return { ...item, product };
    })
  );
  return rawItems.filter((i) => i.product);
}

// selection: { productIds: [...], groupIds: [...] } — какие позиции/сборки оформляем сейчас.
// Если не передана (или пустая) — оформляем всё, что есть в корзине (старое поведение).
function filterBySelection(items, selection) {
  const hasSelection = selection && ((selection.productIds && selection.productIds.length) || (selection.groupIds && selection.groupIds.length));
  if (!hasSelection) return items;
  const productIds = new Set(selection.productIds || []);
  const groupIds = new Set(selection.groupIds || []);
  return items.filter((i) => (i.groupId ? groupIds.has(i.groupId) : productIds.has(i.productId)));
}

// POST /api/checkout
// body: { customer: { name, email, phone, address }, selection?: { productIds: [...], groupIds: [...] } }
router.post("/", async (req, res) => {
  const { customer, selection } = req.body;
  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ error: "Заполните имя, email и адрес доставки" });
  }

  const allItems = await getCartItemsWithProducts(req.sessionId);
  const items = filterBySelection(allItems, selection);
  if (!items.length) {
    return res.status(400).json({ error: "Нечего оформлять — корзина пуста или ничего не выбрано" });
  }
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  const orderItems = items.map((i) => ({
    productId: i.productId,
    name: i.product.name,
    price: i.product.price,
    qty: i.qty,
    groupId: i.groupId || null,
    groupLabel: i.groupLabel || null,
  }));

  // Режим реальной оплаты через Stripe Checkout
  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: items.map((i) => ({
          price_data: {
            currency: "rub",
            product_data: { name: i.groupLabel ? `${i.groupLabel} — ${i.product.name}` : i.product.name },
            unit_amount: Math.round(i.product.price * 100),
          },
          quantity: i.qty,
        })),
        mode: "payment",
        success_url: `${req.protocol}://${req.get("host")}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get("host")}/cart.html`,
        customer_email: customer.email,
      });

      const order = await db.createOrder({
        customer,
        items: orderItems,
        total,
        status: "pending_payment",
        stripeSessionId: session.id,
      });

      return res.json({ mode: "stripe", checkoutUrl: session.url, orderId: order.id });
    } catch (err) {
      return res.status(500).json({ error: "Ошибка создания сессии оплаты: " + err.message });
    }
  }

  // Mock-режим: без ключей Stripe заказ сразу считается оплаченным (для демо/разработки)
  const order = await db.createOrder({
    customer,
    items: orderItems,
    total,
    status: "paid",
    paymentMode: "mock",
  });

  // Из корзины убираем только то, что реально оформили — остальное остаётся «на потом».
  const cart = await db.getCart(req.sessionId);
  const orderedKeys = new Set(items.map((i) => `${i.productId}::${i.groupId || ""}`));
  cart.items = cart.items.filter((i) => !orderedKeys.has(`${i.productId}::${i.groupId || ""}`));
  await db.saveCart(req.sessionId, cart);

  res.json({ mode: "mock", orderId: order.id });
});

// GET /api/checkout/order/:id
router.get("/order/:id", async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Заказ не найден" });
  res.json(order);
});

module.exports = router;
