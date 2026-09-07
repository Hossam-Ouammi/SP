const fs = require("fs/promises");
const path = require("path");
const nodemailer = require("nodemailer");

const {
  BACKUP_SEANCES_ENABLED,
  BACKUP_SEANCES_EMAIL_TO,
  BACKUP_SEANCES_EMAIL_FROM,
  BACKUP_SEANCES_TIMEZONE,
  BACKUP_SEANCES_DAILY_HOUR,
  BACKUP_SEANCES_DAILY_MINUTE,
  BACKUP_SEANCES_OUTPUT_DIR,
  BACKUP_SEANCES_RETENTION_DAYS,
  BACKUP_SEANCES_EMAIL_DRY_RUN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
} = require("../config/backup.config");
const { executerAvecVerrou } = require("./job-lock");
const { listerToutesLesSeances } = require("../models/seance.model");
const {
  convertirDateHeureZonneeEnInstant,
  convertirInstantEnDateHeureZonnee,
} = require("./timezone");

let backupTimer = null;
let backupEnCours = false;
const backupLockStaleMs = 60 * 60 * 1000;
const nomFichierBackupRegex = /^seances-backup-\d{4}-\d{2}-\d{2}\.csv$/;

const colonnesBackupSeances = [
  ["id", "id"],
  ["date", "date"],
  ["heure_debut", "heure_debut"],
  ["heure_fin", "heure_fin"],
  ["duree_minutes", "duree_minutes"],
  ["statut_seance", "statut_seance"],
  ["etudiant", "etudiant"],
  ["parent", "parent"],
  ["matiere", "matiere"],
  ["compte", "compte"],
  ["est_essai", "est_essai"],
  ["prix", "prix"],
  ["statut_paiement", "statut_paiement"],
  ["description", "description"],
  ["cree_par", "cree_par"],
  ["cree_par_nom", "cree_par_nom"],
  ["modifie_par", "modifie_par"],
  ["modifie_par_nom", "modifie_par_nom"],
  ["utilisateur_id", "utilisateur_id"],
  ["public_reservation_device_id", "public_reservation_device_id"],
  ["nombre_photos", "nombre_photos"],
  ["created_at", "created_at"],
  ["updated_at", "updated_at"],
];

function echapperCsv(valeur) {
  const texteBrut = String(valeur ?? "");
  const texte = /^[=+\-@]/.test(texteBrut) ? `'${texteBrut}` : texteBrut;

  if (!/[",\n\r]/.test(texte)) {
    return texte;
  }

  return `"${texte.replace(/"/g, '""')}"`;
}

function convertirSeancesEnCsv(seances) {
  const lignes = [
    colonnesBackupSeances.map(([entete]) => echapperCsv(entete)).join(","),
  ];

  seances.forEach((seance) => {
    lignes.push(
      colonnesBackupSeances
        .map(([, champ]) => echapperCsv(seance?.[champ]))
        .join(",")
    );
  });

  return `${lignes.join("\n")}\n`;
}

function obtenirDateLocaleBackup(date = new Date()) {
  return convertirInstantEnDateHeureZonnee(date, BACKUP_SEANCES_TIMEZONE)?.date ||
    date.toISOString().slice(0, 10);
}

function obtenirNomFichierBackup(date = new Date()) {
  return `seances-backup-${obtenirDateLocaleBackup(date)}.csv`;
}

async function genererFichierBackupSeances(options = {}) {
  const maintenant = options.date || new Date();
  const seances = await listerToutesLesSeances();
  const csv = convertirSeancesEnCsv(seances);
  const dossier = options.outputDir || BACKUP_SEANCES_OUTPUT_DIR;
  const nomFichier = obtenirNomFichierBackup(maintenant);
  const chemin = path.join(dossier, nomFichier);

  await fs.mkdir(dossier, { recursive: true, mode: 0o700 });
  await fs.writeFile(chemin, csv, { encoding: "utf8", mode: 0o600 });

  return {
    chemin,
    nomFichier,
    nombreSeances: seances.length,
    date: obtenirDateLocaleBackup(maintenant),
  };
}

async function nettoyerAnciensBackupsSeances(options = {}) {
  const dossier = options.outputDir || BACKUP_SEANCES_OUTPUT_DIR;
  const retentionDays = Number(
    options.retentionDays ?? BACKUP_SEANCES_RETENTION_DAYS
  );

  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return {
      fichiersSupprimes: 0,
      retentionDays: 0,
    };
  }

  const seuilMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let entrees = [];

  try {
    entrees = await fs.readdir(dossier, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        fichiersSupprimes: 0,
        retentionDays,
      };
    }

    throw error;
  }

  let fichiersSupprimes = 0;

  for (const entree of entrees) {
    if (!entree.isFile() || !nomFichierBackupRegex.test(entree.name)) {
      continue;
    }

    const chemin = path.join(dossier, entree.name);
    const statistiques = await fs.stat(chemin).catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (!statistiques || statistiques.mtimeMs >= seuilMs) {
      continue;
    }

    await fs.unlink(chemin);
    fichiersSupprimes += 1;
  }

  return {
    fichiersSupprimes,
    retentionDays,
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
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function envoyerBackupSeancesParEmail(backup) {
  const transport = creerTransportSmtp();

  if (!BACKUP_SEANCES_EMAIL_TO) {
    return {
      envoye: false,
      raison: "destinataire-non-configure",
    };
  }

  if (!transport || BACKUP_SEANCES_EMAIL_DRY_RUN) {
    return {
      envoye: false,
      raison: BACKUP_SEANCES_EMAIL_DRY_RUN ? "dry-run" : "smtp-non-configure",
    };
  }

  const from = BACKUP_SEANCES_EMAIL_FROM || SMTP_USER;
  const info = await transport.sendMail({
    from,
    to: BACKUP_SEANCES_EMAIL_TO,
    subject: `Backup séances - ${backup.date}`,
    text:
      `Backup automatique des séances du ${backup.date}.\n` +
      `Nombre de séances exportées : ${backup.nombreSeances}.\n`,
    attachments: [
      {
        filename: backup.nomFichier,
        path: backup.chemin,
        contentType: "text/csv; charset=utf-8",
      },
    ],
  });

  return {
    envoye: true,
    messageId: info.messageId,
  };
}

async function executerBackupSeancesEmailSansVerrou(options = {}) {
  const backup = await genererFichierBackupSeances(options);
  const email = await envoyerBackupSeancesParEmail(backup);
  const nettoyage = await nettoyerAnciensBackupsSeances(options);

  if (!email.envoye) {
    console.warn(
      `Backup séances cree sans envoi email (${email.raison}) : ${backup.chemin}`
    );
  } else {
    console.log(
      `Backup séances envoye a ${BACKUP_SEANCES_EMAIL_TO} : ${backup.nomFichier}`
    );
  }

  if (nettoyage.fichiersSupprimes > 0) {
    console.log(
      `${nettoyage.fichiersSupprimes} ancien(s) backup(s) séances supprimé(s).`
    );
  }

  return {
    backup,
    email,
    nettoyage,
  };
}

async function executerBackupSeancesEmail(options = {}) {
  const execution = await executerAvecVerrou(
    "backup-seances",
    () => executerBackupSeancesEmailSansVerrou(options),
    { staleMs: backupLockStaleMs }
  );

  if (execution.skipped) {
    console.warn("Backup séances déjà en cours, execution ignoree.");
    return {
      skipped: true,
      backup: null,
      email: {
        envoye: false,
        raison: "execution-deja-en-cours",
      },
      nettoyage: {
        fichiersSupprimes: 0,
        retentionDays: BACKUP_SEANCES_RETENTION_DAYS,
      },
    };
  }

  return {
    ...execution.result,
    skipped: false,
  };
}

function calculerProchaineExecution(dateReference = new Date()) {
  const locale = convertirInstantEnDateHeureZonnee(
    dateReference,
    BACKUP_SEANCES_TIMEZONE
  );
  const heureCible = `${String(BACKUP_SEANCES_DAILY_HOUR).padStart(2, "0")}:${String(
    BACKUP_SEANCES_DAILY_MINUTE
  ).padStart(2, "0")}`;
  let dateCible = locale?.date || dateReference.toISOString().slice(0, 10);
  let instantCible = convertirDateHeureZonneeEnInstant(
    dateCible,
    heureCible,
    BACKUP_SEANCES_TIMEZONE
  );

  if (!instantCible || instantCible.getTime() <= dateReference.getTime()) {
    const dateMilieuJour = new Date(`${dateCible}T12:00:00Z`);
    dateMilieuJour.setUTCDate(dateMilieuJour.getUTCDate() + 1);
    dateCible = dateMilieuJour.toISOString().slice(0, 10);
    instantCible = convertirDateHeureZonneeEnInstant(
      dateCible,
      heureCible,
      BACKUP_SEANCES_TIMEZONE
    );
  }

  return instantCible || new Date(dateReference.getTime() + 24 * 60 * 60 * 1000);
}

function planifierProchainBackupSeances() {
  const prochaineExecution = calculerProchaineExecution();
  const delai = Math.max(prochaineExecution.getTime() - Date.now(), 1000);

  backupTimer = setTimeout(async () => {
    backupTimer = null;

    if (backupEnCours) {
      planifierProchainBackupSeances();
      return;
    }

    backupEnCours = true;
    try {
      await executerBackupSeancesEmail();
    } catch (error) {
      console.error("Backup automatique des séances impossible :", error);
    } finally {
      backupEnCours = false;
      planifierProchainBackupSeances();
    }
  }, delai);

  if (typeof backupTimer.unref === "function") {
    backupTimer.unref();
  }

  console.log(
    `Backup séances planifie pour ${prochaineExecution.toISOString()} (${BACKUP_SEANCES_TIMEZONE}).`
  );
}

function demarrerPlanificateurBackupSeances() {
  if (!BACKUP_SEANCES_ENABLED || backupTimer) {
    return;
  }

  planifierProchainBackupSeances();
}

module.exports = {
  convertirSeancesEnCsv,
  genererFichierBackupSeances,
  nettoyerAnciensBackupsSeances,
  envoyerBackupSeancesParEmail,
  executerBackupSeancesEmail,
  calculerProchaineExecution,
  demarrerPlanificateurBackupSeances,
};
