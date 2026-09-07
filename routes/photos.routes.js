const express = require("express");

const {
  recupererPhotosDuneSeance,
  recupererFichierPhoto,
} = require("../controllers/photos.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
} = require("../middleware/scope.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);
router.use(chargerScopeAcces);
router.use(verifierScopeHandlerCourant);

router.get("/:photoId/file", recupererFichierPhoto);
router.get("/seance/:seanceId", recupererPhotosDuneSeance);

module.exports = router;
