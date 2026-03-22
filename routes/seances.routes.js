const express = require("express");

const {
  recupererToutesLesSeances,
  recupererOptionsSeances,
  recupererUneSeance,
  ajouterSeance,
  modifierSeance,
  changerStatutSeance,
  supprimerUneSeance,
} = require("../controllers/seances.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);

router.get("/", recupererToutesLesSeances);
router.get("/options", recupererOptionsSeances);
router.get("/:id", recupererUneSeance);
router.post("/", verifierModeEcritureAutorise, notifierMiseAJourApplication(ajouterSeance, "seances"));
router.put(
  "/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(modifierSeance, "seances")
);
router.patch(
  "/:id/statut",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(changerStatutSeance, "seances")
);
router.delete(
  "/:id",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(supprimerUneSeance, "seances")
);

module.exports = router;
