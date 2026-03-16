const bcrypt = require("bcryptjs");

const {
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  mettreAJourMotDePasseUtilisateur,
} = require("../models/utilisateur.model");
const { genererTokenCsrf } = require("../middleware/security.middleware");
const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} = require("../config/security.config");

const tentativesConnexionParIp = new Map();
const FENETRE_TENTATIVES_MS = 15 * 60 * 1000;
const DUREE_BLOCAGE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES = 5;

function normaliserIpClient(req) {
  const enteteTransmis = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return enteteTransmis || req.ip || "ip-inconnue";
}

function nettoyerTentativesConnexion() {
  const maintenant = Date.now();

  for (const [ip, enregistrement] of tentativesConnexionParIp.entries()) {
    const echecsRecents = enregistrement.echecs.filter(
      (horodatage) => maintenant - horodatage <= FENETRE_TENTATIVES_MS
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

function recupererBlocageConnexionActif(req) {
  nettoyerTentativesConnexion();

  const enregistrement = tentativesConnexionParIp.get(normaliserIpClient(req));
  const maintenant = Date.now();

  if (!enregistrement || enregistrement.bloqueJusqua <= maintenant) {
    return 0;
  }

  return Math.ceil((enregistrement.bloqueJusqua - maintenant) / 1000);
}

function enregistrerEchecConnexion(req) {
  nettoyerTentativesConnexion();

  const ip = normaliserIpClient(req);
  const maintenant = Date.now();
  const enregistrement = tentativesConnexionParIp.get(ip) || {
    echecs: [],
    bloqueJusqua: 0,
  };

  enregistrement.echecs.push(maintenant);
  enregistrement.echecs = enregistrement.echecs.filter(
    (horodatage) => maintenant - horodatage <= FENETRE_TENTATIVES_MS
  );

  if (enregistrement.echecs.length >= MAX_TENTATIVES) {
    enregistrement.bloqueJusqua = maintenant + DUREE_BLOCAGE_MS;
    enregistrement.echecs = [];
  }

  tentativesConnexionParIp.set(ip, enregistrement);
}

function reinitialiserTentativesConnexion(req) {
  tentativesConnexionParIp.delete(normaliserIpClient(req));
}

function motDePasseRespectePolitique(motDePasse) {
  const valeur = String(motDePasse || "");
  return (
    valeur.length >= 8 &&
    /[A-Za-z]/.test(valeur) &&
    /\d/.test(valeur)
  );
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

async function connecterUtilisateur(req, res) {
  const { username, email, mot_de_passe: motDePasse } = req.body;
  const identifiant = String(username || email || "").trim();
  const blocageActifSecondes = recupererBlocageConnexionActif(req);

  if (blocageActifSecondes > 0) {
    res.setHeader("Retry-After", String(blocageActifSecondes));
    return res.status(429).json({
      message: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
    });
  }

  if (!identifiant || !motDePasse) {
    return res.status(400).json({
      message: "Username et mot de passe obligatoires.",
    });
  }

  if (identifiant.length > 120 || String(motDePasse).length > 200) {
    return res.status(400).json({
      message: "Les identifiants fournis sont invalides.",
    });
  }

  const utilisateur = await trouverUtilisateurParNomOuEmail(identifiant);

  if (!utilisateur) {
    enregistrerEchecConnexion(req);
    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  const motDePasseValide = await bcrypt.compare(
    motDePasse,
    utilisateur.mot_de_passe
  );

  if (!motDePasseValide) {
    enregistrerEchecConnexion(req);
    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  await regenererSession(req);

  req.session.utilisateur = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
  };
  req.session.csrfToken = genererTokenCsrf();
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;

  await sauvegarderSession(req);
  reinitialiserTentativesConnexion(req);

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  return res.json({
    message: "Connexion réussie.",
    utilisateur: req.session.utilisateur,
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
        "Le nouveau mot de passe doit contenir au moins 8 caractères, avec au moins une lettre et un chiffre.",
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

  req.session.csrfToken = genererTokenCsrf();
  await sauvegarderSession(req);
  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  return res.json({
    message: "Mot de passe modifié avec succès.",
  });
}

function deconnecterUtilisateur(req, res) {
  const optionsCookie = obtenirOptionsCookie(req);

  if (!req.session) {
    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Déconnexion réussie." });
  }

  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "La déconnexion a échoué.",
      });
    }

    res.clearCookie(SESSION_COOKIE_NAME, optionsCookie);
    return res.json({ message: "Déconnexion réussie." });
  });
}

async function recupererUtilisateurConnecte(req, res) {
  if (!req.session.utilisateur) {
    return res.status(401).json({
      message: "Aucun utilisateur connecté.",
    });
  }

  const utilisateur = await trouverUtilisateurParId(req.session.utilisateur.id);

  if (!utilisateur) {
    req.session.destroy(() => {});
    res.clearCookie(SESSION_COOKIE_NAME, obtenirOptionsCookie(req));

    return res.status(401).json({
      message: "Votre session n'est plus valide.",
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
