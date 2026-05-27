const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  get,
  all,
  run,
} = require("../models/db");
const { executerAvecVerrou } = require("../utils/job-lock");

async function executerMaintenanceSqlite() {
  try {
    await initialiserBaseDeDonnees();

    const integrite = await get("PRAGMA integrity_check");
    const checkpoint = await all("PRAGMA wal_checkpoint(TRUNCATE)");
    await run("PRAGMA optimize");

    return {
      integrity_check: Object.values(integrite || {})[0] || "unknown",
      wal_checkpoint: checkpoint?.[0] || null,
      optimize: "ok",
    };
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

async function main() {
  try {
    const execution = await executerAvecVerrou(
      "sqlite-maintenance",
      executerMaintenanceSqlite,
      { staleMs: 30 * 60 * 1000 }
    );

    if (execution.skipped) {
      console.log(
        JSON.stringify(
          {
            maintenance_ignoree: true,
            raison: "execution-deja-en-cours",
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    console.log(JSON.stringify(execution.result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Maintenance SQLite impossible :", error);
    process.exit(1);
  }
}

main();
