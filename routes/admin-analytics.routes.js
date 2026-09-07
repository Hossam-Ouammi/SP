const express = require("express");

const {
  recupererStatistiquesGlobalesAdministration,
} = require("../controllers/statistiques.controller");
const {
  recupererMonetisationGlobaleAdministration,
  telechargerReleveMonetisationGlobaleAdministration,
} = require("../controllers/monetisation.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  chargerScopeAcces,
  verifierRoleSuperAdmin,
} = require("../middleware/scope.middleware");

const router = express.Router();

// This marker is deliberately separate from the normal Handler scope. A
// dual-role account keeps its operational data boundary on `/api/statistiques`
// and `/api/monetisation`; only this explicit, SuperAdmin-protected router can
// request platform-wide aggregates.
function activerContexteAnalyseGlobaleSuperAdmin(req, res, next) {
  req.scope = {
    ...(req.scope || {}),
    modeAnalyseGlobaleSuperAdmin: true,
  };
  return next();
}

router.use(
  verifierAuthentification,
  verifierCompteSecurise,
  chargerScopeAcces,
  verifierRoleSuperAdmin,
  activerContexteAnalyseGlobaleSuperAdmin
);

router.get("/statistiques", recupererStatistiquesGlobalesAdministration);
router.get("/monetisation/releve", telechargerReleveMonetisationGlobaleAdministration);
router.get("/monetisation", recupererMonetisationGlobaleAdministration);

module.exports = router;
