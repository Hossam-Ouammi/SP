const assert = require("node:assert/strict");

const {
  verifierAccesMonetisation,
  verifierAccesIndisponibilites,
} = require("../middleware/auth.middleware");
const routesMonetisation = require("../routes/monetisation.routes");
const routesIndisponibilites = require("../routes/indisponibilites.routes");
const routesDisponibilites = require("../routes/disponibilites.routes");

function executerMiddleware(middleware, req) {
  let statut = null;
  let corps = null;
  let suivant = false;

  const res = {
    status(code) {
      statut = code;
      return this;
    },
    json(payload) {
      corps = payload;
      return this;
    },
  };

  middleware(req, res, () => {
    suivant = true;
  });

  return { statut, corps, suivant };
}

function requete({ roles = {}, permissions = {} } = {}) {
  return {
    scope: {
      estSuperAdmin: roles.superAdmin === true,
      estHandler: roles.handler === true,
      estProfesseur: roles.professeur === true,
    },
    utilisateur: {
      peut_voir_monetisation: permissions.monetisation ? 1 : 0,
      peut_voir_indisponibilites: permissions.indisponibilites ? 1 : 0,
    },
  };
}

function assertAutorise(resultat, label) {
  assert.equal(resultat.suivant, true, `${label} doit atteindre le contrôleur.`);
  assert.equal(resultat.statut, null, `${label} ne doit pas répondre une erreur.`);
}

function assertRefuse(resultat, code, label) {
  assert.equal(resultat.suivant, false, `${label} ne doit pas atteindre le contrôleur.`);
  assert.equal(resultat.statut, 403, `${label} doit être refusé.`);
  assert.equal(resultat.corps?.code, code, `${label} doit exposer le code stable attendu.`);
}

function assertRouteProtégée(routeur, label) {
  assert.ok(
    routeur.stack.some((couche) => couche.name === "verifierAccesIndisponibilites"),
    `${label} doit installer le garde serveur disponibilités.`
  );
}

function main() {
  assertRefuse(
    executerMiddleware(verifierAccesMonetisation, requete({ roles: { professeur: true } })),
    "MONETISATION_ACCESS_DISABLED",
    "Professeur sans monétisation"
  );
  assertAutorise(
    executerMiddleware(
      verifierAccesMonetisation,
      requete({ roles: { professeur: true }, permissions: { monetisation: true } })
    ),
    "Professeur avec monétisation"
  );
  assertAutorise(
    executerMiddleware(verifierAccesMonetisation, requete({ roles: { handler: true } })),
    "Handler"
  );
  assertAutorise(
    executerMiddleware(verifierAccesMonetisation, requete({ roles: { superAdmin: true } })),
    "Super Admin"
  );

  assertRefuse(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { professeur: true } })
    ),
    "UNAVAILABILITY_ACCESS_DISABLED",
    "Professeur sans disponibilités"
  );
  assertAutorise(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({
        roles: { professeur: true },
        permissions: { indisponibilites: true },
      })
    ),
    "Professeur avec disponibilités"
  );
  assertAutorise(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { handler: true } })
    ),
    "Handler disponibilités"
  );
  assertAutorise(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { superAdmin: true } }),
    ),
    "Super Admin disponibilités"
  );

  assert.ok(
    routesMonetisation.stack.some((couche) => couche.name === "verifierAccesMonetisation"),
    "Les routes monétisation doivent installer le garde serveur dédié."
  );
  assertRouteProtégée(routesIndisponibilites, "Les routes indisponibilités");
  assertRouteProtégée(routesDisponibilites, "Les routes disponibilités");

  console.log("module-access-flags test: PASS");
}

try {
  main();
} catch (error) {
  console.error("module-access-flags test: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
