const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  listerHandlersPublics,
  soumettreDemandeInscription,
  demanderReinitialisationMotDePasse,
  activerCompte,
  confirmerReinitialisationMotDePasse,
  listerDemandesEnAttente,
  approuverDemande,
  refuserDemande,
  renvoyerActivation,
} = require("../controllers/account-lifecycle.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const { chargerScopeAcces } = require("../middleware/scope.middleware");

const router = express.Router();

const limiteurDemandeCompte = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { message: "Trop de demandes. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});

const limiteurResetMotDePasse = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: {
    message:
      "Si un compte actif correspond à ces informations, un email de réinitialisation vient d'être envoyé.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const limiteurConfirmationJeton = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: { message: "Trop de tentatives. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoints. The application-wide Origin/Referer protection remains in
// force; CSRF is intentionally only required when a browser already carries a
// logged-in session (as configured globally in app.js).
router.get("/handlers", listerHandlersPublics);
router.post("/requests", limiteurDemandeCompte, soumettreDemandeInscription);
router.post(
  "/password-resets",
  limiteurResetMotDePasse,
  demanderReinitialisationMotDePasse
);
router.post("/activation", limiteurConfirmationJeton, activerCompte);
router.post(
  "/password-resets/confirm",
  limiteurConfirmationJeton,
  confirmerReinitialisationMotDePasse
);

// Reviewer endpoints. Scope is loaded after the normal session and password
// security gates. The controller narrows a Handler to their own team only.
router.use(verifierAuthentification, verifierCompteSecurise, chargerScopeAcces);
router.get("/requests", listerDemandesEnAttente);
router.post("/requests/:id/approve", verifierModeEcritureAutorise, approuverDemande);
router.post("/requests/:id/reject", verifierModeEcritureAutorise, refuserDemande);
router.post(
  "/requests/:id/resend-activation",
  verifierModeEcritureAutorise,
  renvoyerActivation
);

module.exports = router;
