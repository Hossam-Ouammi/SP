const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("../models/db");
const { executerRappelsPushDus } = require("../utils/push-notifications");

async function main() {
  try {
    await initialiserBaseDeDonnees();
    await executerRappelsPushDus();
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(0);
  } catch (error) {
    console.error("Execution des rappels push impossible :", error);
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(1);
  }
}

main();
