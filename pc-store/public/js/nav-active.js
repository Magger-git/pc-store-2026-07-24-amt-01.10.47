// Автоматически подсвечивает активный пункт меню в шапке сайта
// в зависимости от текущей страницы. Подключать на каждой странице
// после разметки <nav class="nav">...</nav> (например, рядом с js/api.js).
(function () {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((link) => {
    const href = link.getAttribute("href").split("/").pop() || "index.html";
    const isActive =
      href === path ||
      (path === "" && href === "index.html") ||
      (path === "index.html" && href === "");
    link.classList.toggle("active", isActive);
  });
})();
