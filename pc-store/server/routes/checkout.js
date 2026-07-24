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

async function getCartTotal(sessionId) {
  const cart = await db.getCart(sessionId);
  const rawItems = await Promise.all(
    cart.items.map(async (item) => {
      const product = await db.getProductById(item.productId);
      return { ...item, product };
    })
  );
  const items = rawItems.filter((i) => i.product);
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  return { items, total };
}

// POST /api/checkout
// body: { customer: { name, email, phone, address }, paymentMethod: "card" }
router.post("/", async (req, res) => {
  const { customer } = req.body;
  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ error: "Заполните имя, email и адрес доставки" });
  }

  const { items, total } = await getCartTotal(req.sessionId);
  if (!items.length) {
    return res.status(400).json({ error: "Корзина пуста" });
  }

  // Режим реальной оплаты через Stripe Checkout
  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: items.map((i) => ({
          price_data: {
            currency: "rub",
            product_data: { name: i.product.name },
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
        items: items.map((i) => ({ productId: i.productId, name: i.product.name, price: i.product.price, qty: i.qty })),
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
    items: items.map((i) => ({ productId: i.productId, name: i.product.name, price: i.product.price, qty: i.qty })),
    total,
    status: "paid",
    paymentMode: "mock",
  });
  await db.clearCart(req.sessionId);

  res.json({ mode: "mock", orderId: order.id });
});

// GET /api/checkout/order/:id
router.get("/order/:id", async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Заказ не найден" });
  res.json(order);
});

module.exports = router;
