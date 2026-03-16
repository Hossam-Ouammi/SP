function verifierAuthentification(req, res, next) {
  if (!req.session.utilisateur) {
    return res.status(401).json({
      message: "Vous devez vous connecter pour accéder à cette ressource.",
    });
  }

  req.utilisateur = req.session.utilisateur;
  return next();
}

function verifierAccesMonetisation(req, res, next) {
  const emailUtilisateur = String(req.utilisateur?.email || "").trim().toLowerCase();

  if (emailUtilisateur !== "hossam@test.com") {
    return res.status(403).json({
      message: "Vous n'avez pas accès à cette ressource.",
    });
  }

  return next();
}

module.exports = {
  verifierAuthentification,
  verifierAccesMonetisation,
};
