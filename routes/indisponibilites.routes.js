const express = require("express");

const {
  recupererIndisponibilites,
  dupliquerSemaineIndisponibilites,
  redimensionnerIndisponibilite,
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
  verifierDeclarationDisponibiliteProfesseur,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierAccesIndisponibilites
);

router.get("/", recupererIndisponibilites);
router.post("/dupliquer-semaine", verifierModeEcritureAutorise, verifierDeclarationDisponibiliteProfesseur,
  notifierMiseAJourApplication(dupliquerSemaineIndisponibilites, "indisponibilites"));
router.patch("/:id/plage", verifierModeEcritureAutorise, verifierDeclarationDisponibiliteProfesseur,
  notifierMiseAJourApplication(redimensionnerIndisponibilite, "indisponibilites"));
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
