const express = require("express");

const {
  afficherPageReservationPublique,
  ouvrirFluxPlanningPublic,
  recupererPlanningReservationPublique,
  repondreCalendrierPublicApiIntrouvable,
  repondreCalendrierPublicPageIntrouvable,
} = require("../controllers/public-reservation.controller");

const pageRouter = express.Router();
const apiRouter = express.Router();

// L'ancienne URL globale ne doit jamais agreger les plannings de plusieurs
// Handler. Sans jeton, elle est volontairement introuvable.
pageRouter.all("/", repondreCalendrierPublicPageIntrouvable);
pageRouter.get("/:token", afficherPageReservationPublique);
pageRouter.use(repondreCalendrierPublicPageIntrouvable);

// Evite que les anciennes URL publiques restent une source de donnees
// globales pendant la transition vers les liens tokenises.
apiRouter.all("/", repondreCalendrierPublicApiIntrouvable);
apiRouter.all("/events", repondreCalendrierPublicApiIntrouvable);
apiRouter.all("/reserver", repondreCalendrierPublicApiIntrouvable);
apiRouter.get("/:token/events", ouvrirFluxPlanningPublic);
apiRouter.get("/:token", recupererPlanningReservationPublique);
apiRouter.use(repondreCalendrierPublicApiIntrouvable);

module.exports = {
  pageRouter,
  apiRouter,
};
