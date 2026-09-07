const express = require("express");

const {
  listerProfesseurs,
  modifierProfesseur,
  envoyerResetProfesseur,
} = require("../controllers/equipe.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierRoleHandler,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierRoleHandler
);

router.get("/professeurs", listerProfesseurs);
router.patch(
  "/professeurs/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierProfesseur, "team")
);
router.post(
  "/professeurs/:id/password-reset",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(envoyerResetProfesseur, "team")
);

module.exports = router;
