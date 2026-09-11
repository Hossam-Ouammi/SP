/*
 * bcrypt only authenticates the first 72 UTF-8 bytes of a password. This
 * focused regression proves that the application refuses an overlong new
 * secret before it can silently become part of the same effective credential.
 */
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  BCRYPT_MAX_PASSWORD_BYTES,
  motDePasseEstCompatibleBcrypt,
  motDePasseRespectePolitique,
} = require("../utils/security");
const {
  modifierMotDePasse,
} = require("../controllers/auth.controller");
const {
  activerCompte,
  confirmerReinitialisationMotDePasse,
} = require("../controllers/account-lifecycle.controller");
const { fermerBaseDeDonnees } = require("../models/db");

function creerReponse() {
  return {
    statusCode: 200,
    corps: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(corps) {
      this.corps = corps;
      return this;
    },
  };
}

async function appelerControleur(controleur, req) {
  const res = creerReponse();
  let erreurSuivante = null;
  await controleur(req, res, (erreur) => {
    erreurSuivante = erreur;
  });
  assert.equal(erreurSuivante, null, "La validation ne doit pas deleguer une erreur serveur.");
  return res;
}

async function main() {
  const motDePasse72 = `${"A".repeat(69)}a1!`;
  const motDePasse73 = `${motDePasse72}x`;
  const motDePasse72Utf8 = `${"A".repeat(67)}a1!é`;
  const motDePasse74Utf8 = `${motDePasse72Utf8}é`;

  assert.equal(Buffer.byteLength(motDePasse72, "utf8"), BCRYPT_MAX_PASSWORD_BYTES);
  assert.equal(Buffer.byteLength(motDePasse73, "utf8"), BCRYPT_MAX_PASSWORD_BYTES + 1);
  assert.equal(Buffer.byteLength(motDePasse72Utf8, "utf8"), BCRYPT_MAX_PASSWORD_BYTES);
  assert.equal(Buffer.byteLength(motDePasse74Utf8, "utf8"), BCRYPT_MAX_PASSWORD_BYTES + 2);
  assert.equal(motDePasseEstCompatibleBcrypt(motDePasse72), true);
  assert.equal(motDePasseEstCompatibleBcrypt(motDePasse72Utf8), true);
  assert.equal(motDePasseEstCompatibleBcrypt(motDePasse73), false);
  assert.equal(motDePasseEstCompatibleBcrypt(motDePasse74Utf8), false);
  assert.equal(motDePasseRespectePolitique(motDePasse72), true);
  assert.equal(motDePasseRespectePolitique(motDePasse73), false);
  assert.equal(motDePasseRespectePolitique(motDePasse74Utf8), false);

  // This is bcrypt's documented truncation behavior. The validation above is
  // what prevents this long spelling from becoming a newly stored password.
  const hash = await bcrypt.hash(motDePasse72, 4);
  assert.equal(await bcrypt.compare(motDePasse73, hash), true);

  let reponse = await appelerControleur(modifierMotDePasse, {
    utilisateur: { id: 1 },
    body: {
      mot_de_passe_actuel: motDePasse72,
      nouveau_mot_de_passe: motDePasse73,
    },
  });
  assert.equal(reponse.statusCode, 400, "Le changement de mot de passe doit refuser >72 octets.");
  assert.match(reponse.corps?.message || "", /72 octets UTF-8/);

  reponse = await appelerControleur(modifierMotDePasse, {
    utilisateur: { id: 1 },
    body: {
      // bcrypt would otherwise accept this spelling as the same current
      // credential as motDePasse72. It must never authorize a mutation.
      mot_de_passe_actuel: motDePasse73,
      nouveau_mot_de_passe: motDePasse72,
    },
  });
  assert.equal(
    reponse.statusCode,
    400,
    "Le mot de passe actuel au-dela de 72 octets doit etre refuse avant bcrypt."
  );
  assert.match(reponse.corps?.message || "", /mot de passe actuel est incorrect/i);

  const tokenValide = "a".repeat(43);
  reponse = await appelerControleur(activerCompte, {
    body: { token: tokenValide, nouveau_mot_de_passe: motDePasse73 },
  });
  assert.equal(reponse.statusCode, 400, "L'activation doit refuser >72 octets.");
  assert.match(reponse.corps?.message || "", /72 octets UTF-8/);

  reponse = await appelerControleur(confirmerReinitialisationMotDePasse, {
    body: { token: tokenValide, nouveau_mot_de_passe: motDePasse73 },
  });
  assert.equal(reponse.statusCode, 400, "La reinitialisation doit refuser >72 octets.");
  assert.match(reponse.corps?.message || "", /72 octets UTF-8/);

  console.log("password-security test: PASS");
}

main().catch((error) => {
  console.error("password-security test: FAIL", error);
  process.exitCode = 1;
}).finally(async () => {
  await fermerBaseDeDonnees().catch(() => {});
});
