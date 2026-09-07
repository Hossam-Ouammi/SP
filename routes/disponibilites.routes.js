const express = require("express");

const {
  recupererDisponibilites,
  recupererReglesDisponibilite,
  recupererExceptionsDisponibilite,
  ajouterRegleDisponibilite,
  modifierRegleDisponibiliteController,
  supprimerRegleDisponibiliteController,
  ajouterExceptionDisponibilite,
  modifierExceptionDisponibiliteController,
  supprimerExceptionDisponibiliteController,
} = require("../controllers/disponibilites.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesIndisponibilites,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant,
  verifierAccesIndisponibilites
);

router.get("/", recupererDisponibilites);
router.get("/regles", recupererReglesDisponibilite);
router.get("/exceptions", recupererExceptionsDisponibilite);
router.post(
  "/regles",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(ajouterRegleDisponibilite, "disponibilites")
);
router.patch(
  "/regles/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierRegleDisponibiliteController, "disponibilites")
);
router.delete(
  "/regles/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(supprimerRegleDisponibiliteController, "disponibilites")
);
router.post(
  "/exceptions",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(ajouterExceptionDisponibilite, "disponibilites")
);
router.patch(
  "/exceptions/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierExceptionDisponibiliteController, "disponibilites")
);
router.delete(
  "/exceptions/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(supprimerExceptionDisponibiliteController, "disponibilites")
);

module.exports = router;
