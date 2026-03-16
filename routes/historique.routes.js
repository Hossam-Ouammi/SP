const express = require("express");

const {
  recupererHistorique,
  recupererDetailHistorique,
} = require("../controllers/historique.controller");
const { verifierAuthentification } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification);

router.get("/", recupererHistorique);
router.get("/:id", recupererDetailHistorique);

module.exports = router;
