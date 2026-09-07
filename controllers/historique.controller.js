const {
  listerEntreesHistoriqueScopees,
  recupererEntreeHistoriqueDetailScopee,
} = require("../models/historique.model");

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

async function recupererHistorique(req, res) {
  const limiteDemandee = Number(req.query?.limit);
  const limite = Number.isInteger(limiteDemandee) && limiteDemandee > 0 ? limiteDemandee : 300;
  const historique = await listerEntreesHistoriqueScopees(req.scope, limite);

  return res.json({ historique });
}

function activerModeAdministration(req, res, next) {
  req.scope = { ...(req.scope || {}), modeAdministration: true };
  return next();
}

async function recupererDetailHistorique(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({
      message: "Identifiant d'historique invalide.",
    });
  }

  const entree = await recupererEntreeHistoriqueDetailScopee(req.params.id, req.scope);

  if (!entree) {
    return res.status(404).json({
      message: "Entrée d'historique introuvable.",
    });
  }

  return res.json({ entree });
}

async function supprimerEntreeHistoriqueAdministration(req, res) {
  // The audit trail is deliberately append-only. Retention/archival, if ever
  // required, must be implemented as a separately auditable operation.
  return res.status(405).json({
    message: "Le journal d'actions est immuable et ne peut pas être supprimé.",
    code: "AUDIT_LOG_IMMUTABLE",
  });
}

module.exports = {
  recupererHistorique,
  recupererDetailHistorique,
  supprimerEntreeHistoriqueAdministration,
  activerModeAdministration,
};
