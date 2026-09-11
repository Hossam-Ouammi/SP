/*
 * Run with an isolated database only, for example:
 *   $env:NODE_ENV = 'test'
 *   $env:DATABASE_PATH = 'C:\Temp\sp-account-lifecycle-test.db'
 *   node scripts/account-lifecycle.test.js
 */
const assert = require("assert/strict");
const bcrypt = require("bcryptjs");
const fs = require("fs/promises");
const path = require("path");

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolée.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

// Do not depend on SMTP settings inherited from a developer machine. The
// lifecycle helper must instead exercise its development email outbox.
process.env.ACCOUNT_EMAIL_DRY_RUN = "true";
process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH),
  "account-lifecycle-mail-outbox"
);
process.env.ACCOUNT_LIFECYCLE_APP_URL = "http://localhost:3911/";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  run,
  all,
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
  hacherTokenCompte,
} = require("../models/account-lifecycle.model");
const {
  envoyerEmailReinitialisationMotDePasse,
} = require("../utils/account-email");

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
    // The model must cap even a mistaken internal caller at fifteen minutes.
    expiresInMinutes: 60,
  });
  assert.ok(reset?.resetToken, "Un compte actif doit pouvoir obtenir un jeton de reset.");
  assert.equal(reset.dejaActif, false);
  const dureeResetMs = Date.parse(reset.resetExpiresAt) - Date.now();
  assert.ok(
    dureeResetMs <= 15 * 60 * 1000 + 5_000 && dureeResetMs >= 14 * 60 * 1000,
    "Le lien de reset doit etre limite a quinze minutes."
  );

  const secondReset = await creerJetonReinitialisationMotDePasse({
    identifiant: utilisateurActive.email,
    expiresInMinutes: 15,
  });
  assert.equal(
    secondReset?.dejaActif,
    true,
    "Un clic repete doit reutiliser le lien actif, sans creer un nouveau jeton."
  );
  assert.equal(secondReset?.resetToken, null);

  const jetonsResetActifs = await all(
    `
      SELECT id
      FROM tokens_compte
      WHERE utilisateur_id = ?
        AND type = 'reset_password'
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND julianday(expires_at) > julianday('now')
    `,
    [utilisateurActive.id]
  );
  assert.equal(jetonsResetActifs.length, 1, "Un seul lien de reset doit rester actif.");

  const fichiersEmailAvant = await fs
    .readdir(process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR)
    .catch(() => []);
  const livraison = await envoyerEmailReinitialisationMotDePasse({
    email: utilisateurActive.email,
    nom: utilisateurActive.nom,
    token: reset.resetToken,
    expiresInMinutes: 15,
  });
  assert.equal(livraison.envoye, true, "La boite locale de developpement doit accepter l'email.");
  assert.equal(livraison.raison, "dev-outbox");
  const fichiersEmail = await fs.readdir(process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR);
  assert.equal(fichiersEmail.length, fichiersEmailAvant.length + 1);
  const fichierEmail = fichiersEmail.find((fichier) => !fichiersEmailAvant.includes(fichier));
  assert.ok(fichierEmail, "Un nouveau fichier d'email doit etre cree.");
  const emailDeveloppement = JSON.parse(
    await fs.readFile(path.join(process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR, fichierEmail), "utf8")
  );
  assert.match(
    emailDeveloppement.text,
    new RegExp(`#reset-password\\?token=${reset.resetToken}`)
  );
  assert.match(emailDeveloppement.text, /15 minutes/);

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

  const resetExpire = await creerJetonReinitialisationMotDePasse({
    identifiant: utilisateurActive.email,
    expiresInMinutes: 15,
  });
  assert.ok(resetExpire?.resetToken);
  await run(
    "UPDATE tokens_compte SET expires_at = datetime('now', '-1 minute') WHERE token_hash = ?",
    [hacherTokenCompte(resetExpire.resetToken)]
  );
  assert.equal(
    await reinitialiserMotDePasseAvecJeton({
      token: resetExpire.resetToken,
      motDePasseHash: hashReset,
    }),
    null,
    "Un lien de reset expire ne doit pas etre utilisable."
  );

  const resetApresExpiration = await creerJetonReinitialisationMotDePasse({
    identifiant: utilisateurActive.email,
    expiresInMinutes: 15,
  });
  assert.ok(
    resetApresExpiration?.resetToken,
    "Une nouvelle demande doit fonctionner apres expiration du lien precedent."
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
