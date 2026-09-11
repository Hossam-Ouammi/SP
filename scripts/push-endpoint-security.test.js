const assert = require("node:assert/strict");
const https = require("node:https");

const {
  ErreurEndpointPushNonSecurise,
  estAdressePriveeOuReservee,
  normaliserEndpointPush,
  creerLookupPushSecurise,
  creerAgentPushSecurise,
} = require("../utils/push-endpoint-security");
const { normaliserSubscriptionPush } = require("../models/push-subscription.model");
const { livraisonPushSimuleeEstActive } = require("../utils/push-notifications");

function executerLookup(lookup, nomHote, options = {}) {
  return new Promise((resolve, reject) => {
    lookup(nomHote, options, (error, adresse, famille) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ adresse, famille });
    });
  });
}

function abonnement(endpoint) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: "cle-p256dh-test",
      auth: "cle-auth-test",
    },
  };
}

function executerRequeteHttps(agent, nomHote) {
  return new Promise((resolve) => {
    const requete = https.request({
      hostname: nomHote,
      path: "/",
      method: "POST",
      agent,
    });

    requete.once("error", resolve);
    requete.end();
  });
}

async function main() {
  assert.equal(
    livraisonPushSimuleeEstActive({ NODE_ENV: "test", PUSH_TEST_DELIVERY_MODE: "mock" }),
    true,
    "Le transport Push simule doit etre disponible seulement pour la recette isolee."
  );
  assert.equal(
    livraisonPushSimuleeEstActive({ NODE_ENV: "production", PUSH_TEST_DELIVERY_MODE: "mock" }),
    false,
    "Le flag de recette ne doit jamais desactiver une livraison Push en production."
  );
  assert.equal(
    livraisonPushSimuleeEstActive({ NODE_ENV: "test", PUSH_TEST_DELIVERY_MODE: "" }),
    false,
    "Le transport Push simule doit rester explicite."
  );

  assert.equal(
    normaliserEndpointPush(" https://fcm.googleapis.com/fcm/send/abc "),
    "https://fcm.googleapis.com/fcm/send/abc"
  );

  for (const endpoint of [
    "http://push.example.test/subscription",
    "https://localhost/subscription",
    "https://127.0.0.1/subscription",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/subscription",
    "https://[::ffff:127.0.0.1]/subscription",
    "https://user:password@push.example.test/subscription",
  ]) {
    assert.throws(
      () => normaliserEndpointPush(endpoint),
      (error) => error instanceof ErreurEndpointPushNonSecurise && error.code === "PUSH_ENDPOINT_UNSAFE",
      `L'endpoint ${endpoint} doit etre refuse.`
    );
  }

  assert.equal(estAdressePriveeOuReservee("10.0.0.1"), true);
  assert.equal(estAdressePriveeOuReservee("172.16.0.1"), true);
  assert.equal(estAdressePriveeOuReservee("192.168.0.1"), true);
  assert.equal(estAdressePriveeOuReservee("8.8.8.8"), false);
  assert.equal(estAdressePriveeOuReservee("fc00::1"), true);
  assert.equal(estAdressePriveeOuReservee("fe80::1"), true);
  assert.equal(estAdressePriveeOuReservee("2001:4860:4860::8888"), false);

  assert.equal(normaliserSubscriptionPush(abonnement("https://127.0.0.1/test")), null);
  assert.equal(
    normaliserSubscriptionPush(abonnement("https://push.example.test/test"))?.endpoint,
    "https://push.example.test/test"
  );

  const lookupPublic = creerLookupPushSecurise((_nomHote, options, callback) => {
    assert.equal(options.all, true);
    callback(null, [{ address: "8.8.8.8", family: 4 }]);
  });
  assert.deepEqual(await executerLookup(lookupPublic, "push.example.test"), {
    adresse: "8.8.8.8",
    famille: 4,
  });

  const lookupMixte = creerLookupPushSecurise((_nomHote, _options, callback) => {
    callback(null, [
      { address: "127.0.0.1", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ]);
  });
  assert.deepEqual(await executerLookup(lookupMixte, "push.example.test"), {
    adresse: "2001:4860:4860::8888",
    famille: 6,
  });

  const lookupPrive = creerLookupPushSecurise((_nomHote, _options, callback) => {
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
  });
  await assert.rejects(
    () => executerLookup(lookupPrive, "attacker.example.test"),
    (error) => error?.code === "PUSH_ENDPOINT_UNSAFE"
  );

  const agent = creerAgentPushSecurise({
    resolver: (_nomHote, _options, callback) => callback(null, [{ address: "8.8.8.8", family: 4 }]),
  });
  assert.equal(typeof agent.options.lookup, "function");
  agent.destroy();

  const agentPrive = creerAgentPushSecurise({
    resolver: (_nomHote, _options, callback) => callback(null, [{ address: "127.0.0.1", family: 4 }]),
  });
  const erreurReseau = await executerRequeteHttps(agentPrive, "attacker.example.test");
  assert.equal(erreurReseau?.code, "PUSH_ENDPOINT_UNSAFE");
  agentPrive.destroy();

  console.log("push-endpoint-security.test.js: OK");
}

main().catch((error) => {
  console.error("push-endpoint-security.test.js: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
