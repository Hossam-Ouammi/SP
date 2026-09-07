const express = require("express");

const {
  recupererReglagesEspace,
  modifierFuseauHoraireEspace,
  modifierReglagesCalendrierEspace,
  modifierReglagesCalendrierPublic,
  regenererLienCalendrierPublic,
} = require("../controllers/workspace-settings.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const { chargerScopeAcces, verifierScopeHandlerCourant } = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant
);

router.get("/", recupererReglagesEspace);
router.patch(
  "/workspace",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierFuseauHoraireEspace, "settings")
);
router.patch(
  "/calendar",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierReglagesCalendrierEspace, "settings")
);
router.patch(
  "/public-calendar",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierReglagesCalendrierPublic, "settings")
);
router.post(
  "/public-calendar/regenerate",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(regenererLienCalendrierPublic, "settings")
);

module.exports = router;
