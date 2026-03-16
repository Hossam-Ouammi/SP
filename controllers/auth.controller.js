const bcrypt = require("bcryptjs");

const {
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  mettreAJourMotDePasseUtilisateur,
} = require("../models/utilisateur.model");

async function connecterUtilisateur(req, res) {
  const {
    username,
    email,
    mot_de_passe: motDePasse,
  } = req.body;
  const identifiant = String(username || email || "").trim();

  if (!identifiant || !motDePasse) {
    return res.status(400).json({
      message: "Username et mot de passe obligatoires.",
    });
  }

  const utilisateur = await trouverUtilisateurParNomOuEmail(identifiant);

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

  if (String(nouveauMotDePasse).length < 6) {
    return res.status(400).json({
      message: "Le nouveau mot de passe doit contenir au moins 6 caractères.",
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

  const nouveauMotDePasseHash = await bcrypt.hash(nouveauMotDePasse, 10);
  await mettreAJourMotDePasseUtilisateur(utilisateur.id, nouveauMotDePasseHash);

  return res.json({
    message: "Mot de passe modifié avec succès.",
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
  modifierMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurConnecte,
};
