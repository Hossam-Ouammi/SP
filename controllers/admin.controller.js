const net = require("net");
const bcrypt = require("bcryptjs");
const { genererMotDePasseAleatoire } = require("../utils/security");
const { normaliserIpClient } = require("../middleware/security.middleware");
const { executerAvecVerrou } = require("../utils/job-lock");
const { executerMaintenanceBaseDeDonnees } = require("../models/db");

const {
  creerUtilisateur,
  normaliserEmailUtilisateur,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  trouverUtilisateurParEmail,
  trouverUtilisateurParNom,
  reinitialiserMotDePasseUtilisateur,
} = require("../models/utilisateur.model");
const {
  listerComptesAdministration,
  trouverCompteParId,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  mettreAJourTarifHoraireCompte,
  mettreAJourAccesAujourdhuiCompte,
  mettreAJourAccesIndisponibilitesCompte,
  listerSessionsActives,
  revoquerSession,
  revoquerSessionsUtilisateur,
  supprimerToutesLesSeances,
  supprimerToutHistorique,
  recupererCatalogueAdministration,
  trouverElementCatalogue,
  trouverElementCatalogueParId,
  ajouterElementCatalogue,
  compterUtilisationElementCatalogue,
  supprimerElementCatalogue,
  supprimerUtilisateurAdministration: supprimerUtilisateurAdministrationModele,
} = require("../models/admin.model");
const {
  enregistrerEvenementAuth,
  listerJournalAuth,
} = require("../models/journal-auth.model");
const {
  listerIpsBloquees,
  bloquerIp,
  debloquerIp,
} = require("../models/ip-blocklist.model");
const {
  listerAppareilsAutoLogin,
  trouverAppareilAutoLoginParId,
  supprimerAppareilAutoLoginParId,
  supprimerAppareilsAutoLoginUtilisateur,
} = require("../models/trusted-device.model");
const { effacerCookieConnexionAutomatique } = require("../middleware/auth.middleware");

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
  const [comptes, sessions, catalogue, journalAuth, ipsBloquees, trustedDevices] = await Promise.all([
    listerComptesAdministration(),
    listerSessionsActives(req.sessionID),
    recupererCatalogueAdministration(),
    listerJournalAuth(200),
    listerIpsBloquees(),
    listerAppareilsAutoLogin(),
  ]);

  return res.json({
    administration: {
      comptes,
      sessions,
      catalogue,
      journal_auth: journalAuth,
      ips_bloquees: ipsBloquees,
      trusted_devices: trustedDevices,
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

  if (typeNormalise !== "compte") {
    return res.status(400).json({
      message: "La gestion admin du catalogue est limitee aux comptes.",
    });
  }

  if (!valeurNormalisee || !motDePasseActuel) {
    return res.status(400).json({
      message: "Valeur du compte et mot de passe actuel obligatoires.",
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
      message: "Ce compte existe deja.",
    });
  }

  const elementCatalogue = await ajouterElementCatalogue(typeNormalise, valeurNormalisee);

  await journaliserActionAdmin(req, "admin_add_catalog_item", "success", {
    type: typeNormalise,
    valeur: elementCatalogue.valeur,
    element_id: elementCatalogue.id,
  });

  return res.status(201).json({
    message: `Le compte ${elementCatalogue.valeur} a ete ajoute.`,
    element: elementCatalogue,
  });
}

async function supprimerElementCatalogueAdministration(req, res) {
  const elementId = Number(req.params.id);
  const { mot_de_passe_actuel: motDePasseActuel } = req.body;

  if (!Number.isInteger(elementId) || elementId <= 0 || !motDePasseActuel) {
    return res.status(400).json({
      message: "Element cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_delete_catalog_item", {
      element_id: elementId,
    });
  }

  const elementCatalogue = await trouverElementCatalogueParId(elementId);

  if (!elementCatalogue) {
    return res.status(404).json({
      message: "Element du catalogue introuvable.",
    });
  }

  if (elementCatalogue.type === "matiere") {
    return res.status(400).json({
      message: "La gestion admin des matieres n'est plus disponible.",
    });
  }

  const totalUtilisations = await compterUtilisationElementCatalogue(
    elementCatalogue.type,
    elementCatalogue.valeur
  );

  await supprimerElementCatalogue(elementCatalogue.id);

  await journaliserActionAdmin(req, "admin_delete_catalog_item", "success", {
    element_id: elementCatalogue.id,
    type: elementCatalogue.type,
    valeur: elementCatalogue.valeur,
    seances_existantes_conservees: totalUtilisations,
  });

  return res.json({
    message: `Le compte ${elementCatalogue.valeur} a ete supprime du catalogue. Les seances existantes restent conservees.`,
  });
}

async function creerUtilisateurAdministration(req, res) {
  const {
    nom,
    email,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  const nomNormalise = normaliserTexte(nom);
  const emailNormalise = normaliserEmailUtilisateur(email);

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

  const motDePasseTemporaire = genererMotDePasseAleatoire();
  const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, 12);
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
    message: `Le compte ${utilisateurCree.nom} a ete cree. Mot de passe initial : ${motDePasseTemporaire}.`,
    mot_de_passe_temporaire: motDePasseTemporaire,
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
    total_seances_legacy_detachees: resumeSuppression.totalSeancesLegacyDetachees,
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

  const motDePasseTemporaire = genererMotDePasseAleatoire();
  const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, 12);
  await reinitialiserMotDePasseUtilisateur(compteCible.id, motDePasseHash);
  await supprimerAppareilsAutoLoginUtilisateur(compteCible.id);

  const selfReset = Number(compteCible.id) === Number(req.utilisateur.id);

  await journaliserActionAdmin(req, "admin_reset_password", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    email: compteCible.email,
    self_reset: selfReset,
  });

  return res.json({
    message: `Le mot de passe de ${compteCible.nom} a ete reinitialise.`,
    mot_de_passe_temporaire: motDePasseTemporaire,
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

  if (!accesActive) {
    await supprimerAppareilsAutoLoginUtilisateur(compteCible.id);
  }

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

async function mettreAJourTarifCompteUtilisateur(req, res) {
  const {
    compte_id: compteIdBrut,
    utilisateur_id: utilisateurIdLegacy,
    tarif_horaire: tarifHoraire,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;
  const compteId = Number(compteIdBrut ?? utilisateurIdLegacy);

  const tarifNormalise = Number(tarifHoraire);

  if (
    !Number.isInteger(compteId) ||
    !Number.isFinite(tarifNormalise) ||
    !Number.isInteger(tarifNormalise) ||
    tarifNormalise < 0 ||
    tarifNormalise > 5000 ||
    !motDePasseActuel
  ) {
    return res.status(400).json({
      message:
        "Compte de seance, tarif horaire entier entre 0 et 5000, et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(
      req,
      res,
      verification,
      "admin_update_hourly_rate",
      {
        compte_id: compteId,
        tarif_horaire: tarifNormalise,
      }
    );
  }

  const compteCible = await trouverElementCatalogueParId(compteId);

  if (!compteCible || compteCible.type !== "compte") {
    return res.status(404).json({
      message: "Compte de seance introuvable.",
    });
  }

  await mettreAJourTarifHoraireCompte(compteCible.id, tarifNormalise);

  await journaliserActionAdmin(req, "admin_update_hourly_rate", "success", {
    compte_id: compteCible.id,
    compte: compteCible.valeur,
    tarif_horaire: tarifNormalise,
  });

  return res.json({
    message: `Le tarif horaire du compte ${compteCible.valeur} est maintenant de ${tarifNormalise} dh.`,
  });
}

async function mettreAJourAccesAujourdhuiUtilisateur(req, res) {
  const {
    utilisateur_id: utilisateurId,
    peut_voir_aujourdhui: peutVoirAujourdhui,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (
    !Number.isInteger(Number(utilisateurId)) ||
    typeof peutVoirAujourdhui !== "boolean" ||
    !motDePasseActuel
  ) {
    return res.status(400).json({
      message: "Compte cible, acces Aujourd'hui et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(
      req,
      res,
      verification,
      "admin_update_today_access",
      {
        utilisateur_id: Number(utilisateurId),
        peut_voir_aujourdhui: peutVoirAujourdhui,
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
      message: "Le menu Aujourd'hui d'un administrateur n'est pas configurable ici.",
    });
  }

  await mettreAJourAccesAujourdhuiCompte(compteCible.id, peutVoirAujourdhui);

  await journaliserActionAdmin(req, "admin_update_today_access", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    peut_voir_aujourdhui: peutVoirAujourdhui,
  });

  return res.json({
    message: peutVoirAujourdhui
      ? `Le menu Aujourd'hui est maintenant visible pour ${compteCible.nom}.`
      : `Le menu Aujourd'hui a ete masque pour ${compteCible.nom}.`,
  });
}

async function mettreAJourAccesIndisponibilitesUtilisateur(req, res) {
  const {
    utilisateur_id: utilisateurId,
    peut_voir_indisponibilites: peutVoirIndisponibilites,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  if (
    !Number.isInteger(Number(utilisateurId)) ||
    typeof peutVoirIndisponibilites !== "boolean" ||
    !motDePasseActuel
  ) {
    return res.status(400).json({
      message: "Compte cible, acces Indisponibilites et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(
      req,
      res,
      verification,
      "admin_update_unavailability_access",
      {
        utilisateur_id: Number(utilisateurId),
        peut_voir_indisponibilites: peutVoirIndisponibilites,
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
      message: "Le menu Indisponibilites d'un administrateur n'est pas configurable ici.",
    });
  }

  await mettreAJourAccesIndisponibilitesCompte(compteCible.id, peutVoirIndisponibilites);

  await journaliserActionAdmin(req, "admin_update_unavailability_access", "success", {
    utilisateur_id: compteCible.id,
    nom: compteCible.nom,
    peut_voir_indisponibilites: peutVoirIndisponibilites,
  });

  return res.json({
    message: peutVoirIndisponibilites
      ? `Le menu Indisponibilites est maintenant visible pour ${compteCible.nom}.`
      : `Le menu Indisponibilites a ete masque pour ${compteCible.nom}.`,
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
    total_fichiers_associes_supprimes: resume.totalPhotos,
  });

  return res.json({
    message: "Toutes les seances ont ete supprimees.",
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
    total_journal_auth_supprime: resume.totalJournalAuth,
  });

  return res.json({
    message: "L'historique a ete reinitialise. L'action de purge a ete conservee dans le journal d'audit.",
  });
}

async function executerMaintenanceSqliteAdministration(req, res) {
  const { mot_de_passe_actuel: motDePasseActuel } = req.body || {};

  if (!motDePasseActuel) {
    return res.status(400).json({
      message: "Le mot de passe actuel est obligatoire.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_sqlite_maintenance");
  }

  const execution = await executerAvecVerrou(
    "sqlite-maintenance",
    executerMaintenanceBaseDeDonnees,
    { staleMs: 30 * 60 * 1000 }
  );

  if (execution.skipped) {
    return res.status(409).json({
      message: "Une maintenance SQLite est deja en cours.",
    });
  }

  await journaliserActionAdmin(req, "admin_sqlite_maintenance", "success", {
    integrity_check: execution.result.integrity_check,
    wal_checkpoint: execution.result.wal_checkpoint,
  });

  return res.json({
    message: "Maintenance SQLite terminee.",
    maintenance: execution.result,
  });
}

async function recupererJournalAuthentification(req, res) {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const logs = await listerJournalAuth(limite);
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la recuperation des logs." });
  }
}

async function recupererToutesLesSessions(req, res) {
  try {
    const sessions = await listerSessionsActives(req.sessionID);
    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la recuperation des sessions." });
  }
}

async function revoquerSessionSpecifique(req, res) {
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

  try {
    const resultat = await revoquerSession(normaliserTexte(sid));

    if (Number(resultat?.changes || 0) === 0) {
      return res.status(404).json({ message: "Session introuvable." });
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
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la revocation de la session." });
  }
}

async function recupererIpsBloquees(req, res) {
  try {
    const ips = await listerIpsBloquees();
    return res.json({ ips });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la recuperation de la blacklist." });
  }
}

function normaliserIpSaisie(ip) {
  const valeur = normaliserTexte(ip);

  if (!valeur) {
    return "";
  }

  if (net.isIP(valeur)) {
    return valeur;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(valeur)) {
    const sansPort = valeur.replace(/:\d+$/, "");
    if (net.isIP(sansPort)) {
      return sansPort;
    }
  }

  return "";
}

async function bloquerNouvelleIp(req, res) {
  const {
    ip,
    raison,
    mot_de_passe_actuel: motDePasseActuel,
  } = req.body;

  const ipNormalisee = normaliserIpSaisie(ip);
  const raisonNormalisee = normaliserTexte(raison).slice(0, 160);
  const ipCourante = normaliserIpClient(req);

  if (!ipNormalisee || !motDePasseActuel) {
    return res.status(400).json({
      message: "Adresse IP valide et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_block_ip", {
      ip: ipNormalisee,
    });
  }

  if (ipCourante && ipNormalisee === ipCourante) {
    return res.status(400).json({
      message: "Vous ne pouvez pas bloquer votre propre adresse IP depuis cette session.",
    });
  }

  try {
    await bloquerIp(
      ipNormalisee,
      raisonNormalisee || "Bloquee par l'administrateur",
      req.utilisateur.id
    );

    await journaliserActionAdmin(req, "admin_block_ip", "success", {
      ip: ipNormalisee,
      raison: raisonNormalisee || "Bloquee par l'administrateur",
    });

    return res.json({ message: `IP ${ipNormalisee} bloquee.` });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors du blocage de l'IP." });
  }
}

async function debloquerIpExistante(req, res) {
  const ip = normaliserIpSaisie(decodeURIComponent(req.params.ip || ""));
  const { mot_de_passe_actuel: motDePasseActuel } = req.body || {};

  if (!ip || !motDePasseActuel) {
    return res.status(400).json({
      message: "Adresse IP valide et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_unblock_ip", {
      ip,
    });
  }

  try {
    const resultat = await debloquerIp(ip);

    if (Number(resultat?.changes || 0) === 0) {
      return res.status(404).json({ message: "Adresse IP introuvable." });
    }

    await journaliserActionAdmin(req, "admin_unblock_ip", "success", { ip });
    return res.json({ message: `IP ${ip} debloquee.` });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors du deblocage de l'IP." });
  }
}

async function revoquerAppareilAutoLoginAdministration(req, res) {
  const appareilId = Number(req.params.id);
  const { mot_de_passe_actuel: motDePasseActuel } = req.body || {};

  if (!Number.isInteger(appareilId) || appareilId <= 0 || !motDePasseActuel) {
    return res.status(400).json({
      message: "Appareil cible et mot de passe actuel obligatoires.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    return repondreErreurVerification(req, res, verification, "admin_revoke_trusted_device", {
      trusted_device_id: appareilId,
    });
  }

  const appareil = await trouverAppareilAutoLoginParId(appareilId);

  if (!appareil) {
    return res.status(404).json({
      message: "Appareil auto-login introuvable.",
    });
  }

  await supprimerAppareilAutoLoginParId(appareil.id);

  await journaliserActionAdmin(req, "admin_revoke_trusted_device", "success", {
    trusted_device_id: appareil.id,
    utilisateur_id: appareil.utilisateur_id,
    utilisateur_nom: appareil.utilisateur_nom,
    device_label: appareil.device_label,
  });

  if (Number(appareil.utilisateur_id) === Number(req.utilisateur.id)) {
    effacerCookieConnexionAutomatique(req, res);
  }

  return res.json({
    message: `L'auto-login de ${appareil.device_label} a ete revoque.`,
  });
}

module.exports = {
  recupererVueAdministration,
  ajouterElementCatalogueAdministration,
  supprimerElementCatalogueAdministration,
  creerUtilisateurAdministration,
  supprimerUtilisateurAdministration,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesUtilisateur,
  mettreAJourLectureSeuleUtilisateur,
  revoquerSessionAdministration,
  revoquerSessionsUtilisateurAdministration,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
  executerMaintenanceSqliteAdministration,
  mettreAJourAccesAujourdhuiUtilisateur,
  mettreAJourAccesIndisponibilitesUtilisateur,
  mettreAJourAccesMonetisationUtilisateur,
  mettreAJourTarifCompteUtilisateur,
  recupererJournalAuthentification,
  recupererToutesLesSessions,
  revoquerSessionSpecifique,
  recupererIpsBloquees,
  bloquerNouvelleIp,
  debloquerIpExistante,
  revoquerAppareilAutoLoginAdministration,
};
