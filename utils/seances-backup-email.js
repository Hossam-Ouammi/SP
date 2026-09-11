const nodemailer = require("nodemailer");

const {
  BACKUP_SEANCES_ENABLED,
  BACKUP_SEANCES_EMAIL_FROM,
  BACKUP_SEANCES_TIMEZONE,
  BACKUP_SEANCES_DELIVERY_RETENTION_DAYS,
  BACKUP_SEANCES_EMAIL_DRY_RUN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
} = require("../config/backup.config");
const { ACCOUNT_EMAIL_FROM } = require("../config/account-lifecycle.config");
const {
  listerHandlersActifsPourBackup,
  listerSuperAdminsActifsPourBackup,
  listerSeancesBackupHandler,
  listerSeancesBackupGlobal,
  reserverLivraisonBackup,
  terminerLivraisonBackup,
  echouerLivraisonBackup,
  nettoyerLivraisonsBackup,
} = require("../models/backup-email.model");
const { executerAvecVerrou } = require("./job-lock");
const {
  convertirDateHeureZonneeEnInstant,
  convertirInstantEnDateHeureZonnee,
} = require("./timezone");

const BACKUP_LOCK_STALE_MS = 60 * 60 * 1000;
const BACKUP_SCHEDULE = Object.freeze(["00:00", "12:00"]);

let backupTimer = null;

const colonnesBackupHandler = Object.freeze([
  ["date", (seance) => seance.date],
  ["heure_debut", (seance) => seance.heure_debut],
  ["heure_fin", (seance) => seance.heure_fin],
  ["duree_minutes", (seance) => seance.duree_minutes],
  ["statut", (seance) => seance.statut_seance],
  ["eleve", (seance) => seance.etudiant],
  ["parent", (seance) => seance.parent],
  ["matiere", (seance) => seance.matiere],
  ["titre", (seance) => seance.titre],
  ["realisateur", (seance) => seance.intervenant_nom || "Non attribué"],
  ["realisateur_public", (seance) => seance.intervenant_public_id],
  ["essai", (seance) => (Number(seance.est_essai) === 1 ? "oui" : "non")],
  ["prix", (seance) => seance.prix],
  ["statut_paiement", (seance) => seance.statut_paiement],
  ["tarif_horaire_snapshot", (seance) => seance.tarif_horaire_applique],
]);

const colonnesBackupAdmin = Object.freeze([
  ["handler", (seance) => seance.handler_nom || "Non attribué"],
  ["handler_public", (seance) => seance.handler_public_id],
  ...colonnesBackupHandler,
]);

function echapperCsv(valeur) {
  const texteBrut = String(valeur ?? "");
  // Excel and LibreOffice may accept a formula after leading whitespace or a
  // tab. Prefix it with an apostrophe before the usual CSV escaping.
  const texte = /^[\u0000-\u0020]*[=+\-@]/.test(texteBrut)
    ? `'${texteBrut}`
    : texteBrut;

  if (!/[",\n\r]/.test(texte)) {
    return texte;
  }

  return `"${texte.replace(/"/g, '""')}"`;
}

/**
 * Serialises a deliberately whitelisted business projection. It never accepts
 * `seances.*`, so authentication, device, internal-id and audit fields cannot
 * accidentally travel in an email attachment.
 */
function convertirSeancesEnCsv(seances, { inclureHandler = false } = {}) {
  const colonnes = inclureHandler ? colonnesBackupAdmin : colonnesBackupHandler;
  const lignes = [colonnes.map(([entete]) => echapperCsv(entete)).join(",")];

  for (const seance of Array.isArray(seances) ? seances : []) {
    lignes.push(colonnes.map(([, valeur]) => echapperCsv(valeur(seance || {}))).join(","));
  }

  // UTF-8 BOM makes the accented French content open correctly in common
  // spreadsheet software without keeping a file on the server filesystem.
  return `\uFEFF${lignes.join("\n")}\n`;
}

function obtenirLocaleBackup(date = new Date()) {
  return (
    convertirInstantEnDateHeureZonnee(date, BACKUP_SEANCES_TIMEZONE) || {
      date: date.toISOString().slice(0, 10),
      heure: date.toISOString().slice(11, 16),
    }
  );
}

function obtenirDateLocaleBackup(date = new Date()) {
  return obtenirLocaleBackup(date).date;
}

function obtenirHeureLocaleBackup(date = new Date()) {
  return obtenirLocaleBackup(date).heure;
}

function formaterDateFrancais(date = new Date()) {
  const locale = obtenirLocaleBackup(date);
  const [annee, mois, jour] = String(locale.date).split("-");
  return `${jour}/${mois}/${annee}`;
}

function normaliserIdentifiantFichier(valeur, valeurParDefaut) {
  const normalise = String(valeur || "")
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalise || valeurParDefaut;
}

function creerExportBackupHandler(handler, seances, date = new Date()) {
  const dateLocale = obtenirDateLocaleBackup(date);
  const identifiantHandler = normaliserIdentifiantFichier(handler?.public_id, "HD-inconnu");
  const nombreSeances = Array.isArray(seances) ? seances.length : 0;

  return {
    type: "handler",
    date: dateLocale,
    heure: obtenirHeureLocaleBackup(date),
    nombreSeances,
    periode: "Toutes les séances enregistrées dans cet espace",
    nomFichier: `backup-seances-${identifiantHandler}-${dateLocale}.csv`,
    sujet: `Sauvegarde quotidienne des séances — ${formaterDateFrancais(date)}`,
    csv: convertirSeancesEnCsv(seances),
  };
}

function creerExportBackupAdmin(seances, date = new Date()) {
  const dateLocale = obtenirDateLocaleBackup(date);
  const heure = obtenirHeureLocaleBackup(date);
  const heureFichier = heure.replace(":", "");
  const nombreSeances = Array.isArray(seances) ? seances.length : 0;

  return {
    type: "admin",
    date: dateLocale,
    heure,
    nombreSeances,
    periode: "Toutes les séances enregistrées dans tous les espaces",
    nomFichier: `backup-seances-global-${dateLocale}-${heureFichier}.csv`,
    sujet: `Sauvegarde globale des séances — ${formaterDateFrancais(date)} ${heure}`,
    csv: convertirSeancesEnCsv(seances, { inclureHandler: true }),
  };
}

function smtpEstConfigure() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function creerTransportSmtp() {
  if (!smtpEstConfigure()) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // Port 587 must use STARTTLS in production. A backup attachment contains
    // business data and must never silently downgrade to clear-text SMTP.
    requireTLS: process.env.NODE_ENV === "production" && !SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function obtenirAdresseExpediteur() {
  return BACKUP_SEANCES_EMAIL_FROM || ACCOUNT_EMAIL_FROM || SMTP_USER;
}

function masquerEmail(email) {
  const valeur = String(email || "").trim();
  const index = valeur.indexOf("@");

  if (index <= 0) {
    return "destinataire-invalide";
  }

  return `${valeur.slice(0, 1)}***${valeur.slice(index)}`;
}

function journaliserBackup(niveau, evenement, details = {}) {
  const ligne = JSON.stringify({
    event: "backup_email",
    level: niveau,
    evenement,
    ...details,
  });

  if (niveau === "error") {
    console.error(ligne);
    return;
  }

  console.log(ligne);
}

function formaterDateFrancaisDepuisExport(exportBackup) {
  const [annee, mois, jour] = String(exportBackup?.date || "").split("-");
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : "date inconnue";
}

function construireTexteEmail(exportBackup) {
  return (
    "Bonjour,\n\n" +
    "Veuillez trouver en pièce jointe votre sauvegarde automatique des séances.\n\n" +
    `Date de génération : ${formaterDateFrancaisDepuisExport(exportBackup)} ${exportBackup.heure}.\n` +
    `Nombre de séances : ${exportBackup.nombreSeances}.\n\n` +
    `Période couverte : ${exportBackup.periode || "toutes les séances enregistrées"}.\n\n` +
    "Cette sauvegarde contient uniquement les données métier utiles et ne contient aucun mot de passe ni secret de sécurité.\n"
  );
}

async function envoyerExportBackupParEmail(
  { destinataire, exportBackup },
  { sendMail = null } = {}
) {
  const envoyerInjecte = typeof sendMail === "function";

  if (BACKUP_SEANCES_EMAIL_DRY_RUN && !envoyerInjecte) {
    return { envoye: false, raison: "dry-run" };
  }

  const transport = envoyerInjecte ? null : creerTransportSmtp();

  if (!envoyerInjecte && !transport) {
    return { envoye: false, raison: "smtp-non-configure" };
  }

  const message = {
    from: obtenirAdresseExpediteur(),
    to: destinataire,
    subject: exportBackup.sujet,
    text: construireTexteEmail(exportBackup),
    attachments: [
      {
        filename: exportBackup.nomFichier,
        content: Buffer.from(exportBackup.csv, "utf8"),
        contentType: "text/csv; charset=utf-8",
      },
    ],
  };

  try {
    const info = envoyerInjecte
      ? await sendMail(message)
      : await transport.sendMail(message);
    return {
      envoye: true,
      messageId: String(info?.messageId || "").slice(0, 300) || null,
    };
  } catch (error) {
    // Never log an SMTP object: it can include authentication configuration.
    return { envoye: false, raison: "envoi-echoue" };
  }
}

function normaliserOccurrence(options, type, date = new Date()) {
  const fournie = String(options?.occurrenceKey || "").trim();
  if (fournie) {
    return fournie.slice(0, 200);
  }

  const locale = obtenirLocaleBackup(date);
  return `manual:${type}:${locale.date}-${locale.heure.replace(":", "")}`;
}

async function executerLivraisonBackup({
  backupType,
  scopeKey,
  handler = null,
  destinataire,
  exportBackup,
  occurrenceKey,
  sendMail,
}) {
  if (BACKUP_SEANCES_EMAIL_DRY_RUN && typeof sendMail !== "function") {
    journaliserBackup("info", "ignored-dry-run", {
      type: backupType,
      occurrence: occurrenceKey,
      destinataire: masquerEmail(destinataire),
      nombre_seances: exportBackup.nombreSeances,
    });
    return { envoye: false, skipped: true, raison: "dry-run" };
  }

  const reservation = await reserverLivraisonBackup({
    backupType,
    scopeKey,
    handlerId: handler?.id ?? null,
    recipientEmail: destinataire,
    occurrenceKey,
    sessionCount: exportBackup.nombreSeances,
    staleMs: BACKUP_LOCK_STALE_MS,
  });

  if (!reservation.reservee) {
    journaliserBackup("info", "ignored-duplicate", {
      type: backupType,
      occurrence: occurrenceKey,
      destinataire: masquerEmail(destinataire),
      raison: reservation.raison,
    });
    return { envoye: false, skipped: true, raison: reservation.raison };
  }

  const debut = Date.now();
  const email = await envoyerExportBackupParEmail(
    { destinataire, exportBackup },
    { sendMail }
  );
  const detailsLog = {
    type: backupType,
    occurrence: occurrenceKey,
    destinataire: masquerEmail(destinataire),
    nombre_seances: exportBackup.nombreSeances,
    duree_ms: Date.now() - debut,
  };

  if (email.envoye) {
    const resultat = await terminerLivraisonBackup({
      livraisonId: reservation.livraisonId,
      attemptToken: reservation.attemptToken,
      messageId: email.messageId,
    });

    if (Number(resultat?.changes) === 1) {
      journaliserBackup("info", "sent", detailsLog);
      return { envoye: true, skipped: false, messageId: email.messageId };
    }

    journaliserBackup("error", "delivery-state-lost", detailsLog);
    return { envoye: false, skipped: false, raison: "delivery-state-lost" };
  }

  await echouerLivraisonBackup({
    livraisonId: reservation.livraisonId,
    attemptToken: reservation.attemptToken,
    errorCode: email.raison,
  }).catch(() => {});
  journaliserBackup("error", "failed", { ...detailsLog, raison: email.raison });
  return { envoye: false, skipped: false, raison: email.raison };
}

async function executerBackupsHandlersSansVerrou(options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const occurrenceKey = normaliserOccurrence(options, "handlers", date);
  const handlers = await (options.listerHandlers || listerHandlersActifsPourBackup)();
  const livraisons = [];

  for (const handler of handlers) {
    const seances = await (options.listerSeancesHandler || listerSeancesBackupHandler)(handler.id);
    const exportBackup = creerExportBackupHandler(handler, seances, date);
    const livraison = await executerLivraisonBackup({
      backupType: "handler",
      scopeKey: `handler:${handler.id}`,
      handler,
      destinataire: handler.email,
      exportBackup,
      occurrenceKey,
      sendMail: options.sendMail,
    });
    livraisons.push({
      handler_public_id: handler.public_id || null,
      nombre_seances: exportBackup.nombreSeances,
      ...livraison,
    });
  }

  const nettoyage = await nettoyerLivraisonsBackup({
    retentionDays: BACKUP_SEANCES_DELIVERY_RETENTION_DAYS,
    now: date,
  });

  return {
    type: "handlers",
    occurrenceKey,
    destinataires: handlers.length,
    livraisons,
    nettoyage,
  };
}

async function executerBackupsHandlersEmail(options = {}) {
  if (options.sansVerrou) {
    return executerBackupsHandlersSansVerrou(options);
  }

  const execution = await executerAvecVerrou(
    "backup-seances-handlers",
    () => executerBackupsHandlersSansVerrou(options),
    { staleMs: BACKUP_LOCK_STALE_MS }
  );

  return execution.skipped
    ? { skipped: true, raison: "execution-deja-en-cours", livraisons: [] }
    : { ...execution.result, skipped: false };
}

async function executerBackupAdminSansVerrou(options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const occurrenceKey = normaliserOccurrence(options, "admin", date);
  const [administrateurs, seances] = await Promise.all([
    (options.listerAdministrateurs || listerSuperAdminsActifsPourBackup)(),
    (options.listerSeancesGlobal || listerSeancesBackupGlobal)(),
  ]);
  const exportBackup = creerExportBackupAdmin(seances, date);
  const livraisons = [];

  for (const administrateur of administrateurs) {
    const livraison = await executerLivraisonBackup({
      backupType: "admin",
      scopeKey: "global",
      destinataire: administrateur.email,
      exportBackup,
      occurrenceKey,
      sendMail: options.sendMail,
    });
    livraisons.push({
      super_admin_public_id: administrateur.public_id || null,
      nombre_seances: exportBackup.nombreSeances,
      ...livraison,
    });
  }

  const nettoyage = await nettoyerLivraisonsBackup({
    retentionDays: BACKUP_SEANCES_DELIVERY_RETENTION_DAYS,
    now: date,
  });

  return {
    type: "admin",
    occurrenceKey,
    destinataires: administrateurs.length,
    nombreSeances: exportBackup.nombreSeances,
    nomFichier: exportBackup.nomFichier,
    livraisons,
    nettoyage,
  };
}

async function executerBackupAdminEmail(options = {}) {
  if (options.sansVerrou) {
    return executerBackupAdminSansVerrou(options);
  }

  const execution = await executerAvecVerrou(
    "backup-seances-admin",
    () => executerBackupAdminSansVerrou(options),
    { staleMs: BACKUP_LOCK_STALE_MS }
  );

  return execution.skipped
    ? { skipped: true, raison: "execution-deja-en-cours", livraisons: [] }
    : { ...execution.result, skipped: false };
}

function ajouterJoursDateIso(dateIso, nombreJours) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + nombreJours);
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the next 00:00 or 12:00 occurrence in the operations timezone.
 * The calendar-public GMT offset is intentionally never read here.
 */
function calculerProchaineExecutionBackup(dateReference = new Date()) {
  const locale = obtenirLocaleBackup(dateReference);
  const dates = [locale.date, ajouterJoursDateIso(locale.date, 1)];
  const candidates = [];

  for (const date of dates) {
    for (const heure of BACKUP_SCHEDULE) {
      const instant = convertirDateHeureZonneeEnInstant(
        date,
        heure,
        BACKUP_SEANCES_TIMEZONE
      );
      if (instant && instant.getTime() > dateReference.getTime()) {
        candidates.push(instant);
      }
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] || new Date(dateReference.getTime() + 12 * 60 * 60 * 1000);
}

function construireCleOccurrencePlanifiee(date = new Date()) {
  const locale = obtenirLocaleBackup(date);
  return `scheduled:${locale.date}-${locale.heure.replace(":", "")}`;
}

async function executerBackupsPlanifies(options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const locale = obtenirLocaleBackup(date);
  const occurrence = construireCleOccurrencePlanifiee(date);
  const resultat = { occurrenceKey: occurrence, handlers: null, admin: null };

  if (locale.heure === "00:00") {
    resultat.handlers = await executerBackupsHandlersEmail({
      ...options,
      date,
      occurrenceKey: `handlers:${occurrence}`,
    });
  }

  if (["00:00", "12:00"].includes(locale.heure)) {
    resultat.admin = await executerBackupAdminEmail({
      ...options,
      date,
      occurrenceKey: `admin:${occurrence}`,
    });
  }

  return resultat;
}

function planifierProchainBackupSeances() {
  const prochaineExecution = calculerProchaineExecutionBackup();
  const delai = Math.max(prochaineExecution.getTime() - Date.now(), 1000);

  backupTimer = setTimeout(async () => {
    backupTimer = null;

    try {
      await executerBackupsPlanifies({ date: prochaineExecution });
    } catch (error) {
      // The job is best-effort. The application remains available and the
      // next scheduled occurrence can retry with current business data.
      journaliserBackup("error", "scheduler-failed", {
        raison: "execution-impossible",
      });
    } finally {
      if (BACKUP_SEANCES_ENABLED) {
        planifierProchainBackupSeances();
      }
    }
  }, delai);

  if (typeof backupTimer.unref === "function") {
    backupTimer.unref();
  }

  journaliserBackup("info", "scheduled", {
    prochain: prochaineExecution.toISOString(),
    timezone: BACKUP_SEANCES_TIMEZONE,
  });
}

function demarrerPlanificateurBackupSeances() {
  if (!BACKUP_SEANCES_ENABLED || backupTimer) {
    return;
  }

  planifierProchainBackupSeances();
}

function arreterPlanificateurBackupSeances() {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
}

module.exports = {
  BACKUP_SCHEDULE,
  colonnesBackupHandler,
  colonnesBackupAdmin,
  echapperCsv,
  convertirSeancesEnCsv,
  creerExportBackupHandler,
  creerExportBackupAdmin,
  smtpEstConfigure,
  creerTransportSmtp,
  envoyerExportBackupParEmail,
  executerBackupsHandlersEmail,
  executerBackupAdminEmail,
  executerBackupsPlanifies,
  calculerProchaineExecutionBackup,
  construireCleOccurrencePlanifiee,
  demarrerPlanificateurBackupSeances,
  arreterPlanificateurBackupSeances,
};
