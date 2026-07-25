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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      tier TEXT,
      name TEXT NOT NULL,
      description TEXT,
      components JSONB NOT NULL,
      price NUMERIC NOT NULL,
      image TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

  const { rows: buildRows } = await pool.query("SELECT COUNT(*)::int AS count FROM builds");
  if (buildRows[0].count === 0) {
    const buildsPath = path.join(__dirname, "data", "builds.json");
    if (fs.existsSync(buildsPath)) {
      const seed = JSON.parse(fs.readFileSync(buildsPath, "utf-8"));
      for (const b of seed) {
        await pool.query(
          `INSERT INTO builds (id, brand, tier, name, description, components, price, image)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [b.id, b.brand, b.tier, b.name, b.description, b.components, b.price, b.image]
        );
      }
      console.log(`🌱 Загружено ${seed.length} готовых сборок из builds.json в базу данных.`);
    }
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

async function createProduct(p) {
  await pool.query(
    `INSERT INTO products (id, category, brand, name, price, stock, image, specs, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.id, p.category, p.brand, p.name, p.price, p.stock, p.image, JSON.stringify(p.specs), p.description]
  );
  return getProductById(p.id);
}

async function updateProduct(id, p) {
  await pool.query(
    `UPDATE products SET category=$2, brand=$3, name=$4, price=$5, stock=$6, image=$7, specs=$8, description=$9
     WHERE id=$1`,
    [id, p.category, p.brand, p.name, p.price, p.stock, p.image, JSON.stringify(p.specs), p.description]
  );
  return getProductById(id);
}

async function deleteProduct(id) {
  await pool.query("DELETE FROM products WHERE id = $1", [id]);
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

// ---------- Управление товарами (админка) ----------
async function createProduct(p) {
  await pool.query(
    `INSERT INTO products (id, category, brand, name, price, stock, image, specs, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.id, p.category, p.brand, p.name, p.price, p.stock, p.image, JSON.stringify(p.specs || {}), p.description]
  );
  return getProductById(p.id);
}

async function updateProduct(id, p) {
  await pool.query(
    `UPDATE products SET category=$2, brand=$3, name=$4, price=$5, stock=$6, image=$7, specs=$8, description=$9
     WHERE id=$1`,
    [id, p.category, p.brand, p.name, p.price, p.stock, p.image, JSON.stringify(p.specs || {}), p.description]
  );
  return getProductById(id);
}

async function deleteProduct(id) {
  await pool.query("DELETE FROM products WHERE id = $1", [id]);
}

// ---------- Готовые сборки ----------
function rowToBuild(row) {
  return {
    id: row.id,
    brand: row.brand,
    tier: row.tier,
    name: row.name,
    description: row.description,
    components: row.components,
    price: Number(row.price),
    image: row.image,
  };
}

async function getBuilds() {
  const { rows } = await pool.query("SELECT * FROM builds ORDER BY price ASC");
  return rows.map(rowToBuild);
}

async function getBuildById(id) {
  const { rows } = await pool.query("SELECT * FROM builds WHERE id = $1", [id]);
  return rows[0] ? rowToBuild(rows[0]) : null;
}

// ---------- Отзывы на сборки ----------
function rowToReview(row) {
  return {
    id: row.id,
    buildId: row.build_id,
    author: row.author,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at,
  };
}

async function getReviewsForBuild(buildId) {
  const { rows } = await pool.query(
    "SELECT * FROM reviews WHERE build_id = $1 ORDER BY created_at DESC",
    [buildId]
  );
  return rows.map(rowToReview);
}

async function createReview(buildId, { author, rating, text }) {
  const { rows } = await pool.query(
    `INSERT INTO reviews (build_id, author, rating, text)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [buildId, author, rating, text]
  );
  return rowToReview(rows[0]);
}

module.exports = {
  init,
  getProducts,
  getProductById,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  getCart,
  saveCart,
  clearCart,
  createOrder,
  getOrderById,
  getAllOrders,
  getBuilds,
  getBuildById,
  getReviewsForBuild,
  createReview,
};
