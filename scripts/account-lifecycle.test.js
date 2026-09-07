/*
 * Run with an isolated database only, for example:
 *   $env:NODE_ENV = 'test'
 *   $env:DATABASE_PATH = 'C:\Temp\sp-account-lifecycle-test.db'
 *   node scripts/account-lifecycle.test.js
 */
const assert = require("assert/strict");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolée.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  run,
} = require("../models/db");
const {
  ROLES_DEMANDE,
  STATUTS_COMPTE,
  listerIdentifiantsPublicsHandlers,
  creerDemandeInscription,
  approuverDemandeInscription,
  activerCompteAvecJeton,
  creerJetonReinitialisationMotDePasse,
  reinitialiserMotDePasseAvecJeton,
} = require("../models/account-lifecycle.model");

async function main() {
  await initialiserBaseDeDonnees();

  const motDePasseHandler = await bcrypt.hash("HandlerLifecycle!2026", 12);
  const insertionHandler = await run(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, statut_compte, acces_active,
        session_version, doit_changer_mot_de_passe, tarif_horaire
      )
      VALUES (?, ?, ?, 'HD-901', 'active', 1, 1, 0, 100)
    `,
    ["Handler Lifecycle", "handler-lifecycle@example.test", motDePasseHandler]
  );
  const handler = { id: insertionHandler.id, public_id: "HD-901" };
  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'handler', ?)",
    [handler.id, handler.id]
  );
  assert.match(String(handler.public_id), /^HD-\d+$/);

  const handlerIds = await listerIdentifiantsPublicsHandlers();
  assert.ok(
    handlerIds.some(
      (identifiant) =>
        String(identifiant).toLowerCase() === String(handler.public_id).toLowerCase()
    ),
    "La liste publique doit contenir l'identifiant du Handler actif."
  );

  const email = `lifecycle-${Date.now()}@example.test`;
  const demandeResultat = await creerDemandeInscription({
    nom: "Professeur Lifecycle",
    email,
    roleDemande: ROLES_DEMANDE.PROFESSEUR,
    handlerId: handler.id,
  });
  assert.equal(demandeResultat.creee, true);

  const hashInutilisable = await bcrypt.hash("never-disclosed-password-value", 12);
  const approbation = await approuverDemandeInscription({
    demandeId: demandeResultat.demande.id,
    reviewedBy: handler.id,
    motDePasseInutilisableHash: hashInutilisable,
    activationTokenTtlMinutes: 60,
  });
  assert.ok(approbation?.activationToken, "L'approbation doit créer un jeton brut en mémoire.");
  assert.equal(approbation.utilisateur.acces_active, false);
  assert.equal(approbation.utilisateur.statut_compte, STATUTS_COMPTE.EN_ATTENTE_ACTIVATION);
  assert.match(String(approbation.utilisateur.public_id), /^PR-\d+$/);

  const hashActivation = await bcrypt.hash("ActivationTest!123", 12);
  const utilisateurActive = await activerCompteAvecJeton({
    token: approbation.activationToken,
    motDePasseHash: hashActivation,
  });
  assert.equal(utilisateurActive?.statut_compte, STATUTS_COMPTE.ACTIF);
  assert.equal(utilisateurActive?.acces_active, true);
  assert.equal(
    await activerCompteAvecJeton({
      token: approbation.activationToken,
      motDePasseHash: hashActivation,
    }),
    null,
    "Un jeton d'activation doit être inutilisable après consommation."
  );

  const reset = await creerJetonReinitialisationMotDePasse({
    identifiant: utilisateurActive.public_id,
    expiresInMinutes: 60,
  });
  assert.ok(reset?.resetToken, "Un compte actif doit pouvoir obtenir un jeton de reset.");

  const hashReset = await bcrypt.hash("ResetTest!123456", 12);
  const utilisateurReset = await reinitialiserMotDePasseAvecJeton({
    token: reset.resetToken,
    motDePasseHash: hashReset,
  });
  assert.equal(utilisateurReset?.id, utilisateurActive.id);
  assert.equal(
    await reinitialiserMotDePasseAvecJeton({
      token: reset.resetToken,
      motDePasseHash: hashReset,
    }),
    null,
    "Un jeton de reset doit être inutilisable après consommation."
  );

  console.log("account-lifecycle test: PASS");
}

main()
  .catch((error) => {
    console.error("account-lifecycle test: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
