const express = require("express");

const {
  recupererIndisponibilites,
  ajouterIndisponibilite,
  supprimerUneIndisponibilite,
} = require("../controllers/indisponibilites.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesHossamUniquement,
} = require("../middleware/auth.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise);

router.get("/", recupererIndisponibilites);
router.post(
  "/",
  verifierAccesHossamUniquement,
  notifierMiseAJourApplication(ajouterIndisponibilite, "indisponibilites")
);
router.delete(
  "/:id",
  verifierAccesHossamUniquement,
  notifierMiseAJourApplication(supprimerUneIndisponibilite, "indisponibilites")
);

module.exports = router;
