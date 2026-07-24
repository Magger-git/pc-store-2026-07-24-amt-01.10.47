const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/products?category=cpu
router.get("/", async (req, res) => {
  const { category } = req.query;
  const products = category ? await db.getProductsByCategory(category) : await db.getProducts();
  res.json(products);
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  const product = await db.getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: "Товар не найден" });
  res.json(product);
});

module.exports = router;
