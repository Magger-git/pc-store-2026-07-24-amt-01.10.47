const express = require("express");
const router = express.Router();
const db = require("../db");

async function enrichCart(cart) {
  const rawItems = await Promise.all(
    cart.items.map(async (item) => {
      const product = await db.getProductById(item.productId);
      return {
        productId: item.productId,
        qty: item.qty,
        product,
        subtotal: product ? product.price * item.qty : 0,
      };
    })
  );
  const items = rawItems.filter((i) => i.product);
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  return { items, total };
}

// GET /api/cart
router.get("/", async (req, res) => {
  const cart = await db.getCart(req.sessionId);
  res.json(await enrichCart(cart));
});

// POST /api/cart/add  { productId, qty }
router.post("/add", async (req, res) => {
  const { productId, qty = 1 } = req.body;
  const product = await db.getProductById(productId);
  if (!product) return res.status(404).json({ error: "Товар не найден" });

  const cart = await db.getCart(req.sessionId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({ productId, qty });
  }
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

// POST /api/cart/update { productId, qty }
router.post("/update", async (req, res) => {
  const { productId, qty } = req.body;
  const cart = await db.getCart(req.sessionId);
  if (qty <= 0) {
    cart.items = cart.items.filter((i) => i.productId !== productId);
  } else {
    const existing = cart.items.find((i) => i.productId === productId);
    if (existing) existing.qty = qty;
  }
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

// POST /api/cart/remove { productId }
router.post("/remove", async (req, res) => {
  const { productId } = req.body;
  const cart = await db.getCart(req.sessionId);
  cart.items = cart.items.filter((i) => i.productId !== productId);
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

module.exports = router;
