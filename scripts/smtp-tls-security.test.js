/*
 * SMTP transports must never silently fall back to clear-text SMTP in a
 * production deployment.  Nodemailer is replaced locally so this test makes
 * no network connection and cannot send a real message.
 */
const assert = require("node:assert/strict");

process.env.NODE_ENV = "production";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "mailer@example.test";
process.env.SMTP_PASS = "test-only-secret";
process.env.ACCOUNT_EMAIL_DRY_RUN = "false";
process.env.BACKUP_SEANCES_EMAIL_DRY_RUN = "false";

const nodemailer = require("nodemailer");
const creerTransportOriginal = nodemailer.createTransport;
const configurations = [];

nodemailer.createTransport = (configuration) => {
  configurations.push(configuration);
  return {
    async sendMail() {
      return { messageId: "smtp-tls-security-test" };
    },
  };
};

function viderCache(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function verifierPortParDefautCompatible(secure) {
  process.env.SMTP_SECURE = secure ? "true" : "false";
  process.env.SMTP_PORT = "configuration-invalide";
  viderCache("../config/backup.config");

  const configuration = require("../config/backup.config");
  assert.equal(configuration.SMTP_SECURE, secure);
  assert.equal(
    configuration.SMTP_PORT,
    secure ? 465 : 587,
    "Un port SMTP invalide doit retomber sur le port compatible avec le mode TLS choisi."
  );
}

async function exercerTransports(secure) {
  process.env.SMTP_SECURE = secure ? "true" : "false";
  configurations.length = 0;

  // The SMTP configuration is read once at module load. Reload only the two
  // transport modules and their configuration to exercise both deployment
  // modes in this isolated process.
  viderCache("../config/backup.config");
  viderCache("../utils/account-email");
  viderCache("../utils/seances-backup-email");

  const { envoyerEmailCycleCompte } = require("../utils/account-email");
  const { envoyerExportBackupParEmail } = require("../utils/seances-backup-email");

  const email = await envoyerEmailCycleCompte({
    to: "recipient@example.test",
    subject: "Test TLS SMTP",
    text: "Test",
    html: "<p>Test</p>",
  });
  assert.equal(email.envoye, true);

  const backup = await envoyerExportBackupParEmail({
    destinataire: "archive@example.test",
    exportBackup: {
      date: "2026-09-09",
      heure: "12:00",
      nombreSeances: 0,
      nomFichier: "seances-backup-2026-09-09.csv",
      sujet: "Backup test",
      csv: "\uFEFFdate\n",
    },
  });
  assert.equal(backup.envoye, true);
  assert.equal(configurations.length, 2, "Les deux transports SMTP doivent etre exerces.");

  return configurations.map((configuration) => ({
    secure: configuration.secure,
    requireTLS: configuration.requireTLS,
  }));
}

async function main() {
  try {
    const startTls = await exercerTransports(false);
    startTls.forEach((configuration) => {
      assert.equal(configuration.secure, false);
      assert.equal(
        configuration.requireTLS,
        true,
        "SMTP explicite doit exiger STARTTLS en production."
      );
    });

    const tlsImplicite = await exercerTransports(true);
    tlsImplicite.forEach((configuration) => {
      assert.equal(configuration.secure, true);
      assert.equal(
        configuration.requireTLS,
        false,
        "Un transport TLS implicite est deja chiffre avant le protocole SMTP."
      );
    });

    verifierPortParDefautCompatible(false);
    verifierPortParDefautCompatible(true);

    console.log("smtp-tls-security test: PASS");
  } finally {
    nodemailer.createTransport = creerTransportOriginal;
  }
}

main().catch((error) => {
  console.error("smtp-tls-security test: FAIL", error);
  process.exitCode = 1;
});
