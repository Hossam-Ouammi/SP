const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("../models/db");
const { executerBackupSeancesEmail } = require("../utils/seances-backup-email");

async function main() {
  try {
    await initialiserBaseDeDonnees();
    const resultat = await executerBackupSeancesEmail();

    if (resultat.skipped) {
      console.log(
        JSON.stringify(
          {
            backup_ignore: true,
            raison: resultat.email.raison,
          },
          null,
          2
        )
      );
      await fermerBaseDeDonnees().catch(() => {});
      process.exit(0);
    }

    console.log(
      JSON.stringify(
        {
          fichier: resultat.backup.chemin,
          nombre_seances: resultat.backup.nombreSeances,
          email_envoye: resultat.email.envoye,
          raison: resultat.email.raison || null,
          backups_supprimes: resultat.nettoyage?.fichiersSupprimes || 0,
        },
        null,
        2
      )
    );
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(0);
  } catch (error) {
    console.error("Backup seances impossible :", error);
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(1);
  }
}

main();
