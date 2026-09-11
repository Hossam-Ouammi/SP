const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const { chargerEnvironnementRuntime } = require("./load-runtime-env");

chargerEnvironnementRuntime();

const {
  sauvegarderBaseSqliteEnLigne,
  verifierBaseSqlite,
} = require("../utils/sqlite-online-backup");
const {
  motDePasseRespectePolitique,
} = require("../utils/security");
const {
  secretConfigureEstRobuste,
} = require("../utils/production-secret");

const root = path.join(__dirname, "..");
const confirmationAttendue = "ARCHIVE_AND_INITIALIZE";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function obtenirCheminSource() {
  return path.resolve(
    String(process.env.DATABASE_PATH || "").trim() ||
      path.join(root, "database", "database.db")
  );
}

function obtenirCheminCible() {
  const valeur = String(process.env.CLEAN_DATABASE_PATH || "").trim();
  if (!valeur || !path.isAbsolute(valeur)) {
    throw new Error("CLEAN_DATABASE_PATH doit être un chemin absolu vers un fichier inexistant.");
  }
  return path.resolve(valeur);
}

function obtenirDossierArchive(source) {
  const configure = String(process.env.CLEAN_DATABASE_ARCHIVE_DIR || "").trim();
  const valeur = configure || path.join(path.dirname(source), "archives");
  if (!path.isAbsolute(valeur)) {
    throw new Error("CLEAN_DATABASE_ARCHIVE_DIR doit être un chemin absolu.");
  }
  return path.resolve(valeur);
}

function validerConfigurationBootstrap() {
  const nom = String(process.env.INITIAL_SUPERADMIN_NAME || "").trim();
  const email = String(process.env.INITIAL_SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const motDePasse = String(process.env.INITIAL_SUPERADMIN_PASSWORD || "");
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
  const auditSecret = String(process.env.AUDIT_SECRET || "").trim();

  if (!nom || !emailRegex.test(email) || !motDePasseRespectePolitique(motDePasse)) {
    throw new Error(
      "INITIAL_SUPERADMIN_NAME, INITIAL_SUPERADMIN_EMAIL et un mot de passe conforme sont obligatoires."
    );
  }

  // A clean installation must not silently reuse fallback files from the old
  // runtime directory. Explicit independent secrets make the cutover clear.
  if (!secretConfigureEstRobuste(sessionSecret) || !secretConfigureEstRobuste(auditSecret)) {
    throw new Error(
      "SESSION_SECRET et AUDIT_SECRET doivent être explicitement définis avec au moins 32 octets aléatoires."
    );
  }

  if (sessionSecret === auditSecret) {
    throw new Error("SESSION_SECRET et AUDIT_SECRET doivent être différents.");
  }
}

async function verifierCibles(source, cible, dossierArchive) {
  const sourceStat = await fsp.stat(source).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error(`Base source introuvable : ${source}`);
  }

  const sourceReel = await fsp.realpath(source);
  if (path.resolve(sourceReel) === cible) {
    throw new Error("La nouvelle base ne peut pas remplacer le fichier source.");
  }

  if (fs.existsSync(cible)) {
    throw new Error("CLEAN_DATABASE_PATH existe déjà ; choisissez une cible neuve.");
  }

  if (path.resolve(dossierArchive) === cible) {
    throw new Error("Le dossier d'archive et la nouvelle base doivent être distincts.");
  }
}

function calculerSha256(chemin) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const flux = fs.createReadStream(chemin);
    flux.on("error", reject);
    flux.on("data", (chunk) => hash.update(chunk));
    flux.on("end", () => resolve(hash.digest("hex")));
  });
}

function lancerInitialisationPropre(databasePath) {
  return new Promise((resolve, reject) => {
    const enfant = spawn(process.execPath, [path.join("scripts", "initialize-clean-database.js")], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        CLEAN_INSTALL_CHILD: "1",
        BACKUP_SEANCES_ENABLED: "false",
        PUSH_ENABLE_IN_MEMORY_REMINDERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    enfant.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    enfant.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    enfant.once("error", reject);
    enfant.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Initialisation interrompue avec le code ${code}.`));
        return;
      }

      const lignes = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lignes.at(-1) || "{}"));
      } catch (error) {
        reject(new Error("Le contrôle de la nouvelle base n'a pas renvoyé un résultat valide."));
      }
    });
  });
}

async function main() {
  if (String(process.env.CLEAN_INSTALL_CONFIRM || "").trim() !== confirmationAttendue) {
    throw new Error(
      `Définissez CLEAN_INSTALL_CONFIRM=${confirmationAttendue} après avoir arrêté l'application.`
    );
  }

  validerConfigurationBootstrap();

  const source = obtenirCheminSource();
  const cible = obtenirCheminCible();
  const dossierArchive = obtenirDossierArchive(source);
  await verifierCibles(source, cible, dossierArchive);

  const validationSource = await verifierBaseSqlite(source);
  if (validationSource.integrityCheck !== "ok") {
    throw new Error("La base source échoue à PRAGMA integrity_check ; le reset est arrêté.");
  }

  await fsp.mkdir(dossierArchive, { recursive: true, mode: 0o700 });
  await fsp.mkdir(path.dirname(cible), { recursive: true, mode: 0o700 });

  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const suffixe = crypto.randomBytes(5).toString("hex");
  const archive = path.join(dossierArchive, `database-legacy-${horodatage}-${suffixe}.db`);
  const archivePartielle = `${archive}.partial`;

  try {
    await sauvegarderBaseSqliteEnLigne(source, archivePartielle);
    const validationArchive = await verifierBaseSqlite(archivePartielle);
    if (
      validationArchive.integrityCheck !== "ok" ||
      validationArchive.foreignKeyViolations !== validationSource.foreignKeyViolations
    ) {
      throw new Error("L'archive SQLite ne reproduit pas fidèlement les contrôles de la source.");
    }
    await fsp.rename(archivePartielle, archive);

    const archiveStat = await fsp.stat(archive);
    const archiveSha256 = await calculerSha256(archive);
    const manifeste = {
      created_at: new Date().toISOString(),
      source_database: source,
      archived_database: archive,
      size_bytes: archiveStat.size,
      sha256: archiveSha256,
      integrity_check: validationArchive.integrityCheck,
      foreign_key_violations: validationArchive.foreignKeyViolations,
      note: "Archive de sécurité hors runtime ; la source originale n'a pas été supprimée.",
    };
    const cheminManifeste = `${archive}.manifest.json`;
    await fsp.writeFile(cheminManifeste, JSON.stringify(manifeste, null, 2), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });

    const staging = path.join(
      path.dirname(cible),
      `.${path.basename(cible)}.initializing-${process.pid}-${suffixe}`
    );
    const nouvelleBase = await lancerInitialisationPropre(staging);
    const sidecars = [`${staging}-wal`, `${staging}-shm`].filter((chemin) => fs.existsSync(chemin));
    if (sidecars.length > 0) {
      throw new Error("La nouvelle base a conservé un WAL/SHM inattendu après sa fermeture.");
    }
    await fsp.rename(staging, cible);

    console.log(
      JSON.stringify(
        {
          ancienne_base_intacte: source,
          archive,
          manifeste: cheminManifeste,
          nouvelle_base: cible,
          nouvelle_base_validation: nouvelleBase,
          prochaine_action:
            "Définir DATABASE_PATH sur la nouvelle base puis redémarrer une seule instance.",
        },
        null,
        2
      )
    );
  } finally {
    await fsp.unlink(archivePartielle).catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Reset propre impossible : ${error.message || error}`);
  process.exitCode = 1;
});
