const express = require("express");

const {
  recupererIndisponibilitesCalendrierCentral,
} = require("../controllers/indisponibilites.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
  verifierRoleHandler,
} = require("../middleware/scope.middleware");

const router = express.Router();

// This router deliberately exposes only the derived data required by the
// Handler central calendar. It is not an alternate unavailability-management
// API: no mutation route is registered here.
router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant,
  verifierRoleHandler
);

router.get("/indisponibilites", recupererIndisponibilitesCalendrierCentral);

module.exports = router;
