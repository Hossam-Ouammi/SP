const assert = require("node:assert/strict");

const {
  verifierAccesMonetisation,
  verifierAccesIndisponibilites,
} = require("../middleware/auth.middleware");
const {
  verifierDeclarationDisponibiliteProfesseur,
  verifierMutationPropositionIndisponibiliteHandler,
} = require("../middleware/scope.middleware");
const routesMonetisation = require("../routes/monetisation.routes");
const routesDashboard = require("../routes/dashboard.routes");
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
  assertAutorise(
    executerMiddleware(verifierAccesMonetisation, requete({ roles: { professeur: true } })),
    "Professeur avec accès personnel à la monétisation"
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

  assertAutorise(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { professeur: true } })
    ),
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
  assertRefuse(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { handler: true } })
    ),
    "HANDLER_UNAVAILABILITY_FORBIDDEN",
    "Handler indisponibilités"
  );
  assertRefuse(
    executerMiddleware(
      verifierAccesIndisponibilites,
      requete({ roles: { handler: true, professeur: true } })
    ),
    "HANDLER_UNAVAILABILITY_FORBIDDEN",
    "Compte double rôle Handler/Professeur"
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
  assert.ok(
    routesDashboard.stack.some((couche) => couche.name === "verifierRoleHandler"),
    "Le flux du calendrier central doit être réservé au Handler."
  );

  assertAutorise(
    executerMiddleware(
      verifierDeclarationDisponibiliteProfesseur,
      requete({ roles: { professeur: true } })
    ),
    "Professor may declare own unavailability"
  );
  assertRefuse(
    executerMiddleware(
      verifierDeclarationDisponibiliteProfesseur,
      requete({ roles: { handler: true } })
    ),
    "HANDLER_UNAVAILABILITY_FORBIDDEN",
    "Handler cannot declare own unavailability"
  );
  assertRefuse(
    executerMiddleware(
      verifierMutationPropositionIndisponibiliteHandler,
      requete({ roles: { handler: true } })
    ),
    "HANDLER_UNAVAILABILITY_FORBIDDEN",
    "Handler cannot mutate an unavailability proposal"
  );
  assert.ok(
    routesIndisponibilites.stack.some((couche) =>
      couche.route?.stack?.some(
        (gestionnaire) =>
          gestionnaire.handle.name === "verifierDeclarationDisponibiliteProfesseur"
      )
    ),
    "Unavailability writes must be protected by the personal-role guard."
  );

  console.log("module-access-flags test: PASS");
}

try {
  main();
} catch (error) {
  console.error("module-access-flags test: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
