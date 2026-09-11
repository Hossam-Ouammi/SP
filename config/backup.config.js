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

function lireEntierBorne(nom, valeurParDefaut, minimum, maximum) {
  return Math.min(
    Math.max(Math.floor(lireNombreEnv(nom, valeurParDefaut)), minimum),
    maximum
  );
}

function lireFuseauHoraireEnv(nom, valeurParDefaut) {
  const valeur = String(process.env[nom] || "").trim() || valeurParDefaut;

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: valeur }).format(new Date());
    return valeur;
  } catch (error) {
    return valeurParDefaut;
  }
}

function lirePortSmtpEnv(nom, valeurParDefaut) {
  const valeurBrute = String(process.env[nom] ?? "").trim();

  // A non-numeric value used to fall back to port 465 even when STARTTLS was
  // selected (`SMTP_SECURE=false`).  That pairing is incompatible with the
  // usual SMTP deployment and made a simple typo silently break delivery.
  if (!/^\d+$/.test(valeurBrute)) {
    return valeurParDefaut;
  }

  const valeur = Number(valeurBrute);
  return Number.isInteger(valeur) && valeur >= 1 && valeur <= 65535
    ? valeur
    : valeurParDefaut;
}

const backupSeancesExplicitementActive =
  lireBooleenEnv("BACKUP_SEANCES_ENABLED", false) &&
  !lireBooleenEnv("BACKUP_SEANCES_DISABLED", false);
const smtpSecure = lireBooleenEnv("SMTP_SECURE", true);
const smtpPort = lirePortSmtpEnv("SMTP_PORT", smtpSecure ? 465 : 587);

module.exports = {
  BACKUP_SEANCES_ENABLED: backupSeancesExplicitementActive,
  BACKUP_SEANCES_EMAIL_FROM: process.env.BACKUP_SEANCES_EMAIL_FROM || "",
  // This IANA timezone is exclusively an operations/scheduler convention.
  // It is unrelated to a Handler's public-calendar display offset.
  BACKUP_SEANCES_TIMEZONE: lireFuseauHoraireEnv(
    "BACKUP_SEANCES_TIMEZONE",
    "Africa/Casablanca"
  ),
  // The delivery ledger is technical operational data, not business audit
  // history. It stays long enough to block duplicate scheduled sends and is
  // pruned afterwards.
  BACKUP_SEANCES_DELIVERY_RETENTION_DAYS: lireEntierBorne(
    "BACKUP_SEANCES_DELIVERY_RETENTION_DAYS",
    180,
    7,
    3650
  ),
  BACKUP_SEANCES_EMAIL_DRY_RUN: lireBooleenEnv("BACKUP_SEANCES_EMAIL_DRY_RUN", false),
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: smtpPort,
  SMTP_SECURE: smtpSecure,
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
};
