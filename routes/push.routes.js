const express = require("express");

const {
  recupererConfigurationPush,
  enregistrerAbonnementPush,
  supprimerAbonnementPush,
  envoyerTestPush,
} = require("../controllers/push.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise);

router.get("/config", recupererConfigurationPush);
router.post("/subscribe", enregistrerAbonnementPush);
router.post("/unsubscribe", supprimerAbonnementPush);
router.post("/test", envoyerTestPush);

module.exports = router;
