const { chargerEnvironnementRuntime } = require("./load-runtime-env");

chargerEnvironnementRuntime();

const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("../models/db");
const { executerBackupAdminEmail } = require("../utils/seances-backup-email");

async function main() {
  try {
    await initialiserBaseDeDonnees();
    const resultat = await executerBackupAdminEmail();
    console.log(JSON.stringify(resultat, null, 2));
  } catch (error) {
    console.error("Backup SuperAdmin impossible :", error.message || error);
    process.exitCode = 1;
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

main();
