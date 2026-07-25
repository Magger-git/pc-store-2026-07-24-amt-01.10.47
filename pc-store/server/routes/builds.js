const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/builds?brand=amd|intel — список готовых сборок (без деталей компонентов),
// отсортирован по цене от дешёвых к дорогим.
router.get("/", async (req, res) => {
  let builds = await db.getBuilds();
  if (req.query.brand) {
    builds = builds.filter((b) => b.brand === req.query.brand);
  }
  res.json(builds);
});

// GET /api/builds/:id — сборка с полными данными по каждому компоненту.
router.get("/:id", async (req, res) => {
  const build = await db.getBuildById(req.params.id);
  if (!build) return res.status(404).json({ error: "Сборка не найдена" });

  const componentEntries = await Promise.all(
    Object.entries(build.components).map(async ([slot, productId]) => {
      const product = await db.getProductById(productId);
      return [slot, product];
    })
  );

  res.json({ ...build, components: Object.fromEntries(componentEntries) });
});

// GET /api/builds/:id/reviews
router.get("/:id/reviews", async (req, res) => {
  const build = await db.getBuildById(req.params.id);
  if (!build) return res.status(404).json({ error: "Сборка не найдена" });
  const reviews = await db.getReviewsForBuild(req.params.id);
  res.json(reviews);
});

// POST /api/builds/:id/reviews  { author, rating, text }
router.post("/:id/reviews", async (req, res) => {
  const build = await db.getBuildById(req.params.id);
  if (!build) return res.status(404).json({ error: "Сборка не найдена" });

  const { author, rating, text } = req.body || {};
  if (!author || !text || !rating) {
    return res.status(400).json({ error: "Заполните имя, оценку и текст отзыва" });
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "Оценка должна быть от 1 до 5" });
  }

  const review = await db.createReview(req.params.id, {
    author: String(author).slice(0, 60),
    rating: ratingNum,
    text: String(text).slice(0, 1000),
  });
  res.json(review);
});

module.exports = router;
