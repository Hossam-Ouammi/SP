const express = require("express");

const { ouvrirFluxTempsReel } = require("../controllers/realtime.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise);
router.get("/", ouvrirFluxTempsReel);

module.exports = router;
