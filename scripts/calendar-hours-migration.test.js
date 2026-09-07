/*
 * Regression of the append-only Handler calendar-hours migration against a
 * deliberately old schema.  It does not initialise the whole application:
 * that makes sure 0705 itself is safe for rows that existed before the new
 * columns, and that it cannot rewrite planning data as a side effect.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repertoireTemporaire = fs.mkdtempSync(
  path.join(os.tmpdir(), "gestion-seances-calendar-hours-migration-")
);
process.env.DATABASE_PATH = path.join(repertoireTemporaire, "legacy.db");
// Le scénario couvre précisément l'ancien défaut global. Il doit rester
// déterministe, même lorsqu'un poste local exporte cette variable d'environnement.
process.env.PUBLIC_RESERVATION_TIMEZONE = "Europe/Paris";

const { run, get, all, fermerBaseDeDonnees } = require("../models/db");
const migration = require("../models/migrations/2026090705-handler-calendar-hours");
const migrationFuseauPublic = require("../models/migrations/2026090707-public-calendar-timezone");
const migrationReparationFuseauPublic = require("../models/migrations/2026090708-repair-public-calendar-timezone");
const migrationOffsetFixePublic = require("../models/migrations/2026090710-public-calendar-fixed-offset");

async function main() {
  await run(`
    CREATE TABLE utilisateurs (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL,
      timezone TEXT
    )
  `);
  await run(`
    CREATE TABLE seances (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL
    )
  `);
  await run(`
    CREATE TABLE disponibilites (
      id INTEGER PRIMARY KEY,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL
    )
  `);

  await run("INSERT INTO utilisateurs (id, nom, timezone) VALUES (1, ?, ?)", [
    "Handler legacy",
    "Africa/Casablanca",
  ]);
  await run(
    "INSERT INTO seances (id, date, heure_debut, heure_fin) VALUES (1, ?, ?, ?)",
    ["2031-04-01", "22:30", "23:30"]
  );
  await run(
    "INSERT INTO disponibilites (id, heure_debut, heure_fin) VALUES (1, ?, ?)",
    ["08:00", "12:00"]
  );
  await run("INSERT INTO utilisateurs (id, nom, timezone) VALUES (2, ?, ?)", [
    "Handler legacy Europe",
    "Europe/Paris",
  ]);

  const contexte = { run, all };
  await migration.up(contexte);
  await migrationFuseauPublic.up(contexte);

  const handlerLegacy = await get(
    `
      SELECT id, timezone, public_calendar_timezone, calendar_start_time, calendar_end_time
      FROM utilisateurs
      WHERE id = 1
    `
  );
  assert.deepEqual(handlerLegacy, {
    id: 1,
    timezone: "Africa/Casablanca",
    public_calendar_timezone: "Africa/Casablanca",
    calendar_start_time: "08:00",
    calendar_end_time: "23:30",
  });

  const seanceApresMigration = await get(
    "SELECT date, heure_debut, heure_fin FROM seances WHERE id = 1"
  );
  assert.deepEqual(seanceApresMigration, {
    date: "2031-04-01",
    heure_debut: "22:30",
    heure_fin: "23:30",
  });
  const disponibiliteApresMigration = await get(
    "SELECT heure_debut, heure_fin FROM disponibilites WHERE id = 1"
  );
  assert.deepEqual(disponibiliteApresMigration, {
    heure_debut: "08:00",
    heure_fin: "12:00",
  });

  const handlerLegacyEurope = await get(
    "SELECT public_calendar_timezone FROM utilisateurs WHERE id = 2"
  );
  assert.deepEqual(handlerLegacyEurope, {
    public_calendar_timezone: "Europe/Paris",
  });

  await run(`
    CREATE TABLE historique_actions (
      id INTEGER PRIMARY KEY,
      handler_id INTEGER,
      action_type TEXT NOT NULL
    )
  `);
  await run("INSERT INTO utilisateurs (id, nom, timezone) VALUES (4, ?, ?)", [
    "Handler choix explicite",
    "America/New_York",
  ]);

  // Simule la version de développement fautive de 0707 : la migration de
  // réparation doit revenir au fuseau public historique, sauf si le Handler
  // a ensuite choisi explicitement cette même valeur.
  await run(
    "UPDATE utilisateurs SET public_calendar_timezone = timezone WHERE id IN (1, 2, 4)"
  );
  await run(
    "INSERT INTO historique_actions (id, handler_id, action_type) VALUES (?, ?, ?)",
    [1, 4, "fuseau_calendrier_public_modifie"]
  );
  await migrationReparationFuseauPublic.up(contexte);
  const reparationFuseaux = await all(`
    SELECT id, public_calendar_timezone
    FROM utilisateurs
    WHERE id IN (1, 2, 4)
    ORDER BY id ASC
  `);
  assert.deepEqual(reparationFuseaux, [
    { id: 1, public_calendar_timezone: "Europe/Paris" },
    { id: 2, public_calendar_timezone: "Europe/Paris" },
    { id: 4, public_calendar_timezone: "America/New_York" },
  ]);

  await migrationOffsetFixePublic.up(contexte);
  const offsetsPublics = await all(
    "SELECT id, public_calendar_timezone FROM utilisateurs WHERE id IN (1, 2, 4) ORDER BY id ASC"
  );
  assert.deepEqual(offsetsPublics, [
    { id: 1, public_calendar_timezone: "GMT" },
    { id: 2, public_calendar_timezone: "GMT" },
    { id: 4, public_calendar_timezone: "GMT" },
  ]);

  await run("INSERT INTO utilisateurs (id, nom, timezone) VALUES (3, ?, ?)", [
    "Handler apres migration",
    "Europe/Paris",
  ]);
  const handlerNouveau = await get(
    `
      SELECT calendar_start_time, calendar_end_time, public_calendar_timezone
      FROM utilisateurs
      WHERE id = 3
    `
  );
  assert.deepEqual(handlerNouveau, {
    calendar_start_time: "08:00",
    calendar_end_time: "23:30",
    public_calendar_timezone: "GMT",
  });

  // Running the migration body again is harmless for a partially migrated
  // installation because it detects the already present columns/index.
  await migration.up(contexte);
  await migrationFuseauPublic.up(contexte);
  await migrationReparationFuseauPublic.up(contexte);
  await migrationOffsetFixePublic.up(contexte);
  const index = await get(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_utilisateurs_calendar_hours'
    `
  );
  assert.equal(index?.name, "idx_utilisateurs_calendar_hours");

  console.log("calendar-hours migration test: PASS");
}

main()
  .catch((error) => {
    console.error("calendar-hours migration test: FAIL");
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
    fs.rmSync(repertoireTemporaire, { recursive: true, force: true });
  });
