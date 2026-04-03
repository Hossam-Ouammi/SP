const { diffuserMiseAJourApplication } = require("./realtime");
const { notifierEvenementApplicationPush } = require("./push-notifications");

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
      return Number(req.body?.jour_complet) === 1 || req.body?.jour_complet === true
        ? "full_day_unavailability_added"
        : "unavailability_added";
    }

    if (methode === "DELETE") {
      return "unavailability_deleted";
    }
  }

  if (scope === "screenshots" && methode === "POST") {
    return "screenshots_added";
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
        const notificationPayload = {
          scope,
          actorId: req.utilisateur?.id || null,
          actorName: req.utilisateur?.nom || null,
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
