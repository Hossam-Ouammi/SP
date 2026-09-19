const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const recoverySource = fs.readFileSync(
  path.join(root, "public", "js", "service-worker-recovery.js"),
  "utf8"
);
const workerSource = fs.readFileSync(
  path.join(root, "public", "service-worker.js"),
  "utf8"
);
const viewSource = fs.readFileSync(path.join(root, "views", "index.ejs"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const pushSource = fs.readFileSync(path.join(root, "public", "js", "push.js"), "utf8");

assert.match(
  recoverySource,
  /navigator\.serviceWorker\s*\.getRegistration\("\/"\)/,
  "Le navigateur doit rechercher un worker existant au chargement."
);
assert.match(
  recoverySource,
  /await enregistrement\.update\(\)/,
  "Un worker existant doit etre rafraichi sans attendre le cycle navigateur."
);
assert.match(
  recoverySource,
  /navigator\.serviceWorker\s*\.addEventListener\(\s*["']controllerchange["']/,
  "Le changement de worker doit etre observe."
);
assert.match(
  recoverySource,
  /window\.location\.reload\(\)/,
  "Le changement de worker doit recharger une fois la page pour eviter un bundle mixte."
);
assert.match(
  recoverySource,
  /avaitControleurAuChargement/,
  "La premiere prise de controle ne doit pas provoquer un rechargement inutile."
);
assert.doesNotMatch(
  workerSource,
  /addEventListener\s*\(\s*["']fetch["']/,
  "Le worker courant ne doit pas intercepter ni mettre les pages en cache."
);
assert.match(
  appSource,
  /setHeader\("Cache-Control", "no-store, no-cache, must-revalidate, private"\)/,
  "Les ressources statiques doivent annoncer qu'elles ne sont pas cacheables."
);
assert.match(
  appSource,
  /express\.static\(path\.join\(__dirname, "public"\),[\s\S]*?setHeaders: appliquerNoCacheStatic/,
  "Le worker et les bundles publics doivent recevoir les en-tetes anti-cache."
);
assert.match(
  pushSource,
  /const avaitControleurAuChargement = Boolean\(navigator\.serviceWorker\.controller\);/,
  "L'activation Push doit distinguer la premiere installation d'une mise a jour."
);
assert.match(
  pushSource,
  /if \(!avaitControleurAuChargement\) \{\s*return;/,
  "La premiere installation Push ne doit pas interrompre subscribe() par un rechargement."
);
assert.match(
  viewSource,
  /service-worker-recovery\.js\?v=20260919-auto-refresh[\s\S]*?login-lifecycle\.js[\s\S]*?type="module" src="\/js\/ui\.js/,
  "La recuperation du worker doit etre chargee avant les scripts qui initialisent l'interface."
);
assert.match(
  appSource,
  /app\.get\("\/app-version"[\s\S]*?VERSION_INSTANCE_APPLICATION/,
  "Le serveur doit exposer une version d'instance non mise en cache."
);
assert.match(
  recoverySource,
  /window\.fetch\("\/app-version"[\s\S]*?window\.location\.reload\(\)/,
  "Une nouvelle version déployée doit provoquer un rechargement automatique unique."
);

function creerCibleEvenements() {
  const ecouteurs = new Map();

  return {
    addEventListener(type, listener) {
      const listeners = ecouteurs.get(type) || [];
      listeners.push(listener);
      ecouteurs.set(type, listeners);
    },
    declencher(type) {
      for (const listener of ecouteurs.get(type) || []) {
        listener({ type });
      }
    },
  };
}

function creerEnvironnementRecovery({ controleurInitial = null, workerEnAttente = true } = {}) {
  const appels = {
    getRegistration: [],
    update: 0,
    messages: [],
    rechargements: 0,
    temporisations: [],
  };
  const worker = Object.assign(creerCibleEvenements(), {
    state: "installed",
    postMessage(message) {
      appels.messages.push(message);
    },
  });
  const registration = Object.assign(creerCibleEvenements(), {
    waiting: workerEnAttente ? worker : null,
    installing: null,
    async update() {
      appels.update += 1;
    },
  });
  const serviceWorker = Object.assign(creerCibleEvenements(), {
    controller: controleurInitial,
    async getRegistration(url) {
      appels.getRegistration.push(url);
      return registration;
    },
  });
  const window = {
    setTimeout(callback) {
      appels.temporisations.push(callback);
      return appels.temporisations.length;
    },
    location: {
      reload() {
        appels.rechargements += 1;
      },
    },
  };

  vm.runInNewContext(recoverySource, {
    navigator: { serviceWorker },
    window,
    document: {
      visibilityState: "visible",
      addEventListener() {},
    },
    Promise,
  });

  return { appels, registration, serviceWorker };
}

async function attendreInitialisationRecovery() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function verifierComportementRecovery() {
  const premiereInstallation = creerEnvironnementRecovery({ controleurInitial: null });
  await attendreInitialisationRecovery();

  assert.deepEqual(
    premiereInstallation.appels.getRegistration,
    ["/"],
    "Le worker existant doit etre recherche a la racine de l'application."
  );
  assert.equal(
    premiereInstallation.appels.update,
    1,
    "Le worker deja installe doit etre verifie immediatement apres le chargement."
  );
  assert.equal(
    premiereInstallation.appels.messages.length,
    1,
    "Une version en attente doit etre activee sans attendre la fermeture des onglets."
  );
  assert.equal(
    premiereInstallation.appels.messages[0]?.type,
    "SKIP_WAITING",
    "Le message d'activation doit etre adresse au worker en attente."
  );
  premiereInstallation.serviceWorker.declencher("controllerchange");
  assert.equal(
    premiereInstallation.appels.temporisations.length,
    0,
    "La premiere prise de controle ne doit pas recharger l'interface."
  );

  const miseAJour = creerEnvironnementRecovery({ controleurInitial: {} });
  await attendreInitialisationRecovery();
  miseAJour.serviceWorker.declencher("controllerchange");
  miseAJour.serviceWorker.declencher("controllerchange");

  assert.equal(
    miseAJour.appels.temporisations.length,
    1,
    "Le remplacement d'un worker actif doit planifier un seul rechargement."
  );
  miseAJour.appels.temporisations[0]();
  assert.equal(
    miseAJour.appels.rechargements,
    1,
    "Le rechargement unique doit eliminer le melange d'ancien et de nouveau bundle."
  );
}

verifierComportementRecovery()
  .then(() => {
    console.log("service-worker recovery test: PASS");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
