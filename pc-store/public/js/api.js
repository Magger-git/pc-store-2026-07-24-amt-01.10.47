const API = {
  async getProducts(category) {
    const url = category ? `/api/products?category=${encodeURIComponent(category)}` : "/api/products";
    const res = await fetch(url);
    return res.json();
  },
  async getProduct(id) {
    const res = await fetch(`/api/products/${id}`);
    return res.json();
  },
  async checkBuild(ids) {
    const res = await fetch("/api/builder/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    });
    return res.json();
  },
  async getCart() {
    const res = await fetch("/api/cart");
    return res.json();
  },
  async addToCart(productId, qty = 1) {
    const res = await fetch("/api/cart/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, qty }),
    });
    return res.json();
  },
  async updateCart(productId, qty) {
    const res = await fetch("/api/cart/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, qty }),
    });
    return res.json();
  },
  async removeFromCart(productId) {
    const res = await fetch("/api/cart/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    return res.json();
  },
  async checkout(customer) {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer }),
    });
    return res.json();
  },
  async getOrder(id) {
    const res = await fetch(`/api/checkout/order/${id}`);
    return res.json();
  },
};

const money = (n) => n.toLocaleString("ru-RU") + " ₽";

async function refreshCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  try {
    const cart = await API.getCart();
    const count = cart.items.reduce((s, i) => s + i.qty, 0);
    badge.textContent = count;
    badge.style.display = count ? "inline-block" : "none";
  } catch (e) {
    /* сеть недоступна — молча пропускаем */
  }
}

document.addEventListener("DOMContentLoaded", refreshCartBadge);
