const fs = require("fs/promises");
const path = require("path");

const lockDirectoryDefault = path.join(__dirname, "..", "database", "locks");
const staleMsDefault = 30 * 60 * 1000;

function normaliserNomVerrou(nom) {
  return (
    String(nom || "job")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "job"
  );
}

function analyserDateVerrou(contenu) {
  try {
    const verrou = JSON.parse(contenu);
    const timestamp = Date.parse(verrou.started_at || verrou.startedAt || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch (error) {
    return 0;
  }
}

async function supprimerVerrouPerimeSiNecessaire(cheminVerrou, staleMs) {
  let contenu = "";

  try {
    contenu = await fs.readFile(cheminVerrou, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return true;
    }

    throw error;
  }

  const timestamp = analyserDateVerrou(contenu);
  const verrouPerime = !timestamp || Date.now() - timestamp > staleMs;

  if (!verrouPerime) {
    return false;
  }

  await fs.unlink(cheminVerrou).catch((error) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });

  return true;
}

async function creerFichierVerrou(cheminVerrou, contenu, staleMs, tentative = 0) {
  try {
    const handle = await fs.open(cheminVerrou, "wx");
    try {
      await handle.writeFile(contenu, "utf8");
    } catch (error) {
      await handle.close().catch(() => {});
      await fs.unlink(cheminVerrou).catch(() => {});
      throw error;
    }
    return handle;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    if (tentative > 0) {
      return null;
    }

    const verrouDisponible = await supprimerVerrouPerimeSiNecessaire(
      cheminVerrou,
      staleMs
    );

    if (!verrouDisponible) {
      return null;
    }

    return creerFichierVerrou(cheminVerrou, contenu, staleMs, tentative + 1);
  }
}

async function executerAvecVerrou(nom, callback, options = {}) {
  const lockDirectory = options.lockDirectory || lockDirectoryDefault;
  const staleMs = Math.max(Number(options.staleMs) || staleMsDefault, 1000);
  const nomVerrou = normaliserNomVerrou(nom);
  const cheminVerrou = path.join(lockDirectory, `${nomVerrou}.lock`);
  const contenuVerrou = JSON.stringify(
    {
      name: nomVerrou,
      pid: process.pid,
      started_at: new Date().toISOString(),
    },
    null,
    2
  );

  await fs.mkdir(lockDirectory, { recursive: true });

  const handle = await creerFichierVerrou(cheminVerrou, contenuVerrou, staleMs);

  if (!handle) {
    return {
      skipped: true,
      reason: "already-running",
      lockPath: cheminVerrou,
    };
  }

  try {
    const result = await callback({ lockPath: cheminVerrou });
    return {
      skipped: false,
      result,
      lockPath: cheminVerrou,
    };
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(cheminVerrou).catch((error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

module.exports = {
  executerAvecVerrou,
  normaliserNomVerrou,
};
