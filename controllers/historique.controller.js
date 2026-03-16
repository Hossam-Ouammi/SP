const {
  listerEntreesHistorique,
  recupererEntreeHistoriqueDetail,
} = require("../models/historique.model");

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

async function recupererHistorique(req, res) {
  const historique = await listerEntreesHistorique(300);
  return res.json({ historique });
}

async function recupererDetailHistorique(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({
      message: "Identifiant d'historique invalide.",
    });
  }

  const entree = await recupererEntreeHistoriqueDetail(req.params.id);

  if (!entree) {
    return res.status(404).json({
      message: "Entrée d'historique introuvable.",
    });
  }

  return res.json({ entree });
}

module.exports = {
  recupererHistorique,
  recupererDetailHistorique,
};
