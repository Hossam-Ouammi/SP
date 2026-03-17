const bcrypt = require("bcryptjs");

const {
  listerComptesAdministration,
  trouverCompteParId,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  listerSessionsActives,
  revoquerSession,
  revoquerSessionsUtilisateur,
  supprimerToutesLesSeances,
  supprimerToutHistorique,
  recupererCatalogueAdministration,
  trouverElementCatalogue,
  ajouterElementCatalogue,
  supprimerUtilisateurAdministration: supprimerUtilisateurAdministrationModele,
} = require("../models/admin.model");
const {
  trouverUtilisateurAvecMotDePasseParId,
  trouverUtilisateurParEmail,
  trouverUtilisateurParNom,
  trouverUtilisateurParId,
  creerUtilisateur,
  reinitialiserMotDePasseUtilisateur,
} = require("../models/utilisateur.model");
const { enregistrerEvenementAuth } = require("../models/journal-auth.model");

function normaliserIpClient(req) {
  const enteteTransmis = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return enteteTransmis || req.ip || "ip-inconnue";
}

function obtenirUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 400);
}

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function estEmailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function journaliserActionAdmin(req, actionType, resultat, details = null) {
  await enregistrerEvenementAuth({
    utilisateurId: req.utilisateur?.id || null,
    identifiant: req.utilisateur?.nom || req.utilisateur?.email || "",
    actionType,
    resultat,
    adresseIp: normaliserIpClient(req),
    userAgent: obtenirUserAgent(req),
    details,
  });
}

async function verifierMotDePasseAdministrateur(req, motDePasseActuel) {
  const administrateur = await trouverUtilisateurAvecMotDePasseParId(req.utilisateur.id);

  if (!administrateur) {
    return {
      ok: false,
      status: 404,
      message: "Administrateur introuvable.",
    };
  }

  const motDePasseValide = await bcrypt.compare(
    String(motDePasseActuel || ""),
    administrateur.mot_de_passe
  );

  if (!motDePasseValide) {
    return {
      ok: false,
      status: 400,
      message: "Le mot de passe actuel est incorrect.",
    };
  }

  return {
    ok: true,
    administrateur,
  };
}

function repondreErreurVerification(req, res, verification, actionType, details) {
  journaliserActionAdmin(req, actionType, "failed_current_password", details).catch(() => {});

  return res.status(verification.status).json({
    message: verification.message,
  });
}

async function recupererVueAdministration(req, res) {
  const [comptes, sessions, catalogue] = await Promise.all([
    listerComptesAdministration(),
    listerSessionsActives(req.sessionID),
    recupererCatalogueAdministration(),
  ]);

  return res.json({
    administration: {
      comptes,
      sessions,
      catalogue,
    },
  });
}

async function ajouterElementCatalogueAdministration(req, res) {
  const {
    type,
    valeur,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  const typeNormalise = normaliserTexte(type).toLowerCase();
  const valeurNormalisee = normaliserTexte(valeur);

  if (!["matiere", "compte"].includes(typeNormalise) || !valeurNormalisee || !motDePasseActuel) {
    return res.status(400).json({
      message: "Type, valeur et mot de passe actuel obligatoires.",
    });
  }

  if (valeurNormalisee.length < 2 || valeurNormalisee.length > 80) {
    return res.status(400).json({
      message: "La valeur doit contenir entre 2 et 80 caracteres.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_add_catalog_item", {
      type: typeNormalise,
      valeur: valeurNormalisee,
    });
  }

  const valeurExistante = await trouverElementCatalogue(typeNormalise, valeurNormalisee);

  if (valeurExistante) {
    return res.status(400).json({
      message:
        typeNormalise === "matiere"
          ? "Cette matiere existe deja."
          : "Ce compte existe deja.",
    });
  }

  const elementCatalogue = await ajouterElementCatalogue(typeNormalise, valeurNormalisee);

  await journaliserActionAdmin(req, "admin_add_catalog_item", "success", {
    type: typeNormalise,
    valeur: elementCatalogue.valeur,
    element_id: elementCatalogue.id,
  });

  return res.status(201).json({
    message:
      typeNormalise === "matiere"
        ? `La matiere ${elementCatalogue.valeur} a ete ajoutee.`
        : `Le compte ${elementCatalogue.valeur} a ete ajoute.`,
    element: elementCatalogue,
  });
}

async function creerUtilisateurAdministration(req, res) {
  const {
    nom,
    email,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  const nomNormalise = normaliserTexte(nom);
  const emailNormalise = normaliserTexte(email).toLowerCase();

  if (!nomNormalise || !emailNormalise || !motDePasseActuel) {
    return res.status(400).json({
      message: "Nom, email et mot de passe actuel obligatoires.",
    });
  }

  if (nomNormalise.length < 2 || nomNormalise.length > 60) {
    return res.status(400).json({
      message: "Le nom doit contenir entre 2 et 60 caracteres.",
    });
  }

  if (!estEmailValide(emailNormalise) || emailNormalise.length > 160) {
    return res.status(400).json({
      message: "L'email fourni est invalide.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_create_user", {
      nom: nomNormalise,
      email: emailNormalise,
    });
  }

  const utilisateurParNom = await trouverUtilisateurParNom(nomNormalise);

  if (utilisateurParNom) {
    return res.status(400).json({
      message: "Ce nom d'utilisateur existe deja.",
    });
  }

  const utilisateurParEmail = await trouverUtilisateurParEmail(emailNormalise);

  if (utilisateurParEmail) {
    return res.status(400).json({
      message: "Cet email existe deja.",
    });
  }

  const collisionNomEmail = await trouverUtilisateurParEmail(nomNormalise);
  const collisionEmailNom = await trouverUtilisateurParNom(emailNormalise);

  if (collisionNomEmail || collisionEmailNom) {
    return res.status(400).json({
      message:
        "Le nom d'utilisateur et l'email doivent rester distincts des identifiants deja utilises.",
    });
  }

  const motDePasseHash = await bcrypt.hash("123456", 12);
  const creation = await creerUtilisateur({
    nom: nomNormalise,
    email: emailNormalise,
    motDePasse: motDePasseHash,
    estAdmin: 0,
    accesActive: 1,
    modeLectureSeule: 0,
    peutVoirMonetisation: 0,
    doitChangerMotDePasse: 1,
  });

  const utilisateurCree = await trouverUtilisateurParId(creation.id);

  await journaliserActionAdmin(req, "admin_create_user", "success", {
    utilisateur_id: utilisateurCree.id,
    nom: utilisateurCree.nom,
    email: utilisateurCree.email,
  });

  return res.status(201).json({
    message: `Le compte ${utilisateurCree.nom} a ete cree. Mot de passe initial : 123456.`,
    utilisateur: utilisateurCree,
  });
}

async function supprimerUtilisateurAdministration(req, res) {
  const utilisateurId = Number(req.params.id);
  const { mot_de_passe_actuel: motDePasseActuel } = req.body;

  if (!Number.isInteger(utilisateurId) || utilisateurId <= 0 || !motDePasseActuel) {
    return res.status(400).json({
      message: "Compte cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_delete_user", {
      utilisateur_id: utilisateurId,
    });
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.id) === Number(req.utilisateur.id)) {
    return res.status(400).json({
      message: "Vous ne pouvez pas supprimer votre propre compte.",
    });
  }

  if (Number(compteCible.est_admin) === 1) {
    return res.status(400).json({
      message: "Un compte administrateur ne peut pas etre supprime ici.",
    });
  }

  const resumeSuppression = await supprimerUtilisateurAdministrationModele(
    compteCible.id,
    req.utilisateur.id
  );

  await journaliserActionAdmin(req, "admin_delete_user", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    email: compteCible.email,
    total_sessions_supprimees: resumeSuppression.totalSessionsSupprimees,
    total_seances_creees_reattribuees: resumeSuppression.totalSeancesCreeesReattribuees,
    total_seances_modifiees_reattribuees: resumeSuppression.totalSeancesModifieesReattribuees,
  });

  return res.json({
    message: `Le compte ${compteCible.nom} a ete supprime.`,
  });
}

async function reinitialiserMotDePasseCompte(req, res) {
  const {
    utilisateur_id: utilisateurId,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (!Number.isInteger(Number(utilisateurId)) || !motDePasseActuel) {
    return res.status(400).json({
      message: "Compte cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_reset_password", {
      utilisateur_id: Number(utilisateurId),
    });
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.est_admin) === 1 && Number(compteCible.id) !== Number(req.utilisateur.id)) {
    return res.status(400).json({
      message: "Le mot de passe d'un autre administrateur ne peut pas etre reinitialise ici.",
    });
  }

  const motDePasseHash = await bcrypt.hash("123456", 12);
  await reinitialiserMotDePasseUtilisateur(compteCible.id, motDePasseHash);

  const selfReset = Number(compteCible.id) === Number(req.utilisateur.id);

  await journaliserActionAdmin(req, "admin_reset_password", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    email: compteCible.email,
    self_reset: selfReset,
  });

  return res.json({
    message: `Le mot de passe de ${compteCible.nom} a ete reinitialise a 123456.`,
    must_reauthenticate: selfReset,
  });
}

async function mettreAJourAccesUtilisateur(req, res) {
  const {
    utilisateur_id: utilisateurId,
    acces_active: accesActive,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (!Number.isInteger(Number(utilisateurId)) || typeof accesActive !== "boolean" || !motDePasseActuel) {
    return res.status(400).json({
      message: "Compte cible, etat d'acces et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_update_access", {
      utilisateur_id: Number(utilisateurId),
      acces_active: accesActive,
    });
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.id) === Number(req.utilisateur.id)) {
    return res.status(400).json({
      message: "Vous ne pouvez pas suspendre votre propre acces.",
    });
  }

  if (Number(compteCible.est_admin) === 1) {
    return res.status(400).json({
      message: "L'acces d'un administrateur ne peut pas etre modifie ici.",
    });
  }

  await mettreAJourAccesCompte(compteCible.id, accesActive);

  await journaliserActionAdmin(req, "admin_update_access", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    acces_active: accesActive,
  });

  return res.json({
    message: accesActive
      ? `L'acces de ${compteCible.nom} a ete reactive.`
      : `L'acces de ${compteCible.nom} a ete suspendu.`,
  });
}

async function mettreAJourLectureSeuleUtilisateur(req, res) {
  const {
    utilisateur_id: utilisateurId,
    mode_lecture_seule: modeLectureSeule,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (
    !Number.isInteger(Number(utilisateurId)) ||
    typeof modeLectureSeule !== "boolean" ||
    !motDePasseActuel
  ) {
    return res.status(400).json({
      message: "Compte cible, mode lecture seule et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_update_read_only", {
      utilisateur_id: Number(utilisateurId),
      mode_lecture_seule: modeLectureSeule,
    });
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.est_admin) === 1) {
    return res.status(400).json({
      message: "Le mode lecture seule ne s'applique pas a un administrateur.",
    });
  }

  await mettreAJourLectureSeuleCompte(compteCible.id, modeLectureSeule);

  await journaliserActionAdmin(req, "admin_update_read_only", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    mode_lecture_seule: modeLectureSeule,
  });

  return res.json({
    message: modeLectureSeule
      ? `${compteCible.nom} est maintenant en lecture seule.`
      : `${compteCible.nom} peut de nouveau modifier les donnees.`,
  });
}

async function mettreAJourAccesMonetisationUtilisateur(req, res) {
  const {
    utilisateur_id: utilisateurId,
    peut_voir_monetisation: peutVoirMonetisation,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (
    !Number.isInteger(Number(utilisateurId)) ||
    typeof peutVoirMonetisation !== "boolean" ||
    !motDePasseActuel
  ) {
    return res.status(400).json({
      message: "Compte cible, acces monetisation et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(
      req,
      res,
      verification,
      "admin_update_monetisation_access",
      {
        utilisateur_id: Number(utilisateurId),
        peut_voir_monetisation: peutVoirMonetisation,
      }
    );
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.est_admin) === 1) {
    return res.status(400).json({
      message: "La monetisation d'un administrateur n'est pas configurable ici.",
    });
  }

  await mettreAJourAccesMonetisationCompte(compteCible.id, peutVoirMonetisation);

  await journaliserActionAdmin(req, "admin_update_monetisation_access", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    peut_voir_monetisation: peutVoirMonetisation,
  });

  return res.json({
    message: peutVoirMonetisation
      ? `Le menu Monetisation est maintenant visible pour ${compteCible.nom}.`
      : `Le menu Monetisation a ete masque pour ${compteCible.nom}.`,
  });
}

async function revoquerSessionAdministration(req, res) {
  const { sid, mot_de_passe_actuel: motDePasseActuel } = req.body;

  if (!normaliserTexte(sid) || !motDePasseActuel) {
    return res.status(400).json({
      message: "Session cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_revoke_session", {
      sid: normaliserTexte(sid),
    });
  }

  const resultat = await revoquerSession(normaliserTexte(sid));

  if (Number(resultat?.changes || 0) === 0) {
    return res.status(404).json({
      message: "Session introuvable.",
    });
  }

  const selfRevoke = normaliserTexte(sid) === String(req.sessionID || "");

  await journaliserActionAdmin(req, "admin_revoke_session", "success", {
    sid: normaliserTexte(sid),
    self_revoke: selfRevoke,
  });

  return res.json({
    message: selfRevoke
      ? "Votre session actuelle a ete fermee."
      : "La session cible a ete fermee.",
    must_reauthenticate: selfRevoke,
  });
}

async function revoquerSessionsUtilisateurAdministration(req, res) {
  const {
    utilisateur_id: utilisateurId,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (!Number.isInteger(Number(utilisateurId)) || !motDePasseActuel) {
    return res.status(400).json({
      message: "Compte cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_revoke_user_sessions", {
      utilisateur_id: Number(utilisateurId),
    });
  }

  const compteCible = await trouverCompteParId(utilisateurId);

  if (!compteCible) {
    return res.status(404).json({
      message: "Compte cible introuvable.",
    });
  }

  if (Number(compteCible.id) === Number(req.utilisateur.id)) {
    return res.status(400).json({
      message: "Utilisez la deconnexion classique pour fermer votre propre session.",
    });
  }

  const totalSupprime = await revoquerSessionsUtilisateur(compteCible.id);

  await journaliserActionAdmin(req, "admin_revoke_user_sessions", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    total_sessions_supprimees: totalSupprime,
  });

  return res.json({
    message:
      totalSupprime > 0
        ? `${totalSupprime} session(s) de ${compteCible.nom} ont ete fermees.`
        : `Aucune session active a fermer pour ${compteCible.nom}.`,
  });
}

async function supprimerToutesLesSeancesAdmin(req, res) {
  const { mot_de_passe_actuel: motDePasseActuel } = req.body;

  if (!motDePasseActuel) {
    return res.status(400).json({
      message: "Le mot de passe actuel est obligatoire.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_clear_seances");
  }

  const resume = await supprimerToutesLesSeances();

  await journaliserActionAdmin(req, "admin_clear_seances", "success", {
    total_seances_supprimees: resume.totalSeances,
    total_screenshots_supprimes: resume.totalPhotos,
  });

  return res.json({
    message: "Toutes les seances et tous les screenshots ont ete supprimes.",
  });
}

async function supprimerToutHistoriqueAdmin(req, res) {
  const { mot_de_passe_actuel: motDePasseActuel } = req.body;

  if (!motDePasseActuel) {
    return res.status(400).json({
      message: "Le mot de passe actuel est obligatoire.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_clear_history");
  }

  const resume = await supprimerToutHistorique();

  await journaliserActionAdmin(req, "admin_clear_history", "success", {
    total_historique_supprime: resume.totalHistorique,
  });

  return res.json({
    message: "Tout l'historique a ete supprime.",
  });
}

module.exports = {
  recupererVueAdministration,
  ajouterElementCatalogueAdministration,
  creerUtilisateurAdministration,
  supprimerUtilisateurAdministration,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesUtilisateur,
  mettreAJourLectureSeuleUtilisateur,
  revoquerSessionAdministration,
  revoquerSessionsUtilisateurAdministration,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
  mettreAJourAccesMonetisationUtilisateur,
};
