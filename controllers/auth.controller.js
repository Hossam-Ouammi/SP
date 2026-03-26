const bcrypt = require("bcryptjs");

const {
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  mettreAJourMotDePasseUtilisateur,
  mettreAJourEtatConnexionReussie,
  mettreAJourEtatEchecConnexion,
} = require("../models/utilisateur.model");
const { enregistrerEvenementAuth } = require("../models/journal-auth.model");
const { genererTokenCsrf, normaliserIpClient } = require("../middleware/security.middleware");
const { chargerUtilisateurAuthentifie } = require("../middleware/auth.middleware");
const { motDePasseRespectePolitique } = require("../utils/security");
const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} = require("../config/security.config");

const tentativesConnexionParIp = new Map();
const FENETRE_TENTATIVES_IP_MS = 15 * 60 * 1000;
const DUREE_BLOCAGE_IP_MS = 15 * 60 * 1000;
const MAX_TENTATIVES_IP = 5;

const FENETRE_TENTATIVES_COMPTE_MS = 15 * 60 * 1000;
const DUREE_BLOCAGE_COMPTE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES_COMPTE = 5;



function obtenirUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 400);
}

function nettoyerTentativesConnexionIp() {
  const maintenant = Date.now();

  for (const [ip, enregistrement] of tentativesConnexionParIp.entries()) {
    const echecsRecents = enregistrement.echecs.filter(
      (horodatage) => maintenant - horodatage <= FENETRE_TENTATIVES_IP_MS
    );

    if (enregistrement.bloqueJusqua <= maintenant && echecsRecents.length === 0) {
      tentativesConnexionParIp.delete(ip);
      continue;
    }

    enregistrement.echecs = echecsRecents;

    if (enregistrement.bloqueJusqua <= maintenant) {
      enregistrement.bloqueJusqua = 0;
    }
  }
}

function recupererBlocageConnexionActifParIp(req) {
  nettoyerTentativesConnexionIp();

  const enregistrement = tentativesConnexionParIp.get(normaliserIpClient(req));
  const maintenant = Date.now();

  if (!enregistrement || enregistrement.bloqueJusqua <= maintenant) {
    return 0;
  }

  return Math.ceil((enregistrement.bloqueJusqua - maintenant) / 1000);
}

function enregistrerEchecConnexionIp(req) {
  nettoyerTentativesConnexionIp();

  const ip = normaliserIpClient(req);
  const maintenant = Date.now();
  const enregistrement = tentativesConnexionParIp.get(ip) || {
    echecs: [],
    bloqueJusqua: 0,
  };

  enregistrement.echecs.push(maintenant);
  enregistrement.echecs = enregistrement.echecs.filter(
    (horodatage) => maintenant - horodatage <= FENETRE_TENTATIVES_IP_MS
  );

  if (enregistrement.echecs.length >= MAX_TENTATIVES_IP) {
    enregistrement.bloqueJusqua = maintenant + DUREE_BLOCAGE_IP_MS;
    enregistrement.echecs = [];
  }

  tentativesConnexionParIp.set(ip, enregistrement);
}

function reinitialiserTentativesConnexionIp(req) {
  tentativesConnexionParIp.delete(normaliserIpClient(req));
}

function calculerSecondesRestantes(dateIso) {
  const horodatage = new Date(dateIso || "").getTime();

  if (!Number.isFinite(horodatage) || horodatage <= Date.now()) {
    return 0;
  }

  return Math.ceil((horodatage - Date.now()) / 1000);
}

function recupererBlocageCompteActif(utilisateur) {
  return calculerSecondesRestantes(utilisateur?.bloque_jusqua);
}

function calculerNouvelEtatEchecConnexion(utilisateur) {
  const maintenant = Date.now();
  const premierEchecExistant = new Date(
    utilisateur?.premier_echec_connexion_at || ""
  ).getTime();

  let echecsConnexion = Number(utilisateur?.echecs_connexion || 0);
  let premierEchecConnexionAt = null;
  let bloqueJusqua = null;

  if (
    !Number.isFinite(premierEchecExistant) ||
    maintenant - premierEchecExistant > FENETRE_TENTATIVES_COMPTE_MS
  ) {
    echecsConnexion = 1;
    premierEchecConnexionAt = new Date(maintenant).toISOString();
  } else {
    echecsConnexion += 1;
    premierEchecConnexionAt = new Date(premierEchecExistant).toISOString();
  }

  if (echecsConnexion >= MAX_TENTATIVES_COMPTE) {
    echecsConnexion = 0;
    premierEchecConnexionAt = null;
    bloqueJusqua = new Date(maintenant + DUREE_BLOCAGE_COMPTE_MS).toISOString();
  }

  return {
    echecsConnexion,
    premierEchecConnexionAt,
    bloqueJusqua,
  };
}

function regenererSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function sauvegarderSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function detruireSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function obtenirOptionsCookie(req) {
  const secure =
    req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");

  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: SESSION_MAX_AGE_MS,
  };
}

async function journaliserEvenementAuth(req, evenement) {
  await enregistrerEvenementAuth({
    utilisateurId: evenement.utilisateurId || null,
    identifiant: evenement.identifiant || "",
    actionType: evenement.actionType,
    resultat: evenement.resultat,
    adresseIp: normaliserIpClient(req),
    userAgent: obtenirUserAgent(req),
    details: evenement.details || null,
  });
}

async function connecterUtilisateur(req, res) {
  const { username, email, mot_de_passe: motDePasse } = req.body;
  const identifiant = String(username || email || "").trim();
  const blocageIpSecondes = recupererBlocageConnexionActifParIp(req);

  if (blocageIpSecondes > 0) {
    res.setHeader("Retry-After", String(blocageIpSecondes));
    await journaliserEvenementAuth(req, {
      identifiant,
      actionType: "login",
      resultat: "blocked_ip",
      details: { retry_after_seconds: blocageIpSecondes },
    });
    return res.status(429).json({
      message: "Trop de tentatives de connexion. Reessayez dans quelques minutes.",
    });
  }

  if (!identifiant || !motDePasse) {
    return res.status(400).json({
      message: "Identifiant et mot de passe obligatoires.",
    });
  }

  if (identifiant.length > 120 || String(motDePasse).length > 200) {
    return res.status(400).json({
      message: "Les identifiants fournis sont invalides.",
    });
  }

  const utilisateur = await trouverUtilisateurParNomOuEmail(identifiant);

  if (!utilisateur) {
    enregistrerEchecConnexionIp(req);
    await journaliserEvenementAuth(req, {
      identifiant,
      actionType: "login",
      resultat: "failed_unknown_user",
    });
    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  if (Number(utilisateur.acces_active) !== 1) {
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant,
      actionType: "login",
      resultat: "blocked_disabled_account",
    });
    return res.status(403).json({
      message: "Votre acces est actuellement suspendu.",
    });
  }

  const blocageCompteSecondes = recupererBlocageCompteActif(utilisateur);

  if (blocageCompteSecondes > 0) {
    res.setHeader("Retry-After", String(blocageCompteSecondes));
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant,
      actionType: "login",
      resultat: "blocked_account",
      details: { retry_after_seconds: blocageCompteSecondes },
    });
    return res.status(429).json({
      message: "Compte temporairement bloque. Reessayez plus tard.",
    });
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);

  if (!motDePasseValide) {
    enregistrerEchecConnexionIp(req);
    const nouvelEtatEchec = calculerNouvelEtatEchecConnexion(utilisateur);
    await mettreAJourEtatEchecConnexion(utilisateur.id, nouvelEtatEchec);

    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant,
      actionType: "login",
      resultat: nouvelEtatEchec.bloqueJusqua ? "blocked_after_failure" : "failed_password",
    });

    if (nouvelEtatEchec.bloqueJusqua) {
      const blocageSecondes = calculerSecondesRestantes(nouvelEtatEchec.bloqueJusqua);
      res.setHeader("Retry-After", String(blocageSecondes));
      return res.status(429).json({
        message:
          "Compte temporairement bloque apres plusieurs tentatives. Reessayez plus tard.",
      });
    }

    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  await regenererSession(req);
  await mettreAJourEtatConnexionReussie(utilisateur.id, normaliserIpClient(req));

  const utilisateurActualise = await trouverUtilisateurParId(utilisateur.id);

  req.session.utilisateur = {
    id: utilisateurActualise.id,
    nom: utilisateurActualise.nom,
    email: utilisateurActualise.email,
    session_version: utilisateurActualise.session_version,
    est_admin: utilisateurActualise.est_admin,
    peut_voir_monetisation: utilisateurActualise.peut_voir_monetisation,
    peut_voir_aujourdhui: utilisateurActualise.peut_voir_aujourdhui,
    peut_voir_indisponibilites: utilisateurActualise.peut_voir_indisponibilites,
  };
  req.session.session_meta = {
    adresse_ip: normaliserIpClient(req),
    user_agent: obtenirUserAgent(req),
    connected_at: new Date().toISOString(),
  };
  req.session.csrfToken = genererTokenCsrf();
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;

  await sauvegarderSession(req);
  reinitialiserTentativesConnexionIp(req);

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  await journaliserEvenementAuth(req, {
    utilisateurId: utilisateurActualise.id,
    identifiant,
    actionType: "login",
    resultat: "success",
    details: {
      must_change_password:
        Number(utilisateurActualise.doit_changer_mot_de_passe) === 1,
    },
  });

  return res.json({
    message:
      Number(utilisateurActualise.doit_changer_mot_de_passe) === 1
        ? "Connexion reussie. Vous devez changer le mot de passe avant de continuer."
        : "Connexion reussie.",
    utilisateur: utilisateurActualise,
  });
}

async function modifierMotDePasse(req, res) {
  const {
    mot_de_passe_actuel: motDePasseActuel,
    nouveau_mot_de_passe: nouveauMotDePasse,
  } = req.body;

  if (!motDePasseActuel || !nouveauMotDePasse) {
    return res.status(400).json({
      message: "Mot de passe actuel et nouveau mot de passe obligatoires.",
    });
  }

  if (!motDePasseRespectePolitique(nouveauMotDePasse)) {
    return res.status(400).json({
      message:
        "Le nouveau mot de passe doit contenir au moins 12 caracteres, avec une minuscule, une majuscule, un chiffre et un caractere special.",
    });
  }

  const utilisateur = await trouverUtilisateurAvecMotDePasseParId(req.utilisateur.id);

  if (!utilisateur) {
    return res.status(404).json({
      message: "Utilisateur introuvable.",
    });
  }

  const motDePasseActuelValide = await bcrypt.compare(
    motDePasseActuel,
    utilisateur.mot_de_passe
  );

  if (!motDePasseActuelValide) {
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant: utilisateur.nom,
      actionType: "password_change",
      resultat: "failed_current_password",
    });
    return res.status(400).json({
      message: "Le mot de passe actuel est incorrect.",
    });
  }

  const nouveauMotDePasseIdentique = await bcrypt.compare(
    nouveauMotDePasse,
    utilisateur.mot_de_passe
  );

  if (nouveauMotDePasseIdentique) {
    return res.status(400).json({
      message: "Le nouveau mot de passe doit etre different de l'ancien.",
    });
  }

  const nouveauMotDePasseHash = await bcrypt.hash(nouveauMotDePasse, 12);
  await mettreAJourMotDePasseUtilisateur(utilisateur.id, nouveauMotDePasseHash);

  const utilisateurActualise = await trouverUtilisateurParId(utilisateur.id);

  await regenererSession(req);
  req.session.utilisateur = {
    id: utilisateurActualise.id,
    nom: utilisateurActualise.nom,
    email: utilisateurActualise.email,
    session_version: utilisateurActualise.session_version,
    est_admin: utilisateurActualise.est_admin,
    peut_voir_monetisation: utilisateurActualise.peut_voir_monetisation,
    peut_voir_aujourdhui: utilisateurActualise.peut_voir_aujourdhui,
    peut_voir_indisponibilites: utilisateurActualise.peut_voir_indisponibilites,
  };
  req.session.session_meta = {
    ...(req.session.session_meta || {}),
    adresse_ip: normaliserIpClient(req),
    user_agent: obtenirUserAgent(req),
    connected_at: req.session.session_meta?.connected_at || new Date().toISOString(),
  };
  req.session.csrfToken = genererTokenCsrf();
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
  await sauvegarderSession(req);

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  await journaliserEvenementAuth(req, {
    utilisateurId: utilisateurActualise.id,
    identifiant: utilisateurActualise.nom,
    actionType: "password_change",
    resultat: "success",
  });

  return res.json({
    message: "Mot de passe modifie avec succes.",
    utilisateur: utilisateurActualise,
  });
}

async function deconnecterUtilisateur(req, res) {
  const optionsCookie = obtenirOptionsCookie(req);
  const utilisateurSession = req.session?.utilisateur || null;

  if (utilisateurSession) {
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateurSession.id,
      identifiant: utilisateurSession.nom || utilisateurSession.email,
      actionType: "logout",
      resultat: "success",
    }).catch(() => {});
  }

  if (!req.session) {
    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Deconnexion reussie." });
  }

  try {
    await detruireSession(req);
    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Deconnexion reussie." });
  } catch (error) {
    return res.status(500).json({
      message: "La deconnexion a echoue.",
    });
  }
}

async function recupererUtilisateurConnecte(req, res) {
  const utilisateur = await chargerUtilisateurAuthentifie(req, res);

  if (!utilisateur) {
    return res.status(401).json({
      message: "Aucun utilisateur connecte.",
    });
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = genererTokenCsrf();
    await sauvegarderSession(req);
  }

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  return res.json({ utilisateur });
}

module.exports = {
  connecterUtilisateur,
  modifierMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
};
