const express = require("express");

const {
  recupererToutesLesSeances,
  recupererUneSeance,
  ajouterSeance,
  modifierSeance,
  changerStatutSeance,
  supprimerUneSeance,
} = require("../controllers/seances.controller");
const { verifierAuthentification } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification);

router.get("/", recupererToutesLesSeances);
router.get("/:id", recupererUneSeance);
router.post("/", ajouterSeance);
router.put("/:id", modifierSeance);
router.patch("/:id/statut", changerStatutSeance);
router.delete("/:id", supprimerUneSeance);

module.exports = router;
