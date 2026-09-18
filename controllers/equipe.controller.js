const {
  listerProfesseursEquipe,
  trouverProfesseurEquipe,
  mettreAJourProfesseurEquipe,
  retirerProfesseurEquipe,
} = require("../models/equipe.model");
const {
  creerJetonReinitialisationMotDePasse,
  invaliderJetonReinitialisationMotDePasse,
} = require("../models/account-lifecycle.model");
const { envoyerEmailReinitialisationMotDePasse } = require("../utils/account-email");
const { RESET_PASSWORD_TOKEN_TTL_MINUTES } = require("../config/account-lifecycle.config");
const { creerEntreeHistorique } = require("../models/historique.model");
const { fermerFluxTempsReelUtilisateur } = require("../utils/realtime");
const {
  attribuerCouleursCalendrierProfesseurs,
} = require("../utils/professor-calendar-colors");
const {
  listerGrilleTarificationHandler,
  ajouterMatiereHandler,
  renommerMatiereHandler,
  archiverMatiereHandler,
  mettreAJourTarifsMatieresHandler,
} = require("../models/tarification-matieres.model");

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

function serialiserProfesseur(professeur, couleurCalendrier = null) {
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
    couleur_calendrier: couleurCalendrier || professeur.couleur_calendrier || null,
    timezone: professeur.timezone || null,
    rattachement_debut_at: professeur.rattachement_debut_at || null,
    created_at: professeur.created_at || null,
  };
}

function serialiserProfesseurs(professeurs = []) {
  const couleurs = attribuerCouleursCalendrierProfesseurs(professeurs);
  return professeurs.map((professeur) =>
    serialiserProfesseur(professeur, couleurs.get(Number(professeur.id)) || null)
  );
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

async function journaliserTarificationEquipe({
  req,
  handlerId,
  intervenantId = null,
  libelle = "Tarification",
  actionType,
  actionLabel,
  details,
}) {
  await creerEntreeHistorique({
    handlerId,
    intervenantId: normaliserIdentifiant(intervenantId),
    seanceId: null,
    seanceLibelle: libelle,
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

  return res.json({ professeurs: serialiserProfesseurs(professeurs) });
}

async function listerTarificationMatieres(req, res) {
  const handlerId = handlerCourant(req);
  const tarification = await listerGrilleTarificationHandler(handlerId);
  return res.json({ tarification });
}

async function ajouterMatiereEquipe(req, res) {
  const handlerId = handlerCourant(req);
  const matiere = await ajouterMatiereHandler(handlerId, req.body?.libelle ?? req.body?.matiere);

  await journaliserTarificationEquipe({
    req,
    handlerId,
    intervenantId: handlerId,
    libelle: `Matière — ${matiere.libelle}`,
    actionType: "matiere_handler_ajoutee",
    actionLabel: "Ajout d'une matière",
    details: { matiere_id: matiere.id, matiere: matiere.libelle },
  });
  res.locals.realtimeScope = { handlerId };

  return res.status(201).json({
    message: "Matière ajoutée.",
    matiere: { id: Number(matiere.id), libelle: matiere.libelle },
  });
}

async function modifierMatiereEquipe(req, res) {
  const handlerId = handlerCourant(req);
  const matiereId = normaliserIdentifiant(req.params.id);
  if (!matiereId) {
    return res.status(400).json({ message: "Identifiant de matière invalide." });
  }

  const resultat = await renommerMatiereHandler(
    handlerId,
    matiereId,
    req.body?.libelle ?? req.body?.matiere
  );
  await journaliserTarificationEquipe({
    req,
    handlerId,
    intervenantId: handlerId,
    libelle: `Matière — ${resultat.matiere.libelle}`,
    actionType: "matiere_handler_modifiee",
    actionLabel: "Modification d'une matière",
    details: {
      matiere_id: resultat.matiere.id,
      matiere: resultat.matiere.libelle,
      seances_futures_renommees: resultat.seancesFuturesRenommees,
    },
  });
  res.locals.realtimeScope = { handlerId };

  return res.json({
    message: "Matière mise à jour.",
    matiere: { id: Number(resultat.matiere.id), libelle: resultat.matiere.libelle },
    seances_futures_renommees: resultat.seancesFuturesRenommees,
  });
}

async function supprimerMatiereEquipe(req, res) {
  const handlerId = handlerCourant(req);
  const matiereId = normaliserIdentifiant(req.params.id);
  if (!matiereId) {
    return res.status(400).json({ message: "Identifiant de matière invalide." });
  }

  const matiere = await archiverMatiereHandler(handlerId, matiereId);
  await journaliserTarificationEquipe({
    req,
    handlerId,
    intervenantId: handlerId,
    libelle: `Matière — ${matiere.libelle}`,
    actionType: "matiere_handler_archivee",
    actionLabel: "Suppression d'une matière",
    details: {
      matiere_id: matiere.id,
      matiere: matiere.libelle,
      historique_conserve: true,
    },
  });
  res.locals.realtimeScope = { handlerId };

  return res.json({
    message: "Matière supprimée. Les séances et tarifs historiques sont conservés.",
  });
}

async function modifierTarifsMatieresEquipe(req, res) {
  const handlerId = handlerCourant(req);
  const resultat = await mettreAJourTarifsMatieresHandler(handlerId, req.body?.tarifs || []);

  for (const changement of resultat.changements) {
    await journaliserTarificationEquipe({
      req,
      handlerId,
      intervenantId: changement.intervenant_id,
      libelle: `Tarif — ${changement.intervenant_nom} / ${changement.matiere}`,
      actionType: "tarif_matiere_modifie",
      actionLabel: "Modification d'un tarif par matière",
      details: changement,
    });
  }

  res.locals.realtimeScope = { handlerId };
  const tarification = await listerGrilleTarificationHandler(handlerId);
  return res.json({
    message:
      resultat.changements.length > 0
        ? "Tarifs par matière enregistrés."
        : "Aucun tarif n'a été modifié.",
    changements: resultat.changements,
    tarification,
  });
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

  const professeursEquipe = await listerProfesseursEquipe(handlerId);
  const professeurSerialise = serialiserProfesseurs(professeursEquipe).find(
    (element) => Number(element.id) === Number(professeur.id)
  );

  await journaliserEquipe({
    req,
    professeur,
    actionType: "professeur_modifie",
    actionLabel: "Modification d'un professeur",
    details: {
      avant: serialiserProfesseur(professeurAvant),
      apres: professeurSerialise || serialiserProfesseur(professeur),
    },
  });
  res.locals.realtimeScope = { handlerId, intervenantId: professeurId };

  return res.json({
    message: "Professeur mis à jour.",
    professeur: professeurSerialise || serialiserProfesseur(professeur),
  });
}

async function retirerProfesseur(req, res) {
  const handlerId = handlerCourant(req);
  const professeurId = normaliserIdentifiant(req.params.id);

  if (!professeurId) {
    return res.status(400).json({ message: "Identifiant de professeur invalide." });
  }

  const professeur = await retirerProfesseurEquipe(handlerId, professeurId);
  if (!professeur) {
    return res.status(404).json({ message: "Professeur introuvable dans cette équipe." });
  }

  await journaliserEquipe({
    req,
    professeur,
    actionType: "professeur_retire_equipe",
    actionLabel: "Retrait d'un professeur de l'équipe",
    details: {
      professeur: serialiserProfesseur(professeur),
      rattachement_actif: false,
    },
  });
  res.locals.realtimeScope = { handlerId, intervenantId: professeurId };

  return res.json({
    message: "Professeur retiré de l'équipe.",
    professeur_id: professeurId,
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
    // A Handler explicitly requesting a resend is a reviewed management
    // action, unlike repeated public clicks on the recovery page.
    forcerNouveauLien: true,
  });

  if (!reset?.resetToken) {
    return res.status(409).json({ message: "Impossible de préparer le lien de réinitialisation." });
  }

  const livraison = await envoyerEmailReinitialisationMotDePasse({
    email: professeur.email,
    nom: professeur.nom,
    token: reset.resetToken,
    expiresInMinutes: RESET_PASSWORD_TOKEN_TTL_MINUTES,
  });

  // A management resend forcibly replaces any prior token. If SMTP fails,
  // revoke the newly-created token as well: otherwise the account is locked
  // behind an inaccessible link until its expiration.
  if (!livraison.envoye) {
    await invaliderJetonReinitialisationMotDePasse({
      token: reset.resetToken,
    }).catch(() => {});
  }

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

  return res.status(livraison.envoye ? 200 : 503).json({
    message: livraison.envoye
      ? "Lien de réinitialisation envoyé au professeur."
      : "L'email n'a pas pu être envoyé ; le lien a été annulé. Vérifiez la configuration email puis réessayez.",
    email_envoye: livraison.envoye,
  });
}

module.exports = {
  listerProfesseurs,
  listerTarificationMatieres,
  ajouterMatiereEquipe,
  modifierMatiereEquipe,
  supprimerMatiereEquipe,
  modifierTarifsMatieresEquipe,
  modifierProfesseur,
  retirerProfesseur,
  envoyerResetProfesseur,
  serialiserProfesseur,
  serialiserProfesseurs,
};
