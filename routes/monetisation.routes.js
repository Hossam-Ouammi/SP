const express = require("express");

const {
  recupererMonetisation,
  telechargerReleveMonetisation,
} = require("../controllers/monetisation.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesMonetisation,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);
router.use(verifierAccesMonetisation);

router.get("/releve", telechargerReleveMonetisation);
router.get("/", recupererMonetisation);

module.exports = router;
