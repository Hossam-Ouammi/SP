/*
 * Integration test for the operational privacy boundary between two Handlers.
 *
 * It deliberately owns its temporary SQLite database instead of accepting a
 * caller-supplied path, so it can never alter a development or production
 * database.  It starts the real HTTP server and exercises authenticated routes
 * with two independent session cookies.
 *
 * Run:
 *   node scripts/multi-handler-isolation.test.js
 */
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");

const root = path.join(__dirname, "..");
const testId = crypto.randomUUID();
const databasePath = path.join(os.tmpdir(), `sp-multi-handler-${testId}.db`);
const sessionSecret = crypto.randomBytes(48).toString("hex");
const auditSecret = crypto.randomBytes(48).toString("hex");

// The DB module resolves DATABASE_PATH during import, so set these before it
// is loaded. The generated path is known only to this test process.
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.SEED_DEMO_DATA = "";
process.env.SESSION_SECRET = sessionSecret;
process.env.AUDIT_SECRET = auditSecret;
process.env.PUSH_ENABLE_IN_MEMORY_REMINDERS = "false";
process.env.BACKUP_SEANCES_ENABLED = "false";

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  run: executerSql,
} = require("../models/db");

function assertStatus(response, expectedStatus, label) {
  assert.equal(
    response.status,
    expectedStatus,
    `${label}: statut attendu=${expectedStatus}, recu=${response.status}; reponse=${response.text}`
  );
}

function supprimerFichierTest() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${databasePath}${suffix}`, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenirPortLibre() {
  const serveur = net.createServer();

  await new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", resolve);
  });

  const adresse = serveur.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : null;
  await new Promise((resolve, reject) => serveur.close((error) => (error ? reject(error) : resolve())));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Impossible de reserver un port HTTP de test.");
  }

  return port;
}

class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
    this.csrfToken = "";
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  memoriserCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    for (const entry of setCookies) {
      const firstPart = String(entry || "").split(";", 1)[0];
      const separator = firstPart.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      this.cookies.set(
        firstPart.slice(0, separator).trim(),
        firstPart.slice(separator + 1).trim()
      );
    }

    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken) {
      this.csrfToken = csrfToken;
    }
  }

  async request(method, pathname, body = undefined) {
    const headers = {
      "x-requested-with": "XMLHttpRequest",
    };
    const cookie = this.cookieHeader();

    if (cookie) {
      headers.cookie = cookie;
    }

    if (this.csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["x-csrf-token"] = this.csrfToken;
    }

    let payload = body;
    if (body !== undefined && body !== null) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body: payload,
      redirect: "manual",
    });
    this.memoriserCookies(response);

    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch (error) {
      // The status assertion prints the raw body when a route unexpectedly
      // returns a non-JSON response.
    }

    return { status: response.status, text, json };
  }
}

async function attendreServeur(baseUrl) {
  for (let tentative = 0; tentative < 100; tentative += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // The child process is still booting.
    }

    await attendre(200);
  }

  throw new Error("Le serveur de test multi-Handler n'a pas demarre a temps.");
}

async function arreterServeur(serveur) {
  if (!serveur || serveur.exitCode !== null || serveur.signalCode !== null) {
    return;
  }

  const termine = new Promise((resolve) => serveur.once("exit", resolve));
  serveur.kill("SIGTERM");

  const resultat = await Promise.race([
    termine.then(() => "termine"),
    attendre(5000).then(() => "timeout"),
  ]);

  if (resultat === "timeout" && serveur.exitCode === null && serveur.signalCode === null) {
    serveur.kill("SIGKILL");
    await termine;
  }
}

async function creerHandler({ nom, email, motDePasse, publicId, roles = ["handler"] }) {
  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  const resultat = await executerSql(
    `
      INSERT INTO utilisateurs (
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        statut_compte,
        doit_changer_mot_de_passe,
        session_version,
        tarif_horaire,
        public_id
      )
      VALUES (?, ?, ?, ?, 1, 'active', 0, 1, 100, ?)
    `,
    [nom, email, motDePasseHash, roles.includes("super_admin") ? 1 : 0, publicId]
  );

  for (const role of roles) {
    await executerSql(
      `
        INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par)
        VALUES (?, ?, ?)
      `,
      [resultat.id, role, resultat.id]
    );
  }

  return resultat.id;
}

async function preparerBase() {
  await initialiserBaseDeDonnees();
  await executerSql(
    "INSERT INTO catalogue_options (type, valeur, tarif_horaire) VALUES ('compte', 'Cours', 0)"
  );

  const alphaId = await creerHandler({
    nom: "Handler Alpha Isolation",
    email: "handler-alpha-isolation@example.test",
    motDePasse: "Alpha!Handler2026",
    publicId: "HD-901",
    // Alpha represents the dual-role account: the standard Handler endpoint
    // must remain private even though the same identity is also SuperAdmin.
    roles: ["handler", "super_admin"],
  });
  const betaId = await creerHandler({
    nom: "Handler Beta Isolation",
    email: "handler-beta-isolation@example.test",
    motDePasse: "Beta!Handler2026",
    publicId: "HD-902",
  });

  await fermerBaseDeDonnees();
  return { alphaId, betaId };
}

function donneesSeance(marker, date, heureDebut) {
  return {
    etudiant: `Eleve ${marker}`,
    parent: "",
    matiere: "Maths",
    compte: "Cours",
    est_essai: false,
    date,
    heure_debut: heureDebut,
    duree_minutes: 60,
    statut_seance: "planifiee",
    description: `Session privee ${marker}`,
  };
}

function donneesDisponibilite(date, heureDebut, heureFin) {
  return {
    type: "ponctuelle",
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
  };
}

function verifierCollectionScopee(elements, { handlerId, intervenantId, idAttendu, label }) {
  assert.ok(Array.isArray(elements), `${label}: une collection est attendue.`);
  assert.ok(
    elements.some((element) => Number(element.id) === Number(idAttendu)),
    `${label}: la ressource propre au Handler doit etre presente.`
  );
  assert.ok(
    elements.every((element) => Number(element.handler_id) === Number(handlerId)),
    `${label}: aucune ressource d'un autre Handler ne doit etre renvoyee.`
  );

  if (intervenantId) {
    assert.ok(
      elements.every((element) => Number(element.intervenant_id) === Number(intervenantId)),
      `${label}: aucune ressource d'un autre intervenant ne doit etre renvoyee.`
    );
  }
}

async function connecter(client, email, motDePasse, label) {
  const response = await client.request("POST", "/api/auth/login", {
    username: email,
    mot_de_passe: motDePasse,
  });
  assertStatus(response, 200, `${label} connexion`);
  assert.ok(response.json?.scope?.roles?.includes("handler"), `${label} doit etre Handler.`);
  assert.ok(client.csrfToken, `${label} doit recevoir un jeton CSRF.`);
}

async function run() {
  let serveur = null;
  let stderr = "";

  try {
    const { alphaId, betaId } = await preparerBase();
    const port = await obtenirPortLibre();
    const baseUrl = `http://127.0.0.1:${port}`;

    serveur = spawn("node", ["app.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATABASE_PATH: databasePath,
        NODE_ENV: "test",
        SEED_DEMO_DATA: "",
        SESSION_SECRET: sessionSecret,
        AUDIT_SECRET: auditSecret,
        PUSH_ENABLE_IN_MEMORY_REMINDERS: "false",
        BACKUP_SEANCES_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serveur.stdout.on("data", () => {});
    serveur.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    await attendreServeur(baseUrl);

    const alpha = new SessionClient(baseUrl);
    const beta = new SessionClient(baseUrl);
    await connecter(alpha, "handler-alpha-isolation@example.test", "Alpha!Handler2026", "Alpha");
    await connecter(beta, "handler-beta-isolation@example.test", "Beta!Handler2026", "Beta");

    // A Handler must not create a session or an availability rule inside a
    // second Handler's space, even when it knows their opaque numeric ID.
    let response = await alpha.request("POST", "/api/seances", {
      ...donneesSeance("alpha-cross-write", "2035-01-13", "08:00"),
      handler_id: betaId,
      intervenant_id: betaId,
    });
    assertStatus(response, 404, "ecriture croisee de seance");

    response = await alpha.request("POST", "/api/disponibilites/regles", {
      ...donneesDisponibilite("2035-01-13", "08:00", "09:00"),
      handler_id: betaId,
      intervenant_id: betaId,
    });
    assertStatus(response, 404, "ecriture croisee de disponibilite");

    response = await alpha.request("POST", "/api/seances", {
      ...donneesSeance("alpha-privee", "2035-01-13", "10:00"),
      intervenant_id: alphaId,
    });
    assertStatus(response, 201, "creation seance Alpha");
    const alphaSeanceId = Number(response.json?.seance?.id);
    assert.ok(alphaSeanceId > 0, "La seance Alpha doit avoir un identifiant.");

    response = await beta.request("POST", "/api/seances", {
      ...donneesSeance("beta-privee", "2035-01-13", "10:00"),
      intervenant_id: betaId,
    });
    assertStatus(response, 201, "creation seance Beta");
    const betaSeanceId = Number(response.json?.seance?.id);
    assert.ok(betaSeanceId > 0, "La seance Beta doit avoir un identifiant.");

    response = await alpha.request("POST", "/api/disponibilites/regles", {
      ...donneesDisponibilite("2035-01-14", "09:00", "10:00"),
      intervenant_id: alphaId,
    });
    assertStatus(response, 201, "creation disponibilite Alpha");
    const alphaRegleId = Number(response.json?.regle?.id);
    assert.ok(alphaRegleId > 0, "La regle Alpha doit avoir un identifiant.");

    response = await beta.request("POST", "/api/disponibilites/regles", {
      ...donneesDisponibilite("2035-01-14", "09:00", "10:00"),
      intervenant_id: betaId,
    });
    assertStatus(response, 201, "creation disponibilite Beta");
    const betaRegleId = Number(response.json?.regle?.id);
    assert.ok(betaRegleId > 0, "La regle Beta doit avoir un identifiant.");

    response = await alpha.request("GET", "/api/seances");
    assertStatus(response, 200, "lecture seances Alpha");
    verifierCollectionScopee(response.json?.seances, {
      handlerId: alphaId,
      intervenantId: null,
      idAttendu: alphaSeanceId,
      label: "lecture seances Alpha",
    });
    assert.ok(
      !response.json.seances.some((seance) => Number(seance.id) === betaSeanceId),
      "Alpha ne doit jamais recevoir la seance Beta."
    );

    response = await beta.request("GET", "/api/seances");
    assertStatus(response, 200, "lecture seances Beta");
    verifierCollectionScopee(response.json?.seances, {
      handlerId: betaId,
      intervenantId: null,
      idAttendu: betaSeanceId,
      label: "lecture seances Beta",
    });
    assert.ok(
      !response.json.seances.some((seance) => Number(seance.id) === alphaSeanceId),
      "Beta ne doit jamais recevoir la seance Alpha."
    );

    response = await alpha.request("GET", "/api/disponibilites/regles");
    assertStatus(response, 200, "lecture disponibilites Alpha");
    verifierCollectionScopee(response.json?.regles, {
      handlerId: alphaId,
      intervenantId: alphaId,
      idAttendu: alphaRegleId,
      label: "lecture disponibilites Alpha",
    });
    assert.ok(
      !response.json.regles.some((regle) => Number(regle.id) === betaRegleId),
      "Alpha ne doit jamais recevoir la disponibilite Beta."
    );

    response = await beta.request("GET", "/api/disponibilites/regles");
    assertStatus(response, 200, "lecture disponibilites Beta");
    verifierCollectionScopee(response.json?.regles, {
      handlerId: betaId,
      intervenantId: betaId,
      idAttendu: betaRegleId,
      label: "lecture disponibilites Beta",
    });
    assert.ok(
      !response.json.regles.some((regle) => Number(regle.id) === alphaRegleId),
      "Beta ne doit jamais recevoir la disponibilite Alpha."
    );

    response = await beta.request("GET", `/api/seances/${alphaSeanceId}`);
    assertStatus(response, 404, "lecture directe seance Alpha par Beta");

    response = await beta.request("GET", `/api/disponibilites/regles?intervenant_id=${alphaId}`);
    assertStatus(response, 404, "lecture ciblee disponibilite Alpha par Beta");

    response = await beta.request("PATCH", `/api/disponibilites/regles/${alphaRegleId}`, {
      actif: false,
    });
    assertStatus(response, 404, "modification disponibilite Alpha par Beta");

    // Read-only status must apply to every proposal mutation, including the
    // Handler-only acceptance paths that historically did not carry the
    // generic write guard.
    response = await alpha.request("PATCH", "/api/admin/read-only", {
      utilisateur_id: betaId,
      mode_lecture_seule: true,
      mot_de_passe_actuel: "Alpha!Handler2026",
    });
    assertStatus(response, 200, "passage Beta en lecture seule");
    for (const [method, route] of [
      ["PUT", "/api/propositions-seances/999999"],
      ["POST", "/api/propositions-seances/999999/accepter"],
      ["POST", "/api/propositions-seances/999999/refuser"],
    ]) {
      response = await beta.request(method, route, method === "PUT" ? {} : undefined);
      assertStatus(response, 403, `proposition bloquee en lecture seule (${method} ${route})`);
      assert.equal(response.json?.code, "READ_ONLY_ACCOUNT");
    }
    response = await alpha.request("PATCH", "/api/admin/read-only", {
      utilisateur_id: betaId,
      mode_lecture_seule: false,
      mot_de_passe_actuel: "Alpha!Handler2026",
    });
    assertStatus(response, 200, "retour Beta en ecriture");

    // Account requests use the same team boundary. Beta can neither list nor
    // decide a Professor request addressed to Alpha, even by altering the URL.
    response = await alpha.request("POST", "/api/account-lifecycle/requests", {
      nom: "Professeur Alpha Lifecycle",
      email: "professeur-alpha-lifecycle@example.test",
      role: "professeur",
      handler_public_id: "HD-901",
    });
    assertStatus(response, 202, "demande de professeur Alpha");

    response = await alpha.request("GET", "/api/account-lifecycle/requests");
    assertStatus(response, 200, "liste demandes Alpha");
    const demandeAlpha = response.json?.demandes?.find(
      (demande) => demande.email === "professeur-alpha-lifecycle@example.test"
    );
    assert.ok(demandeAlpha?.id, "Alpha doit retrouver la demande de son equipe.");

    response = await beta.request("GET", "/api/account-lifecycle/requests");
    assertStatus(response, 200, "liste demandes Beta");
    assert.ok(
      !response.json?.demandes?.some((demande) => Number(demande.id) === Number(demandeAlpha.id)),
      "Beta ne doit jamais recevoir la demande destinee a Alpha."
    );

    response = await beta.request(
      "POST",
      `/api/account-lifecycle/requests/${demandeAlpha.id}/approve`
    );
    assertStatus(response, 404, "approbation croisee de demande");

    response = await alpha.request(
      "POST",
      `/api/account-lifecycle/requests/${demandeAlpha.id}/approve`
    );
    assertStatus(response, 201, "approbation demande Alpha");

    // A Handler request remains invisible in the operational Handler view;
    // the same dual-role identity can process it only through Administration.
    response = await alpha.request("POST", "/api/account-lifecycle/requests", {
      nom: "Handler Platform Lifecycle",
      email: "handler-platform-lifecycle@example.test",
      role: "handler",
    });
    assertStatus(response, 202, "demande Handler plateforme");

    response = await alpha.request("GET", "/api/account-lifecycle/requests");
    assertStatus(response, 200, "vue Handler apres demande plateforme");
    assert.ok(
      !response.json?.demandes?.some(
        (demande) => demande.email === "handler-platform-lifecycle@example.test"
      ),
      "Une demande Handler ne doit pas apparaitre dans l'espace Handler operationnel."
    );

    response = await alpha.request("GET", "/api/admin/account-requests");
    assertStatus(response, 200, "vue demandes SuperAdmin");
    const demandeHandler = response.json?.demandes?.find(
      (demande) => demande.email === "handler-platform-lifecycle@example.test"
    );
    assert.ok(demandeHandler?.id, "Le SuperAdmin doit voir la demande Handler globale.");

    response = await alpha.request(
      "POST",
      `/api/admin/account-requests/${demandeHandler.id}/approve`
    );
    assertStatus(response, 201, "approbation Handler par SuperAdmin");

    response = await alpha.request("GET", "/api/historique?limit=100");
    assertStatus(response, 200, "lecture historique Alpha");
    const alphaHistorique = response.json?.historique;
    assert.ok(Array.isArray(alphaHistorique) && alphaHistorique.length > 0, "Alpha doit voir son historique.");
    assert.ok(
      alphaHistorique.every((entree) => Number(entree.handler_id) === alphaId),
      "L'historique Alpha ne doit contenir aucune entree d'un autre Handler."
    );
    const entreeHistoriqueAlpha = alphaHistorique.find(
      (entree) => Number(entree.seance_id) === alphaSeanceId
    );
    assert.ok(entreeHistoriqueAlpha?.id, "La creation de seance Alpha doit etre auditee.");
    assert.ok(
      alphaHistorique.some(
        (entree) =>
          entree.action_type === "demande_compte_approuvee" &&
          Number(entree.details?.demande_id) === Number(demandeAlpha.id)
      ),
      "L'approbation d'une demande doit etre conservee dans l'historique d'Alpha."
    );

    response = await beta.request("GET", "/api/historique?limit=100");
    assertStatus(response, 200, "lecture historique Beta");
    const betaHistorique = response.json?.historique;
    assert.ok(Array.isArray(betaHistorique) && betaHistorique.length > 0, "Beta doit voir son historique.");
    assert.ok(
      betaHistorique.every((entree) => Number(entree.handler_id) === betaId),
      "L'historique Beta ne doit contenir aucune entree d'un autre Handler."
    );
    assert.ok(
      !betaHistorique.some((entree) => Number(entree.id) === Number(entreeHistoriqueAlpha.id)),
      "Beta ne doit jamais recevoir l'entree d'historique Alpha."
    );

    // The dual-role account stays in its Handler scope on the ordinary route.
    // It receives platform-wide history only after taking the dedicated,
    // SuperAdmin-protected administrative route.
    response = await alpha.request("GET", "/api/admin/history?limit=100");
    assertStatus(response, 200, "lecture historique global SuperAdmin Alpha");
    assert.ok(
      response.json?.historique?.some((entree) => Number(entree.seance_id) === betaSeanceId),
      "La vue Administration doit pouvoir consulter l'historique global."
    );

    response = await beta.request("GET", `/api/historique/${entreeHistoriqueAlpha.id}`);
    assertStatus(response, 404, "lecture directe historique Alpha par Beta");

    console.log("multi-handler isolation test: PASS");
  } catch (error) {
    console.error("multi-handler isolation test: FAIL");
    console.error(error.stack || error.message || error);
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    await arreterServeur(serveur).catch((error) => {
      console.error("Arret du serveur de test impossible:", error.message || error);
      process.exitCode = 1;
    });
    supprimerFichierTest();
  }
}

run();
