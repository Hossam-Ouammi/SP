function verifierAuthentification(req, res, next) {
  if (!req.session.utilisateur) {
    return res.status(401).json({
      message: "Vous devez vous connecter pour acceder a cette ressource.",
    });
  }

  req.utilisateur = req.session.utilisateur;
  return next();
}

module.exports = {
  verifierAuthentification,
};
