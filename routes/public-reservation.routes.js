const express = require("express");

const {
  afficherPageReservationPublique,
  recupererPlanningReservationPublique,
  reserverCreneauPublic,
} = require("../controllers/public-reservation.controller");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const pageRouter = express.Router();
const apiRouter = express.Router();

pageRouter.get("/", afficherPageReservationPublique);

apiRouter.get("/", recupererPlanningReservationPublique);
apiRouter.post("/reserver", notifierMiseAJourApplication(reserverCreneauPublic, "seances"));

module.exports = {
  pageRouter,
  apiRouter,
};
