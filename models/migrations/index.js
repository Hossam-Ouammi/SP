const multiHandlerFoundation = require("./2026090701-multi-handler-foundation");
const availabilityRules = require("./2026090702-availability-rules");
const historiqueScopeColumns = require("./2026090703-historique-scope-columns");
const publicIdFormat = require("./2026090704-public-id-format");
const handlerCalendarHours = require("./2026090705-handler-calendar-hours");
const availabilityMidnight = require("./2026090706-availability-midnight");
const publicCalendarTimezone = require("./2026090707-public-calendar-timezone");
const repairPublicCalendarTimezone = require("./2026090708-repair-public-calendar-timezone");
const historiqueHmacV2Scope = require("./2026090709-historique-hmac-v2-scope");
const publicCalendarFixedOffset = require("./2026090710-public-calendar-fixed-offset");
const publicCalendarStableLink = require("./2026090801-public-calendar-stable-link");
const legacySuspendedProfessorAccess = require("./2026090802-legacy-suspended-professor-access");
const trustedDeviceExpiration = require("./2026090803-trusted-device-expiration");
const handlerSubjectTariffs = require("./2026090901-handler-subject-tariffs");
const normalizeHandlerSubjectKeys = require("./2026090902-normalize-handler-subject-keys");
const backupEmailDeliveries = require("./2026091001-backup-email-deliveries");
const professorMultiTeam = require("./2026091101-professor-multi-team");
const personalGlobalAvailability = require("./2026091102-personal-global-availability");

// Les migrations sont volontairement append-only. Une migration deja appliquee ne
// doit jamais etre modifiee : une evolution ulterieure ajoute une nouvelle entree.
const migrations = [
  multiHandlerFoundation,
  availabilityRules,
  historiqueScopeColumns,
  publicIdFormat,
  handlerCalendarHours,
  availabilityMidnight,
  publicCalendarTimezone,
  repairPublicCalendarTimezone,
  historiqueHmacV2Scope,
  publicCalendarFixedOffset,
  publicCalendarStableLink,
  legacySuspendedProfessorAccess,
  trustedDeviceExpiration,
  handlerSubjectTariffs,
  normalizeHandlerSubjectKeys,
  backupEmailDeliveries,
  professorMultiTeam,
  personalGlobalAvailability,
];

function verifierDefinitionMigrations() {
  const versions = new Set();

  for (const migration of migrations) {
    if (!migration?.version || typeof migration.up !== "function") {
      throw new Error("Migration SQLite invalide.");
    }

    if (versions.has(migration.version)) {
      throw new Error(`Version de migration SQLite dupliquee : ${migration.version}`);
    }

    versions.add(migration.version);
  }
}

async function assurerTableMigrations(run) {
  await run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function executerMigrationsVersionnees({
  run,
  get,
  all,
  executerTransactionImmediate,
}) {
  verifierDefinitionMigrations();
  await assurerTableMigrations(run);

  for (const migration of migrations) {
    const dejaAppliquee = await get(
      "SELECT version FROM schema_migrations WHERE version = ?",
      [migration.version]
    );

    if (dejaAppliquee) {
      continue;
    }

    await executerTransactionImmediate(async () => {
      // Le verrou de demarrage protege le cas normal. Cette seconde verification
      // rend aussi le runner sur pour les appels directs/concurrents.
      const appliqueePendantAttente = await get(
        "SELECT version FROM schema_migrations WHERE version = ?",
        [migration.version]
      );

      if (appliqueePendantAttente) {
        return;
      }

      await migration.up({ run, get, all });

      await run(
        `
          INSERT INTO schema_migrations (version, description)
          VALUES (?, ?)
        `,
        [migration.version, migration.description || migration.version]
      );
    });
  }
}

module.exports = {
  executerMigrationsVersionnees,
  migrations,
};
