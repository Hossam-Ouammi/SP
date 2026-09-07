const {
  listerProfesseursEquipe,
  trouverProfesseurEquipe,
  mettreAJourProfesseurEquipe,
} = require("../models/equipe.model");
const { creerJetonReinitialisationMotDePasse } = require("../models/account-lifecycle.model");
const { envoyerEmailReinitialisationMotDePasse } = require("../utils/account-email");
const { RESET_PASSWORD_TOKEN_TTL_MINUTES } = require("../config/account-lifecycle.config");
const { creerEntreeHistorique } = require("../models/historique.model");
const { fermerFluxTempsReelUtilisateur } = require("../utils/realtime");

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handlerCourant(req) {
  const handlerId = normaliserIdentifiant(req.scope?.utilisateurId);
  if (!req.scope?.estHandler || !handlerId) {
    const erreur = new Error("Cette ressource est réservée au Handler de l'équipe.");
    erreur.status = 403;
    throw erreur;
  }

  return handlerId;
}

function serialiserProfesseur(professeur) {
  if (!professeur) {
    return null;
  }

  return {
    id: Number(professeur.id),
    public_id: professeur.public_id || null,
    nom: professeur.nom,
    email: professeur.email,
    statut_compte: professeur.statut_compte,
    acces_active: Number(professeur.acces_active) === 1,
    tarif_horaire: Number(professeur.tarif_horaire) || 0,
    couleur_calendrier: professeur.couleur_calendrier || null,
    permissions: {
      monetisation: Number(professeur.peut_voir_monetisation) === 1,
      aujourdhui: Number(professeur.peut_voir_aujourdhui) === 1,
      disponibilites: Number(professeur.peut_voir_indisponibilites) === 1,
    },
    timezone: professeur.timezone || null,
    rattachement_debut_at: professeur.rattachement_debut_at || null,
    created_at: professeur.created_at || null,
  };
}

async function journaliserEquipe({ req, professeur, actionType, actionLabel, details }) {
  await creerEntreeHistorique({
    handlerId: req.scope.utilisateurId,
    intervenantId: professeur.id,
    seanceId: null,
    seanceLibelle: `${professeur.public_id || "PR"} — ${professeur.nom}`,
    actionType,
    actionLabel,
    acteurId: req.utilisateur.id,
    acteurNom: req.utilisateur.nom,
    details,
  });
}

async function listerProfesseurs(req, res) {
  const handlerId = handlerCourant(req);
  const professeurs = await listerProfesseursEquipe(handlerId);

  return res.json({ professeurs: professeurs.map(serialiserProfesseur) });
}

async function modifierProfesseur(req, res) {
  const handlerId = handlerCourant(req);
  const professeurId = normaliserIdentifiant(req.params.id);

  if (!professeurId) {
    return res.status(400).json({ message: "Identifiant de professeur invalide." });
  }

  const professeurAvant = await trouverProfesseurEquipe(handlerId, professeurId);
  if (!professeurAvant) {
    return res.status(404).json({ message: "Professeur introuvable." });
  }

  const professeur = await mettreAJourProfesseurEquipe(handlerId, professeurId, req.body || {});
  if (!professeur) {
    return res.status(404).json({ message: "Professeur introuvable." });
  }

  // The SSE scope is captured when the stream opens. A suspended or revoked
  // Professor must not retain an already-open private stream until reconnect.
  if (
    String(professeur.statut_compte || "").toLowerCase() !== "active" ||
    Number(professeur.acces_active) !== 1
  ) {
    fermerFluxTempsReelUtilisateur(professeur.id, {
      reason: "account_suspended",
    });
  }

  await journaliserEquipe({
    req,
    professeur,
    actionType: "professeur_modifie",
    actionLabel: "Modification d'un professeur",
    details: {
      avant: serialiserProfesseur(professeurAvant),
      apres: serialiserProfesseur(professeur),
    },
  });
  res.locals.realtimeScope = { handlerId, intervenantId: professeurId };

  return res.json({
    message: "Professeur mis à jour.",
    professeur: serialiserProfesseur(professeur),
  });
}

async function envoyerResetProfesseur(req, res) {
  const handlerId = handlerCourant(req);
  const professeurId = normaliserIdentifiant(req.params.id);

  if (!professeurId) {
    return res.status(400).json({ message: "Identifiant de professeur invalide." });
  }

  const professeur = await trouverProfesseurEquipe(handlerId, professeurId);
  if (!professeur) {
    return res.status(404).json({ message: "Professeur introuvable." });
  }

  if (professeur.statut_compte !== "active" || Number(professeur.acces_active) !== 1) {
    return res.status(409).json({
      message: "Le compte doit être actif avant l'envoi d'un lien de réinitialisation.",
    });
  }

  const reset = await creerJetonReinitialisationMotDePasse({
    identifiant: professeur.public_id,
    expiresInMinutes: RESET_PASSWORD_TOKEN_TTL_MINUTES,
  });

  if (!reset?.resetToken) {
    return res.status(409).json({ message: "Impossible de préparer le lien de réinitialisation." });
  }

  const livraison = await envoyerEmailReinitialisationMotDePasse({
    email: professeur.email,
    nom: professeur.nom,
    token: reset.resetToken,
  });

  await journaliserEquipe({
    req,
    professeur,
    actionType: "professeur_reset_mot_de_passe",
    actionLabel: "Envoi d'un lien de réinitialisation",
    details: {
      delivery: livraison.envoye ? "sent" : "not_sent",
      delivery_reason: livraison.raison || null,
    },
  });
  res.locals.realtimeScope = { handlerId, intervenantId: professeurId };

  return res.json({
    message: livraison.envoye
      ? "Lien de réinitialisation envoyé au professeur."
      : "Lien créé mais l'email n'a pas pu être envoyé ; vérifiez la configuration email.",
    email_envoye: livraison.envoye,
  });
}

module.exports = {
  listerProfesseurs,
  modifierProfesseur,
  envoyerResetProfesseur,
  serialiserProfesseur,
};
