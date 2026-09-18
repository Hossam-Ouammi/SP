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
  appareilAutoLoginEstExpire,
  hacherValidator,
  trouverAppareilAutoLoginParSelector,
  renouvelerAppareilAutoLogin,
  supprimerAppareilAutoLoginParSelector,
} = require("../models/trusted-device.model");

function compteEstActif(utilisateur) {
  const statut = String(utilisateur?.statut_compte || "active").trim().toLowerCase();
  return Number(utilisateur?.acces_active) === 1 && statut === "active";
}

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
    public_id: utilisateur.public_id || null,
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

    // Browser Max-Age is client-controlled. Enforce the same absolute expiry
    // on the server so a copied or replayed cookie cannot outlive 90 days.
    if (appareilAutoLoginEstExpire(appareil)) {
      await supprimerAppareilAutoLoginParSelector(donneesCookie.selector);
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
      !compteEstActif(utilisateur) ||
      Number(appareil.session_version || 0) !== Number(utilisateur.session_version || 0)
    ) {
      await supprimerAppareilAutoLoginParSelector(donneesCookie.selector);
      await invaliderSessionEtCookie(req, res);
      return next();
    }

    // Rotate the device credential before creating a session.  The renewal
    // is a compare-and-swap on the validator received in this request: if a
    // copied cookie is replayed concurrently, only the winner can proceed to
    // session creation.  Never delete by selector here on failure because a
    // legitimate concurrent winner may already hold the newly rotated token.
    const userAgent = String(req.headers["user-agent"] || appareil.user_agent || "").slice(0, 400);
    const rotation = await renouvelerAppareilAutoLogin(appareil.id, {
      sessionVersion: utilisateur.session_version,
      sessionVersionAttendue: appareil.session_version,
      selector: appareil.selector,
      validatorHashAttendu: hacherValidator(donneesCookie.validator),
      adresseIp: normaliserIpClient(req),
      userAgent,
    });

    if (!rotation?.cookieValue) {
      effacerCookieConnexionAutomatique(req, res);
      return next();
    }

    await initialiserSessionAuthentifiee(req, utilisateur);
    res.cookie(
      AUTO_LOGIN_COOKIE_NAME,
      rotation.cookieValue,
      obtenirOptionsCookieConnexionAutomatique(req)
    );

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

  if (!compteEstActif(utilisateur)) {
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
        message: "Vous devez vous connecter pour accéder à cette ressource.",
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
        "Le mot de passe initial doit être remplace avant d'accéder aux données.",
    });
  }

  return next();
}

function verifierModeEcritureAutorise(req, res, next) {
  const peutEcrireDansEspace =
    req.scope?.estSuperAdmin === true ||
    req.scope?.estHandler === true ||
    req.scope?.estProfesseur === true;

  if (!peutEcrireDansEspace) {
    return res.status(403).json({
      code: "WRITE_SCOPE_REQUIRED",
      message: "Vous n'avez pas de droit d'écriture dans cet espace.",
    });
  }

  if (Number(req.utilisateur?.mode_lecture_seule) === 1 && !req.scope?.estSuperAdmin) {
    return res.status(403).json({
      code: "READ_ONLY_ACCOUNT",
      message: "Votre compte est actuellement en lecture seule.",
    });
  }

  return next();
}

function verifierAccesMonetisation(req, res, next) {
  const estAutorise =
    req.scope?.estSuperAdmin === true ||
    req.scope?.estHandler === true ||
    // La monétisation personnelle ne peut pas être désactivée par le
    // Handler : le scope de lecture limite déjà le Professeur à ses séances.
    req.scope?.estProfesseur === true;

  if (!estAutorise) {
    return res.status(403).json({
      code: "MONETISATION_ACCESS_DISABLED",
      message: "La monétisation n'est pas activée pour ce compte.",
    });
  }

  return next();
}

function verifierAccesIndisponibilites(req, res, next) {
  const estAutorise =
    req.scope?.estSuperAdmin === true ||
    req.scope?.estProfesseur === true ||
    req.scope?.estHandler === true;

  if (!estAutorise) {
    return res.status(403).json({
      code: "UNAVAILABILITY_ACCESS_DISABLED",
      message: "Les disponibilités ne sont pas activées pour ce compte.",
    });
  }

  return next();
}

module.exports = {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesMonetisation,
  verifierAccesIndisponibilites,
  chargerUtilisateurAuthentifie,
  verifierModeEcritureAutorise,
  initialiserSessionAuthentifiee,
  obtenirOptionsCookieConnexionAutomatique,
  recupererCookieRequete,
  effacerCookieConnexionAutomatique,
  restaurerConnexionAutomatique,
  detruireSession,
  compteEstActif,
};
