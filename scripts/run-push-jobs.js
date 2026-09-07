const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("../models/db");
const { executerRappelsPushDus } = require("../utils/push-notifications");
const { executerAvecVerrou } = require("../utils/job-lock");

async function executerJobPush() {
  try {
    await initialiserBaseDeDonnees();
    await executerRappelsPushDus({ sansVerrou: true });
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

async function main() {
  try {
    const execution = await executerAvecVerrou(
      "push-due",
      executerJobPush,
      { staleMs: 20 * 60 * 1000 }
    );

    if (execution.skipped) {
      console.log("Rappels push deja en cours, execution ignoree.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Execution des rappels push impossible :", error);
    process.exit(1);
  }
}

main();
