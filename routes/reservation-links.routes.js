const express = require("express");

const {
  recupererLiensReservation,
  creerLienReservationEtudiant,
  revoquerLienReservationEtudiant,
} = require("../controllers/reservation-links.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);

router.get("/", recupererLiensReservation);
router.post("/", verifierModeEcritureAutorise, creerLienReservationEtudiant);
router.delete("/:id", verifierModeEcritureAutorise, revoquerLienReservationEtudiant);

module.exports = router;
