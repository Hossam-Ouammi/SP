const express = require("express");

const {
  recupererMonetisation,
  telechargerReleveMonetisation,
} = require("../controllers/monetisation.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesMonetisation,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
} = require("../middleware/scope.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);
router.use(chargerScopeAcces, verifierScopeHandlerCourant);
router.use(verifierAccesMonetisation);

router.get("/releve", telechargerReleveMonetisation);
router.get("/", recupererMonetisation);

module.exports = router;
