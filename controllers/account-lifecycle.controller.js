const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const {
  ROLES_DEMANDE,
  normaliserTexte,
  normaliserEmail,
  normaliserPublicId,
  normaliserRoleDemande,
  listerIdentifiantsPublicsHandlers,
  trouverHandlerActifParPublicId,
  creerDemandeInscription,
  trouverDemandeInscriptionParId,
  listerDemandesInscriptionEnAttente,
  approuverDemandeInscription,
  refuserDemandeInscription,
  creerNouveauJetonActivationPourDemande,
  creerJetonReinitialisationMotDePasse,
  invaliderJetonReinitialisationMotDePasse,
  activerCompteAvecJeton,
  reinitialiserMotDePasseAvecJeton,
  verifierJetonCompte,
} = require("../models/account-lifecycle.model");
const { motDePasseRespectePolitique } = require("../utils/security");
const {
  envoyerEmailActivation,
  envoyerEmailNouvelleDemandeProfesseur,
  envoyerEmailReinitialisationMotDePasse,
} = require("../utils/account-email");
const {
  ACTIVATION_TOKEN_TTL_MINUTES,
  RESET_PASSWORD_TOKEN_TTL_MINUTES,
} = require("../config/account-lifecycle.config");
const { normaliserIpClient } = require("../middleware/security.middleware");
const { enregistrerEvenementAuth } = require("../models/journal-auth.model");
const {
  supprimerAppareilsAutoLoginUtilisateur,
} = require("../models/trusted-device.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const { fermerFluxTempsReelUtilisateur } = require("../utils/realtime");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

function obtenirUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 400);
}

function estEmailValide(email) {
  return EMAIL_REGEX.test(String(email || ""));
}

function normaliserIdEntier(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserJeton(valeur) {
  const token = String(valeur || "").trim();
  return TOKEN_REGEX.test(token) ? token : "";
}

function normaliserMotDePasseNouveau(corps) {
  return String(corps?.nouveau_mot_de_passe ?? corps?.password ?? "");
}

function reponseDemandePublique() {
  // The same answer is used for accepted, duplicate, and existing-email cases
  // to avoid turning this endpoint into an account enumeration oracle.
  return {
    message:
      "Votre demande a été prise en compte. Vous recevrez un email après validation si elle est acceptée.",
  };
}

function reponseResetPublique() {
  return {
    message:
      "Si un compte actif correspond à ces informations, un email de réinitialisation vient d'être envoyé.",
    // The client can show its confirmation then return to the login form. It
    // remains identical for existing, unknown, and repeated requests.
    redirect_after_seconds: 12,
  };
}

async function journaliserEvenement(req, {
  utilisateurId = null,
  identifiant = "",
  actionType,
  resultat,
  details = null,
}) {
  await enregistrerEvenementAuth({
    utilisateurId,
    identifiant,
    actionType,
    resultat,
    adresseIp: normaliserIpClient(req),
    userAgent: obtenirUserAgent(req),
    details,
  });
}

function journaliserEnArrierePlan(req, evenement) {
  journaliserEvenement(req, evenement).catch(() => {});
}

function construirePorteeHistoriqueDemande(demande, utilisateur = null) {
  const role = String(demande?.role_demande || "").trim().toLowerCase();
  const utilisateurId = normaliserIdEntier(utilisateur?.id);

  if (role === ROLES_DEMANDE.PROFESSEUR) {
    return {
      handlerId: normaliserIdEntier(demande?.handler_id),
      intervenantId: utilisateurId,
    };
  }

  // A newly approved Handler owns their historical onboarding entry as soon
  // as the account becomes active. Rejected Handler requests stay global and
  // therefore remain available only in the explicit administration context.
  if (role === ROLES_DEMANDE.HANDLER && utilisateurId) {
    return { handlerId: utilisateurId, intervenantId: utilisateurId };
  }

  return { handlerId: null, intervenantId: null };
}

async function journaliserHistoriqueDemande(
  req,
  demande,
  { actionType, actionLabel, utilisateur = null, details = {} }
) {
  const portee = construirePorteeHistoriqueDemande(demande, utilisateur);

  try {
    await creerEntreeHistorique({
      ...portee,
      seanceId: null,
      seanceLibelle: "Compte",
      actionType,
      actionLabel,
      acteurId: req.utilisateur?.id || null,
      acteurNom: req.utilisateur?.nom || "Système",
      details: {
        demande_id: normaliserIdEntier(demande?.id),
        role_demande: demande?.role_demande || null,
        utilisateur_public_id: utilisateur?.public_id || null,
        ...details,
      },
    });
  } catch (error) {
    // A successful lifecycle transition must not be rolled back by a
    // secondary audit write. The primary auth journal remains written too.
    console.error("Historisation du cycle de compte impossible:", error);
  }
}

function scopePeutTraiterDemande(scope, demande) {
  if (!scope || !demande) {
    return false;
  }

  // A dual-role account is still constrained to its own team on the regular
  // lifecycle API.  Cross-team approval requires the admin router.
  if (scope.estSuperAdmin && scope.modeAdministration === true) {
    return true;
  }

  return (
    scope.estHandler === true &&
    demande.role_demande === ROLES_DEMANDE.PROFESSEUR &&
    Number(demande.handler_id) === Number(scope.utilisateurId)
  );
}

async function chargerDemandeDansScope(req, res) {
  const demandeId = normaliserIdEntier(req.params?.id);

  if (!demandeId) {
    res.status(400).json({ message: "Identifiant de demande invalide." });
    return null;
  }

  const demande = await trouverDemandeInscriptionParId(demandeId);

  if (!demande || !scopePeutTraiterDemande(req.scope, demande)) {
    // Do not reveal the existence of a request outside the Handler's team.
    res.status(404).json({ message: "Demande introuvable." });
    return null;
  }

  return demande;
}

function construireHashInutilisable() {
  // This value is never sent to a user and cannot be used as a temporary
  // password. Activation replaces it with the password chosen by the user.
  return bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 12);
}

async function listerHandlersPublics(req, res, next) {
  try {
    const handlerIds = await listerIdentifiantsPublicsHandlers();

    // Intentionally only public IDs: no name, email, database ID, count by
    // team, or availability information is disclosed here.
    return res.json({ handler_ids: handlerIds });
  } catch (error) {
    return next(error);
  }
}

async function soumettreDemandeInscription(req, res, next) {
  try {
    const nom = normaliserTexte(req.body?.nom);
    const email = normaliserEmail(req.body?.email);
    const role = normaliserRoleDemande(req.body?.role ?? req.body?.role_demande);
    const handlerPublicId = normaliserPublicId(
      req.body?.handler_public_id ?? req.body?.handlerPublicId
    );

    if (
      !nom ||
      nom.length < 2 ||
      nom.length > 120 ||
      !email ||
      email.length > 160 ||
      !estEmailValide(email) ||
      !role
    ) {
      return res.status(400).json({
        message: "Nom, email valide et rôle demandé sont obligatoires.",
      });
    }

    let handlerId = null;

    if (role === ROLES_DEMANDE.PROFESSEUR) {
      if (!handlerPublicId || handlerPublicId.length > 80) {
        return res.status(400).json({
          message: "Un identifiant public de Handler est obligatoire pour une demande Professeur.",
        });
      }

      const handler = await trouverHandlerActifParPublicId(handlerPublicId);

      if (!handler) {
        return res.status(400).json({
          message: "Identifiant public de Handler invalide.",
        });
      }

      handlerId = Number(handler.id);
    } else if (handlerPublicId) {
      return res.status(400).json({
        message: "Une demande Handler ne doit pas cibler un autre Handler.",
      });
    }

    const resultat = await creerDemandeInscription({
      nom,
      email,
      roleDemande: role,
      handlerId,
    });

    // The notification is intentionally best-effort and never changes the
    // public response (otherwise it would leak whether an email/account is
    // present).  The Handler sees the request again through their scoped API.
    if (resultat.creee && role === ROLES_DEMANDE.PROFESSEUR && handlerId) {
      const handler = await trouverHandlerActifParPublicId(handlerPublicId);
      if (handler) {
        envoyerEmailNouvelleDemandeProfesseur({
          email: handler.email,
          nomHandler: handler.nom,
          nomDemandeur: nom,
          emailDemandeur: email,
          handlerPublicId: handler.public_id,
        }).catch(() => {});
      }
    }

    journaliserEnArrierePlan(req, {
      identifiant: email,
      actionType: "account_request",
      resultat: resultat.creee ? "pending_created" : "accepted_without_duplicate_disclosure",
      details: {
        role_demande: role,
        handler_id: handlerId,
      },
    });

    return res.status(202).json(reponseDemandePublique());
  } catch (error) {
    if (error.code === "INVALID_REQUEST" || error.code === "INVALID_HANDLER") {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
}

async function demanderReinitialisationMotDePasse(req, res, next) {
  try {
    const identifiant = normaliserTexte(
      req.body?.identifiant ?? req.body?.email ?? req.body?.public_id,
      0
    );

    // This endpoint deliberately returns 202 even for malformed or unknown
    // input, so it cannot disclose whether an account exists.
    if (!identifiant || identifiant.length > 160) {
      return res.status(202).json(reponseResetPublique());
    }

    const resultat = await creerJetonReinitialisationMotDePasse({
      identifiant,
      expiresInMinutes: RESET_PASSWORD_TOKEN_TTL_MINUTES,
    });

    if (resultat?.resetToken) {
      const livraison = await envoyerEmailReinitialisationMotDePasse({
        email: resultat.utilisateur.email,
        nom: resultat.utilisateur.nom,
        token: resultat.resetToken,
        expiresInMinutes: RESET_PASSWORD_TOKEN_TTL_MINUTES,
      });

      // Do not leave an unreachable link active when delivery is known to
      // fail. A later click can then safely create one fresh link. The public
      // response stays generic so this never becomes an account oracle.
      if (!livraison.envoye) {
        await invaliderJetonReinitialisationMotDePasse({
          token: resultat.resetToken,
        }).catch(() => {});
      }

      journaliserEnArrierePlan(req, {
        utilisateurId: resultat.utilisateur.id,
        identifiant: identifiant,
        actionType: "password_reset_request",
        resultat: livraison.envoye ? "accepted_email_sent" : "accepted_email_not_sent",
        details: { delivery_reason: livraison.raison || null },
      });
    } else if (resultat?.dejaActif) {
      // The existing valid URL was already delivered. Repeated clicks do not
      // produce another email containing a different, immediately revoked URL.
      journaliserEnArrierePlan(req, {
        utilisateurId: resultat.utilisateur.id,
        identifiant,
        actionType: "password_reset_request",
        resultat: "accepted_existing_active_link",
      });
    } else {
      journaliserEnArrierePlan(req, {
        identifiant,
        actionType: "password_reset_request",
        resultat: "accepted_no_matching_active_account",
      });
    }

    return res.status(202).json(reponseResetPublique());
  } catch (error) {
    return next(error);
  }
}

async function activerCompte(req, res, next) {
  try {
    const token = normaliserJeton(req.body?.token);
    const nouveauMotDePasse = normaliserMotDePasseNouveau(req.body);

    if (!token) {
      return res.status(400).json({
        message: "Lien d'activation invalide ou expiré.",
      });
    }

    if (!motDePasseRespectePolitique(nouveauMotDePasse)) {
      return res.status(400).json({
        message:
          "Le mot de passe doit contenir entre 12 caractères et 72 octets UTF-8, avec une minuscule, une majuscule, un chiffre et un caractère spécial.",
      });
    }

    const motDePasseHash = await bcrypt.hash(nouveauMotDePasse, 12);
    const utilisateur = await activerCompteAvecJeton({ token, motDePasseHash });

    if (!utilisateur) {
      journaliserEnArrierePlan(req, {
        actionType: "account_activation",
        resultat: "invalid_or_expired_token",
      });
      return res.status(400).json({
        message: "Lien d'activation invalide ou expiré.",
      });
    }

    await supprimerAppareilsAutoLoginUtilisateur(utilisateur.id).catch(() => {});
    fermerFluxTempsReelUtilisateur(utilisateur.id, {
      reason: "account_activated",
    });
    journaliserEnArrierePlan(req, {
      utilisateurId: utilisateur.id,
      identifiant: utilisateur.email,
      actionType: "account_activation",
      resultat: "success",
    });

    return res.json({
      message: "Votre compte est activé. Vous pouvez maintenant vous connecter.",
    });
  } catch (error) {
    return next(error);
  }
}

async function verifierLienCycleCompte(req, res, next) {
  try {
    const token = normaliserJeton(req.body?.token);
    const valide = token && await verifierJetonCompte({ type: req.body?.type, token });
    return res.json({ valide: Boolean(valide) });
  } catch (error) { return next(error); }
}

async function confirmerReinitialisationMotDePasse(req, res, next) {
  try {
    const token = normaliserJeton(req.body?.token);
    const nouveauMotDePasse = normaliserMotDePasseNouveau(req.body);

    if (!token) {
      return res.status(400).json({
        message: "Lien de réinitialisation invalide ou expiré.",
      });
    }

    if (!motDePasseRespectePolitique(nouveauMotDePasse)) {
      return res.status(400).json({
        message:
          "Le mot de passe doit contenir entre 12 caractères et 72 octets UTF-8, avec une minuscule, une majuscule, un chiffre et un caractère spécial.",
      });
    }

    const motDePasseHash = await bcrypt.hash(nouveauMotDePasse, 12);
    const utilisateur = await reinitialiserMotDePasseAvecJeton({ token, motDePasseHash });

    if (!utilisateur) {
      journaliserEnArrierePlan(req, {
        actionType: "password_reset_complete",
        resultat: "invalid_or_expired_token",
      });
      return res.status(400).json({
        message: "Lien de réinitialisation invalide ou expiré.",
      });
    }

    await supprimerAppareilsAutoLoginUtilisateur(utilisateur.id).catch(() => {});
    fermerFluxTempsReelUtilisateur(utilisateur.id, {
      reason: "password_reset",
    });
    journaliserEnArrierePlan(req, {
      utilisateurId: utilisateur.id,
      identifiant: utilisateur.email,
      actionType: "password_reset_complete",
      resultat: "success",
    });

    return res.json({
      message: "Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.",
    });
  } catch (error) {
    return next(error);
  }
}

async function listerDemandesEnAttente(req, res, next) {
  try {
    const demandes = await listerDemandesInscriptionEnAttente({
      estSuperAdmin:
        req.scope?.estSuperAdmin === true && req.scope?.modeAdministration === true,
      handlerId: req.scope?.utilisateurId,
    });

    return res.json({ demandes });
  } catch (error) {
    return next(error);
  }
}

async function approuverDemande(req, res, next) {
  try {
    const demande = await chargerDemandeDansScope(req, res);

    if (!demande) {
      return undefined;
    }

    if (demande.statut !== "pending") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    const motDePasseInutilisableHash = await construireHashInutilisable();
    const resultat = await approuverDemandeInscription({
      demandeId: demande.id,
      reviewedBy: req.utilisateur.id,
      motDePasseInutilisableHash,
      activationTokenTtlMinutes: ACTIVATION_TOKEN_TTL_MINUTES,
    });

    if (!resultat) {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    const livraison = await envoyerEmailActivation({
      email: resultat.utilisateur.email,
      nom: resultat.utilisateur.nom,
      token: resultat.activationToken,
    });

    journaliserEnArrierePlan(req, {
      utilisateurId: req.utilisateur.id,
      identifiant: req.utilisateur.email || req.utilisateur.nom,
      actionType: "account_request_approval",
      resultat: livraison.envoye ? "approved_email_sent" : "approved_email_not_sent",
      details: {
        demande_id: resultat.demande.id,
        utilisateur_id: resultat.utilisateur.id,
        role_demande: resultat.demande.role_demande,
        delivery_reason: livraison.raison || null,
      },
    });
    await journaliserHistoriqueDemande(req, resultat.demande, {
      actionType: "demande_compte_approuvee",
      actionLabel: "Approbation d'une demande de compte",
      utilisateur: resultat.utilisateur,
      details: {
        activation_email_envoye: livraison.envoye,
      },
    });

    return res.status(201).json({
      message: livraison.envoye
        ? "Demande approuvée et email d'activation envoyé."
        : "Demande approuvée. L'email d'activation n'a pas pu être envoyé ; utilisez le renvoi après avoir configuré l'email.",
      demande: resultat.demande,
      activation_email_envoye: livraison.envoye,
    });
  } catch (error) {
    if (error.code === "EMAIL_ALREADY_USED") {
      return res.status(409).json({
        message: "Un compte utilise déjà l'email de cette demande.",
      });
    }

    if (error.code === "HANDLER_INACTIVE") {
      return res.status(409).json({ message: error.message });
    }

    if (error.code === "REQUEST_STATE_CHANGED") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    return next(error);
  }
}

async function refuserDemande(req, res, next) {
  try {
    const demande = await chargerDemandeDansScope(req, res);

    if (!demande) {
      return undefined;
    }

    if (demande.statut !== "pending") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    const resultat = await refuserDemandeInscription({
      demandeId: demande.id,
      reviewedBy: req.utilisateur.id,
      raison: req.body?.raison ?? req.body?.reason,
    });

    if (!resultat) {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }

    journaliserEnArrierePlan(req, {
      utilisateurId: req.utilisateur.id,
      identifiant: req.utilisateur.email || req.utilisateur.nom,
      actionType: "account_request_rejection",
      resultat: "rejected",
      details: {
        demande_id: resultat.id,
        role_demande: resultat.role_demande,
      },
    });
    await journaliserHistoriqueDemande(req, resultat, {
      actionType: "demande_compte_refusee",
      actionLabel: "Refus d'une demande de compte",
      details: {
        raison: resultat.refusal_reason || null,
      },
    });

    return res.json({
      message: "Demande refusée.",
      demande: resultat,
    });
  } catch (error) {
    return next(error);
  }
}

async function renvoyerActivation(req, res, next) {
  try {
    const demande = await chargerDemandeDansScope(req, res);

    if (!demande) {
      return undefined;
    }

    const resultat = await creerNouveauJetonActivationPourDemande({
      demandeId: demande.id,
      activationTokenTtlMinutes: ACTIVATION_TOKEN_TTL_MINUTES,
    });

    if (!resultat) {
      return res.status(409).json({
        message: "Cette demande ne peut plus recevoir de lien d'activation.",
      });
    }

    const livraison = await envoyerEmailActivation({
      email: resultat.utilisateur.email,
      nom: resultat.utilisateur.nom,
      token: resultat.activationToken,
    });

    journaliserEnArrierePlan(req, {
      utilisateurId: req.utilisateur.id,
      identifiant: req.utilisateur.email || req.utilisateur.nom,
      actionType: "account_activation_resend",
      resultat: livraison.envoye ? "email_sent" : "email_not_sent",
      details: {
        demande_id: resultat.demande.id,
        utilisateur_id: resultat.utilisateur.id,
        delivery_reason: livraison.raison || null,
      },
    });
    await journaliserHistoriqueDemande(req, resultat.demande, {
      actionType: "activation_compte_renvoyee",
      actionLabel: "Renvoi du lien d'activation",
      utilisateur: resultat.utilisateur,
      details: {
        activation_email_envoye: livraison.envoye,
      },
    });

    return res.json({
      message: livraison.envoye
        ? "Un nouvel email d'activation a été envoyé."
        : "Le nouveau lien a été créé, mais l'email n'a pas pu être envoyé.",
      activation_email_envoye: livraison.envoye,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listerHandlersPublics,
  soumettreDemandeInscription,
  demanderReinitialisationMotDePasse,
  activerCompte,
  verifierLienCycleCompte,
  confirmerReinitialisationMotDePasse,
  listerDemandesEnAttente,
  approuverDemande,
  refuserDemande,
  renvoyerActivation,
  scopePeutTraiterDemande,
};
