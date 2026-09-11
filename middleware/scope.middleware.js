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

/**
 * Une indisponibilité est toujours une déclaration personnelle de Professeur.
 * Le Handler ne possède pas ce module : son Dashboard reçoit un flux lecture
 * seule séparé, limité aux créneaux de ses Professeurs actifs.
 */
function verifierDeclarationDisponibiliteProfesseur(req, res, next) {
  if (req.scope?.estHandler === true) {
    return res.status(403).json({
      code: "HANDLER_UNAVAILABILITY_FORBIDDEN",
      message:
        "Le Handler ne peut pas déclarer, modifier ou supprimer une indisponibilité.",
    });
  }

  if (req.scope?.estProfesseur !== true && req.scope?.estSuperAdmin !== true) {
    return res.status(403).json({
      code: "PROFESSOR_UNAVAILABILITY_DECLARATION_REQUIRED",
      message: "Seul un Professeur peut déclarer ses indisponibilités.",
    });
  }

  return next();
}

/**
 * The former proposal workflow was an exception mechanism for an
 * unavailability. It has been retired with the availability exceptions UI:
 * accepting it would give a Handler an indirect mutation path over a
 * Professor's personal declaration.
 */
function verifierCreationPropositionProfesseur(req, res, next) {
  return res.status(410).json({
    code: "UNAVAILABILITY_PROPOSALS_RETIRED",
    message:
      "Les propositions liées aux indisponibilités ne sont plus disponibles. Choisissez un créneau disponible dans le calendrier central.",
  });
}

/**
 * Les propositions historiques constituent l'ancien mécanisme d'exception
 * d'indisponibilité. Le Handler n'a plus à les consulter : son seul flux lié
 * aux indisponibilités est la projection en lecture seule du Dashboard.
 */
function verifierLecturePropositionIndisponibiliteHandler(req, res, next) {
  if (req.scope?.estHandler === true) {
    return res.status(403).json({
      code: "HANDLER_UNAVAILABILITY_FORBIDDEN",
      message:
        "Le Handler n'a pas accès aux propositions liées aux indisponibilités.",
    });
  }

  return next();
}

/**
 * Les anciennes propositions servaient à demander une exception à une
 * indisponibilité. Le Handler n'a plus de module Indisponibilités et ne peut
 * donc plus modifier, accepter ou refuser ce type d'exception par API.
 *
 * Le garde est placé après `verifierModeEcritureAutorise` dans les routes : un
 * compte lecture seule conserve ainsi son erreur stable `READ_ONLY_ACCOUNT`.
 */
function verifierMutationPropositionIndisponibiliteHandler(req, res, next) {
  if (req.scope?.estHandler === true) {
    return res.status(403).json({
      code: "HANDLER_UNAVAILABILITY_FORBIDDEN",
      message:
        "Le Handler ne peut pas modifier, accepter ou refuser une proposition liée à une indisponibilité.",
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
  verifierDeclarationDisponibiliteProfesseur,
  verifierCreationPropositionProfesseur,
  verifierLecturePropositionIndisponibiliteHandler,
  verifierMutationPropositionIndisponibiliteHandler,
  verifierAccesHandler,
  verifierGestionIntervenant,
};
