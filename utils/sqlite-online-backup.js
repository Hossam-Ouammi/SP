const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function ouvrirBaseSqlite(chemin, mode) {
  return new Promise((resolve, reject) => {
    const base = new sqlite3.Database(chemin, mode, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(base);
    });
  });
}

function fermerBaseSqlite(base) {
  return new Promise((resolve, reject) => {
    base.close((error) => (error ? reject(error) : resolve()));
  });
}

function lireUneLigne(base, sql) {
  return new Promise((resolve, reject) => {
    base.get(sql, (error, ligne) => (error ? reject(error) : resolve(ligne)));
  });
}

function lireToutesLesLignes(base, sql) {
  return new Promise((resolve, reject) => {
    base.all(sql, (error, lignes) => (error ? reject(error) : resolve(lignes)));
  });
}

async function sauvegarderBaseSqliteEnLigne(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const base = await ouvrirBaseSqlite(source, sqlite3.OPEN_READONLY);

  try {
    await new Promise((resolve, reject) => {
      const backup = base.backup(destination);
      backup.step(-1, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } finally {
    await fermerBaseSqlite(base).catch(() => {});
  }

  await fs.chmod(destination, 0o600).catch(() => {});
  return destination;
}

async function verifierBaseSqlite(chemin) {
  const base = await ouvrirBaseSqlite(chemin, sqlite3.OPEN_READONLY);

  try {
    const integrite = await lireUneLigne(base, "PRAGMA integrity_check");
    const violations = await lireToutesLesLignes(base, "PRAGMA foreign_key_check");
    return {
      integrityCheck: String(Object.values(integrite || {})[0] || "unknown"),
      foreignKeyViolations: Array.isArray(violations) ? violations.length : 0,
    };
  } finally {
    await fermerBaseSqlite(base).catch(() => {});
  }
}

module.exports = {
  sauvegarderBaseSqliteEnLigne,
  verifierBaseSqlite,
};
