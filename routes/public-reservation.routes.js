const express = require("express");

const {
  afficherPageReservationPublique,
  ouvrirFluxPlanningPublic,
  recupererPlanningReservationPublique,
  reserverCreneauPublic,
} = require("../controllers/public-reservation.controller");

const pageRouter = express.Router();
const apiRouter = express.Router();

pageRouter.get("/", afficherPageReservationPublique);

apiRouter.get("/", recupererPlanningReservationPublique);
apiRouter.get("/events", ouvrirFluxPlanningPublic);
apiRouter.post("/reserver", reserverCreneauPublic);

module.exports = {
  pageRouter,
  apiRouter,
};
