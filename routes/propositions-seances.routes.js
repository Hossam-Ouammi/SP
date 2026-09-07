const express = require("express");

const {
  recupererPropositionsSeances,
  ajouterPropositionSeance,
  modifierPropositionSeance,
  accepterPropositionSeance,
  refuserPropositionSeance,
} = require("../controllers/propositions-seances.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierScopeHandlerCourant,
  verifierRoleHandler,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant
);

router.get("/", recupererPropositionsSeances);
router.post(
  "/",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(ajouterPropositionSeance, "propositions")
);
router.put(
  "/:id",
  verifierModeEcritureAutorise,
  verifierRoleHandler,
  notifierMiseAJourApplication(modifierPropositionSeance, "propositions")
);
router.post(
  "/:id/accepter",
  verifierModeEcritureAutorise,
  verifierRoleHandler,
  notifierMiseAJourApplication(accepterPropositionSeance, "propositions")
);
router.post(
  "/:id/refuser",
  verifierModeEcritureAutorise,
  verifierRoleHandler,
  notifierMiseAJourApplication(refuserPropositionSeance, "propositions")
);

module.exports = router;
