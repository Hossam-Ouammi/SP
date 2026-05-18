const dureesAutorisees = new Set([60, 90, 120]);
const listeDureesAutorisees = Object.freeze([60, 90, 120]);

function lireDureeParDefaut() {
  const duree = Number(process.env.PUBLIC_RESERVATION_SLOT_DURATION_MINUTES || 60);
  return dureesAutorisees.has(duree) ? duree : 60;
}

module.exports = {
  PUBLIC_RESERVATION_COOKIE_NAME: "gestion_seances.public_reservation_device",
  PUBLIC_RESERVATION_COOKIE_MAX_AGE_MS: 2 * 365 * 24 * 60 * 60 * 1000,
  PUBLIC_RESERVATION_ALLOWED_DURATIONS: listeDureesAutorisees,
  PUBLIC_RESERVATION_SLOT_DURATION_MINUTES: lireDureeParDefaut(),
  PUBLIC_RESERVATION_TIMEZONE: process.env.PUBLIC_RESERVATION_TIMEZONE || "Europe/Paris",
  PUBLIC_RESERVATION_TIMEZONE_LABEL:
    process.env.PUBLIC_RESERVATION_TIMEZONE_LABEL || "heure de France",
  CENTRAL_CALENDAR_TIMEZONE: process.env.CENTRAL_CALENDAR_TIMEZONE || "Africa/Casablanca",
  CENTRAL_CALENDAR_TIMEZONE_LABEL:
    process.env.CENTRAL_CALENDAR_TIMEZONE_LABEL || "heure du Maroc",
  PUBLIC_RESERVATION_DEFAULT_COMPTE: String(
    process.env.PUBLIC_RESERVATION_DEFAULT_COMPTE || ""
  ).trim(),
  PUBLIC_RESERVATION_OWNER_EMAIL: String(
    process.env.PUBLIC_RESERVATION_OWNER_EMAIL || "hossam@test.com"
  )
    .trim()
    .toLowerCase(),
  PUBLIC_RESERVATION_SLOT_MIN_TIME:
    process.env.PUBLIC_RESERVATION_SLOT_MIN_TIME || "10:00",
  PUBLIC_RESERVATION_SLOT_MAX_TIME:
    process.env.PUBLIC_RESERVATION_SLOT_MAX_TIME || "23:00",
};
