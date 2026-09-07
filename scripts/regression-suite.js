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
  { name: "scope temps reel", script: "realtime-scope.test.js" },
  { name: "scope notifications push", script: "push-scope.test.js" },
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
  { name: "isolation entre Handlers", script: "multi-handler-isolation.test.js" },
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
