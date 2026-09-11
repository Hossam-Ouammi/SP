/*
 * Server-side expiry must not rely on the browser's Max-Age attribute: a
 * copied remembered-device cookie is still rejected after its absolute date.
 */
const assert = require("assert/strict");

if (!process.env.DATABASE_PATH || process.env.NODE_ENV !== "test") {
  throw new Error("Ce test exige NODE_ENV=test et une base DATABASE_PATH isolee.");
}

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  get,
  run,
} = require("../models/db");
const {
  creerAppareilAutoLogin,
  trouverAppareilAutoLoginParSelector,
  analyserCookieAppareil,
  hacherValidator,
} = require("../models/trusted-device.model");
const { restaurerConnexionAutomatique } = require("../middleware/auth.middleware");
const { AUTO_LOGIN_COOKIE_NAME, AUTO_LOGIN_MAX_AGE_MS } = require("../config/security.config");

async function main() {
  await initialiserBaseDeDonnees();

  const utilisateur = await run(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, statut_compte, acces_active,
        session_version, doit_changer_mot_de_passe
      )
      VALUES (?, ?, ?, ?, 'active', 1, 1, 0)
    `,
    ["Appareil Test", "trusted-device@example.test", "hash-inutilise", "HD-990"]
  );

  const creation = await creerAppareilAutoLogin({
    utilisateurId: utilisateur.id,
    sessionVersion: 1,
    adresseIp: "127.0.0.1",
    userAgent: "Mozilla/5.0 Chrome/150.0",
  });
  assert.ok(creation.cookieValue, "La creation doit produire un cookie signe.");
  assert.ok(creation.appareil?.expires_at, "Chaque appareil doit avoir une expiration serveur.");

  const expirationMs = Date.parse(creation.appareil.expires_at);
  assert.ok(Number.isFinite(expirationMs));
  assert.ok(
    expirationMs > Date.now() + AUTO_LOGIN_MAX_AGE_MS - 10_000 &&
      expirationMs <= Date.now() + AUTO_LOGIN_MAX_AGE_MS + 10_000,
    "La date d'expiration doit respecter exactement la duree configuree."
  );

  await run(
    "UPDATE trusted_devices SET expires_at = datetime('now', '-1 second') WHERE id = ?",
    [creation.appareil.id]
  );

  const cookiesEffaces = [];
  let nextAppelee = false;
  const req = {
    method: "GET",
    path: "/api/auth/me",
    headers: {
      cookie: `${AUTO_LOGIN_COOKIE_NAME}=${encodeURIComponent(creation.cookieValue)}`,
      "user-agent": "Mozilla/5.0 Chrome/150.0",
    },
  };
  const res = {
    clearCookie(nom, options) {
      cookiesEffaces.push({ nom, options });
    },
  };

  await restaurerConnexionAutomatique(req, res, () => {
    nextAppelee = true;
  });

  assert.equal(nextAppelee, true);
  assert.equal(req.session, undefined, "Un appareil expire ne doit jamais recreer de session.");
  assert.ok(
    cookiesEffaces.some((cookie) => cookie.nom === AUTO_LOGIN_COOKIE_NAME),
    "Le cookie expire doit etre efface du navigateur."
  );
  const appareilSupprime = await trouverAppareilAutoLoginParSelector(
    creation.appareil.selector
  );
  assert.equal(appareilSupprime, undefined, "La trace serveur expiree doit etre supprimee.");

  const colonne = await get(
    "SELECT expires_at FROM trusted_devices WHERE id = ?",
    [creation.appareil.id]
  );
  assert.equal(colonne, undefined);

  // A stolen cookie can be replayed by two requests at almost the same time.
  // Exactly one compare-and-swap rotation may win, and only that request may
  // create an authenticated session. The loser must merely clear its stale
  // browser cookie; it must not delete the winner's fresh device record.
  const concurrent = await creerAppareilAutoLogin({
    utilisateurId: utilisateur.id,
    sessionVersion: 1,
    adresseIp: "127.0.0.1",
    userAgent: "Mozilla/5.0 Chrome/150.0",
  });

  function creerRequeteRejeu(cookieValue) {
    const session = {
      cookie: {},
      regenerate(callback) {
        callback(null);
      },
      save(callback) {
        callback(null);
      },
    };
    const appels = { next: 0, cookies: [], cookiesEffaces: [] };
    const requete = {
      method: "GET",
      path: "/api/auth/me",
      headers: {
        cookie: `${AUTO_LOGIN_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
        "user-agent": "Mozilla/5.0 Chrome/150.0",
      },
      session,
    };
    const reponse = {
      cookie(nom, valeur, options) {
        appels.cookies.push({ nom, valeur, options });
      },
      clearCookie(nom, options) {
        appels.cookiesEffaces.push({ nom, options });
      },
    };

    return { requete, reponse, appels };
  }

  const tentativeA = creerRequeteRejeu(concurrent.cookieValue);
  const tentativeB = creerRequeteRejeu(concurrent.cookieValue);
  await Promise.all([
    restaurerConnexionAutomatique(tentativeA.requete, tentativeA.reponse, () => {
      tentativeA.appels.next += 1;
    }),
    restaurerConnexionAutomatique(tentativeB.requete, tentativeB.reponse, () => {
      tentativeB.appels.next += 1;
    }),
  ]);

  const tentatives = [tentativeA, tentativeB];
  const tentativesAuthentifiees = tentatives.filter(
    (tentative) => Number(tentative.requete.session?.utilisateur?.id) === Number(utilisateur.id)
  );
  const tentativesRefusees = tentatives.filter(
    (tentative) => !tentativesAuthentifiees.includes(tentative)
  );

  assert.equal(tentativesAuthentifiees.length, 1, "Un seul rejeu concurrent doit ouvrir une session.");
  assert.equal(tentativesRefusees.length, 1, "Le second rejeu doit perdre la rotation.");
  assert.ok(
    tentatives.every((tentative) => tentative.appels.next === 1),
    "Chaque requete de restauration doit poursuivre normalement le middleware."
  );
  assert.equal(
    tentativesRefusees[0].requete.session?.utilisateur,
    undefined,
    "Le perdant ne doit jamais posseder de session authentifiee."
  );
  assert.ok(
    tentativesRefusees[0].appels.cookiesEffaces.some(
      (cookie) => cookie.nom === AUTO_LOGIN_COOKIE_NAME
    ),
    "Le perdant doit effacer son cookie auto-login devenu obsolete."
  );

  const cookieGagnant = tentativesAuthentifiees[0].appels.cookies.find(
    (cookie) => cookie.nom === AUTO_LOGIN_COOKIE_NAME
  );
  assert.ok(cookieGagnant?.valeur, "Le gagnant doit recevoir un cookie auto-login tourne.");
  const donneesCookieGagnant = analyserCookieAppareil(cookieGagnant.valeur);
  assert.ok(donneesCookieGagnant, "Le cookie tourne doit conserver un format valide.");
  const appareilApresCourse = await trouverAppareilAutoLoginParSelector(
    concurrent.appareil.selector
  );
  assert.ok(appareilApresCourse, "Le perdant ne doit pas supprimer l'appareil du gagnant.");
  assert.equal(
    appareilApresCourse.validator_hash,
    hacherValidator(donneesCookieGagnant.validator),
    "Seul le validator remis au gagnant doit rester accepte par le serveur."
  );

  console.log("trusted-device-expiration test: PASS");
}

main()
  .catch((error) => {
    console.error("trusted-device-expiration test: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
