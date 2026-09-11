/*
 * Focused integration test for the SuperAdmin Professor-transfer workflow.
 *
 * Run:
 *   node scripts/professor-transfer.test.js
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();

const root = path.join(__dirname, "..");
const testId = crypto.randomUUID();
const databasePath = path.join(os.tmpdir(), `sp-professor-transfer-${testId}.db`);
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
const {
  listerMatieresHandler,
  mettreAJourTarifsMatieresHandler,
} = require("../models/tarification-matieres.model");

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

      if (separator > 0) {
        this.cookies.set(
          firstPart.slice(0, separator).trim(),
          firstPart.slice(separator + 1).trim()
        );
      }
    }

    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken) {
      this.csrfToken = csrfToken;
    }
  }

  async request(method, pathname, body = undefined) {
    const headers = { "x-requested-with": "XMLHttpRequest" };
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
      // Assertions include the raw response text on failure.
    }

    return { status: response.status, text, json };
  }
}

async function attendreServeur(baseUrl) {
  for (let tentative = 0; tentative < 100; tentative += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) {
        return;
      }
    } catch (error) {
      // The child server is still starting.
    }
    await attendre(100);
  }
  throw new Error("Le serveur de test de transfert n'a pas demarre a temps.");
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

async function creerCompte({ nom, email, motDePasse, publicId, roles }) {
  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  const resultat = await executerSql(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, est_admin, acces_active, statut_compte,
        doit_changer_mot_de_passe, session_version, tarif_horaire, public_id
      )
      VALUES (?, ?, ?, ?, 1, 'active', 0, 1, 100, ?)
    `,
    [nom, email, motDePasseHash, roles.includes("super_admin") ? 1 : 0, publicId]
  );

  for (const role of roles) {
    await executerSql(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, ?, ?)",
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

  const alphaId = await creerCompte({
    nom: "SuperAdmin Transfer Alpha",
    email: "transfer-alpha@example.test",
    motDePasse: "Alpha!Transfer2026",
    publicId: "HD-811",
    roles: ["handler", "super_admin"],
  });
  const betaId = await creerCompte({
    nom: "Handler Transfer Beta",
    email: "transfer-beta@example.test",
    motDePasse: "Beta!Transfer2026",
    publicId: "HD-812",
    roles: ["handler"],
  });
  const professeurId = await creerCompte({
    nom: "Professeur Transfer",
    email: "transfer-professeur@example.test",
    motDePasse: "Professeur!Transfer2026",
    publicId: "PR-811",
    roles: ["professeur"],
  });
  const rattachement = await executerSql(
    `INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par)
     VALUES (?, ?, 1, ?)`,
    [alphaId, professeurId, alphaId]
  );

  const matieres = await listerMatieresHandler(alphaId);
  const maths = matieres.find((matiere) => matiere.libelle === "Maths");
  assert.ok(maths?.id, "La matière Maths du Handler doit être initialisée.");
  await mettreAJourTarifsMatieresHandler(
    alphaId,
    [alphaId, professeurId].map((intervenantId) => ({
      intervenant_id: intervenantId,
      matiere_id: maths.id,
      tarif_horaire: 100,
    })),
    new Date("1970-01-01T00:00:00.000Z")
  );

  await fermerBaseDeDonnees();
  return { alphaId, betaId, professeurId, rattachementSourceId: rattachement.id };
}

async function connecter(client, email, motDePasse, roleAttendu, label) {
  const response = await client.request("POST", "/api/auth/login", {
    username: email,
    mot_de_passe: motDePasse,
  });
  assertStatus(response, 200, `${label} connexion`);
  assert.ok(response.json?.scope?.roles?.includes(roleAttendu), `${label}: role manquant.`);
  assert.ok(client.csrfToken, `${label}: jeton CSRF manquant.`);
  return response.json.scope;
}

function donneesSeanceSource() {
  return {
    etudiant: "Eleve historique transfert",
    parent: "",
    matiere: "Maths",
    compte: "Cours",
    est_essai: false,
    date: "2035-04-11",
    heure_debut: "10:00",
    duree_minutes: 60,
    statut_seance: "planifiee",
    description: "Cette seance doit rester dans l'espace source.",
  };
}

function lireLignesSql(sql, parametres = []) {
  return new Promise((resolve, reject) => {
    const base = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (erreurOuverture) => {
      if (erreurOuverture) {
        reject(erreurOuverture);
        return;
      }

      base.all(sql, parametres, (erreurLecture, lignes) => {
        base.close((erreurFermeture) => {
          if (erreurLecture) {
            reject(erreurLecture);
          } else if (erreurFermeture) {
            reject(erreurFermeture);
          } else {
            resolve(lignes);
          }
        });
      });
    });
  });
}

async function verifierPersistanceApresArret(attendus) {
  const rattachements = await lireLignesSql(
    `SELECT id, handler_id, professeur_id, actif, debut_at, fin_at
     FROM rattachements_professeurs WHERE professeur_id = ? ORDER BY id ASC`,
    [attendus.professeurId]
  );
  assert.equal(rattachements.length, 2, "Les deux rattachements doivent etre conserves.");
  const source = rattachements.find((ligne) => Number(ligne.id) === attendus.rattachementSourceId);
  const destination = rattachements.find(
    (ligne) => Number(ligne.id) === attendus.rattachementDestinationId
  );
  assert.ok(source, "Le rattachement source doit rester archive.");
  assert.equal(Number(source.actif), 0, "Le rattachement source doit etre clos.");
  assert.ok(source.fin_at, "Le rattachement source doit avoir une date de fin.");
  assert.ok(destination, "Le rattachement destination doit exister.");
  assert.equal(Number(destination.actif), 1, "Le rattachement destination doit etre actif.");
  assert.equal(Number(destination.handler_id), attendus.betaId);

  const seances = await lireLignesSql(
    "SELECT id, handler_id, intervenant_id FROM seances WHERE id = ?",
    [attendus.seanceSourceId]
  );
  assert.equal(seances.length, 1, "La seance historique source doit etre conservee.");
  assert.equal(Number(seances[0].handler_id), attendus.alphaId);
  assert.equal(Number(seances[0].intervenant_id), attendus.professeurId);
}

async function run() {
  let serveur = null;
  let stderr = "";
  let verificationPersistance = null;

  try {
    const { alphaId, betaId, professeurId, rattachementSourceId } = await preparerBase();
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
    const professeur = new SessionClient(baseUrl);
    await connecter(alpha, "transfer-alpha@example.test", "Alpha!Transfer2026", "super_admin", "Alpha");
    await connecter(beta, "transfer-beta@example.test", "Beta!Transfer2026", "handler", "Beta");
    const scopeProfesseurAvant = await connecter(
      professeur,
      "transfer-professeur@example.test",
      "Professeur!Transfer2026",
      "professeur",
      "Professeur"
    );
    assert.ok(scopeProfesseurAvant.handlerProfesseurIds.includes(alphaId));

    let response = await professeur.request("POST", "/api/seances", donneesSeanceSource());
    assertStatus(response, 201, "creation seance historique par le Professeur");
    const seanceSourceId = Number(response.json?.seance?.id);
    assert.ok(seanceSourceId > 0, "La seance source doit exister avant le transfert.");

    response = await beta.request("POST", `/api/admin/professeurs/${professeurId}/transfer`, {
      handler_destination_id: alphaId,
    });
    assertStatus(response, 403, "transfert par Handler non SuperAdmin");

    response = await alpha.request("POST", `/api/admin/professeurs/${professeurId}/transfer`, {});
    assertStatus(response, 400, "transfert sans destination");

    response = await alpha.request("POST", `/api/admin/professeurs/${professeurId}/transfer`, {
      handler_destination_id: betaId,
    });
    assertStatus(response, 200, "transfert SuperAdmin");
    const transfert = response.json?.transfert;
    assert.equal(Number(transfert?.professeur?.id), professeurId);
    assert.equal(Number(transfert?.handler_source?.id), alphaId);
    assert.equal(Number(transfert?.handler_destination?.id), betaId);
    assert.equal(transfert?.rattachement_source?.actif, false);
    assert.ok(transfert?.rattachement_source?.fin_at, "Le rattachement source doit etre date.");
    assert.equal(transfert?.rattachement_destination?.actif, true);
    assert.ok(Number(transfert?.historique?.sortie_id) > 0, "Audit source manquant.");
    assert.ok(Number(transfert?.historique?.entree_id) > 0, "Audit destination manquant.");

    response = await professeur.request("GET", "/api/seances");
    assertStatus(response, 401, "ancienne session Professeur apres transfert");

    const scopeProfesseurApres = await connecter(
      professeur,
      "transfer-professeur@example.test",
      "Professeur!Transfer2026",
      "professeur",
      "Professeur apres transfert"
    );
    assert.deepEqual(scopeProfesseurApres.handlerProfesseurIds, [betaId]);

    response = await professeur.request("GET", "/api/seances");
    assertStatus(response, 200, "lecture Professeur apres reconnexion");
    assert.ok(
      !response.json?.seances?.some((seance) => Number(seance.id) === seanceSourceId),
      "Le Professeur transfere ne doit plus lire les seances de l'ancien Handler."
    );

    response = await alpha.request("GET", "/api/equipe/professeurs");
    assertStatus(response, 200, "equipe Alpha apres transfert");
    assert.ok(!response.json?.professeurs?.some((membre) => Number(membre.id) === professeurId));

    response = await beta.request("GET", "/api/equipe/professeurs");
    assertStatus(response, 200, "equipe Beta apres transfert");
    assert.ok(response.json?.professeurs?.some((membre) => Number(membre.id) === professeurId));

    response = await alpha.request("GET", "/api/seances");
    assertStatus(response, 200, "seances historiques Alpha");
    assert.ok(response.json?.seances?.some((seance) => Number(seance.id) === seanceSourceId));

    response = await beta.request("GET", `/api/seances/${seanceSourceId}`);
    assertStatus(response, 404, "lecture Beta de la seance historique Alpha");

    response = await alpha.request("GET", "/api/historique?limit=100");
    assertStatus(response, 200, "historique Alpha apres transfert");
    const auditSortie = response.json?.historique?.find(
      (entree) =>
        entree.action_type === "professeur_transfere" &&
        entree.details?.sens === "sortie" &&
        Number(entree.intervenant_id) === professeurId
    );
    assert.ok(auditSortie?.integrite_valide, "La trace HMAC de sortie doit etre valide.");
    assert.equal(Number(auditSortie.handler_id), alphaId);

    response = await beta.request("GET", "/api/historique?limit=100");
    assertStatus(response, 200, "historique Beta apres transfert");
    const auditEntree = response.json?.historique?.find(
      (entree) =>
        entree.action_type === "professeur_transfere" &&
        entree.details?.sens === "entree" &&
        Number(entree.intervenant_id) === professeurId
    );
    assert.ok(auditEntree?.integrite_valide, "La trace HMAC d'entree doit etre valide.");
    assert.equal(Number(auditEntree.handler_id), betaId);

    response = await alpha.request("GET", "/api/admin/history?limit=100");
    assertStatus(response, 200, "historique global SuperAdmin apres transfert");
    const auditsTransfert = response.json?.historique?.filter(
      (entree) =>
        entree.action_type === "professeur_transfere" &&
        Number(entree.intervenant_id) === professeurId
    );
    assert.equal(auditsTransfert?.length, 2, "Le SuperAdmin doit voir les deux traces du transfert.");
    assert.ok(auditsTransfert.every((entree) => entree.integrite_valide));

    verificationPersistance = {
      alphaId,
      betaId,
      professeurId,
      rattachementSourceId,
      rattachementDestinationId: Number(transfert.rattachement_destination.id),
      seanceSourceId,
    };
    console.log("professor-transfer.test.js: OK");
  } catch (error) {
    console.error("professor-transfer.test.js: FAIL");
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
    if (verificationPersistance) {
      try {
        await verifierPersistanceApresArret(verificationPersistance);
        console.log("professor-transfer persistence: OK");
      } catch (error) {
        console.error("professor-transfer persistence: FAIL");
        console.error(error.stack || error.message || error);
        process.exitCode = 1;
      }
    }
    supprimerFichierTest();
  }
}

run();
