const express = require("express");
const {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierModeEcritureAutorise,
} = require("../middleware/auth.middleware");
const { chargerScopeAcces } = require("../middleware/scope.middleware");
const controller = require("../controllers/team-membership.controller");

const router = express.Router();
router.use(verifierAuthentification, verifierCompteSecurise, chargerScopeAcces);
router.get("/available", (req, res, next) => {
  if (!req.scope?.estProfesseur && !req.scope?.estHandler) return res.status(403).json({ message: "Acces intervenant requis." });
  return controller.equipesDisponibles(req, res, next);
});
router.post("/requests", verifierModeEcritureAutorise, (req, res, next) => {
  if (!req.scope?.estProfesseur && !req.scope?.estHandler) return res.status(403).json({ message: "Acces intervenant requis." });
  return controller.envoyerDemande(req, res, next);
});
router.get("/requests/received", (req, res, next) => {
  if (!req.scope?.estHandler) return res.status(403).json({ message: "Acces Handler requis." });
  return controller.demandesRecues(req, res, next);
});
router.post("/requests/:id/approve", verifierModeEcritureAutorise, (req, res, next) => {
  if (!req.scope?.estHandler) return res.status(403).json({ message: "Acces Handler requis." });
  return controller.accepterDemande(req, res, next);
});
router.post("/requests/:id/reject", verifierModeEcritureAutorise, (req, res, next) => {
  if (!req.scope?.estHandler) return res.status(403).json({ message: "Acces Handler requis." });
  return controller.refuserDemande(req, res, next);
});
module.exports = router;
