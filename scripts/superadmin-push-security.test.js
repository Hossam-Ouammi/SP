/*
 * Regression for the two former authority-confusion paths:
 * - SuperAdmin is granted exclusively by utilisateur_roles;
 * - a Push endpoint remains owned by the account that first registered it.
 *
 * The script owns its temporary SQLite database and never inherits a
 * deployment database path.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repertoireTemporaire = fs.mkdtempSync(
  path.join(os.tmpdir(), "gestion-seances-superadmin-push-")
);

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(repertoireTemporaire, "security.db");
process.env.SEED_DEMO_DATA = "";
process.env.SESSION_SECRET = crypto.randomBytes(48).toString("hex");
process.env.AUDIT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.PUSH_ENABLE_IN_MEMORY_REMINDERS = "false";
process.env.BACKUP_SEANCES_ENABLED = "false";

const { initialiserBaseDeDonnees, fermerBaseDeDonnees, get, run } = require("../models/db");
const { construireScopeAcces } = require("../models/access-scope.model");
const {
  enregistrerOuMettreAJourAbonnementPush,
  desactiverAbonnementPushUtilisateurParEndpoint,
} = require("../models/push-subscription.model");

async function creerUtilisateur({ nom, email, estAdmin = 0, roles = [] }) {
  const creation = await run(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, est_admin, acces_active,
        statut_compte, session_version, doit_changer_mot_de_passe
      )
      VALUES (?, ?, 'hash-de-test', ?, 1, 'active', 1, 0)
    `,
    [nom, email, estAdmin ? 1 : 0]
  );

  for (const role of roles) {
    await run(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, ?, ?)",
      [creation.id, role, creation.id]
    );
  }

  return creation.id;
}

function abonnement(endpoint, suffixe) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: `cle-p256dh-${suffixe}`,
      auth: `cle-auth-${suffixe}`,
    },
  };
}

async function main() {
  await initialiserBaseDeDonnees();

  const superAdminCanoniqueId = await creerUtilisateur({
    nom: "SuperAdmin par role",
    email: "superadmin-role@example.test",
    estAdmin: 0,
    roles: ["super_admin"],
  });
  const ancienDrapeauId = await creerUtilisateur({
    nom: "Ancien drapeau seulement",
    email: "ancien-drapeau@example.test",
    estAdmin: 1,
    roles: [],
  });
  const proprietaireAId = await creerUtilisateur({
    nom: "Proprietaire endpoint A",
    email: "proprietaire-a@example.test",
  });
  const tentativeBId = await creerUtilisateur({
    nom: "Tentative endpoint B",
    email: "tentative-b@example.test",
  });

  const [scopeCanonique, scopeAncienDrapeau] = await Promise.all([
    construireScopeAcces({ id: superAdminCanoniqueId, est_admin: 0 }),
    construireScopeAcces({ id: ancienDrapeauId, est_admin: 1 }),
  ]);
  assert.equal(
    scopeCanonique.estSuperAdmin,
    true,
    "Le role super_admin doit autoriser meme avec est_admin=0."
  );
  assert.equal(
    scopeAncienDrapeau.estSuperAdmin,
    false,
    "est_admin=1 ne doit pas accorder un role SuperAdmin absent."
  );

  const endpoint = "https://push.example.test/ownership/security-regression";
  await enregistrerOuMettreAJourAbonnementPush({
    utilisateurId: proprietaireAId,
    subscription: abonnement(endpoint, "A"),
    deviceLabel: "A",
    userAgent: "test-A",
  });

  await assert.rejects(
    () =>
      enregistrerOuMettreAJourAbonnementPush({
        utilisateurId: tentativeBId,
        subscription: abonnement(endpoint, "B"),
        deviceLabel: "B",
        userAgent: "test-B",
      }),
    (error) => error?.code === "PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER",
    "B doit recevoir un conflit sans pouvoir reprendre l'endpoint de A."
  );

  const desactivationB = await desactiverAbonnementPushUtilisateurParEndpoint(
    tentativeBId,
    endpoint
  );
  assert.equal(
    Number(desactivationB.changes || 0),
    0,
    "B ne doit pas pouvoir desactiver l'endpoint de A."
  );

  let ligne = await get(
    "SELECT utilisateur_id, actif, p256dh, auth FROM push_subscriptions WHERE endpoint = ?",
    [endpoint]
  );
  assert.deepEqual(ligne, {
    utilisateur_id: proprietaireAId,
    actif: 1,
    p256dh: "cle-p256dh-A",
    auth: "cle-auth-A",
  });

  await enregistrerOuMettreAJourAbonnementPush({
    utilisateurId: proprietaireAId,
    subscription: abonnement(endpoint, "A-mis-a-jour"),
    deviceLabel: "A mis a jour",
    userAgent: "test-A-update",
  });
  ligne = await get(
    "SELECT utilisateur_id, actif, p256dh, auth FROM push_subscriptions WHERE endpoint = ?",
    [endpoint]
  );
  assert.deepEqual(ligne, {
    utilisateur_id: proprietaireAId,
    actif: 1,
    p256dh: "cle-p256dh-A-mis-a-jour",
    auth: "cle-auth-A-mis-a-jour",
  });

  console.log("superadmin-push-security test: PASS");
}

main()
  .catch((error) => {
    console.error("superadmin-push-security test: FAIL");
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
    fs.rmSync(repertoireTemporaire, { recursive: true, force: true });
  });
