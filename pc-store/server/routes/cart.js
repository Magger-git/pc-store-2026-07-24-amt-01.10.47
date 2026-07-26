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
        groupId: item.groupId || null,
        groupLabel: item.groupLabel || null,
        product,
        subtotal: product ? product.price * item.qty : 0,
      };
    })
  );
  const items = rawItems.filter((i) => i.product);
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);

  // Группируем позиции, добавленные вместе как сборка в конструкторе,
  // отдельно от товаров, докинутых по одному из каталога.
  const groupsMap = new Map();
  const individual = [];
  for (const item of items) {
    if (item.groupId) {
      if (!groupsMap.has(item.groupId)) {
        groupsMap.set(item.groupId, {
          groupId: item.groupId,
          groupLabel: item.groupLabel || "Сборка",
          items: [],
          subtotal: 0,
        });
      }
      const g = groupsMap.get(item.groupId);
      g.items.push(item);
      g.subtotal += item.subtotal;
    } else {
      individual.push(item);
    }
  }

  return { items, groups: [...groupsMap.values()], individual, total };
}

// GET /api/cart
router.get("/", async (req, res) => {
  const cart = await db.getCart(req.sessionId);
  res.json(await enrichCart(cart));
});

// POST /api/cart/add  { productId, qty, groupId?, groupLabel? }
router.post("/add", async (req, res) => {
  const { productId, qty = 1, groupId = null, groupLabel = null } = req.body;
  const product = await db.getProductById(productId);
  if (!product) return res.status(404).json({ error: "Товар не найден" });

  const cart = await db.getCart(req.sessionId);
  const existing = cart.items.find((i) => i.productId === productId && (i.groupId || null) === groupId);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({ productId, qty, groupId, groupLabel });
  }
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

// POST /api/cart/update { productId, qty, groupId? }
router.post("/update", async (req, res) => {
  const { productId, qty, groupId = null } = req.body;
  const cart = await db.getCart(req.sessionId);
  if (qty <= 0) {
    cart.items = cart.items.filter((i) => !(i.productId === productId && (i.groupId || null) === groupId));
  } else {
    const existing = cart.items.find((i) => i.productId === productId && (i.groupId || null) === groupId);
    if (existing) existing.qty = qty;
  }
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

// POST /api/cart/remove { productId, groupId? }
router.post("/remove", async (req, res) => {
  const { productId, groupId = null } = req.body;
  const cart = await db.getCart(req.sessionId);
  cart.items = cart.items.filter((i) => !(i.productId === productId && (i.groupId || null) === groupId));
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

// POST /api/cart/remove-group { groupId } — удаляет всю сборку целиком
router.post("/remove-group", async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: "Не передан groupId" });
  const cart = await db.getCart(req.sessionId);
  cart.items = cart.items.filter((i) => i.groupId !== groupId);
  await db.saveCart(req.sessionId, cart);
  res.json(await enrichCart(cart));
});

module.exports = router;
