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
const {
  genererTokenCsrf,
  normaliserIpClient,
  requeteEstSecurisee,
} = require("../middleware/security.middleware");
const {
  chargerUtilisateurAuthentifie,
  initialiserSessionAuthentifiee,
  obtenirOptionsCookieConnexionAutomatique,
  recupererCookieRequete,
  effacerCookieConnexionAutomatique,
  detruireSession,
} = require("../middleware/auth.middleware");
const { motDePasseRespectePolitique } = require("../utils/security");
const {
  analyserCookieAppareil,
  creerAppareilAutoLogin,
  supprimerAppareilAutoLoginParSelector,
  supprimerAppareilsAutoLoginUtilisateur,
} = require("../models/trusted-device.model");
const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  AUTO_LOGIN_COOKIE_NAME,
} = require("../config/security.config");

const tentativesConnexionParIp = new Map();
const FENETRE_TENTATIVES_IP_MS = 15 * 60 * 1000;
const DUREE_BLOCAGE_IP_MS = 15 * 60 * 1000;
const MAX_TENTATIVES_IP = 5;

const FENETRE_TENTATIVES_COMPTE_MS = 15 * 60 * 1000;
const DUREE_BLOCAGE_COMPTE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES_COMPTE = 5;

function normaliserIdentifiantConnexion(identifiant) {
  const identifiantBrut = String(identifiant || "").trim();
  const identifiantNormalise = identifiantBrut.toLowerCase();

  if (identifiantNormalise === "ami") {
    return "Abdo";
  }

  if (identifiantNormalise === "ami@test.com") {
    return "abdo@test.com";
  }

  return identifiantBrut;
}

function creerErreurConnexion(status, message, options = {}) {
  const erreur = new Error(message);
  erreur.status = status;
  Object.assign(erreur, options);
  return erreur;
}



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

function obtenirOptionsCookie(req) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: requeteEstSecurisee(req),
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

function valeurBooleenneActive(valeur) {
  return valeur === true || valeur === 1 || valeur === "1" || valeur === "true" || valeur === "on";
}

async function supprimerAppareilAutoLoginCourant(req) {
  const cookieAppareil = recupererCookieRequete(req, AUTO_LOGIN_COOKIE_NAME);
  const donneesCookie = analyserCookieAppareil(cookieAppareil);

  if (!donneesCookie) {
    return;
  }

  await supprimerAppareilAutoLoginParSelector(donneesCookie.selector);
}

async function synchroniserConnexionAutomatique(req, res, utilisateur, rememberDevice) {
  await supprimerAppareilAutoLoginCourant(req).catch(() => {});

  if (!rememberDevice) {
    effacerCookieConnexionAutomatique(req, res);
    return;
  }

  const appareil = await creerAppareilAutoLogin({
    utilisateurId: utilisateur.id,
    sessionVersion: utilisateur.session_version,
    adresseIp: normaliserIpClient(req),
    userAgent: obtenirUserAgent(req),
  });

  res.cookie(
    AUTO_LOGIN_COOKIE_NAME,
    appareil.cookieValue,
    obtenirOptionsCookieConnexionAutomatique(req)
  );
}

async function authentifierConnexion(req, res, options = {}) {
  const identifiant = normaliserIdentifiantConnexion(options.identifiant);
  const motDePasse = options.motDePasse;
  const rememberDevice = options.rememberDevice;
  const blocageIpSecondes = recupererBlocageConnexionActifParIp(req);

  if (blocageIpSecondes > 0) {
    await journaliserEvenementAuth(req, {
      identifiant,
      actionType: "login",
      resultat: "blocked_ip",
      details: { retry_after_seconds: blocageIpSecondes },
    });
    throw creerErreurConnexion(
      429,
      "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      {
        retryAfter: blocageIpSecondes,
      }
    );
  }

  if (!identifiant || !motDePasse) {
    throw creerErreurConnexion(400, "Identifiant et mot de passe obligatoires.");
  }

  if (identifiant.length > 120 || String(motDePasse).length > 200) {
    throw creerErreurConnexion(400, "Les identifiants fournis sont invalides.");
  }

  const utilisateur = await trouverUtilisateurParNomOuEmail(identifiant);

  if (!utilisateur) {
    enregistrerEchecConnexionIp(req);
    await journaliserEvenementAuth(req, {
      identifiant,
      actionType: "login",
      resultat: "failed_unknown_user",
    });
    throw creerErreurConnexion(401, "Identifiants invalides.");
  }

  if (Number(utilisateur.acces_active) !== 1) {
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant,
      actionType: "login",
      resultat: "blocked_disabled_account",
    });
    throw creerErreurConnexion(403, "Votre accès est actuellement suspendu.");
  }

  const blocageCompteSecondes = recupererBlocageCompteActif(utilisateur);

  if (blocageCompteSecondes > 0) {
    await journaliserEvenementAuth(req, {
      utilisateurId: utilisateur.id,
      identifiant,
      actionType: "login",
      resultat: "blocked_account",
      details: { retry_after_seconds: blocageCompteSecondes },
    });
    throw creerErreurConnexion(429, "Compte temporairement bloque. Réessayez plus tard.", {
      retryAfter: blocageCompteSecondes,
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
      throw creerErreurConnexion(
        429,
        "Compte temporairement bloque apres plusieurs tentatives. Réessayez plus tard.",
        {
          retryAfter: blocageSecondes,
        }
      );
    }

    throw creerErreurConnexion(401, "Identifiants invalides.");
  }

  await mettreAJourEtatConnexionReussie(utilisateur.id, normaliserIpClient(req));

  const utilisateurActualise = await trouverUtilisateurParId(utilisateur.id);

  await initialiserSessionAuthentifiee(req, utilisateurActualise);
  await synchroniserConnexionAutomatique(
    req,
    res,
    utilisateurActualise,
    valeurBooleenneActive(rememberDevice)
  );
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

  return {
    message:
      Number(utilisateurActualise.doit_changer_mot_de_passe) === 1
        ? "Connexion reussie. Vous devez changer le mot de passe avant de continuer."
        : "Connexion reussie.",
    utilisateur: utilisateurActualise,
  };
}

async function connecterUtilisateur(req, res) {
  const { username, email, mot_de_passe: motDePasse, remember_device: rememberDevice } = req.body;

  try {
    const resultat = await authentifierConnexion(req, res, {
      identifiant: String(username || email || "").trim(),
      motDePasse,
      rememberDevice,
    });

    res.setHeader("X-CSRF-Token", req.session.csrfToken);
    return res.json(resultat);
  } catch (error) {
    if (error.retryAfter) {
      res.setHeader("Retry-After", String(error.retryAfter));
    }

    return res.status(error.status || 500).json({
      message: error.message || "La connexion a échoué.",
    });
  }
}

async function connecterUtilisateurDepuisFormulaire(req, res) {
  const { username, email, mot_de_passe: motDePasse, remember_device: rememberDevice } = req.body;
  const identifiantSaisi = String(username || email || "").trim();

  try {
    await authentifierConnexion(req, res, {
      identifiant: identifiantSaisi,
      motDePasse,
      rememberDevice,
    });

    if (req.session) {
      delete req.session.login_error;
      delete req.session.login_username;
      await sauvegarderSession(req).catch(() => {});
    }

    return res.redirect(303, "/");
  } catch (error) {
    if (req.session) {
      req.session.login_error = error.message || "La connexion a échoué.";
      req.session.login_username = identifiantSaisi;
      await sauvegarderSession(req).catch(() => {});
    }

    return res.redirect(303, "/");
  }
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
      message: "Le nouveau mot de passe doit être différent de l'ancien.",
    });
  }

  const nouveauMotDePasseHash = await bcrypt.hash(nouveauMotDePasse, 12);
  await mettreAJourMotDePasseUtilisateur(utilisateur.id, nouveauMotDePasseHash);
  await supprimerAppareilsAutoLoginUtilisateur(utilisateur.id);

  const utilisateurActualise = await trouverUtilisateurParId(utilisateur.id);

  await initialiserSessionAuthentifiee(req, utilisateurActualise, {
    connectedAt: req.session?.session_meta?.connected_at || new Date().toISOString(),
  });
  effacerCookieConnexionAutomatique(req, res);

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  await journaliserEvenementAuth(req, {
    utilisateurId: utilisateurActualise.id,
    identifiant: utilisateurActualise.nom,
    actionType: "password_change",
    resultat: "success",
  });

  return res.json({
    message: "Mot de passe modifié avec succès.",
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
    await supprimerAppareilAutoLoginCourant(req).catch(() => {});
    effacerCookieConnexionAutomatique(req, res);
    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Deconnexion reussie." });
  }

  try {
    await supprimerAppareilAutoLoginCourant(req).catch(() => {});
    await detruireSession(req);
    effacerCookieConnexionAutomatique(req, res);
    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Deconnexion reussie." });
  } catch (error) {
    return res.status(500).json({
      message: "La déconnexion a échoué.",
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
  connecterUtilisateurDepuisFormulaire,
  modifierMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
};
