const path = require("path");

function lireBooleenEnv(nom, valeurParDefaut = false) {
  const valeur = process.env[nom];

  if (valeur === undefined) {
    return valeurParDefaut;
  }

  return ["1", "true", "yes", "on"].includes(String(valeur).trim().toLowerCase());
}

function lireNombreEnv(nom, valeurParDefaut) {
  const valeur = Number(process.env[nom]);
  return Number.isFinite(valeur) ? valeur : valeurParDefaut;
}

const backupSeancesExplicitementActive =
  lireBooleenEnv("BACKUP_SEANCES_ENABLED", false) &&
  !lireBooleenEnv("BACKUP_SEANCES_DISABLED", false);

module.exports = {
  BACKUP_SEANCES_ENABLED: backupSeancesExplicitementActive,
  BACKUP_SEANCES_EMAIL_TO: process.env.BACKUP_SEANCES_EMAIL_TO || "",
  BACKUP_SEANCES_EMAIL_FROM: process.env.BACKUP_SEANCES_EMAIL_FROM || "",
  BACKUP_SEANCES_TIMEZONE: process.env.BACKUP_SEANCES_TIMEZONE || "Africa/Casablanca",
  BACKUP_SEANCES_DAILY_HOUR: Math.min(
    Math.max(lireNombreEnv("BACKUP_SEANCES_DAILY_HOUR", 0), 0),
    23
  ),
  BACKUP_SEANCES_DAILY_MINUTE: Math.min(
    Math.max(lireNombreEnv("BACKUP_SEANCES_DAILY_MINUTE", 0), 0),
    59
  ),
  BACKUP_SEANCES_OUTPUT_DIR:
    process.env.BACKUP_SEANCES_OUTPUT_DIR ||
    path.join(__dirname, "..", "backups", "seances"),
  BACKUP_SEANCES_RETENTION_DAYS: Math.max(
    Math.floor(lireNombreEnv("BACKUP_SEANCES_RETENTION_DAYS", 60)),
    0
  ),
  BACKUP_SEANCES_EMAIL_DRY_RUN: lireBooleenEnv("BACKUP_SEANCES_EMAIL_DRY_RUN", false),
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: lireNombreEnv("SMTP_PORT", 465),
  SMTP_SECURE: lireBooleenEnv("SMTP_SECURE", true),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
};
