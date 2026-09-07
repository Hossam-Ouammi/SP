const { transfererProfesseurEntreHandlers } = require("../models/professeur-transfer.model");
const {
  fermerFluxTempsReelUtilisateur,
  diffuserMiseAJourApplication,
} = require("../utils/realtime");

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function verifierContexteAdministration(req) {
  if (req.scope?.estSuperAdmin !== true || req.scope?.modeAdministration !== true) {
    const erreur = new Error("Cette action est reservee au mode Administration SuperAdmin.");
    erreur.status = 403;
    erreur.code = "SUPER_ADMIN_MODE_REQUIRED";
    throw erreur;
  }
}

function serialiserTransfert(transfert, fluxTempsReelFermes) {
  return {
    professeur: {
      id: Number(transfert.professeur.id),
      public_id: transfert.professeur.public_id || null,
      nom: transfert.professeur.nom,
      email: transfert.professeur.email,
    },
    handler_source: transfert.handlerSource,
    handler_destination: transfert.handlerDestination,
    rattachement_source: {
      id: Number(transfert.rattachementSource.id),
      actif: Number(transfert.rattachementSource.actif) === 1,
      debut_at: transfert.rattachementSource.debut_at || null,
      fin_at: transfert.rattachementSource.fin_at || null,
    },
    rattachement_destination: {
      id: Number(transfert.rattachementDestination.id),
      actif: Number(transfert.rattachementDestination.actif) === 1,
      debut_at: transfert.rattachementDestination.debut_at || null,
      fin_at: transfert.rattachementDestination.fin_at || null,
    },
    sessions_invalidees: true,
    flux_temps_reel_fermes: Number(fluxTempsReelFermes) || 0,
    historique: {
      sortie_id: Number(transfert.historique.sortie.id),
      entree_id: Number(transfert.historique.entree.id),
    },
  };
}

function diffuserNotificationTransfert(req, transfert) {
  const message = `${transfert.professeur.nom} a ete transfere vers ${transfert.handlerDestination.nom}.`;
  const payloadCommun = {
    scope: "team",
    action: "professor_transferred",
    actorId: req.utilisateur.id,
    actorName: req.utilisateur.nom,
    intervenantId: transfert.professeur.id,
    message,
  };

  // A transfer spans two independent Handler scopes. Emit one narrowly
  // targeted event per scope; no broad application event is ever sent.
  diffuserMiseAJourApplication({
    ...payloadCommun,
    handlerId: transfert.handlerSource.id,
  });
  diffuserMiseAJourApplication({
    ...payloadCommun,
    handlerId: transfert.handlerDestination.id,
  });
}

async function transfererProfesseurAdministration(req, res) {
  verifierContexteAdministration(req);

  const professeurId = normaliserIdentifiant(req.params?.id);
  const handlerDestinationId = normaliserIdentifiant(
    req.body?.handler_destination_id ?? req.body?.handlerDestinationId
  );

  if (!professeurId || !handlerDestinationId) {
    return res.status(400).json({
      message: "Identifiant du Professeur et Handler de destination obligatoires.",
    });
  }

  const transfert = await transfererProfesseurEntreHandlers({
    professeurId,
    handlerDestinationId,
    acteurId: req.utilisateur.id,
    acteurNom: req.utilisateur.nom,
  });

  // The stored SSE scope is evaluated only when the stream opens. Closing it
  // prevents a transferred Professor from keeping a stale stream alive.
  const fluxTempsReelFermes = fermerFluxTempsReelUtilisateur(transfert.professeur.id, {
    reason: "access_scope_changed",
  });
  diffuserNotificationTransfert(req, transfert);

  return res.json({
    message: "Professeur transfere et sessions invalidees.",
    transfert: serialiserTransfert(transfert, fluxTempsReelFermes),
  });
}

module.exports = {
  transfererProfesseurAdministration,
};
