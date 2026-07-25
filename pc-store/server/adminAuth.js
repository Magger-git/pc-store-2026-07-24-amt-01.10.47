// Простая защита админки паролем (переменная окружения ADMIN_PASSWORD).
// Не рассчитано на множество администраторов или сложную ролевую модель —
// для одного владельца магазина этого достаточно.

const crypto = require("crypto");

function expectedToken() {
  const password = process.env.ADMIN_PASSWORD || "admin";
  return crypto.createHash("sha256").update(password).digest("hex");
}

function requireAdmin(req, res, next) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter((pair) => pair[0])
  );
  if (cookies.admin_auth && cookies.admin_auth === expectedToken()) {
    return next();
  }
  res.status(401).json({ error: "Требуется авторизация администратора" });
}

function login(req, res) {
  const { password } = req.body || {};
  const password_ok = password && password === (process.env.ADMIN_PASSWORD || "admin");
  if (!password_ok) {
    return res.status(401).json({ error: "Неверный пароль" });
  }
  res.setHeader(
    "Set-Cookie",
    `admin_auth=${expectedToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
  res.json({ ok: true });
}

function logout(req, res) {
  res.setHeader("Set-Cookie", "admin_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
}

module.exports = { requireAdmin, login, logout };
