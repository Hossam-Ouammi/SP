/*
 * Integration coverage for the deliberately separate SuperAdmin analytics
 * surface.  It owns a temporary SQLite file and never uses DATABASE_PATH from
 * the caller, so it is safe to include in the regression suite.
 */
const assert = require("assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const testId = crypto.randomUUID();
const databasePath = path.join(os.tmpdir(), `sp-admin-analytics-${testId}.db`);
const sessionSecret = crypto.randomBytes(48).toString("hex");
const auditSecret = crypto.randomBytes(48).toString("hex");

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

function assertStatus(response, attendu, libelle) {
  assert.equal(
    response.status,
    attendu,
    `${libelle}: statut attendu=${attendu}, recu=${response.status}; reponse=${response.text}`
  );
}

function supprimerFichierTest() {
  for (const suffixe of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${databasePath}${suffixe}`, { force: true });
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
  assert.ok(Number.isInteger(port) && port > 0, "Un port HTTP de test est requis.");
  return port;
}

class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
    this.csrfToken = "";
  }

  memoriserCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    for (const entree of setCookies) {
      const paire = String(entree || "").split(";", 1)[0];
      const index = paire.indexOf("=");
      if (index > 0) {
        this.cookies.set(paire.slice(0, index).trim(), paire.slice(index + 1).trim());
      }
    }

    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken) {
      this.csrfToken = csrfToken;
    }
  }

  async request(method, pathname, body = undefined) {
    const headers = { "x-requested-with": "XMLHttpRequest" };
    const cookie = Array.from(this.cookies.entries())
      .map(([nom, valeur]) => `${nom}=${valeur}`)
      .join("; ");
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
      // Status assertions include the raw response if JSON is unexpectedly absent.
    }
    return { status: response.status, text, json };
  }
}

async function attendreServeur(baseUrl) {
  for (let tentative = 0; tentative < 100; tentative += 1) {
    try {
      const reponse = await fetch(`${baseUrl}/health`);
      if (reponse.ok) {
        return;
      }
    } catch (error) {
      // The child process is still starting.
    }
    await attendre(100);
  }
  throw new Error("Le serveur de test analytics n'a pas demarre a temps.");
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

async function creerUtilisateur({
  nom,
  email,
  motDePasse,
  publicId,
  tarifHoraire,
  roles,
  estAdmin = roles.includes("super_admin") ? 1 : 0,
}) {
  const hash = await bcrypt.hash(motDePasse, 12);
  const resultat = await executerSql(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, est_admin, acces_active,
        statut_compte, session_version, doit_changer_mot_de_passe, tarif_horaire
      )
      VALUES (?, ?, ?, ?, ?, 1, 'active', 1, 0, ?)
    `,
    [nom, email, hash, publicId, estAdmin ? 1 : 0, tarifHoraire]
  );

  for (const role of roles) {
    await executerSql(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, ?, ?)",
      [resultat.id, role, resultat.id]
    );
  }

  return resultat.id;
}

async function creerSeance({ handlerId, intervenantId, etudiant, estEssai = 0, tarifHoraire }) {
  await executerSql(
    `
      INSERT INTO seances (
        titre, etudiant, parent, matiere, compte, est_essai, date,
        heure_debut, heure_fin, duree_minutes, statut_seance, prix,
        statut_paiement, description, cree_par, modifie_par, utilisateur_id,
        handler_id, intervenant_id, tarif_horaire_applique
      )
      VALUES (?, ?, '', 'Maths', 'Cours', ?, '2020-01-15', '09:00', '10:00',
        60, 'faite', 0, 'non_payee', '', ?, ?, ?, ?, ?, ?)
    `,
    [
      `Maths - ${etudiant}`,
      etudiant,
      estEssai ? 1 : 0,
      handlerId,
      handlerId,
      handlerId,
      handlerId,
      intervenantId,
      tarifHoraire,
    ]
  );
}

async function preparerBase() {
  await initialiserBaseDeDonnees();
  const alphaId = await creerUtilisateur({
    nom: "Handler Alpha Analytics",
    email: "handler-alpha-analytics@example.test",
    motDePasse: "Alpha!Analytics2026",
    publicId: "HD-931",
    tarifHoraire: 100,
    roles: ["handler", "super_admin"],
    // The canonical role, not the legacy denormalized flag, grants the
    // platform-wide administration capability.
    estAdmin: 0,
  });
  const betaId = await creerUtilisateur({
    nom: "Handler Beta Analytics",
    email: "handler-beta-analytics@example.test",
    motDePasse: "Beta!Analytics2026",
    publicId: "HD-932",
    tarifHoraire: 125,
    roles: ["handler"],
  });
  const superAdminCanoniqueId = await creerUtilisateur({
    nom: "SuperAdmin Canonique Cible",
    email: "superadmin-canonique-cible@example.test",
    motDePasse: "Canonique!Target2026",
    publicId: "SA-933",
    tarifHoraire: 0,
    roles: ["super_admin"],
    estAdmin: 0,
  });
  const ancienDrapeauAdminId = await creerUtilisateur({
    nom: "Ancien Drapeau Admin",
    email: "ancien-drapeau-admin@example.test",
    motDePasse: "Legacy!Flag2026",
    publicId: "LG-934",
    tarifHoraire: 0,
    roles: [],
    estAdmin: 1,
  });
  const pushAId = await creerUtilisateur({
    nom: "Push Proprietaire A",
    email: "push-proprietaire-a@example.test",
    motDePasse: "Push!OwnerA2026",
    publicId: "PU-935",
    tarifHoraire: 0,
    roles: ["handler"],
  });
  const pushBId = await creerUtilisateur({
    nom: "Push Tentative B",
    email: "push-tentative-b@example.test",
    motDePasse: "Push!OwnerB2026",
    publicId: "PU-936",
    tarifHoraire: 0,
    roles: ["handler"],
  });

  await creerSeance({
    handlerId: alphaId,
    intervenantId: alphaId,
    etudiant: "Alpha",
    tarifHoraire: 100,
  });
  await creerSeance({
    handlerId: betaId,
    intervenantId: betaId,
    etudiant: "Beta",
    tarifHoraire: 125,
  });
  await creerSeance({
    handlerId: betaId,
    intervenantId: betaId,
    etudiant: "Beta essai",
    estEssai: 1,
    tarifHoraire: 125,
  });
  await fermerBaseDeDonnees();
  return {
    alphaId,
    betaId,
    superAdminCanoniqueId,
    ancienDrapeauAdminId,
    pushAId,
    pushBId,
  };
}

function lireLigneBase(sql, params = []) {
  return new Promise((resolve, reject) => {
    const base = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (erreurOuverture) => {
      if (erreurOuverture) {
        reject(erreurOuverture);
        return;
      }

      base.get(sql, params, (erreurLecture, ligne) => {
        base.close((erreurFermeture) => {
          if (erreurLecture) {
            reject(erreurLecture);
          } else if (erreurFermeture) {
            reject(erreurFermeture);
          } else {
            resolve(ligne);
          }
        });
      });
    });
  });
}

async function connecter(client, email, motDePasse, libelle) {
  const reponse = await client.request("POST", "/api/auth/login", {
    username: email,
    mot_de_passe: motDePasse,
  });
  assertStatus(reponse, 200, `${libelle} connexion`);
  assert.ok(client.csrfToken, `${libelle} doit recevoir un jeton CSRF.`);
}

async function run() {
  let serveur = null;
  let stderr = "";

  try {
    const {
      alphaId,
      betaId,
      superAdminCanoniqueId,
      ancienDrapeauAdminId,
      pushAId,
      pushBId,
    } = await preparerBase();
    const port = await obtenirPortLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    serveur = spawn("node", ["app.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATABASE_PATH: databasePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serveur.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    await attendreServeur(baseUrl);

    const alpha = new SessionClient(baseUrl);
    const beta = new SessionClient(baseUrl);
    const ancienDrapeauAdmin = new SessionClient(baseUrl);
    const pushA = new SessionClient(baseUrl);
    const pushB = new SessionClient(baseUrl);
    const anonyme = new SessionClient(baseUrl);
    await connecter(alpha, "handler-alpha-analytics@example.test", "Alpha!Analytics2026", "Alpha");
    await connecter(beta, "handler-beta-analytics@example.test", "Beta!Analytics2026", "Beta");
    await connecter(
      ancienDrapeauAdmin,
      "ancien-drapeau-admin@example.test",
      "Legacy!Flag2026",
      "Ancien drapeau"
    );
    await connecter(pushA, "push-proprietaire-a@example.test", "Push!OwnerA2026", "Push A");
    await connecter(pushB, "push-tentative-b@example.test", "Push!OwnerB2026", "Push B");

    // `super_admin` alone must be sufficient, even when the compatibility
    // column is 0. Conversely an old `est_admin=1` value has no global power.
    assert.equal(alphaId > 0, true);
    let reponse = await alpha.request(
      "GET",
      "/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 200, "SuperAdmin canonique sans drapeau legacy");
    reponse = await ancienDrapeauAdmin.request(
      "GET",
      "/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 403, "drapeau legacy sans role SuperAdmin");

    reponse = await alpha.request("PATCH", "/api/admin/access", {
      utilisateur_id: superAdminCanoniqueId,
      acces_active: false,
      mot_de_passe_actuel: "Alpha!Analytics2026",
    });
    assertStatus(reponse, 400, "protection cible SuperAdmin canonique");

    reponse = await alpha.request("PATCH", "/api/admin/access", {
      utilisateur_id: ancienDrapeauAdminId,
      acces_active: false,
      mot_de_passe_actuel: "Alpha!Analytics2026",
    });
    assertStatus(reponse, 200, "drapeau legacy sans role reste un compte ordinaire");

    const endpointPartage = "https://push.example.test/subscriptions/shared-owner";
    const abonnementA = {
      endpoint: endpointPartage,
      expirationTime: null,
      keys: { p256dh: "cle-p256dh-A", auth: "cle-auth-A" },
    };
    const abonnementB = {
      endpoint: endpointPartage,
      expirationTime: null,
      keys: { p256dh: "cle-p256dh-B", auth: "cle-auth-B" },
    };
    reponse = await pushA.request("POST", "/api/push/subscribe", {
      subscription: abonnementA,
      device_label: "Appareil A",
    });
    assertStatus(reponse, 201, "inscription Push du proprietaire A");
    reponse = await pushB.request("POST", "/api/push/subscribe", {
      subscription: abonnementB,
      device_label: "Appareil B",
    });
    assertStatus(reponse, 409, "conflit Push B sur endpoint de A");
    assert.equal(reponse.json?.code, "PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER");
    reponse = await pushB.request("POST", "/api/push/unsubscribe", {
      endpoint: endpointPartage,
    });
    assertStatus(reponse, 200, "desactivation Push B sur endpoint de A sans effet");

    reponse = await alpha.request(
      "GET",
      "/api/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 200, "statistiques operationnelles Alpha");
    assert.equal(reponse.json?.statistiques?.total_seances, 1);

    reponse = await alpha.request(
      "GET",
      "/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 200, "statistiques globales SuperAdmin");
    assert.equal(reponse.json?.portee?.type, "super_admin_globale");
    assert.equal(reponse.json?.statistiques?.total_seances, 3);
    assert.ok(
      reponse.json?.statistiques?.intervenants?.some(
        (intervenant) => Number(intervenant.intervenant_id) === betaId
      ),
      "La vue globale doit contenir l'activite du second Handler."
    );

    reponse = await alpha.request(
      "GET",
      `/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31&intervenant_id=${betaId}`
    );
    assertStatus(reponse, 200, "filtre intervenant global statistiques");
    assert.equal(reponse.json?.statistiques?.total_seances, 2);
    assert.equal(reponse.json?.portee?.intervenant_id, betaId);

    reponse = await alpha.request("GET", "/api/admin-analytics/statistiques?intervenant_id=invalide");
    assertStatus(reponse, 400, "validation filtre intervenant global statistiques");

    reponse = await beta.request(
      "GET",
      "/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 403, "refus statistiques globales Handler");

    reponse = await anonyme.request(
      "GET",
      "/api/admin-analytics/statistiques?du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 401, "refus statistiques globales anonyme");

    reponse = await alpha.request(
      "GET",
      "/api/monetisation?mode=global&du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 200, "monetisation operationnelle Alpha");
    assert.equal(reponse.json?.monetisation?.periode?.nombre_seances, 1);

    reponse = await alpha.request(
      "GET",
      "/api/admin-analytics/monetisation?mode=global&du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 200, "monetisation globale SuperAdmin");
    assert.equal(reponse.json?.portee?.type, "super_admin_globale");
    assert.equal(reponse.json?.monetisation?.periode?.nombre_seances, 3);
    assert.equal(reponse.json?.monetisation?.nombre_total_facturable, 2);
    assert.equal(reponse.json?.monetisation?.montant_total, 225);

    reponse = await alpha.request(
      "GET",
      `/api/admin-analytics/monetisation?mode=global&du=2020-01-01&au=2020-01-31&intervenant_id=${betaId}`
    );
    assertStatus(reponse, 200, "filtre intervenant global monetisation");
    assert.equal(reponse.json?.monetisation?.periode?.nombre_seances, 2);
    assert.equal(reponse.json?.monetisation?.montant_total, 125);
    assert.equal(reponse.json?.portee?.intervenant_id, betaId);

    reponse = await beta.request(
      "GET",
      "/api/admin-analytics/monetisation?mode=global&du=2020-01-01&au=2020-01-31"
    );
    assertStatus(reponse, 403, "refus monetisation globale Handler");

    await arreterServeur(serveur);
    serveur = null;
    const abonnementPersistant = await lireLigneBase(
      "SELECT utilisateur_id, actif, p256dh, auth FROM push_subscriptions WHERE endpoint = ?",
      [endpointPartage]
    );
    assert.deepEqual(abonnementPersistant, {
      utilisateur_id: pushAId,
      actif: 1,
      p256dh: "cle-p256dh-A",
      auth: "cle-auth-A",
    });
    assert.notEqual(
      abonnementPersistant.utilisateur_id,
      pushBId,
      "B ne doit jamais devenir proprietaire de l'endpoint de A."
    );

    console.log("admin analytics test: PASS");
  } catch (error) {
    console.error("admin analytics test: FAIL");
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
