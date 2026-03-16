const express = require("express");
const {
  connecterUtilisateur,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", connecterUtilisateur);
router.post("/logout", deconnecterUtilisateur);
router.get("/me", recupererUtilisateurConnecte);

module.exports = router;
