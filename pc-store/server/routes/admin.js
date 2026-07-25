const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAdmin, login, logout } = require("../adminAuth");

// POST /api/admin/login  { password }
router.post("/login", login);

// POST /api/admin/logout
router.post("/logout", logout);

// GET /api/admin/check — проверить, авторизован ли уже (для восстановления сессии на фронте)
router.get("/check", requireAdmin, (req, res) => res.json({ ok: true }));

// Всё, что ниже, требует авторизации администратора
router.use(requireAdmin);

// GET /api/admin/products — полный список товаров для таблицы управления
router.get("/products", async (req, res) => {
  const products = await db.getProducts();
  res.json(products);
});

// POST /api/admin/products — создать новый товар
router.post("/products", async (req, res) => {
  const p = req.body;
  if (!p.id || !p.category || !p.name || p.price == null) {
    return res.status(400).json({ error: "Заполните обязательные поля: id, category, name, price" });
  }
  const existing = await db.getProductById(p.id);
  if (existing) {
    return res.status(400).json({ error: `Товар с id "${p.id}" уже существует` });
  }
  try {
    const created = await db.createProduct({
      id: p.id,
      category: p.category,
      brand: p.brand || "",
      name: p.name,
      price: Number(p.price),
      stock: Number(p.stock) || 0,
      image: p.image || `${p.category}.svg`,
      specs: p.specs || {},
      description: p.description || "",
    });
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: "Ошибка создания товара: " + err.message });
  }
});

// PUT /api/admin/products/:id — обновить товар
router.put("/products/:id", async (req, res) => {
  const existing = await db.getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Товар не найден" });

  const p = req.body;
  try {
    const updated = await db.updateProduct(req.params.id, {
      category: p.category ?? existing.category,
      brand: p.brand ?? existing.brand,
      name: p.name ?? existing.name,
      price: p.price != null ? Number(p.price) : existing.price,
      stock: p.stock != null ? Number(p.stock) : existing.stock,
      image: p.image ?? existing.image,
      specs: p.specs ?? existing.specs,
      description: p.description ?? existing.description,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Ошибка обновления товара: " + err.message });
  }
});

// DELETE /api/admin/products/:id
router.delete("/products/:id", async (req, res) => {
  const existing = await db.getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Товар не найден" });
  await db.deleteProduct(req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/orders — список заказов (только просмотр)
router.get("/orders", async (req, res) => {
  const orders = await db.getAllOrders();
  res.json(orders);
});

module.exports = router;
