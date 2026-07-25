const express = require("express");
const router = express.Router();
const db = require("../db");
const { checkBuild } = require("../compatibility");

// POST /api/builder/check
// body: { cpu: "cpu-r5-7600", motherboard: "mb-b650-tomahawk", ram: "...", gpu: "...", storage: "...", psu: "...", case: "..." }
router.post("/check", async (req, res) => {
  const ids = req.body || {};
  const build = {};
  let total = 0;

  for (const key of ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case"]) {
    if (ids[key]) {
      const product = await db.getProductById(ids[key]);
      if (!product) {
        return res.status(400).json({ error: `Товар с id "${ids[key]}" не найден (поле ${key})` });
      }
      build[key] = product;
      total += product.price;
    } else {
      build[key] = null;
    }
  }

  const result = checkBuild(build);
  res.json({ ...result, total, build });
});

module.exports = router;
