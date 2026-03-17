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

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);

router.get("/", recupererToutesLesSeances);
router.get("/options", recupererOptionsSeances);
router.get("/:id", recupererUneSeance);
router.post("/", verifierModeEcritureAutorise, ajouterSeance);
router.put("/:id", verifierModeEcritureAutorise, modifierSeance);
router.patch("/:id/statut", verifierModeEcritureAutorise, changerStatutSeance);
router.delete("/:id", verifierModeEcritureAutorise, supprimerUneSeance);

module.exports = router;
