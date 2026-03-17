const express = require("express");

const {
  recupererVueAdministration,
  ajouterElementCatalogueAdministration,
  creerUtilisateurAdministration,
  supprimerUtilisateurAdministration,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesUtilisateur,
  mettreAJourLectureSeuleUtilisateur,
  mettreAJourAccesMonetisationUtilisateur,
  revoquerSessionAdministration,
  revoquerSessionsUtilisateurAdministration,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
} = require("../controllers/admin.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesAdministratifHossam,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise, verifierAccesAdministratifHossam);

router.get("/", recupererVueAdministration);
router.post("/catalogue-items", ajouterElementCatalogueAdministration);
router.post("/users", creerUtilisateurAdministration);
router.delete("/users/:id", supprimerUtilisateurAdministration);
router.post("/reset-password", reinitialiserMotDePasseCompte);
router.patch("/access", mettreAJourAccesUtilisateur);
router.patch("/read-only", mettreAJourLectureSeuleUtilisateur);
router.patch("/monetisation-access", mettreAJourAccesMonetisationUtilisateur);
router.post("/sessions/revoke", revoquerSessionAdministration);
router.post("/sessions/revoke-user", revoquerSessionsUtilisateurAdministration);
router.post("/clear-seances", supprimerToutesLesSeancesAdmin);
router.post("/clear-history", supprimerToutHistoriqueAdmin);

module.exports = router;
