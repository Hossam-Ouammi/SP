const express = require("express");

const { recupererStatistiques } = require("../controllers/statistiques.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
} = require("../middleware/scope.middleware");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant
);
router.get("/", recupererStatistiques);

module.exports = router;
