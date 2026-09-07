const {
  construireScopeAcces,
  scopePeutAccederHandler,
  scopePeutGererIntervenant,
} = require("../models/access-scope.model");

async function chargerScopeAcces(req, res, next) {
  try {
    if (!req.utilisateur?.id) {
      return res.status(401).json({
        message: "Vous devez vous connecter pour accéder à cette ressource.",
      });
    }

    req.scope = await construireScopeAcces(req.utilisateur);
    return next();
  } catch (error) {
    return next(error);
  }
}

function verifierRoleSuperAdmin(req, res, next) {
  if (!req.scope?.estSuperAdmin) {
    return res.status(403).json({
      message: "Vous n'avez pas accès à cette ressource.",
      code: "SUPER_ADMIN_REQUIRED",
    });
  }

  return next();
}

function verifierRoleHandler(req, res, next) {
  if (!req.scope?.estHandler) {
    return res.status(403).json({
      message: "Cette action est r\u00e9serv\u00e9e au Handler de l'\u00e9quipe.",
      code: "HANDLER_REQUIRED",
    });
  }

  return next();
}

function verifierScopeHandlerCourant(req, res, next) {
  if (!Array.isArray(req.scope?.handlerIds) || req.scope.handlerIds.length === 0) {
    return res.status(403).json({
      message: "Aucun espace Handler actif n'est associé à ce compte.",
      code: "HANDLER_SCOPE_REQUIRED",
    });
  }

  return next();
}

async function verifierAccesHandler(req, res, next) {
  try {
    const handlerId = req.params?.handlerId ?? req.body?.handler_id ?? req.query?.handler_id;

    if (!(await scopePeutAccederHandler(req.scope, handlerId))) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

async function verifierGestionIntervenant(req, res, next) {
  try {
    const handlerId = req.params?.handlerId ?? req.body?.handler_id ?? req.query?.handler_id;
    const intervenantId =
      req.params?.intervenantId ?? req.body?.intervenant_id ?? req.query?.intervenant_id;

    if (!(await scopePeutGererIntervenant(req.scope, { handlerId, intervenantId }))) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  chargerScopeAcces,
  verifierRoleSuperAdmin,
  verifierRoleHandler,
  verifierScopeHandlerCourant,
  verifierAccesHandler,
  verifierGestionIntervenant,
};
