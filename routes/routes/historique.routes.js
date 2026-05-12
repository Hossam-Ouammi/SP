const express = require("express");

const {
  recupererHistorique,
  recupererDetailHistorique,
  supprimerEntreeHistoriqueAdministration,
} = require("../controllers/historique.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesAdministratifHossam,
} = require("../middleware/auth.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);

router.get("/", recupererHistorique);
router.get("/:id", recupererDetailHistorique);
router.delete(
  "/:id",
  verifierAccesAdministratifHossam,
  notifierMiseAJourApplication(supprimerEntreeHistoriqueAdministration, "historique")
);

module.exports = router;
