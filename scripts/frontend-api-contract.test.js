const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function lire(fichier) {
  return fs.readFileSync(path.join(root, fichier), "utf8");
}

function echapperExpression(valeur) {
  return valeur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifierRoute(fichier, methode, chemin) {
  const source = lire(fichier);
  const expression = new RegExp(
    `router\\.${methode}\\(\\s*["']${echapperExpression(chemin)}["']`
  );
  assert.match(source, expression, `${fichier} doit exposer ${methode.toUpperCase()} ${chemin}.`);
}

function verifierMontage(prefixe, routeur) {
  const source = lire("app.js");
  const expression = new RegExp(
    `app\\.use\\(\\s*["']${echapperExpression(prefixe)}["']\\s*,\\s*${routeur}\\s*\\)`
  );
  assert.match(source, expression, `Le routeur ${routeur} doit etre monte sous ${prefixe}.`);
}

const sourceHttp = lire("public/js/http.js");
assert.match(
  sourceHttp,
  /if \(!reponse\.ok\)[\s\S]*?erreur\.status\s*=\s*reponse\.status[\s\S]*?throw erreur;/,
  "Les erreurs HTTP (notamment 404/500) doivent remonter a l'interface."
);

const montages = [
  ["/api/auth", "authRoutes"],
  ["/api/account-lifecycle", "accountLifecycleRoutes"],
  ["/api/equipe", "equipeRoutes"],
  ["/api/admin", "adminRoutes"],
  ["/api/dashboard", "dashboardRoutes"],
  ["/api/seances", "seancesRoutes"],
  ["/api/indisponibilites", "indisponibilitesRoutes"],
  ["/api/statistiques", "statistiquesRoutes"],
  ["/api/settings", "workspaceSettingsRoutes"],
  ["/api/push", "pushRoutes"],
  ["/api/realtime", "realtimeRoutes"],
];
montages.forEach(([prefixe, routeur]) => verifierMontage(prefixe, routeur));

const contrats = [
  {
    client: "public/js/auth.js",
    appel: /\/api\/auth\/login[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/auth.routes.js",
    methode: "post",
    chemin: "/login",
  },
  {
    client: "public/js/auth.js",
    appel: /\/api\/auth\/password[\s\S]{0,250}method:\s*"PATCH"/,
    route: "routes/auth.routes.js",
    methode: "patch",
    chemin: "/password",
  },
  {
    client: "public/js/account-lifecycle.js",
    appel: /\/api\/account-lifecycle\/requests[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/account-lifecycle.routes.js",
    methode: "post",
    chemin: "/requests",
  },
  {
    client: "public/js/account-lifecycle.js",
    appel: /\/api\/account-lifecycle\/password-resets[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/account-lifecycle.routes.js",
    methode: "post",
    chemin: "/password-resets",
  },
  {
    client: "public/js/equipe.js",
    appel: /\/api\/equipe\/professeurs\/\$\{Number\(professeurId\)\}\/password-reset[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/equipe.routes.js",
    methode: "post",
    chemin: "/professeurs/:id/password-reset",
  },
  {
    client: "public/js/admin.js",
    appel: /\/api\/admin\/access[\s\S]{0,250}method:\s*"PATCH"/,
    route: "routes/admin.routes.js",
    methode: "patch",
    chemin: "/access",
  },
  {
    client: "public/js/admin.js",
    appel: /\/api\/admin\/sessions\/revoke-user[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/admin.routes.js",
    methode: "post",
    chemin: "/sessions/revoke-user",
  },
  {
    client: "public/js/seances.js",
    appel: /\/api\/seances"[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/seances.routes.js",
    methode: "post",
    chemin: "/",
  },
  {
    client: "public/js/seances.js",
    appel: /\/api\/indisponibilites"[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/indisponibilites.routes.js",
    methode: "post",
    chemin: "/",
  },
  {
    client: "public/js/seances.js",
    appel: /\/api\/dashboard\/indisponibilites/,
    route: "routes/dashboard.routes.js",
    methode: "get",
    chemin: "/indisponibilites",
  },
  {
    client: "public/js/seances.js",
    appel: /envoyerRequete\(`\/api\/statistiques\$\{suffixe\}`\)/,
    route: "routes/statistiques.routes.js",
    methode: "get",
    chemin: "/",
  },
  {
    client: "public/js/workspace-settings.js",
    appel: /\/api\/settings\/calendar[\s\S]{0,250}method:\s*"PATCH"/,
    route: "routes/workspace-settings.routes.js",
    methode: "patch",
    chemin: "/calendar",
  },
  {
    client: "public/js/push.js",
    appel: /\/api\/push\/subscribe[\s\S]{0,250}method:\s*"POST"/,
    route: "routes/push.routes.js",
    methode: "post",
    chemin: "/subscribe",
  },
];

contrats.forEach(({ client, appel, route, methode, chemin }) => {
  assert.match(lire(client), appel, `${client} doit appeler ${methode.toUpperCase()} ${chemin}.`);
  verifierRoute(route, methode, chemin);
});

const sourceUi = lire("public/js/ui.js");
const sourceAdmin = lire("public/js/admin.js");
const sourceVue = lire("views/index.ejs");
const sourceWorkspaceSettings = lire("public/js/workspace-settings.js");

const endpointsLegacy = [
  "/api/admin/reset-password",
  "/api/admin/clear-seances",
  "/api/admin/clear-history",
];

assert.match(
  sourceAdmin,
  /\/api\/admin\/users\/\$\{Number\(utilisateurId\)\}[\s\S]{0,250}method:\s*"DELETE"/,
  "Le client SuperAdmin doit pouvoir supprimer un compte."
);
verifierRoute("routes/admin.routes.js", "delete", "/users/:id");
assert.match(sourceVue, /id="admin-delete-user-form"/, "Le formulaire de suppression doit être visible dans les réglages SuperAdmin.");
endpointsLegacy.forEach((endpoint) => {
  assert.doesNotMatch(
    sourceAdmin,
    new RegExp(echapperExpression(endpoint)),
    `Le client ne doit pas proposer ${endpoint}, route legacy intentionnellement desactivee.`
  );
});

const handlersLegacy = [
  "gererCreationUtilisateurAdmin",
  "gererSuppressionUtilisateurAdmin",
  "gererReinitialisationMotDePasseCompte",
  "gererSuppressionToutesLesSeances",
  "gererSuppressionToutHistorique",
];
handlersLegacy.forEach((handler) => {
  assert.doesNotMatch(
    sourceUi,
    new RegExp(`\\b${handler}\\b`),
    `${handler} ne doit plus etre attache a une action visible.`
  );
});

const formulairesRetires = [
  "admin-create-user-form",
  "admin-reset-password-form",
  "admin-clear-seances-form",
  "admin-clear-history-form",
  "admin-add-account-form",
  "admin-rate-form",
];
formulairesRetires.forEach((id) => {
  assert.doesNotMatch(
    sourceVue,
    new RegExp(`id="${echapperExpression(id)}"`),
    `${id} ne doit plus rester dans le DOM.`
  );
});

assert.doesNotMatch(
  sourceUi,
  /adminAddAccount|adminRate|adminCreateUser|adminResetPassword|adminClearSeances|adminClearHistory/,
  "Le client ne doit plus conserver de references aux formulaires retires."
);
assert.doesNotMatch(
  sourceWorkspaceSettings,
  /\/api\/settings\/public-calendar\/regenerate/,
  "L'interface ne doit pas proposer de regeneration d'un lien public Handler stable."
);
assert.doesNotMatch(
  sourceUi,
  /regenererLienCalendrierPublic/,
  "Aucun controle visible ne doit rattacher l'ancien workflow de regeneration publique."
);
assert.match(
  sourceVue,
  /id="show-account-request-button"[\s\S]*?Cr[ée]ation de compte/,
  "La creation de compte doit rester accessible depuis la connexion."
);
assert.match(
  sourceVue,
  /id="admin-account-requests-list"/,
  "Les demandes de compte doivent rester visibles pour validation Admin."
);
assert.match(sourceUi, /reset\.textContent\s*=\s*"Reset password"/);
assert.match(
  sourceUi,
  /envoyerLienResetProfesseur\(/,
  "Le reset email d'un professeur doit rester decouvrable dans Equipe."
);
assert.match(
  sourceUi,
  /const vuesAdministration = \{[\s\S]*?accounts:\s*\{[\s\S]*?titre:\s*"Comptes"/,
  "La vue Comptes doit rester disponible sans texte d'aide superflu."
);
assert.match(
  sourceUi,
  /new window\.EventSource\("\/api\/realtime"\)/,
  "Le flux temps reel doit conserver son endpoint Express monte."
);
verifierRoute("routes/realtime.routes.js", "get", "/");

console.log("frontend API contract test: PASS");
