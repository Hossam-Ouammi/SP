const express = require("express");

const {
  afficherPageReservationPublique,
  recupererPlanningReservationPublique,
  reserverCreneauPublic,
  reprogrammerReservationPublique,
  annulerReservationPublique,
} = require("../controllers/public-reservation.controller");
const { notifierMiseAJourApplication } = require("../utils/realtime-route");

const pageRouter = express.Router();
const apiRouter = express.Router();

pageRouter.get("/:token", afficherPageReservationPublique);

apiRouter.get("/:token", recupererPlanningReservationPublique);
apiRouter.post(
  "/:token/reserver",
  notifierMiseAJourApplication(reserverCreneauPublic, "seances")
);
apiRouter.patch(
  "/:token/reservations/:reservationId",
  notifierMiseAJourApplication(reprogrammerReservationPublique, "seances")
);
apiRouter.delete(
  "/:token/reservations/:reservationId",
  notifierMiseAJourApplication(annulerReservationPublique, "seances")
);

module.exports = {
  pageRouter,
  apiRouter,
};
