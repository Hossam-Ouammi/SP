function lireBooleenEnv(nom, valeurParDefaut = false) {
  const valeur = process.env[nom];

  if (valeur === undefined) {
    return valeurParDefaut;
  }

  return ["1", "true", "yes", "on"].includes(String(valeur).trim().toLowerCase());
}

function lireEntierEnv(nom, valeurParDefaut, { min, max }) {
  const valeur = Number(process.env[nom]);

  if (!Number.isFinite(valeur)) {
    return valeurParDefaut;
  }

  return Math.min(Math.max(Math.floor(valeur), min), max);
}

module.exports = {
  // This must be an explicitly configured, trusted origin in production. It is
  // deliberately never inferred from a request Host header.
  ACCOUNT_LIFECYCLE_APP_URL:
    process.env.ACCOUNT_LIFECYCLE_APP_URL || process.env.APP_BASE_URL || "",
  ACCOUNT_EMAIL_FROM: process.env.ACCOUNT_EMAIL_FROM || "",
  ACCOUNT_EMAIL_DRY_RUN: lireBooleenEnv("ACCOUNT_EMAIL_DRY_RUN", false),
  ACTIVATION_TOKEN_TTL_MINUTES: lireEntierEnv(
    "ACCOUNT_ACTIVATION_TOKEN_TTL_MINUTES",
    24 * 60,
    { min: 15, max: 7 * 24 * 60 }
  ),
  RESET_PASSWORD_TOKEN_TTL_MINUTES: lireEntierEnv(
    "ACCOUNT_RESET_PASSWORD_TOKEN_TTL_MINUTES",
    60,
    { min: 10, max: 24 * 60 }
  ),
};
