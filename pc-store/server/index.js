require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const productsRouter = require("./routes/products");
const builderRouter = require("./routes/builder");
const cartRouter = require("./routes/cart");
const checkoutRouter = require("./routes/checkout");
const adminRouter = require("./routes/admin");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Простая идентификация сессии по cookie (без внешних библиотек).
// В продакшене замените на express-session / JWT.
app.use((req, res, next) => {
  const COOKIE_NAME = "sid";
  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter((pair) => pair[0])
  );
  let sid = cookies[COOKIE_NAME];
  if (!sid) {
    sid = crypto.randomUUID();
    res.append("Set-Cookie", `${COOKIE_NAME}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }
  req.sessionId = sid;
  next();
});

app.use("/api/products", productsRouter);
app.use("/api/builder", builderRouter);
app.use("/api/cart", cartRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/admin", adminRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

async function start() {
  try {
    await db.init();
    app.listen(PORT, () => {
      console.log(`🖥  PC Store запущен: http://localhost:${PORT}`);
      if (!process.env.STRIPE_SECRET_KEY) {
        console.log("ℹ️  STRIPE_SECRET_KEY не задан — оплата работает в mock-режиме (см. README).");
      }
    });
  } catch (err) {
    console.error("❌ Не удалось подключиться к базе данных / инициализировать схему.");
    console.error("   Проверьте переменную DATABASE_URL в файле .env — см. README.");
    console.error(err.message);
    process.exit(1);
  }
}

start();
