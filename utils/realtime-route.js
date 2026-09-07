const { diffuserMiseAJourApplication } = require("./realtime");
const { notifierEvenementApplicationPush } = require("./push-notifications");

function valeurBooleenneActive(valeur) {
  return (
    valeur === true ||
    valeur === 1 ||
    valeur === "1" ||
    valeur === "true" ||
    valeur === "on"
  );
}

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function determinerIdentifiantUnique(valeurs) {
  const identifiants = Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [valeurs])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );

  return identifiants.length === 1 ? identifiants[0] : undefined;
}

function lireCibleExplicite(scope, nom) {
  if (!scope || typeof scope !== "object") {
    return undefined;
  }

  const nomSnakeCase = nom.replace(/[A-Z]/g, (lettre) => `_${lettre.toLowerCase()}`);
  const identifiant = normaliserIdentifiant(scope[nom] ?? scope[nomSnakeCase]);

  if (identifiant) {
    return identifiant;
  }

  return determinerIdentifiantUnique(scope[`${nom}s`] ?? scope[`${nomSnakeCase}s`]);
}

function determinerCibleTempsReel(req, res) {
  const scopeExplicite = res.locals?.realtimeScope;

  if (scopeExplicite && typeof scopeExplicite === "object") {
    return {
      handlerId: lireCibleExplicite(scopeExplicite, "handlerId"),
      intervenantId: lireCibleExplicite(scopeExplicite, "intervenantId"),
    };
  }

  return {
    handlerId: determinerIdentifiantUnique(req.scope?.handlerIds),
    intervenantId: determinerIdentifiantUnique(req.scope?.intervenantIds),
  };
}

function determinerActionTempsReel(req, scope, reponseJson = null) {
  const methode = String(req.method || "").toUpperCase();
  const chemin = String(req.route?.path || req.path || "");

  if (scope === "seances") {
    if (methode === "POST") {
      return "seance_added";
    }

    if (methode === "PUT") {
      return "seance_updated";
    }

    if (methode === "PATCH" && chemin.includes("/statut")) {
      return "seance_status_updated";
    }

    if (methode === "DELETE") {
      return "seance_deleted";
    }
  }

  if (scope === "indisponibilites") {
    if (methode === "POST") {
      return valeurBooleenneActive(req.body?.jour_complet)
        ? "full_day_unavailability_added"
        : "unavailability_added";
    }

    if (methode === "PUT") {
      return "unavailability_updated";
    }

    if (methode === "DELETE") {
      return "unavailability_deleted";
    }
  }

  if (scope === "propositions") {
    if (methode === "POST" && chemin.includes("/accepter")) {
      return "proposal_accepted";
    }

    if (methode === "POST" && chemin.includes("/refuser")) {
      return "proposal_refused";
    }

    if (methode === "POST") {
      return "proposal_added";
    }

    if (methode === "PUT") {
      return "proposal_updated";
    }
  }

  if (scope === "catalogue") {
    return methode === "DELETE" ? "catalogue_deleted" : "catalogue_updated";
  }

  if (scope === "historique") {
    return "history_updated";
  }

  if (scope === "administration") {
    return reponseJson?.must_reauthenticate ? "session_updated" : "administration_updated";
  }

  return "application_updated";
}

function notifierMiseAJourApplication(controller, scope = "application") {
  return async function controleurAvecNotification(req, res, next) {
    try {
      let reponseJson = null;
      const reponseJsonOriginale = typeof res.json === "function" ? res.json.bind(res) : null;

      if (reponseJsonOriginale) {
        res.json = function reponseJsonCapturee(payload) {
          reponseJson = payload;
          return reponseJsonOriginale(payload);
        };
      }

      await controller(req, res, next);

      if (res.statusCode < 400) {
        const { handlerId, intervenantId } = determinerCibleTempsReel(req, res);
        const notificationPayload = {
          scope,
          actorId: req.utilisateur?.id || null,
          actorName: req.utilisateur?.nom || null,
          handlerId,
          intervenantId,
          action: determinerActionTempsReel(req, scope, reponseJson),
          message: reponseJson?.message || null,
        };

        diffuserMiseAJourApplication(notificationPayload);
        notifierEvenementApplicationPush(notificationPayload).catch((error) => {
          console.error("Erreur notification push:", error);
        });
      }
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  notifierMiseAJourApplication,
};
