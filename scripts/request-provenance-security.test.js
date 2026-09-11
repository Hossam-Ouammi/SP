/*
 * Unsafe requests require same-origin provenance. A direct JSON API client
 * may use the existing X-Requested-With contract when it cannot supply
 * Origin/Referer; an HTML form cannot use that exemption.
 */
const assert = require("node:assert/strict");
const { verifierOrigineRequete } = require("../middleware/security.middleware");

function executerMiddleware({
  method = "POST",
  path = "/api/auth/login",
  headers = {},
} = {}) {
  const entetes = Object.fromEntries(
    Object.entries(headers).map(([nom, valeur]) => [nom.toLowerCase(), valeur])
  );
  let prochain = false;
  let statut = null;
  let corps = null;
  const req = {
    method,
    path,
    protocol: "https",
    secure: true,
    app: { get: () => false },
    get(nom) {
      return entetes[String(nom).toLowerCase()] || "";
    },
  };
  const res = {
    status(code) {
      statut = code;
      return this;
    },
    json(valeur) {
      corps = valeur;
      return this;
    },
  };

  verifierOrigineRequete(req, res, () => {
    prochain = true;
  });

  return { prochain, statut, corps };
}

function main() {
  const origine = "https://planning.example.test";

  assert.equal(executerMiddleware({ method: "GET" }).prochain, true);
  assert.equal(
    executerMiddleware({ headers: { host: "planning.example.test", origin: origine } }).prochain,
    true,
    "Une origine identique doit etre acceptee."
  );
  assert.equal(
    executerMiddleware({
      headers: { host: "planning.example.test", referer: `${origine}/connexion` },
    }).prochain,
    true,
    "Un referent de meme origine doit etre accepte."
  );

  const origineEtrangere = executerMiddleware({
    headers: { host: "planning.example.test", origin: "https://evil.example.test" },
  });
  assert.equal(origineEtrangere.statut, 403);

  const referentEtranger = executerMiddleware({
    headers: { host: "planning.example.test", referer: "https://evil.example.test/form" },
  });
  assert.equal(referentEtranger.statut, 403);

  const absenceProvenance = executerMiddleware({
    headers: { host: "planning.example.test" },
  });
  assert.equal(absenceProvenance.statut, 403);
  assert.equal(absenceProvenance.corps?.code, "REQUEST_PROVENANCE_REQUIRED");

  assert.equal(
    executerMiddleware({
      headers: {
        host: "planning.example.test",
        "x-requested-with": "XMLHttpRequest",
      },
    }).prochain,
    true,
    "Le client API explicite sans provenance reste compatible."
  );

  const formulaireSansProvenance = executerMiddleware({
    path: "/",
    headers: {
      host: "planning.example.test",
      "x-requested-with": "XMLHttpRequest",
    },
  });
  assert.equal(formulaireSansProvenance.statut, 403);

  assert.equal(
    executerMiddleware({
      path: "/",
      headers: {
        host: "planning.example.test",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
    }).prochain,
    true,
    "Une navigation de formulaire meme-site reste utilisable sans provenance."
  );

  console.log("request-provenance-security test: PASS");
}

try {
  main();
} catch (error) {
  console.error("request-provenance-security test: FAIL", error);
  process.exitCode = 1;
}
