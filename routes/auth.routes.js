const express = require("express");
const {
  connecterUtilisateur,
  modifierMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
} = require("../controllers/auth.controller");
const { verifierAuthentification } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", connecterUtilisateur);
router.post("/logout", deconnecterUtilisateur);
router.get("/me", recupererUtilisateurConnecte);
router.patch("/password", verifierAuthentification, modifierMotDePasse);

module.exports = router;
