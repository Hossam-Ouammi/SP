const express = require("express");

const {
  recupererVueAdministration,
  ajouterElementCatalogueAdministration,
  supprimerElementCatalogueAdministration,
  restaurerElementCatalogueAdministration,
  creerUtilisateurAdministration,
  supprimerUtilisateurAdministration,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesUtilisateur,
  mettreAJourLectureSeuleUtilisateur,
  mettreAJourAccesAujourdhuiUtilisateur,
  mettreAJourAccesIndisponibilitesUtilisateur,
  mettreAJourAccesMonetisationUtilisateur,
  mettreAJourTarifCompteUtilisateur,
  revoquerSessionAdministration,
  revoquerSessionsUtilisateurAdministration,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
  recupererJournalAuthentification,
  recupererToutesLesSessions,
  revoquerSessionSpecifique,
  recupererIpsBloquees,
  bloquerNouvelleIp,
  debloquerIpExistante,
  revoquerAppareilAutoLoginAdministration,
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
router.delete(
  "/catalogue-items/:id",
  notifierMiseAJourApplication(supprimerElementCatalogueAdministration, "catalogue")
);
router.post(
  "/catalogue-items/:id/restore",
  notifierMiseAJourApplication(restaurerElementCatalogueAdministration, "catalogue")
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
  "/today-access",
  notifierMiseAJourApplication(mettreAJourAccesAujourdhuiUtilisateur, "administration")
);
router.patch(
  "/unavailability-access",
  notifierMiseAJourApplication(mettreAJourAccesIndisponibilitesUtilisateur, "administration")
);
router.patch(
  "/monetisation-access",
  notifierMiseAJourApplication(mettreAJourAccesMonetisationUtilisateur, "administration")
);
router.patch(
  "/hourly-rate",
  notifierMiseAJourApplication(mettreAJourTarifCompteUtilisateur, "administration")
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

router.get("/audit-logins", recupererJournalAuthentification);
router.get("/sessions", recupererToutesLesSessions);
router.post(
  "/sessions/revoke-sid",
  notifierMiseAJourApplication(revoquerSessionSpecifique, "administration")
);
router.get("/blocked-ips", recupererIpsBloquees);
router.post(
  "/blocked-ips",
  notifierMiseAJourApplication(bloquerNouvelleIp, "administration")
);
router.delete(
  "/blocked-ips/:ip",
  notifierMiseAJourApplication(debloquerIpExistante, "administration")
);
router.delete(
  "/trusted-devices/:id",
  notifierMiseAJourApplication(revoquerAppareilAutoLoginAdministration, "administration")
);


module.exports = router;
