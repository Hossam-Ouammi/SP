const bcrypt = require("bcryptjs");

const {
  trouverUtilisateurParEmail,
  trouverUtilisateurParId,
} = require("../models/utilisateur.model");

async function connecterUtilisateur(req, res) {
  const { email, mot_de_passe: motDePasse } = req.body;

  if (!email || !motDePasse) {
    return res.status(400).json({
      message: "Email et mot de passe obligatoires.",
    });
  }

  const utilisateur = await trouverUtilisateurParEmail(email.trim().toLowerCase());

  if (!utilisateur) {
    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  const motDePasseValide = await bcrypt.compare(
    motDePasse,
    utilisateur.mot_de_passe
  );

  if (!motDePasseValide) {
    return res.status(401).json({
      message: "Identifiants invalides.",
    });
  }

  req.session.utilisateur = {
    id: utilisateur.id,
    nom: utilisateur.nom,
    email: utilisateur.email,
  };

  return res.json({
    message: "Connexion réussie.",
    utilisateur: req.session.utilisateur,
  });
}

function deconnecterUtilisateur(req, res) {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "La déconnexion a échoué.",
      });
    }

    res.clearCookie("connect.sid");
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

    return res.status(401).json({
      message: "Votre session n'est plus valide.",
    });
  }

  return res.json({ utilisateur });
}

module.exports = {
  connecterUtilisateur,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
};
