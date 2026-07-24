// Слой доступа к данным на PostgreSQL.
// Публичный интерфейс (getProducts, createOrder и т.д.) намеренно совпадает
// с прежней файловой реализацией, поэтому роуты почти не пришлось менять —
// только добавить await, так как запросы к БД асинхронные.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render и большинство облачных Postgres требуют SSL, но не имеют
  // доверенного корневого сертификата в контейнере — поэтому отключаем
  // строгую проверку. Для локальной БД (без ssl) это поле просто не мешает.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

function rowToProduct(row) {
  return {
    id: row.id,
    category: row.category,
    brand: row.brand,
    name: row.name,
    price: Number(row.price),
    stock: row.stock,
    image: row.image,
    specs: row.specs,
    description: row.description,
  };
}

function rowToOrder(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    customer: row.customer,
    items: row.items,
    total: Number(row.total),
    paymentMode: row.payment_mode,
    stripeSessionId: row.stripe_session_id,
  };
}

// ---------- Инициализация схемы + первичный сид товаров ----------
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      brand TEXT,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      specs JSONB NOT NULL DEFAULT '{}'::jsonb,
      description TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS carts (
      session_id TEXT PRIMARY KEY,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL,
      customer JSONB NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC NOT NULL,
      payment_mode TEXT,
      stripe_session_id TEXT
    );
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM products");
  if (rows[0].count === 0) {
    const seedPath = path.join(__dirname, "data", "products.json");
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
    for (const p of seed) {
      await pool.query(
        `INSERT INTO products (id, category, brand, name, price, stock, image, specs, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.category, p.brand, p.name, p.price, p.stock, p.image, p.specs, p.description]
      );
    }
    console.log(`🌱 Загружено ${seed.length} товаров из products.json в базу данных.`);
  }
}

// ---------- Товары ----------
async function getProducts() {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY category, name");
  return rows.map(rowToProduct);
}

async function getProductById(id) {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] ? rowToProduct(rows[0]) : null;
}

async function getProductsByCategory(category) {
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE category = $1 ORDER BY name",
    [category]
  );
  return rows.map(rowToProduct);
}

// ---------- Корзины (session-based) ----------
async function getCart(sessionId) {
  const { rows } = await pool.query("SELECT items FROM carts WHERE session_id = $1", [sessionId]);
  return { items: rows[0] ? rows[0].items : [] };
}

async function saveCart(sessionId, cart) {
  await pool.query(
    `INSERT INTO carts (session_id, items, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (session_id) DO UPDATE SET items = $2, updated_at = now()`,
    [sessionId, JSON.stringify(cart.items)]
  );
  return cart;
}

async function clearCart(sessionId) {
  await pool.query("DELETE FROM carts WHERE session_id = $1", [sessionId]);
}

// ---------- Заказы ----------
async function createOrder(order) {
  const id = "ORD-" + Date.now().toString(36).toUpperCase();
  const status = order.status || "paid";
  const { rows } = await pool.query(
    `INSERT INTO orders (id, status, customer, items, total, payment_mode, stripe_session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      id,
      status,
      JSON.stringify(order.customer),
      JSON.stringify(order.items),
      order.total,
      order.paymentMode || null,
      order.stripeSessionId || null,
    ]
  );
  return rowToOrder(rows[0]);
}

async function getOrderById(id) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

async function getAllOrders() {
  const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
  return rows.map(rowToOrder);
}

module.exports = {
  init,
  getProducts,
  getProductById,
  getProductsByCategory,
  getCart,
  saveCart,
  clearCart,
  createOrder,
  getOrderById,
  getAllOrders,
};
