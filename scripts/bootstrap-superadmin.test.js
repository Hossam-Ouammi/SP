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
  run,
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

  // Bootstrap variables are only allowed to provision this brand-new
  // account. A deliberate role or membership revocation must survive a later
  // database initialization/restart while those variables are still present.
  await run(
    "DELETE FROM utilisateur_roles WHERE utilisateur_id = ? AND role = 'super_admin'",
    [utilisateur.id]
  );
  await run(
    "UPDATE rattachements_professeurs SET actif = 0 WHERE handler_id = ? AND professeur_id = ?",
    [utilisateur.id, utilisateur.id]
  );

  await initialiserBaseDeDonnees();

  const rolesApresReinitialisation = await all(
    "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
    [utilisateur.id]
  );
  assert.deepEqual(
    rolesApresReinitialisation.map((ligne) => ligne.role),
    ["handler", "professeur"],
    "Un redemarrage ne doit jamais restaurer le role SuperAdmin revoque."
  );
  const rattachementApresReinitialisation = await get(
    "SELECT actif FROM rattachements_professeurs WHERE handler_id = ? AND professeur_id = ? LIMIT 1",
    [utilisateur.id, utilisateur.id]
  );
  assert.equal(
    Number(rattachementApresReinitialisation?.actif),
    0,
    "Un redemarrage ne doit jamais reactiver un rattachement bootstrap desactive."
  );

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
