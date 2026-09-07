const express = require("express");

const {
  recupererHistorique,
  recupererDetailHistorique,
  supprimerEntreeHistoriqueAdministration,
} = require("../controllers/historique.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierRoleSuperAdmin,
  verifierScopeHandlerCourant,
} = require("../middleware/scope.middleware");

const router = express.Router();

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);
router.use(chargerScopeAcces);
router.use(verifierScopeHandlerCourant);

router.get("/", recupererHistorique);
router.get("/:id", recupererDetailHistorique);
router.delete(
  "/:id",
  verifierRoleSuperAdmin,
  supprimerEntreeHistoriqueAdministration
);

module.exports = router;
