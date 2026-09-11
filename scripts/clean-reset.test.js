const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const sqlite3 = require("sqlite3").verbose();

if (!process.env.DATABASE_PATH || process.env.NODE_ENV !== "test") {
  throw new Error("Ce test exige une base isolee et NODE_ENV=test.");
}

const { initialiserBaseDeDonnees, fermerBaseDeDonnees, run } = require("../models/db");

function lancer(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: path.join(__dirname, ".."), env,
      stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `code ${code}`)));
  });
}

function lireUn(database, sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(database, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
      else db.get(sql, (err, row) => db.close(() => err ? reject(err) : resolve(row)));
    });
  });
}

async function main() {
  const source = path.resolve(process.env.DATABASE_PATH);
  await initialiserBaseDeDonnees();
  await run("CREATE TABLE legacy_marker (value TEXT NOT NULL)");
  await run("INSERT INTO legacy_marker (value) VALUES ('ANCIENNE-BASE-A-CONSERVER')");
  await fermerBaseDeDonnees();

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "clean-reset-test-"));
  const cible = path.join(dossier, "runtime", "database-clean.db");
  const archives = path.join(dossier, "archives");
  const stdout = await lancer(path.join("scripts", "reset-clean-install.js"), {
    ...process.env,
    DATABASE_PATH: source,
    CLEAN_DATABASE_PATH: cible,
    CLEAN_DATABASE_ARCHIVE_DIR: archives,
    CLEAN_INSTALL_CONFIRM: "ARCHIVE_AND_INITIALIZE",
    BACKUP_SEANCES_ENABLED: "false",
  });
  const debutJson = stdout.indexOf("{");
  const resultat = JSON.parse(stdout.slice(debutJson));
  assert.equal(fs.existsSync(source), true, "La source doit rester en place.");
  assert.equal(fs.existsSync(resultat.archive), true);
  assert.equal(fs.existsSync(resultat.manifeste), true);
  assert.equal(fs.existsSync(cible), true);
  assert.equal((await lireUn(source, "SELECT value FROM legacy_marker")).value, "ANCIENNE-BASE-A-CONSERVER");
  assert.equal((await lireUn(resultat.archive, "SELECT value FROM legacy_marker")).value, "ANCIENNE-BASE-A-CONSERVER");
  assert.equal(await lireUn(cible, "SELECT name FROM sqlite_master WHERE name='legacy_marker'"), undefined);
  assert.equal((await lireUn(cible, "SELECT COUNT(*) AS total FROM utilisateurs")).total, 1);
  assert.equal((await lireUn(cible, "SELECT COUNT(*) AS total FROM seances")).total, 0);
  assert.equal(Object.values(await lireUn(cible, "PRAGMA integrity_check"))[0], "ok");
  console.log("clean reset archive/initialization test: PASS");
}

main().catch((error) => { console.error("clean reset test: FAIL", error); process.exitCode = 1; })
  .finally(async () => fermerBaseDeDonnees().catch(() => {}));
