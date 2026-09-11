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
  verifierCreationPropositionProfesseur,
  verifierLecturePropositionIndisponibiliteHandler,
  verifierMutationPropositionIndisponibiliteHandler,
} = require("../middleware/scope.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierScopeHandlerCourant
);

router.get("/", verifierLecturePropositionIndisponibiliteHandler, recupererPropositionsSeances);
router.post(
  "/",
  verifierModeEcritureAutorise,
  verifierCreationPropositionProfesseur,
  notifierMiseAJourApplication(ajouterPropositionSeance, "propositions")
);
router.put(
  "/:id",
  verifierModeEcritureAutorise,
  verifierMutationPropositionIndisponibiliteHandler,
  verifierRoleHandler,
  notifierMiseAJourApplication(modifierPropositionSeance, "propositions")
);
router.post(
  "/:id/accepter",
  verifierModeEcritureAutorise,
  verifierMutationPropositionIndisponibiliteHandler,
  verifierRoleHandler,
  notifierMiseAJourApplication(accepterPropositionSeance, "propositions")
);
router.post(
  "/:id/refuser",
  verifierModeEcritureAutorise,
  verifierMutationPropositionIndisponibiliteHandler,
  verifierRoleHandler,
  notifierMiseAJourApplication(refuserPropositionSeance, "propositions")
);

module.exports = router;
