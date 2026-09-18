/*
 * HTTP regression for the Handler central-calendar availability policy.
 *
 * This owns its SQLite file and starts the real application. It therefore
 * exercises auth, scope construction, route guards and session validation
 * together instead of testing an implementation detail in isolation.
 */
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const testId = crypto.randomUUID();
const databasePath = path.join(os.tmpdir(), `sp-handler-availability-${testId}.db`);
const sessionSecret = crypto.randomBytes(48).toString("hex");
const auditSecret = crypto.randomBytes(48).toString("hex");

// The database module resolves this path at import time.
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.SEED_DEMO_DATA = "";
process.env.SESSION_SECRET = sessionSecret;
process.env.AUDIT_SECRET = auditSecret;
process.env.CENTRAL_CALENDAR_TIMEZONE = "Africa/Casablanca";
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
    `${label}: expected ${expectedStatus}, got ${response.status}; body=${response.text}`
  );
}

function attendre(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function supprimerFichiersTest() {
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

async function obtenirPortLibre() {
  const serveur = net.createServer();
  await new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", resolve);
  });
  const adresse = serveur.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : null;
  await new Promise((resolve, reject) => serveur.close((error) => (error ? reject(error) : resolve())));
  assert.ok(Number.isInteger(port) && port > 0, "A free test port is required.");
  return port;
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

async function attendreServeur(baseUrl) {
  for (let tentative = 0; tentative < 100; tentative += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // The child process is still applying database migrations.
    }
    await attendre(100);
  }
  throw new Error("The availability-policy test server did not start in time.");
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
    const cookie = Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
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
      // Raw response remains in the assertion diagnostic.
    }
    return { status: response.status, text, json };
  }
}

async function creerUtilisateur({ nom, email, motDePasse, publicId, role }) {
  const motDePasseHash = await bcrypt.hash(motDePasse, 10);
  const resultat = await executerSql(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, est_admin, acces_active,
        statut_compte, session_version, doit_changer_mot_de_passe
      )
      VALUES (?, ?, ?, ?, 0, 1, 'active', 1, 0)
    `,
    [nom, email, motDePasseHash, publicId]
  );
  await executerSql(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, ?, ?)",
    [resultat.id, role, resultat.id]
  );
  return resultat.id;
}

function insererLigneLegacy(sql, parametres) {
  return new Promise((resolve, reject) => {
    const connexion = new sqlite3.Database(databasePath, (erreurOuverture) => {
      if (erreurOuverture) {
        reject(erreurOuverture);
      }
    });
    connexion.run(sql, parametres, function surInsertion(erreur) {
      connexion.close((erreurFermeture) => {
        if (erreur) {
          reject(erreur);
          return;
        }
        if (erreurFermeture) {
          reject(erreurFermeture);
          return;
        }
        resolve(this.lastID);
      });
    });
  });
}

async function preparerBase() {
  await initialiserBaseDeDonnees();
  await executerSql(
    "INSERT OR IGNORE INTO catalogue_options (type, valeur, tarif_horaire) VALUES ('compte', 'Cours', 0)"
  );
  await executerSql(
    "INSERT OR IGNORE INTO catalogue_options (type, valeur, tarif_horaire) VALUES ('matiere', 'Maths', 0)"
  );

  const handlerId = await creerUtilisateur({
    nom: "Handler Availability",
    email: "handler-availability@example.test",
    motDePasse: "Handler!Availability2026",
    publicId: "HD-AVAIL",
    role: "handler",
  });
  const professeurAId = await creerUtilisateur({
    nom: "Professeur Availability A",
    email: "professeur-availability-a@example.test",
    motDePasse: "ProfessorA!Availability2026",
    publicId: "PR-AVAIL-A",
    role: "professeur",
  });
  const professeurBId = await creerUtilisateur({
    nom: "Professeur Availability B",
    email: "professeur-availability-b@example.test",
    motDePasse: "ProfessorB!Availability2026",
    publicId: "PR-AVAIL-B",
    role: "professeur",
  });

  for (const professeurId of [professeurAId, professeurBId]) {
    await executerSql(
      `
        INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par)
        VALUES (?, ?, 1, ?)
      `,
      [handlerId, professeurId, handlerId]
    );
  }

  // Paid sessions require an explicit rate for each realisateur/subject
  // pair. Keep this availability scenario independent of rate defaults.
  const matieres = await listerMatieresHandler(handlerId);
  const maths = matieres.find((matiere) => matiere.libelle === "Maths");
  assert.ok(maths?.id, "The Handler Maths subject must be initialized.");
  await mettreAJourTarifsMatieresHandler(
    handlerId,
    [handlerId, professeurAId, professeurBId].map((intervenantId) => ({
      intervenant_id: intervenantId,
      matiere_id: maths.id,
      tarif_horaire: 100,
    })),
    new Date("1970-01-01T00:00:00.000Z")
  );

  // Une indisponibilité historique du Handler peut exister en base. Elle doit
  // être ignorée par le Dashboard et le calendrier public : seuls les
  // Professeurs actifs rattachés déclarent désormais leurs indisponibilités.
  const historiqueHandler = await executerSql(
    `
      INSERT INTO indisponibilites (
        date, heure_debut, heure_fin, jour_complet, raison,
        cree_par, handler_id, intervenant_id
      )
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `,
    ["2034-06-03", "08:00", "09:00", "legacy handler block", handlerId, handlerId, handlerId]
  );

  await fermerBaseDeDonnees();
  return { handlerId, professeurAId, professeurBId, historiqueHandlerId: historiqueHandler.id };
}

async function connecter(client, email, motDePasse, label) {
  const response = await client.request("POST", "/api/auth/login", {
    username: email,
    mot_de_passe: motDePasse,
  });
  assertStatus(response, 200, `${label} login`);
  assert.ok(client.csrfToken, `${label} must receive a CSRF token.`);
}

function donneesIndisponibilite(date, heureDebut, heureFin) {
  return {
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    jour_complet: false,
  };
}

function donneesSeance(marker, date, heureDebut, intervenantId) {
  return {
    etudiant: `Student ${marker}`,
    parent: "",
    matiere: "Maths",
    compte: "Cours",
    est_essai: false,
    date,
    heure_debut: heureDebut,
    duree_minutes: 60,
    statut_seance: "planifiee",
    description: `Availability regression ${marker}`,
    intervenant_id: intervenantId,
  };
}

function dateCentraleAujourdhui() {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((resultat, partie) => {
      if (partie.type !== "literal") {
        resultat[partie.type] = partie.value;
      }
      return resultat;
    }, {});
  return `${parties.year}-${parties.month}-${parties.day}`;
}

async function run() {
  let serveur = null;
  let stderr = "";
  let basePreparee = false;

  try {
    const { handlerId, professeurAId, professeurBId, historiqueHandlerId } = await preparerBase();
    basePreparee = true;
    const port = await obtenirPortLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    serveur = spawn(process.execPath, ["app.js"], {
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

    const handler = new SessionClient(baseUrl);
    const professeurA = new SessionClient(baseUrl);
    const professeurB = new SessionClient(baseUrl);
    await connecter(handler, "handler-availability@example.test", "Handler!Availability2026", "Handler");
    await connecter(
      professeurA,
      "professeur-availability-a@example.test",
      "ProfessorA!Availability2026",
      "Professor A"
    );
    await connecter(
      professeurB,
      "professeur-availability-b@example.test",
      "ProfessorB!Availability2026",
      "Professor B"
    );

    // Le sélecteur Réalisateur du Handler doit contenir le Handler lui-même
    // ainsi que chaque Professeur actif. Le champ historique `compte` ne peut
    // plus être fourni par le formulaire : le serveur le dérive du
    // Réalisateur autorisé.
    let response = await handler.request("GET", "/api/seances/options");
    assertStatus(response, 200, "Handler reads the available Réalisateurs");
    assert.deepEqual(
      new Set((response.json?.options?.intervenants || []).map((intervenant) => Number(intervenant.id))),
      new Set([handlerId, professeurAId, professeurBId]),
      "The Handler selector must contain the Handler and active attached Professors."
    );
    const seanceSansCompte = donneesSeance("derived-realisateur", "2034-06-04", "09:00", handlerId);
    delete seanceSansCompte.compte;
    response = await handler.request("POST", "/api/seances", seanceSansCompte);
    assertStatus(response, 201, "Handler creates a session without choosing legacy account");
    assert.equal(response.json?.seance?.compte, "Handler Availability");
    assert.equal(Number(response.json?.seance?.intervenant_id), handlerId);

    const seanceProfesseurSansCompte = donneesSeance(
      "derived-professor",
      "2034-06-04",
      "08:00",
      professeurAId
    );
    delete seanceProfesseurSansCompte.compte;
    delete seanceProfesseurSansCompte.intervenant_id;
    response = await professeurA.request("POST", "/api/seances", seanceProfesseurSansCompte);
    assertStatus(response, 201, "Professor creates a session without a Réalisateur choice");
    assert.equal(response.json?.seance?.compte, "Professeur Availability A");
    assert.equal(Number(response.json?.seance?.intervenant_id), professeurAId);

    // Choosing a Professor never bypasses that Professor's own agenda. It is
    // independent from the Handler's availability exception.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("targeted-professor-own-overlap", "2034-06-04", "08:30", professeurAId)
    );
    assertStatus(response, 400, "Handler cannot overlap a selected Professor's own session");

    // A professor can declare their own exception even when the legacy UI
    // permission flag was never activated. The default is otherwise available.
    response = await professeurA.request("POST", "/api/indisponibilites", {
      ...donneesIndisponibilite("2034-06-10", "08:00", "09:00"),
      dates: ["2034-06-10", "2034-06-11", "2034-06-12"],
    });
    assertStatus(response, 201, "Professor creates the same unavailability on multiple days");
    assert.deepEqual(
      response.json?.indisponibilites?.map((item) => item.date),
      ["2034-06-10", "2034-06-11", "2034-06-12"],
      "The batch must create one identical slot for every selected day"
    );
    assert.ok(
      response.json.indisponibilites.every(
        (item) => item.heure_debut === "08:00" && item.heure_fin === "09:00"
      ),
      "Every selected day must receive the same time range"
    );
    for (const indisponibilite of response.json.indisponibilites) {
      const suppression = await professeurA.request(
        "DELETE",
        `/api/indisponibilites/${indisponibilite.id}`
      );
      assertStatus(suppression, 200, "Professor cleans up a batch unavailability");
    }

    response = await professeurA.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "09:00", "10:00")
    );
    assertStatus(response, 201, "Professor A declares personal unavailability");
    const indisponibiliteProfesseurAId = Number(response.json?.indisponibilite?.id);
    assert.ok(indisponibiliteProfesseurAId > 0, "A professor unavailability identifier is required.");

    response = await handler.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "09:00", "10:00")
    );
    assertStatus(
      response,
      201,
      "Handler can declare a personal unavailability overlapping a Professor's block"
    );
    const indisponibiliteHandlerMemeCreneauId = Number(
      response.json?.indisponibilite?.id
    );
    assert.ok(
      Number.isInteger(indisponibiliteHandlerMemeCreneauId),
      "Same-slot Handler unavailability exposes its identifier"
    );
    response = await handler.request(
      "DELETE",
      `/api/indisponibilites/${indisponibiliteHandlerMemeCreneauId}`
    );
    assertStatus(
      response,
      200,
      "Handler removes the temporary same-slot personal unavailability"
    );

    // A Handler manages one personal unavailability calendar, independently
    // from the retired positive-availability rules/exceptions API.
    response = await handler.request("GET", "/api/indisponibilites");
    assertStatus(response, 200, "Handler reads personal unavailability management API");
    response = await handler.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "10:00", "11:00")
    );
    assertStatus(response, 201, "Handler declares personal unavailability");
    const indisponibiliteHandlerCreeeId = Number(response.json?.indisponibilite?.id);
    response = await handler.request(
      "PUT",
      `/api/indisponibilites/${historiqueHandlerId}`,
      donneesIndisponibilite("2034-06-03", "08:30", "09:30")
    );
    assertStatus(response, 200, "Handler edits historical personal unavailability");
    response = await handler.request(
      "DELETE",
      `/api/indisponibilites/${indisponibiliteHandlerCreeeId}`
    );
    assertStatus(response, 200, "Handler deletes personal unavailability");
    response = await handler.request("GET", "/api/disponibilites");
    assertStatus(response, 403, "Handler cannot read legacy availability rules");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");
    response = await handler.request("POST", "/api/disponibilites/regles", {
      type: "ponctuelle",
      date: "2034-06-03",
      heure_debut: "10:00",
      heure_fin: "11:00",
    });
    assertStatus(response, 403, "Handler cannot mutate legacy availability rules");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");

    // The central calendar receives the global personal blocks of the Handler
    // and every active member, without private metadata.
    response = await handler.request("GET", "/api/dashboard/indisponibilites");
    assertStatus(response, 200, "Handler reads central-calendar professor blocks");
    assert.ok(
      response.json?.indisponibilites?.some(
        (indisponibilite) => Number(indisponibilite.id) === indisponibiliteProfesseurAId
      ),
      "The central Dashboard must receive an active professor's declared unavailability."
    );
    assert.ok(
      response.json?.indisponibilites?.some(
        (indisponibilite) => Number(indisponibilite.intervenant_id) === handlerId
      ),
      "The central Dashboard must include Handler personal unavailability rows."
    );
    assert.ok(
      response.json?.indisponibilites?.some(
        (indisponibilite) => Number(indisponibilite.id) === historiqueHandlerId
      ),
      "A Handler personal block must be exposed by the central Dashboard endpoint."
    );
    assert.ok(
      response.json?.indisponibilites?.every((indisponibilite) =>
        Object.keys(indisponibilite).every((cle) =>
          [
            "id",
            "date",
            "heure_debut",
            "heure_fin",
            "jour_complet",
            "handler_id",
            "intervenant_id",
          ].includes(cle)
        )
      ),
      "The central Dashboard endpoint must not leak reason or creator metadata."
    );
    response = await professeurA.request("GET", "/api/dashboard/indisponibilites");
    assertStatus(response, 403, "Professor cannot access Handler central projection");
    assert.equal(response.json?.code, "HANDLER_REQUIRED");

    // Une proposition historique acceptée ne doit pas ressusciter une
    // indisponibilité personnelle quand le Handler supprime sa séance. Le
    // mécanisme d'exception a été retiré : la suppression reste une opération
    // de séance, jamais une mutation cachée du calendrier du Professeur.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("legacy-proposal-delete", "2034-06-05", "14:00", professeurAId)
    );
    assertStatus(response, 201, "Create the session linked to a legacy proposal");
    const seanceLegacyPropositionId = Number(response.json?.seance?.id);
    assert.ok(seanceLegacyPropositionId > 0, "The legacy-proposal session must exist.");
    await insererLigneLegacy(
      `
        INSERT INTO propositions_seances (
          etudiant,
          parent,
          matiere,
          compte,
          est_essai,
          date,
          heure_debut,
          heure_fin,
          duree_minutes,
          statut_seance,
          description,
          indisponibilite_date_originale,
          indisponibilite_heure_debut_originale,
          indisponibilite_heure_fin_originale,
          indisponibilite_jour_complet_original,
          statut,
          proposee_par,
          traitee_par,
          seance_id,
          handler_id,
          intervenant_id
        )
        VALUES (?, '', ?, ?, 0, ?, ?, ?, 60, 'planifiee', '', ?, ?, ?, 0, 'acceptee', ?, ?, ?, ?, ?)
      `,
      [
        "Student legacy proposal delete",
        "Maths",
        "Cours",
        "2034-06-05",
        "14:00",
        "15:00",
        "2034-06-05",
        "14:00",
        "15:00",
        handlerId,
        handlerId,
        seanceLegacyPropositionId,
        handlerId,
        professeurAId,
      ]
    );
    response = await handler.request("DELETE", `/api/seances/${seanceLegacyPropositionId}`);
    assertStatus(response, 200, "Handler removes a legacy-proposal session");
    response = await professeurA.request("GET", "/api/indisponibilites");
    assertStatus(response, 200, "Professor reads their own unavailability after deletion");
    assert.ok(
      !(response.json?.indisponibilites || []).some(
        (indisponibilite) =>
          indisponibilite.date === "2034-06-05" &&
          indisponibilite.heure_debut === "14:00" &&
          indisponibilite.heure_fin === "15:00"
      ),
      "Deleting a legacy-proposal session must not recreate a Professor unavailability."
    );

    // Professor A is blocked at 09:00, but Professor B is default-available:
    // the Handler can still schedule Professor B. The Handler itself has a
    // personal block at this time and must not bypass it.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("one-professor-free", "2034-06-03", "09:00", professeurBId)
    );
    assertStatus(response, 201, "An available selected Professor permits Handler booking");
    const seanceUnProfLibreId = Number(response.json?.seance?.id);
    assert.ok(seanceUnProfLibreId > 0, "Allowed session must be created.");

    // The intended professor's own exception still wins, even though another
    // professor remains free. This is deliberately a normal individual 400.
    response = await professeurA.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "10:00", "11:00")
    );
    assertStatus(response, 201, "Professor A declares individual booking block");
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("targeted-professor-blocked", "2034-06-03", "10:00", professeurAId)
    );
    assertStatus(response, 400, "Targeted unavailable professor blocks the session individually");
    assert.notEqual(
      response.json?.code,
      "COLLECTIVE_UNAVAILABILITY",
      "An individual target conflict must not be reported as the collective rule."
    );

    for (const [nomRealisateur, realisateur] of [
      ["Professor A", professeurA],
      ["Professor B", professeurB],
    ]) {
      response = await realisateur.request(
        "POST",
        "/api/indisponibilites",
        donneesIndisponibilite("2034-06-03", "12:00", "13:00")
      );
      assertStatus(response, 201, `${nomRealisateur} blocks the test slot`);
    }
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("all-professors-blocked", "2034-06-03", "12:00", handlerId)
    );
    assertStatus(
      response,
      201,
      "Handler self-session bypasses declared professor unavailability"
    );
    const seanceHandlerIndisponibleId = Number(response.json?.seance?.id);
    assert.ok(seanceHandlerIndisponibleId > 0, "The Handler self-session must be created.");

    // The exception is not a general overlap bypass: a Handler may share a
    // central slot with a Professor, never with another of their own sessions.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("handler-own-overlap", "2034-06-03", "12:00", handlerId)
    );
    assertStatus(response, 400, "Handler self-session still rejects own-session overlap");

    // An annulled Handler self-session does not occupy its slot. Restoring it
    // must keep the same narrowly scoped Handler exception through both the
    // quick-status route and a normal PUT.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("reactivation-source", "2034-06-03", "18:00", handlerId)
    );
    assertStatus(response, 201, "Create session before cancellation");
    const seanceReactivationId = Number(response.json?.seance?.id);
    response = await handler.request("PATCH", `/api/seances/${seanceReactivationId}/statut`, {
      statut_seance: "annulee",
    });
    assertStatus(response, 200, "Cancel session before collective block");
    for (const realisateur of [professeurA, professeurB]) {
      response = await realisateur.request(
        "POST",
        "/api/indisponibilites",
        donneesIndisponibilite("2034-06-03", "18:00", "19:00")
      );
      assertStatus(response, 201, "Realisateur blocks reactivation slot");
    }
    response = await handler.request("PATCH", `/api/seances/${seanceReactivationId}/statut`, {
      statut_seance: "planifiee",
    });
    assertStatus(response, 200, "Quick status reactivation keeps Handler self exception");
    response = await handler.request("PATCH", `/api/seances/${seanceReactivationId}/statut`, {
      statut_seance: "annulee",
    });
    assertStatus(response, 200, "Cancel Handler self-session before PUT reactivation");
    response = await handler.request(
      "PUT",
      `/api/seances/${seanceReactivationId}`,
      donneesSeance("reactivation-source", "2034-06-03", "18:00", handlerId)
    );
    assertStatus(response, 200, "PUT on reactivated Handler self-session remains allowed");

    // A later change in the other Realisateurs' availability cannot prevent a
    // metadata-only edit of an already-booked Handler session whose time has
    // not changed. The Handler cannot declare an unavailability over that
    // active session, which is exactly why the Dashboard remains usable.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("unchanged-update", "2034-06-03", "14:00", handlerId)
    );
    assertStatus(response, 201, "Create session before later collective block");
    const seanceMetadataId = Number(response.json?.seance?.id);
    response = await professeurA.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "14:00", "15:00")
    );
    assertStatus(response, 201, "Professor A blocks metadata-update slot later");
    response = await professeurB.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "14:00", "15:00")
    );
    assertStatus(response, 201, "Professor B blocks metadata-update slot later");
    response = await handler.request(
      "PUT",
      `/api/seances/${seanceMetadataId}`,
      {
        ...donneesSeance("unchanged-update", "2034-06-03", "14:00", handlerId),
        description: "Metadata change after other Realisateurs became unavailable",
      }
    );
    assertStatus(response, 200, "Metadata-only update remains possible on unchanged slot");

    // Changing only the assigned person is not a metadata-only update. The
    // API must re-check that person's individual unavailability even when
    // date and hours stay unchanged.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("reassignment-source", "2034-06-03", "15:00", handlerId)
    );
    assertStatus(response, 201, "Create a session before same-slot reassignment");
    const seanceReaffectationId = Number(response.json?.seance?.id);
    response = await professeurA.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-03", "15:00", "16:00")
    );
    assertStatus(response, 201, "Professor A blocks the reassignment slot");
    response = await handler.request(
      "PUT",
      `/api/seances/${seanceReaffectationId}`,
      donneesSeance("reassignment-target-blocked", "2034-06-03", "15:00", professeurAId)
    );
    assertStatus(response, 400, "Same-slot reassignment must check target unavailability");

    // Likewise, a reassignment must re-evaluate the selected Professor's own
    // availability instead of inheriting the old Handler-self exception. The
    // source is cancelled first so every Realisateur can declare the range.
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("collective-reassignment-source", "2034-06-03", "17:00", handlerId)
    );
    assertStatus(response, 201, "Create a session before collective reassignment");
    const seanceReaffectationCollectiveId = Number(response.json?.seance?.id);
    response = await handler.request(
      "PATCH",
      `/api/seances/${seanceReaffectationCollectiveId}/statut`,
      { statut_seance: "annulee" }
    );
    assertStatus(response, 200, "Cancel source before collective reassignment block");
    for (const realisateur of [professeurA, professeurB]) {
      response = await realisateur.request(
        "POST",
        "/api/indisponibilites",
        donneesIndisponibilite("2034-06-03", "17:00", "18:00")
      );
      assertStatus(response, 201, "Realisateur blocks collective reassignment slot");
    }
    response = await handler.request(
      "PUT",
      `/api/seances/${seanceReaffectationCollectiveId}`,
      {
        ...donneesSeance(
          "collective-reassignment-target",
          "2034-06-03",
          "17:00",
          professeurAId
        ),
        statut_seance: "planifiee",
      }
    );
    assertStatus(response, 400, "Same-slot reassignment checks target Professor availability");
    assert.notEqual(
      response.json?.code,
      "COLLECTIVE_UNAVAILABILITY",
      "A selected Professor must fail on their own availability, never the collective visual state."
    );

    // The former exception workflow is retired, so it cannot create an
    // indirect availability-mutation route for either role.
    response = await handler.request("GET", "/api/propositions-seances");
    assertStatus(response, 403, "Handler cannot read retired unavailability proposals");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");

    response = await handler.request(
      "POST",
      "/api/propositions-seances",
      donneesSeance("handler-proposal-bypass", "2034-06-03", "12:00", professeurAId)
    );
    assertStatus(response, 410, "Handler cannot create a retired session proposal");
    assert.equal(response.json?.code, "UNAVAILABILITY_PROPOSALS_RETIRED");

    // A Professor cannot create a dead proposal either. The historic Handler
    // mutation routes stay independently blocked to prevent replay.
    response = await professeurA.request(
      "POST",
      "/api/propositions-seances",
      donneesSeance("collective-proposal", "2034-06-03", "12:00", professeurAId)
    );
    assertStatus(response, 410, "Professor cannot create a retired unavailability proposal");
    assert.equal(response.json?.code, "UNAVAILABILITY_PROPOSALS_RETIRED");
    const propositionCollectiveId = 999999;
    response = await handler.request(
      "PUT",
      `/api/propositions-seances/${propositionCollectiveId}`,
      { heure_debut: "12:00" }
    );
    assertStatus(response, 403, "Handler cannot modify an unavailability proposal");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");
    response = await handler.request(
      "POST",
      `/api/propositions-seances/${propositionCollectiveId}/accepter`
    );
    assertStatus(response, 403, "Handler cannot accept an unavailability proposal");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");
    response = await handler.request(
      "POST",
      `/api/propositions-seances/${propositionCollectiveId}/refuser`
    );
    assertStatus(response, 403, "Handler cannot refuse an unavailability proposal");
    assert.equal(response.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");

    // The API supplies unique, server-chosen colors and silently ignores any
    // legacy attempt to override them from a client.
    response = await handler.request("GET", "/api/equipe/professeurs");
    assertStatus(response, 200, "Handler reads automatically colored team");
    const professeursAvant = response.json?.professeurs || [];
    const couleursAvant = professeursAvant.map((professeur) => professeur.couleur_calendrier);
    assert.equal(new Set(couleursAvant).size, professeursAvant.length, "Team colors must be unique.");
    assert.ok(couleursAvant.every((couleur) => /^#[0-9a-f]{6}$/i.test(String(couleur))), "Team colors must be hex values.");
    const couleurProfesseurA = professeursAvant.find(
      (professeur) => Number(professeur.id) === professeurAId
    )?.couleur_calendrier;
    response = await handler.request("PATCH", `/api/equipe/professeurs/${professeurAId}`, {
      couleur_calendrier: "#ff0000",
    });
    assertStatus(response, 200, "Legacy color override request is accepted without changing the color");
    assert.equal(response.json?.professeur?.couleur_calendrier, couleurProfesseurA);
    assert.notEqual(response.json?.professeur?.couleur_calendrier, "#ff0000");

    // Today data remains scoped: Handler receives own plus team sessions;
    // each Professor receives only their own sessions.
    const aujourdHui = dateCentraleAujourdhui();
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("today-handler", aujourdHui, "16:00", handlerId)
    );
    assertStatus(response, 201, "Create Handler session for Today scope");
    const seanceAujourdHuiHandlerId = Number(response.json?.seance?.id);
    response = await handler.request(
      "POST",
      "/api/seances",
      donneesSeance("today-professor", aujourdHui, "18:00", professeurAId)
    );
    assertStatus(response, 201, "Create Professor session for Today scope");
    const seanceAujourdHuiProfesseurId = Number(response.json?.seance?.id);
    response = await handler.request("GET", "/api/seances");
    assertStatus(response, 200, "Handler reads Today data");
    assert.ok(
      response.json?.seances?.some((seance) => Number(seance.id) === seanceAujourdHuiHandlerId),
      "Handler must receive own session in Today feed."
    );
    assert.ok(
      response.json?.seances?.some((seance) => Number(seance.id) === seanceAujourdHuiProfesseurId),
      "Handler must receive team professor session in Today feed."
    );
    response = await professeurA.request("GET", "/api/seances");
    assertStatus(response, 200, "Professor reads Today data");
    assert.ok(
      response.json?.seances?.some((seance) => Number(seance.id) === seanceAujourdHuiProfesseurId),
      "Professor must receive own session in Today feed."
    );
    assert.ok(
      !response.json?.seances?.some((seance) => Number(seance.id) === seanceAujourdHuiHandlerId),
      "Professor must not receive Handler session in Today feed."
    );
    assert.ok(
      response.json?.seances?.every(
        (seance) => Number(seance.intervenant_id) === professeurAId
      ),
      "Professor session feed must remain limited to the professor's own sessions."
    );

    // Chaque Réalisateur reste propriétaire de ses indisponibilités. Une
    // lecture Handler couvre l'équipe pour le Dashboard, mais ne doit jamais
    // donner un droit de modification ou suppression sur les créneaux d'un
    // Professeur. Un autre Professeur n'y a pas accès non plus.
    response = await professeurA.request(
      "POST",
      "/api/indisponibilites",
      donneesIndisponibilite("2034-06-04", "20:00", "21:00")
    );
    assertStatus(response, 201, "Professor A creates a personal availability block");
    const indisponibilitePersonnelleProfesseurAId = Number(response.json?.indisponibilite?.id);
    assert.ok(
      indisponibilitePersonnelleProfesseurAId > 0,
      "A Professor personal unavailability identifier is required."
    );
    response = await handler.request(
      "PUT",
      `/api/indisponibilites/${indisponibilitePersonnelleProfesseurAId}`,
      donneesIndisponibilite("2034-06-04", "21:00", "22:00")
    );
    assertStatus(response, 404, "Handler cannot edit a Professor's personal unavailability");
    response = await handler.request(
      "DELETE",
      `/api/indisponibilites/${indisponibilitePersonnelleProfesseurAId}`
    );
    assertStatus(response, 404, "Handler cannot delete a Professor's personal unavailability");
    response = await professeurB.request(
      "PUT",
      `/api/indisponibilites/${indisponibilitePersonnelleProfesseurAId}`,
      donneesIndisponibilite("2034-06-04", "21:00", "22:00")
    );
    assertStatus(response, 404, "A Professor cannot edit another Professor's unavailability");
    response = await professeurA.request(
      "PUT",
      `/api/indisponibilites/${indisponibilitePersonnelleProfesseurAId}`,
      donneesIndisponibilite("2034-06-04", "21:00", "22:00")
    );
    assertStatus(response, 200, "Professor can edit own personal unavailability");
    response = await professeurA.request(
      "DELETE",
      `/api/indisponibilites/${indisponibilitePersonnelleProfesseurAId}`
    );
    assertStatus(response, 200, "Professor can delete own personal unavailability");
    response = await professeurA.request("POST", "/api/indisponibilites", {
      ...donneesIndisponibilite("2034-06-04", "20:00", "21:00"),
      intervenant_id: handlerId,
    });
    assertStatus(response, 404, "Professor cannot declare unavailability for Handler");

    console.log("handler availability policy test: PASS");
  } catch (error) {
    console.error("handler availability policy test: FAIL");
    console.error(error.stack || error.message || error);
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    await arreterServeur(serveur).catch((error) => {
      console.error("Unable to stop availability-policy test server:", error.message || error);
      process.exitCode = 1;
    });
    if (!basePreparee) {
      await fermerBaseDeDonnees().catch(() => {});
    }
    supprimerFichiersTest();
  }
}

run();
