/*
 * Cross-platform regression runner for the multi-user application.
 *
 * Each database-backed unit test receives a fresh SQLite file under a
 * generated temporary directory.  This intentionally never reuses
 * DATABASE_PATH from the caller, so `npm test` cannot touch a local or
 * production database by accident.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "gestion-seances-regression-")
);

const tests = [
  {
    name: "bootstrap SuperAdmin sans identifiants embarques",
    script: "bootstrap-superadmin.test.js",
    database: true,
    bootstrap: true,
  },
  {
    name: "reset propre avec archivage verifie",
    script: "clean-reset.test.js",
    database: true,
    bootstrap: true,
  },
  {
    name: "isolation transactionnelle SQLite",
    script: "transaction-isolation.test.js",
    database: true,
  },
  {
    name: "bootstrap legacy SQLite",
    script: "legacy-bootstrap-regression.test.js",
    database: true,
  },
  { name: "scope temps reel", script: "realtime-scope.test.js" },
  { name: "scope notifications push", script: "push-scope.test.js" },
  {
    name: "endpoints Push publics uniquement",
    script: "push-endpoint-security.test.js",
    database: true,
  },
  {
    name: "role SuperAdmin canonique et propriete Push",
    script: "superadmin-push-security.test.js",
  },
  {
    name: "cycle de vie des comptes",
    script: "account-lifecycle.test.js",
    database: true,
  },
  {
    name: "suppression definitive d'un compte sans seance",
    script: "account-deletion.test.js",
    database: true,
  },
  {
    name: "limite bcrypt des mots de passe",
    script: "password-security.test.js",
    database: true,
  },
  {
    name: "configuration SMTP explicite",
    script: "account-email-configuration.test.js",
  },
  {
    name: "secrets de production robustes",
    script: "production-secret-validation.test.js",
  },
  {
    name: "export CSV de sauvegarde des seances",
    script: "seances-backup-export.test.js",
    database: true,
  },
  {
    name: "isolation et idempotence des sauvegardes email",
    script: "email-backups.test.js",
    database: true,
  },
  {
    name: "TLS obligatoire pour SMTP de production",
    script: "smtp-tls-security.test.js",
  },
  {
    name: "provenance des mutations HTTP",
    script: "request-provenance-security.test.js",
  },
  {
    name: "expiration serveur des appareils de confiance",
    script: "trusted-device-expiration.test.js",
    database: true,
  },
  {
    name: "recuperation du service worker apres deploiement",
    script: "service-worker-recovery.test.js",
  },
  {
    name: "regles de disponibilite",
    script: "disponibilite-model.test.js",
    database: true,
  },
  {
    name: "migration horaires calendrier Handler",
    script: "calendar-hours-migration.test.js",
  },
  { name: "heure civile et transitions DST", script: "timezone-dst.test.js" },
  {
    name: "conversion centrale vers calendrier public",
    script: "public-calendar-timezone.test.js",
  },
  { name: "calendrier public a jeton", script: "public-calendar-token.test.js" },
  {
    name: "reglages espace et calendrier public Handler",
    script: "workspace-settings.test.js",
  },
  {
    name: "politique de disponibilite du calendrier Handler",
    script: "handler-availability-policy.test.js",
  },
  {
    name: "tarifs versionnes par matiere Handler",
    script: "subject-tariffs.test.js",
  },
  { name: "isolation entre Handlers", script: "multi-handler-isolation.test.js" },
  { name: "Professeur rattache a plusieurs equipes", script: "professor-multi-team.test.js", database: true },
  { name: "transfert SuperAdmin de Professeur", script: "professor-transfer.test.js" },
  {
    name: "analyses globales SuperAdmin",
    script: "admin-analytics.test.js",
  },
  {
    name: "permissions des modules Professeur",
    script: "module-access-flags.test.js",
  },
  {
    name: "bootstrap interface après connexion",
    script: "ui-bootstrap.test.js",
  },
  {
    name: "contrat API frontend et workflows admin actifs",
    script: "frontend-api-contract.test.js",
  },
  {
    name: "chaine d'audit HMAC v1/v2 et concurrence SQLite",
    script: "historique-audit-chain.test.js",
    database: true,
  },
];

function lancerTest(test, index) {
  const env = {
    ...process.env,
    NODE_ENV: "test",
    SEED_DEMO_DATA: "",
    SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
    AUDIT_SECRET: crypto.randomBytes(48).toString("hex"),
    PUSH_ENABLE_IN_MEMORY_REMINDERS: "false",
    BACKUP_SEANCES_ENABLED: "false",
    BACKUP_SEANCES_EMAIL_DRY_RUN: "false",
  };

  // Tests must not accidentally create a deployment account inherited from
  // the parent shell.  The bootstrap test below is the sole explicit opt-in.
  delete env.INITIAL_SUPERADMIN_NAME;
  delete env.INITIAL_SUPERADMIN_EMAIL;
  delete env.INITIAL_SUPERADMIN_PASSWORD;

  if (test.bootstrap) {
    env.INITIAL_SUPERADMIN_NAME = "SuperAdmin Bootstrap Test";
    env.INITIAL_SUPERADMIN_EMAIL = "bootstrap-superadmin@example.test";
    env.INITIAL_SUPERADMIN_PASSWORD = "BootstrapOnly!2026";
  }

  if (test.database) {
    env.DATABASE_PATH = path.join(temporaryDirectory, `test-${index + 1}.db`);
  } else {
    delete env.DATABASE_PATH;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join("scripts", test.script)], {
      cwd: root,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${test.script} a echoue (${signal ? `signal ${signal}` : `code ${code}`}).`
        )
      );
    });
  });
}

async function main() {
  const failures = [];

  try {
    for (const [index, test] of tests.entries()) {
      console.log(`\n> Regression: ${test.name}`);
      try {
        await lancerTest(test, index);
      } catch (error) {
        failures.push({ test, error });
        console.error(`ECHEC - ${test.name}: ${error.message || error}`);
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} test(s) de regression ont echoue.`);
  }

  console.log(`\nSuite de regression terminee: ${tests.length} tests reussis.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
