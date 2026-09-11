const {
  listerEquipesDisponibles,
  creerDemandeRattachement,
  listerDemandesHandler,
  traiterDemandeRattachement,
} = require("../models/team-membership.model");
const { get } = require("../models/db");
const { envoyerEmailRattachementEquipeAccepte } = require("../utils/account-email");

async function equipesDisponibles(req, res, next) {
  try { return res.json({ equipes: await listerEquipesDisponibles(req.utilisateur.id) }); }
  catch (error) { return next(error); }
}

async function envoyerDemande(req, res, next) {
  try {
    const demande = await creerDemandeRattachement({
      professeurId: req.utilisateur.id,
      handlerId: req.body?.handler_id,
      description: req.body?.description,
    });
    return res.status(201).json({ message: "Demande envoyee.", demande });
  } catch (error) { return next(error); }
}

async function demandesRecues(req, res, next) {
  try { return res.json({ demandes: await listerDemandesHandler(req.utilisateur.id) }); }
  catch (error) { return next(error); }
}

async function traiter(req, res, next, accepter) {
  try {
    const demande = await traiterDemandeRattachement({
      demandeId: req.params.id,
      handlerId: req.utilisateur.id,
      reviewerId: req.utilisateur.id,
      accepter,
    });
    if (!demande) return res.status(404).json({ message: "Demande introuvable ou deja traitee." });
    if (accepter) {
      const handler = await get("SELECT nom, public_id FROM utilisateurs WHERE id = ?", [req.utilisateur.id]);
      await envoyerEmailRattachementEquipeAccepte({
        email: demande.email, nom: demande.nom,
        handlerNom: handler?.nom, handlerPublicId: handler?.public_id,
      });
    }
    return res.json({ message: accepter ? "Demande acceptee." : "Demande refusee.", demande });
  } catch (error) { return next(error); }
}

module.exports = {
  equipesDisponibles, envoyerDemande, demandesRecues,
  accepterDemande: (req, res, next) => traiter(req, res, next, true),
  refuserDemande: (req, res, next) => traiter(req, res, next, false),
};
