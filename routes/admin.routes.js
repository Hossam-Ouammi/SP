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
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise, verifierAccesAdministratifHossam);

router.get("/", recupererVueAdministration);
router.post(
  "/catalogue-items",
  notifierMiseAJourApplication(ajouterElementCatalogueAdministration, "catalogue")
);
router.post("/users", notifierMiseAJourApplication(creerUtilisateurAdministration, "administration"));
router.delete(
  "/users/:id",
  notifierMiseAJourApplication(supprimerUtilisateurAdministration, "administration")
);
router.post(
  "/reset-password",
  notifierMiseAJourApplication(reinitialiserMotDePasseCompte, "administration")
);
router.patch(
  "/access",
  notifierMiseAJourApplication(mettreAJourAccesUtilisateur, "administration")
);
router.patch(
  "/read-only",
  notifierMiseAJourApplication(mettreAJourLectureSeuleUtilisateur, "administration")
);
router.patch(
  "/monetisation-access",
  notifierMiseAJourApplication(mettreAJourAccesMonetisationUtilisateur, "administration")
);
router.post(
  "/sessions/revoke",
  notifierMiseAJourApplication(revoquerSessionAdministration, "administration")
);
router.post(
  "/sessions/revoke-user",
  notifierMiseAJourApplication(revoquerSessionsUtilisateurAdministration, "administration")
);
router.post(
  "/clear-seances",
  notifierMiseAJourApplication(supprimerToutesLesSeancesAdmin, "administration")
);
router.post(
  "/clear-history",
  notifierMiseAJourApplication(supprimerToutHistoriqueAdmin, "historique")
);

module.exports = router;
