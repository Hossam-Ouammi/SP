const express = require("express");

const { recupererMonetisation } = require("../controllers/monetisation.controller");
const {
  verifierAuthentification,
  verifierAccesMonetisation,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierAccesMonetisation);

router.get("/", recupererMonetisation);

module.exports = router;
