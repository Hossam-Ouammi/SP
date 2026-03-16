const {
  listerEntreesHistorique,
  recupererEntreeHistoriqueDetail,
} = require("../models/historique.model");

async function recupererHistorique(req, res) {
  const historique = await listerEntreesHistorique(300);
  return res.json({ historique });
}

async function recupererDetailHistorique(req, res) {
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
