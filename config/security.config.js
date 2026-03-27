const SESSION_COOKIE_NAME = "gestion_seances.sid";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const AUTO_LOGIN_COOKIE_NAME = "gestion_seances.device";
const AUTO_LOGIN_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  AUTO_LOGIN_COOKIE_NAME,
  AUTO_LOGIN_MAX_AGE_MS,
};
