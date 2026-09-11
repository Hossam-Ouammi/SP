const { chargerEnvironnementRuntime } = require("./load-runtime-env");

chargerEnvironnementRuntime();

const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("../models/db");
const {
  executerBackupsHandlersEmail,
  executerBackupAdminEmail,
} = require("../utils/seances-backup-email");

async function main() {
  try {
    await initialiserBaseDeDonnees();
    const [handlers, admin] = await Promise.all([
      executerBackupsHandlersEmail(),
      executerBackupAdminEmail(),
    ]);

    console.log(JSON.stringify({ handlers, admin }, null, 2));
  } catch (error) {
    console.error("Backups séances impossibles :", error.message || error);
    process.exitCode = 1;
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

main();
