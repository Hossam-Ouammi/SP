const { diffuserMiseAJourApplication } = require("./realtime");

function notifierMiseAJourApplication(controller, scope = "application") {
  return async function controleurAvecNotification(req, res, next) {
    try {
      await controller(req, res, next);

      if (res.statusCode < 400) {
        diffuserMiseAJourApplication({
          scope,
          actorId: req.utilisateur?.id || null,
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
