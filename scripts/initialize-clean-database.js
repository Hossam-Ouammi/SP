const fs = require("fs");

if (process.env.CLEAN_INSTALL_CHILD !== "1") {
  throw new Error("Ce script interne doit être lancé par reset-clean-install.js.");
}

const databasePath = String(process.env.DATABASE_PATH || "").trim();

if (!databasePath || fs.existsSync(databasePath)) {
  throw new Error("La cible temporaire de la nouvelle base doit être inexistante.");
}

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  all,
  get,
} = require("../models/db");
const { migrations } = require("../models/migrations");

const tablesQuiDoiventEtreVides = [
  "seances",
  "historique",
  "historique_actions",
  "journal_auth",
  "sessions",
  "trusted_devices",
  "tokens_compte",
  "demandes_inscription",
  "push_subscriptions",
  "public_reservation_devices",
  "indisponibilites",
  "propositions_seances",
  "reconciliation_seances_legacy",
  "backup_email_deliveries",
];

async function verifierBasePropre() {
  const utilisateur = await get(
    `
      SELECT id, nom, email, public_id, est_admin, acces_active, statut_compte
      FROM utilisateurs
    `
  );
  const totalUtilisateurs = await get("SELECT COUNT(*) AS total FROM utilisateurs");

  if (Number(totalUtilisateurs?.total) !== 1 || !utilisateur?.id) {
    throw new Error("La nouvelle base doit contenir uniquement le SuperAdmin bootstrap.");
  }

  const roles = await all(
    "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
    [utilisateur.id]
  );
  const rolesAttendus = ["handler", "professeur", "super_admin"];
  if (JSON.stringify(roles.map((ligne) => ligne.role)) !== JSON.stringify(rolesAttendus)) {
    throw new Error("Les rôles du SuperAdmin bootstrap sont incomplets.");
  }

  for (const table of tablesQuiDoiventEtreVides) {
    const compte = await get(`SELECT COUNT(*) AS total FROM ${table}`);
    if (Number(compte?.total) !== 0) {
      throw new Error(`La table ${table} n'est pas vide sur la nouvelle installation.`);
    }
  }

  const lostAndFound = await get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lost_and_found'"
  );
  if (lostAndFound) {
    throw new Error("lost_and_found ne doit pas être importée dans la nouvelle base.");
  }

  const migrationsAppliquees = await get("SELECT COUNT(*) AS total FROM schema_migrations");
  if (Number(migrationsAppliquees?.total) !== migrations.length) {
    throw new Error("Toutes les migrations actuelles n'ont pas été appliquées.");
  }

  const integrite = await get("PRAGMA integrity_check");
  const violations = await all("PRAGMA foreign_key_check");
  if (Object.values(integrite || {})[0] !== "ok" || violations.length !== 0) {
    throw new Error("La nouvelle base SQLite ne passe pas les contrôles d'intégrité.");
  }

  return {
    database: databasePath,
    utilisateur: {
      public_id: utilisateur.public_id,
      email: utilisateur.email,
      statut: utilisateur.statut_compte,
    },
    migrations: migrations.length,
    integrity_check: "ok",
    foreign_key_violations: 0,
  };
}

async function main() {
  try {
    await initialiserBaseDeDonnees();
    const resultat = await verifierBasePropre();
    console.log(JSON.stringify(resultat));
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
