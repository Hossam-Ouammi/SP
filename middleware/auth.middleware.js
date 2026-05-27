const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  AUTO_LOGIN_COOKIE_NAME,
  AUTO_LOGIN_MAX_AGE_MS,
} = require("../config/security.config");
const { trouverUtilisateurParId } = require("../models/utilisateur.model");
const {
  genererTokenCsrf,
  normaliserIpClient,
  requeteEstSecurisee,
} = require("./security.middleware");
const {
  analyserCookieAppareil,
  hacherValidator,
  trouverAppareilAutoLoginParSelector,
  renouvelerAppareilAutoLogin,
  supprimerAppareilAutoLoginParSelector,
} = require("../models/trusted-device.model");

function obtenirOptionsCookie(req) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: requeteEstSecurisee(req),
  };
}

function obtenirOptionsCookieConnexionAutomatique(req) {
  return {
    ...obtenirOptionsCookie(req),
    maxAge: AUTO_LOGIN_MAX_AGE_MS,
  };
}

function recupererCookiesRequete(req) {
  const header = String(req.headers.cookie || "");

  return header.split(";").reduce((accumulateur, paire) => {
    const indexSeparateur = paire.indexOf("=");

    if (indexSeparateur <= 0) {
      return accumulateur;
    }

    const cle = decoderComposantCookie(paire.slice(0, indexSeparateur).trim());
    const valeur = decoderComposantCookie(paire.slice(indexSeparateur + 1).trim());

    if (!cle) {
      return accumulateur;
    }

    accumulateur[cle] = valeur;
    return accumulateur;
  }, {});
}

function decoderComposantCookie(valeur) {
  try {
    return decodeURIComponent(String(valeur || ""));
  } catch (error) {
    return "";
  }
}

function recupererCookieRequete(req, nomCookie) {
  return recupererCookiesRequete(req)[nomCookie] || "";
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
        return;
      }

      resolve();
    });
  });
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

function effacerCookieConnexionAutomatique(req, res) {
  res.clearCookie(AUTO_LOGIN_COOKIE_NAME, obtenirOptionsCookieConnexionAutomatique(req));
}

async function invaliderSessionEtCookie(req, res) {
  await detruireSession(req).catch(() => {});
  res.clearCookie(SESSION_COOKIE_NAME, obtenirOptionsCookie(req));
  effacerCookieConnexionAutomatique(req, res);
}

async function initialiserSessionAuthentifiee(req, utilisateur, options = {}) {
  await regenererSession(req);

  req.session.utilisateur = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
    session_version: utilisateur.session_version,
    est_admin: utilisateur.est_admin,
    peut_voir_monetisation: utilisateur.peut_voir_monetisation,
    peut_voir_aujourdhui: utilisateur.peut_voir_aujourdhui,
    peut_voir_indisponibilites: utilisateur.peut_voir_indisponibilites,
  };
  req.session.session_meta = {
    adresse_ip: normaliserIpClient(req),
    user_agent: String(req.headers["user-agent"] || "").slice(0, 400),
    connected_at: options.connectedAt || new Date().toISOString(),
  };
  req.session.csrfToken = genererTokenCsrf();
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;

  await sauvegarderSession(req);
}

async function restaurerConnexionAutomatique(req, res, next) {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    if (!(req.path === "/" || req.path.startsWith("/api/"))) {
      return next();
    }

    if (req.session?.utilisateur?.id) {
      return next();
    }

    const cookieAppareil = recupererCookieRequete(req, AUTO_LOGIN_COOKIE_NAME);

    if (!cookieAppareil) {
      return next();
    }

    const donneesCookie = analyserCookieAppareil(cookieAppareil);

    if (!donneesCookie) {
      effacerCookieConnexionAutomatique(req, res);
      return next();
    }

    const appareil = await trouverAppareilAutoLoginParSelector(donneesCookie.selector);

    if (!appareil) {
      effacerCookieConnexionAutomatique(req, res);
      return next();
    }

    if (appareil.validator_hash !== hacherValidator(donneesCookie.validator)) {
      await supprimerAppareilAutoLoginParSelector(donneesCookie.selector);
      effacerCookieConnexionAutomatique(req, res);
      return next();
    }

    const utilisateur = await trouverUtilisateurParId(appareil.utilisateur_id);

    if (
      !utilisateur ||
      Number(utilisateur.acces_active) !== 1 ||
      Number(appareil.session_version || 0) !== Number(utilisateur.session_version || 0)
    ) {
      await supprimerAppareilAutoLoginParSelector(donneesCookie.selector);
      await invaliderSessionEtCookie(req, res);
      return next();
    }

    await initialiserSessionAuthentifiee(req, utilisateur);

    const rotation = await renouvelerAppareilAutoLogin(appareil.id, {
      sessionVersion: utilisateur.session_version,
      adresseIp: normaliserIpClient(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 400),
    });

    if (rotation?.cookieValue) {
      res.cookie(
        AUTO_LOGIN_COOKIE_NAME,
        rotation.cookieValue,
        obtenirOptionsCookieConnexionAutomatique(req)
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

async function chargerUtilisateurAuthentifie(req, res) {
  const utilisateurSession = req.session?.utilisateur;

  if (!utilisateurSession?.id) {
    return null;
  }

  const utilisateur = await trouverUtilisateurParId(utilisateurSession.id);

  if (!utilisateur) {
    await invaliderSessionEtCookie(req, res);
    return null;
  }

  if (Number(utilisateur.acces_active) !== 1) {
    await invaliderSessionEtCookie(req, res);
    return null;
  }

  if (
    Number(utilisateurSession.session_version || 0) !==
    Number(utilisateur.session_version || 0)
  ) {
    await invaliderSessionEtCookie(req, res);
    return null;
  }

  return utilisateur;
}

async function verifierAuthentification(req, res, next) {
  try {
    const utilisateur = await chargerUtilisateurAuthentifie(req, res);

    if (!utilisateur) {
      return res.status(401).json({
        message: "Vous devez vous connecter pour acceder a cette ressource.",
      });
    }

    req.utilisateur = utilisateur;
    return next();
  } catch (error) {
    return next(error);
  }
}

function verifierCompteSecurise(req, res, next) {
  if (Number(req.utilisateur?.doit_changer_mot_de_passe) === 1) {
    return res.status(403).json({
      code: "PASSWORD_CHANGE_REQUIRED",
      message:
        "Le mot de passe initial doit etre remplace avant d'acceder aux donnees.",
    });
  }

  return next();
}

function utilisateurEstAdministrateur(utilisateur) {
  return (
    Number(utilisateur?.est_admin) === 1 ||
    String(utilisateur?.email || "").trim().toLowerCase() === "hossam@test.com"
  );
}

function utilisateurEstHossam(utilisateur) {
  const emailUtilisateur = String(utilisateur?.email || "").trim().toLowerCase();
  return emailUtilisateur === "hossam@test.com";
}

function verifierAccesAdministratifHossam(req, res, next) {
  if (!utilisateurEstAdministrateur(req.utilisateur)) {
    return res.status(403).json({
      message: "Vous n'avez pas acces a cette ressource.",
    });
  }

  return next();
}

function verifierAccesHossamUniquement(req, res, next) {
  if (!utilisateurEstHossam(req.utilisateur)) {
    return res.status(403).json({
      message: "Seul Hossam peut gerer les indisponibilites.",
    });
  }

  return next();
}

function verifierModeEcritureAutorise(req, res, next) {
  if (utilisateurEstAdministrateur(req.utilisateur)) {
    return next();
  }

  if (Number(req.utilisateur?.mode_lecture_seule) === 1) {
    return res.status(403).json({
      code: "READ_ONLY_ACCOUNT",
      message:
        "Votre compte est actuellement en lecture seule. Les modifications sont reservees a Hossam.",
    });
  }

  return next();
}

function verifierAccesMonetisation(req, res, next) {
  if (
    !utilisateurEstHossam(req.utilisateur) &&
    Number(req.utilisateur?.peut_voir_monetisation) !== 1
  ) {
    return res.status(403).json({
      message: "Vous n'avez pas acces a cette ressource.",
    });
  }

  return next();
}

function verifierAccesIndisponibilites(req, res, next) {
  if (
    !utilisateurEstAdministrateur(req.utilisateur) &&
    Number(req.utilisateur?.peut_voir_indisponibilites) !== 1
  ) {
    return res.status(403).json({
      message: "Vous n'avez pas acces a cette ressource.",
    });
  }

  return next();
}

module.exports = {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesAdministratifHossam,
  verifierAccesHossamUniquement,
  verifierAccesMonetisation,
  verifierAccesIndisponibilites,
  chargerUtilisateurAuthentifie,
  verifierModeEcritureAutorise,
  utilisateurEstAdministrateur,
  utilisateurEstHossam,
  initialiserSessionAuthentifiee,
  obtenirOptionsCookieConnexionAutomatique,
  recupererCookieRequete,
  effacerCookieConnexionAutomatique,
  restaurerConnexionAutomatique,
  detruireSession,
};
