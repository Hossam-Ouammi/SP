/*
 * Verifies the one-time, environment-driven bootstrap on a brand-new
 * database.  The values are deliberately test-only and are injected by the
 * regression runner; no credential is baked into the application.
 */
const assert = require("assert/strict");

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolee.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  all,
  get,
} = require("../models/db");

async function main() {
  const nom = "SuperAdmin Bootstrap Test";
  const email = "bootstrap-superadmin@example.test";

  assert.equal(process.env.INITIAL_SUPERADMIN_NAME, nom);
  assert.equal(process.env.INITIAL_SUPERADMIN_EMAIL, email);
  assert.ok(process.env.INITIAL_SUPERADMIN_PASSWORD);

  await initialiserBaseDeDonnees();

  const utilisateurs = await all(
    "SELECT id, nom, email, public_id, est_admin, acces_active, statut_compte, doit_changer_mot_de_passe FROM utilisateurs"
  );
  assert.equal(utilisateurs.length, 1, "Le bootstrap ne doit creer qu'un seul compte.");

  const utilisateur = utilisateurs[0];
  assert.equal(utilisateur.nom, nom);
  assert.equal(utilisateur.email, email);
  assert.equal(Number(utilisateur.est_admin), 1);
  assert.equal(Number(utilisateur.acces_active), 1);
  assert.equal(utilisateur.statut_compte, "active");
  assert.equal(Number(utilisateur.doit_changer_mot_de_passe), 1);
  assert.match(String(utilisateur.public_id), /^HD-\d+$/);

  const roles = await all(
    "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
    [utilisateur.id]
  );
  assert.deepEqual(
    roles.map((ligne) => ligne.role),
    ["handler", "professeur", "super_admin"]
  );

  const rattachement = await get(
    "SELECT handler_id, professeur_id, actif FROM rattachements_professeurs WHERE professeur_id = ? AND actif = 1",
    [utilisateur.id]
  );
  assert.deepEqual(rattachement, {
    handler_id: utilisateur.id,
    professeur_id: utilisateur.id,
    actif: 1,
  });

  console.log("bootstrap-superadmin test: PASS");
}

main()
  .catch((error) => {
    console.error("bootstrap-superadmin test: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
