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
  verifierAccesHossamUniquement,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const router = express.Router();

router.use(verifierAuthentification, verifierCompteSecurise);

router.get("/", recupererPropositionsSeances);
router.post(
  "/",
  verifierModeEcritureAutorise,
  notifierMiseAJourApplication(ajouterPropositionSeance, "propositions")
);
router.put(
  "/:id",
  verifierAccesHossamUniquement,
  notifierMiseAJourApplication(modifierPropositionSeance, "propositions")
);
router.post(
  "/:id/accepter",
  verifierAccesHossamUniquement,
  notifierMiseAJourApplication(accepterPropositionSeance, "propositions")
);
router.post(
  "/:id/refuser",
  verifierAccesHossamUniquement,
  notifierMiseAJourApplication(refuserPropositionSeance, "propositions")
);

module.exports = router;
