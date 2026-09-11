const express = require("express");

const {
  listerProfesseurs,
  listerTarificationMatieres,
  ajouterMatiereEquipe,
  modifierMatiereEquipe,
  supprimerMatiereEquipe,
  modifierTarifsMatieresEquipe,
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
router.get("/tarification", listerTarificationMatieres);
router.post(
  "/matieres",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(ajouterMatiereEquipe, "team")
);
router.patch(
  "/matieres/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierMatiereEquipe, "team")
);
router.delete(
  "/matieres/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(supprimerMatiereEquipe, "team")
);
router.put(
  "/tarification",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierTarifsMatieresEquipe, "team")
);
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
