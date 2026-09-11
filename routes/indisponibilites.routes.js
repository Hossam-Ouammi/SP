const express = require("express");

const {
  recupererIndisponibilites,
  ajouterIndisponibilite,
  modifierUneIndisponibilite,
  supprimerUneIndisponibilite,
} = require("../controllers/indisponibilites.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesIndisponibilites,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
  verifierDeclarationDisponibiliteProfesseur,
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

router.get("/", recupererIndisponibilites);
router.post(
  "/",
  verifierModeEcritureAutorise,
  verifierDeclarationDisponibiliteProfesseur,
  notifierMiseAJourApplication(ajouterIndisponibilite, "indisponibilites")
);
router.put(
  "/:id",
  verifierModeEcritureAutorise,
  verifierDeclarationDisponibiliteProfesseur,
  notifierMiseAJourApplication(modifierUneIndisponibilite, "indisponibilites")
);
router.delete(
  "/:id",
  verifierModeEcritureAutorise,
  verifierDeclarationDisponibiliteProfesseur,
  notifierMiseAJourApplication(supprimerUneIndisponibilite, "indisponibilites")
);

module.exports = router;
