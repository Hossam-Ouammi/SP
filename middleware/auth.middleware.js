const { SESSION_COOKIE_NAME } = require("../config/security.config");
const { trouverUtilisateurParId } = require("../models/utilisateur.model");

function obtenirOptionsCookie(req) {
  const secure =
    req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");

  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
  };
}

function detruireSession(req) {
  return new Promise((resolve) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy(() => {
      resolve();
    });
  });
}

async function invaliderSessionEtCookie(req, res) {
  await detruireSession(req);
  res.clearCookie(SESSION_COOKIE_NAME, obtenirOptionsCookie(req));
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

module.exports = {
  verifierAuthentification,
  verifierCompteSecurise,
  verifierAccesAdministratifHossam,
  verifierAccesHossamUniquement,
  verifierAccesMonetisation,
  chargerUtilisateurAuthentifie,
  verifierModeEcritureAutorise,
  utilisateurEstAdministrateur,
  utilisateurEstHossam,
};
