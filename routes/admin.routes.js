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
  executerMaintenanceSqliteAdministration,
  recupererJournalAuthentification,
  recupererToutesLesSessions,
  revoquerSessionSpecifique,
  recupererIpsBloquees,
  bloquerNouvelleIp,
  debloquerIpExistante,
  revoquerAppareilAutoLoginAdministration,
} = require("../controllers/admin.controller");
const {
  listerDemandesEnAttente,
  approuverDemande,
  refuserDemande,
  renvoyerActivation,
} = require("../controllers/account-lifecycle.controller");
const {
  recupererHistorique,
  recupererDetailHistorique,
  activerModeAdministration,
} = require("../controllers/historique.controller");
const {
  transfererProfesseurAdministration,
} = require("../controllers/professeur-transfer.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierRoleSuperAdmin,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

function fonctionnaliteLegacyDesactivee(message) {
  return (req, res) =>
    res.status(410).json({
      message,
      code: "LEGACY_ADMIN_WORKFLOW_DISABLED",
    });
}

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierRoleSuperAdmin
);

// A global account-request/audit view is available only under the explicit
// SuperAdmin router.  This marker avoids widening the normal Handler view for
// a person who has both roles.
router.use(activerModeAdministration);

router.get("/", recupererVueAdministration);
router.get("/account-requests", listerDemandesEnAttente);
router.post(
  "/account-requests/:id/approve",
  verifierModeEcritureAutorise,
  approuverDemande
);
router.post(
  "/account-requests/:id/reject",
  verifierModeEcritureAutorise,
  refuserDemande
);
router.post(
  "/account-requests/:id/resend-activation",
  verifierModeEcritureAutorise,
  renvoyerActivation
);
router.get("/history", recupererHistorique);
router.get("/history/:id", recupererDetailHistorique);
router.post(
  "/professeurs/:id/transfer",
  verifierModeEcritureAutorise,
  transfererProfesseurAdministration
);
router.post(
  "/catalogue-items",
  notifierMiseAJourApplication(ajouterElementCatalogueAdministration, "catalogue")
);
router.delete(
  "/users/:id",
  notifierMiseAJourApplication(supprimerUtilisateurAdministration, "administration")
);
router.delete(
  "/catalogue-items/:id",
  notifierMiseAJourApplication(supprimerElementCatalogueAdministration, "catalogue")
);
router.post(
  "/catalogue-items/:id/restore",
  notifierMiseAJourApplication(restaurerElementCatalogueAdministration, "catalogue")
);
router.post(
  "/users",
  fonctionnaliteLegacyDesactivee(
    "La création directe est remplacée par le workflow de demande et d'activation sécurisé."
  )
);
router.post(
  "/reset-password",
  fonctionnaliteLegacyDesactivee(
    "Le mot de passe n'est jamais défini par un administrateur ; envoyez un lien sécurisé."
  )
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
  fonctionnaliteLegacyDesactivee("La suppression globale des séances est désactivée.")
);
router.post(
  "/clear-history",
  fonctionnaliteLegacyDesactivee("Le journal d'actions est immuable et ne peut pas être effacé.")
);
router.post(
  "/maintenance/sqlite",
  notifierMiseAJourApplication(executerMaintenanceSqliteAdministration, "administration")
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
