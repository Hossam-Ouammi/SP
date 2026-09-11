/*
 * HTTP regression for workspace settings and the public-calendar lifecycle.
 * This owns a temporary database and starts the real Express application so
 * authentication, CSRF, role scopes and route mounting are all exercised.
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
const databasePath = path.join(os.tmpdir(), `sp-workspace-settings-${testId}.db`);

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.SEED_DEMO_DATA = "";
process.env.SESSION_SECRET = crypto.randomBytes(48).toString("hex");
process.env.AUDIT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.PUSH_ENABLE_IN_MEMORY_REMINDERS = "false";
process.env.BACKUP_SEANCES_ENABLED = "false";
// La référence centrale est déployée globalement et ne dépend jamais du
// champ public_calendar_timezone d'un Handler.
process.env.CENTRAL_CALENDAR_TIMEZONE = "Europe/Paris";

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  run: executerSql,
} = require("../models/db");
const {
  listerAvertissementsPlageCalendrierFuture,
} = require("../models/workspace-settings.model");

function assertStatus(response, attendu, libelle) {
  assert.equal(
    response.status,
    attendu,
    `${libelle}: statut attendu=${attendu}, recu=${response.status}; reponse=${response.text}`
  );
}

function planningContientCreneau(planning, { date, heureDebut, heureFin, etat }) {
  return (planning?.creneaux || []).some(
    (creneau) =>
      creneau.date === date &&
      creneau.heure_debut === heureDebut &&
      creneau.heure_fin === heureFin &&
      creneau.etat === etat
  );
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supprimerFichiersTest() {
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

async function obtenirPortLibre() {
  const serveur = net.createServer();
  await new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", resolve);
  });
  const adresse = serveur.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : null;
  await new Promise((resolve, reject) => serveur.close((error) => (error ? reject(error) : resolve())));
  assert.ok(Number.isInteger(port) && port > 0, "Un port de test est requis.");
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
      const reponse = await fetch(`${baseUrl}/health`);
      if (reponse.ok) {
        return;
      }
    } catch (error) {
      // Le processus enfant initialise SQLite.
    }
    await attendre(100);
  }
  throw new Error("Le serveur de test des reglages n'a pas demarre a temps.");
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
      // Les assertions incluent le corps brut en cas de reponse inattendue.
    }
    return { status: response.status, text, json };
  }
}

async function creerUtilisateur({ nom, email, motDePasse, publicId, roles, timezone }) {
  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  const resultat = await executerSql(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, est_admin, acces_active,
        statut_compte, session_version, doit_changer_mot_de_passe, timezone
      )
      VALUES (?, ?, ?, ?, ?, 1, 'active', 1, 0, ?)
    `,
    [nom, email, motDePasseHash, publicId, roles.includes("super_admin") ? 1 : 0, timezone]
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
    "INSERT INTO catalogue_options (type, valeur, tarif_horaire) VALUES ('compte', 'DST', 0)"
  );
  const handlerId = await creerUtilisateur({
    nom: "Handler Reglages",
    email: "handler-reglages@example.test",
    motDePasse: "Handler!Reglages2026",
    publicId: "HD-941",
    roles: ["handler"],
    timezone: "Africa/Casablanca",
  });
  const professeurId = await creerUtilisateur({
    nom: "Professeur Reglages",
    email: "professeur-reglages@example.test",
    motDePasse: "Professeur!Reglages2026",
    publicId: "PR-941",
    roles: ["professeur"],
    timezone: "Europe/Paris",
  });
  await executerSql(
    "INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par) VALUES (?, ?, 1, ?)",
    [handlerId, professeurId, handlerId]
  );
  // Ces donnees futures ne doivent jamais etre modifiees par un changement de
  // plage. Elles permettent de verifier le parcours d'avertissement/confirmation
  // plutot qu'une perte silencieuse de donnees.
  await executerSql(
    `
      INSERT INTO seances (
        titre, etudiant, matiere, date, heure_debut, heure_fin,
        statut_seance, handler_id, intervenant_id
      )
      VALUES (?, ?, ?, ?, ?, ?, 'planifiee', ?, ?)
    `,
    [
      "Séance future hors nouvelle plage",
      "Étudiant calendrier",
      "Mathématiques",
      "2099-01-05",
      "22:00",
      "22:30",
      handlerId,
      handlerId,
    ]
  );
  await executerSql(
    `
      INSERT INTO disponibilites (
        handler_id, intervenant_id, type, date, jour_semaine,
        heure_debut, heure_fin, actif, cree_par
      )
      VALUES (?, ?, 'ponctuelle', ?, NULL, ?, ?, 1, ?)
    `,
    [handlerId, handlerId, "2099-01-05", "22:00", "22:30", handlerId]
  );

  const avertissementFutur = await listerAvertissementsPlageCalendrierFuture({
    handlerId,
    plageCalendrierAvant: {
      calendar_start_time: "08:00",
      calendar_end_time: "23:30",
    },
    plageCalendrier: {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
    },
    dateReference: "2099-01-05",
    heureReference: "21:00",
  });
  assert.equal(
    avertissementFutur.total,
    2,
    "Seuls les elements encore a venir et nouvellement hors plage doivent avertir."
  );

  const avertissementDejaTermine = await listerAvertissementsPlageCalendrierFuture({
    handlerId,
    plageCalendrierAvant: {
      calendar_start_time: "08:00",
      calendar_end_time: "23:30",
    },
    plageCalendrier: {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
    },
    dateReference: "2099-01-05",
    heureReference: "23:00",
  });
  assert.equal(
    avertissementDejaTermine.total,
    0,
    "Un creneau deja termine aujourd'hui ne doit pas etre annonce comme futur."
  );

  const avertissementDejaHorsPlage = await listerAvertissementsPlageCalendrierFuture({
    handlerId,
    plageCalendrierAvant: {
      calendar_start_time: "08:00",
      calendar_end_time: "21:30",
    },
    plageCalendrier: {
      calendar_start_time: "08:30",
      calendar_end_time: "21:00",
    },
    dateReference: "2099-01-05",
    heureReference: "21:00",
  });
  assert.equal(
    avertissementDejaHorsPlage.total,
    0,
    "Un element deja hors de l'ancienne plage ne doit pas produire un nouvel avertissement."
  );

  await fermerBaseDeDonnees();
  return { handlerId, professeurId };
}

async function connecter(client, email, motDePasse, libelle) {
  const reponse = await client.request("POST", "/api/auth/login", {
    username: email,
    mot_de_passe: motDePasse,
  });
  assertStatus(reponse, 200, `${libelle} connexion`);
  assert.ok(client.csrfToken, `${libelle} doit recevoir un jeton CSRF.`);
}

function lireLigneBase(sql, params = []) {
  return new Promise((resolve, reject) => {
    const base = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (ouvertureErreur) => {
      if (ouvertureErreur) {
        reject(ouvertureErreur);
        return;
      }
      base.get(sql, params, (erreur, ligne) => {
        base.close((fermetureErreur) => {
          if (erreur) {
            reject(erreur);
          } else if (fermetureErreur) {
            reject(fermetureErreur);
          } else {
            resolve(ligne);
          }
        });
      });
    });
  });
}

async function run() {
  let serveur = null;
  let stderr = "";
  let tokenActuel = "";
  let handlerId = null;
  let professeurId = null;

  try {
    ({ handlerId, professeurId } = await preparerBase());
    const valeursParDefaut = await lireLigneBase(
      `
        SELECT calendar_start_time, calendar_end_time
        FROM utilisateurs
        WHERE id = ?
      `,
      [handlerId]
    );
    assert.deepEqual(
      valeursParDefaut,
      { calendar_start_time: "08:00", calendar_end_time: "23:30" },
      "La migration doit donner aux Handler existants la plage historique par defaut."
    );
    const valeursParDefautProfesseur = await lireLigneBase(
      `
        SELECT calendar_start_time, calendar_end_time
        FROM utilisateurs
        WHERE id = ?
      `,
      [professeurId]
    );
    assert.deepEqual(
      valeursParDefautProfesseur,
      { calendar_start_time: "08:00", calendar_end_time: "23:30" },
      "Les colonnes migrees doivent etre renseignees sans intervention manuelle."
    );
    const port = await obtenirPortLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    serveur = spawn("node", ["app.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATABASE_PATH: databasePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serveur.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    await attendreServeur(baseUrl);

    const handler = new SessionClient(baseUrl);
    const professeur = new SessionClient(baseUrl);
    await connecter(handler, "handler-reglages@example.test", "Handler!Reglages2026", "Handler");
    await connecter(professeur, "professeur-reglages@example.test", "Professeur!Reglages2026", "Professeur");

    let reponse = await handler.request("GET", "/api/settings");
    assertStatus(reponse, 200, "lecture reglages Handler");
    assert.deepEqual(reponse.json?.reglages?.calendrier, {
      reference_timezone: "Europe/Paris",
      calendar_start_time: "08:00",
      calendar_end_time: "23:30",
      slot_min_time: "08:00:00",
      slot_max_time: "23:30:00",
      slot_duration_minutes: 30,
      modifiable: true,
    });
    assert.equal(reponse.json?.reglages?.calendrier_public?.jeton_configure, false);
    assert.equal(reponse.json?.reglages?.calendrier_public?.lien_public, null);
    assert.equal(reponse.json?.reglages?.calendrier_public?.public_calendar_timezone, "GMT+1");
    assert.equal(reponse.json?.reglages?.timezone, undefined);

    reponse = await professeur.request("GET", "/api/settings");
    assertStatus(reponse, 200, "lecture reglages Professeur");
    assert.deepEqual(
      reponse.json?.reglages?.calendrier,
      {
        reference_timezone: "Europe/Paris",
        calendar_start_time: "08:00",
        calendar_end_time: "23:30",
        slot_min_time: "08:00:00",
        slot_max_time: "23:30:00",
        slot_duration_minutes: 30,
        modifiable: false,
      },
      "Le Professeur doit lire la plage de son Handler, pas ses preferences individuelles."
    );
    assert.equal(reponse.json?.reglages?.calendrier_public?.disponible, false);

    reponse = await professeur.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
    });
    assertStatus(reponse, 403, "modification calendrier refusee au Professeur");

    reponse = await professeur.request("POST", "/api/settings/public-calendar/regenerate");
    assertStatus(reponse, 403, "generation publique refusee au Professeur");

    reponse = await professeur.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+1",
    });
    assertStatus(reponse, 403, "fuseau public refuse au Professeur");

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
    });
    assertStatus(reponse, 409, "avertissement avant reduction de plage Handler");
    assert.equal(reponse.json?.code, "CALENDAR_RANGE_DATA_WARNING");
    assert.ok(
      Number(reponse.json?.avertissement?.total) >= 2,
      "La reponse doit comptabiliser la seance et la disponibilite futures hors plage."
    );
    assert.ok(
      Number(reponse.json?.avertissement?.seances_futures?.total) >= 1,
      "Les seances futures hors plage doivent etre signalees."
    );
    assert.ok(
      Number(reponse.json?.avertissement?.disponibilites_futures?.total) >= 1,
      "Les disponibilites futures hors plage doivent etre signalees."
    );

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
      confirm_out_of_range: true,
    });
    assertStatus(reponse, 200, "mise a jour calendrier Handler apres confirmation");
    assert.deepEqual(reponse.json?.reglages?.calendrier, {
      reference_timezone: "Europe/Paris",
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
      slot_min_time: "08:30:00",
      slot_max_time: "21:30:00",
      slot_duration_minutes: 30,
      modifiable: true,
    });

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "UTC+1",
    });
    assertStatus(reponse, 400, "rejet fuseau public invalide");

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      timezone: "GMT+2",
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
    });
    assertStatus(
      reponse,
      400,
      "le fuseau public ne doit pas être mélangé aux réglages horaires centraux"
    );

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+2",
    });
    assertStatus(reponse, 200, "mise a jour du fuseau public separée");
    assert.equal(
      reponse.json?.reglages?.calendrier_public?.public_calendar_timezone,
      "GMT+2"
    );
    assert.equal(
      reponse.json?.reglages?.calendrier_public?.public_calendar_offset_minutes,
      120
    );
    assert.deepEqual(reponse.json?.reglages?.calendrier, {
      reference_timezone: "Europe/Paris",
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
      slot_min_time: "08:30:00",
      slot_max_time: "21:30:00",
      slot_duration_minutes: 30,
      modifiable: true,
    });

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:15",
      calendar_end_time: "21:30",
    });
    assertStatus(reponse, 400, "rejet horaire hors creneau de 30 minutes");

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "01:00",
      calendar_end_time: "04:00",
      confirm_out_of_range: true,
    });
    assertStatus(reponse, 200, "plage ciblee pour test DST");

    reponse = await handler.request("POST", "/api/seances", {
      etudiant: "Eleve DST",
      parent: "",
      matiere: "Maths",
      compte: "DST",
      est_essai: false,
      date: "2026-03-29",
      heure_debut: "02:00",
      duree_minutes: 60,
      statut_seance: "planifiee",
      description: "Creation dans une heure sautee",
    });
    assertStatus(reponse, 400, "seance dans une heure DST inexistante refusee");
    assert.match(
      String(reponse.json?.message || reponse.text),
      /n'existe pas/i,
      "La seance doit signaler une heure civile inexistante."
    );

    reponse = await professeur.request("POST", "/api/indisponibilites", {
      date: "2026-03-29",
      heure_debut: "02:00",
      heure_fin: "02:30",
      jour_complet: false,
    });
    assertStatus(reponse, 400, "indisponibilite dans une heure DST inexistante refusee");
    assert.match(
      String(reponse.json?.message || reponse.text),
      /n'existe pas/i,
      "L'indisponibilite doit signaler une heure civile inexistante."
    );

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:30",
      calendar_end_time: "21:30",
      confirm_out_of_range: true,
    });
    assertStatus(reponse, 200, "retour a la plage des assertions suivantes");

    reponse = await professeur.request("GET", "/api/settings");
    assertStatus(reponse, 200, "relecture reglages Professeur apres modification Handler");
    assert.deepEqual(
      reponse.json?.reglages?.calendrier,
      {
        reference_timezone: "Europe/Paris",
        calendar_start_time: "08:30",
        calendar_end_time: "21:30",
        slot_min_time: "08:30:00",
        slot_max_time: "21:30:00",
        slot_duration_minutes: 30,
        modifiable: false,
      },
      "Le Professeur doit heriter la modification du Handler sans configuration locale."
    );

    const handlerReconnecte = new SessionClient(baseUrl);
    await connecter(
      handlerReconnecte,
      "handler-reglages@example.test",
      "Handler!Reglages2026",
      "Handler reconnecte"
    );
    reponse = await handlerReconnecte.request("GET", "/api/settings");
    assertStatus(reponse, 200, "persistance reglages apres reconnexion");
    assert.equal(reponse.json?.reglages?.calendrier?.calendar_start_time, "08:30");
    assert.equal(reponse.json?.reglages?.calendrier?.calendar_end_time, "21:30");

    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:00",
      calendar_end_time: "00:00",
    });
    assertStatus(reponse, 400, "00:00 est refuse comme fin de calendrier centrale");

    reponse = await professeur.request("POST", "/api/indisponibilites", {
      date: "2026-09-10",
      heure_debut: "20:30",
      heure_fin: "21:00",
      jour_complet: false,
    });
    assertStatus(reponse, 201, "indisponibilite dans la plage centrale");
    assert.equal(
      reponse.json?.indisponibilite?.heure_fin,
      "21:00"
    );

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      actif: true,
      public_calendar_timezone: "GMT+2",
    });
    assertStatus(reponse, 200, "enregistrement du premier lien public");
    const lienInitial = String(reponse.json?.reglages?.calendrier_public?.lien_public || "");
    tokenActuel = lienInitial.split("/").filter(Boolean).at(-1) || "";
    assert.match(tokenActuel, /^[A-Za-z0-9_-]{32,160}$/);
    assert.equal(reponse.json?.reglages?.calendrier_public?.actif, true);

    reponse = await handler.request("GET", "/api/settings");
    assertStatus(reponse, 200, "relecture du même lien public");
    assert.equal(
      reponse.json?.reglages?.calendrier_public?.lien_public,
      lienInitial,
      "Le Handler peut copier son lien stable après rechargement."
    );

    reponse = await fetch(`${baseUrl}/api/reservation-public/${tokenActuel}?week_start=2026-09-07`);
    assert.equal(reponse.status, 200, "le nouveau lien public doit fonctionner");
    const corpsPublic = await reponse.text();
    assert.ok(!/handler|intervenant|etudiant|email|token|"id"/i.test(corpsPublic));

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", { actif: false });
    assertStatus(reponse, 200, "desactivation calendrier public");
    assert.equal(
      reponse.json?.reglages?.calendrier_public?.lien_public,
      lienInitial,
      "Désactiver conserve le lien unique."
    );
    reponse = await fetch(`${baseUrl}/api/reservation-public/${tokenActuel}?week_start=2026-09-07`);
    assert.equal(reponse.status, 404, "lien public desactive introuvable");

    reponse = await handler.request("POST", "/api/settings/public-calendar/regenerate");
    assertStatus(reponse, 200, "route historique réutilise le lien stable");
    const nouveauToken = String(reponse.json?.reglages?.calendrier_public?.lien_public || "")
      .split("/")
      .filter(Boolean)
      .at(-1) || "";
    assert.match(nouveauToken, /^[A-Za-z0-9_-]{32,160}$/);
    assert.equal(nouveauToken, tokenActuel, "Aucune action ne fait tourner le lien unique.");
    reponse = await fetch(`${baseUrl}/api/reservation-public/${nouveauToken}?week_start=2026-09-07`);
    assert.equal(reponse.status, 200, "lien réactivé fonctionnel");
    tokenActuel = nouveauToken;

    // Référence métier intégrée : une même disponibilité centrale 08:00–09:00
    // reste 08:00–09:00 pour le Handler et le Professeur, tandis que le lien
    // public passe successivement par les trois offsets fixes.
    reponse = await handler.request("PATCH", "/api/settings/calendar", {
      calendar_start_time: "08:00",
      calendar_end_time: "09:00",
      confirm_out_of_range: true,
    });
    assertStatus(reponse, 200, "plage centrale de référence 08:00–09:00");

    reponse = await handler.request("POST", "/api/disponibilites/regles", {
      type: "ponctuelle",
      date: "2026-09-07",
      heure_debut: "08:00",
      heure_fin: "09:00",
    });
    assertStatus(reponse, 403, "Handler cannot create retired availability rule");
    assert.equal(reponse.json?.code, "HANDLER_UNAVAILABILITY_FORBIDDEN");

    reponse = await handler.request("GET", "/api/settings");
    assertStatus(reponse, 200, "relecture Handler de la référence centrale");
    assert.equal(reponse.json?.reglages?.calendrier?.calendar_start_time, "08:00");
    assert.equal(reponse.json?.reglages?.calendrier?.calendar_end_time, "09:00");

    reponse = await professeur.request("GET", "/api/settings");
    assertStatus(reponse, 200, "relecture Professeur de la référence centrale");
    assert.equal(
      reponse.json?.reglages?.calendrier?.calendar_start_time,
      "08:00",
      "Le Professeur doit conserver l'heure centrale, quel que soit l'offset public."
    );
    assert.equal(reponse.json?.reglages?.calendrier?.calendar_end_time, "09:00");

    const verifierProjectionPubliqueReference = async ({ offset, debut, fin }) => {
      const reponsePublique = await fetch(
        `${baseUrl}/api/reservation-public/${tokenActuel}?week_start=2026-09-07`
      );
      assert.equal(reponsePublique.status, 200, `lecture publique ${offset}`);
      const donneesPubliques = await reponsePublique.json();
      assert.equal(donneesPubliques.config?.public_calendar_timezone, offset);
      assert.equal(donneesPubliques.config?.calendar_start_time, debut);
      assert.equal(donneesPubliques.config?.calendar_end_time, fin);
      assert.ok(
        planningContientCreneau(donneesPubliques.planning, {
          date: "2026-09-07",
          heureDebut: debut,
          heureFin: fin,
          etat: "disponible",
        }),
        `La disponibilité centrale 08:00–09:00 doit être ${debut}–${fin} en ${offset}.`
      );
    };

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+2",
    });
    assertStatus(reponse, 200, "offset public GMT+2 de référence");
    assert.equal(
      reponse.json?.reglages?.calendrier_public?.lien_public,
      lienInitial,
      "Modifier le décalage ne doit pas créer un autre lien."
    );
    await verifierProjectionPubliqueReference({ offset: "GMT+2", debut: "10:00", fin: "11:00" });

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+1",
    });
    assertStatus(reponse, 200, "offset public GMT+1 de référence");
    await verifierProjectionPubliqueReference({ offset: "GMT+1", debut: "09:00", fin: "10:00" });

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+3",
    });
    assertStatus(reponse, 200, "offset public GMT+3 de référence");
    await verifierProjectionPubliqueReference({ offset: "GMT+3", debut: "11:00", fin: "12:00" });

    reponse = await handler.request("PATCH", "/api/settings/public-calendar", {
      public_calendar_timezone: "GMT+4",
    });
    assertStatus(reponse, 200, "offset public GMT+4 de référence");
    await verifierProjectionPubliqueReference({ offset: "GMT+4", debut: "12:00", fin: "13:00" });

    reponse = await handler.request("GET", "/api/historique?limit=100");
    assertStatus(reponse, 200, "historique des reglages");
    assert.ok(!reponse.text.includes(tokenActuel), "Le jeton brut ne doit jamais etre journalise.");

    await arreterServeur(serveur);
    serveur = null;
    const ligne = await lireLigneBase(
      `
        SELECT
          timezone,
          public_calendar_timezone,
          calendar_start_time,
          calendar_end_time,
          token_calendrier_public_hash
        FROM utilisateurs
        WHERE id = ?
      `,
      [handlerId]
    );
    assert.equal(
      ligne?.timezone,
      "Africa/Casablanca",
      "Le réglage public ne doit jamais réécrire la préférence timezone legacy."
    );
    assert.equal(ligne?.public_calendar_timezone, "GMT+4");
    assert.equal(ligne?.calendar_start_time, "08:00");
    assert.equal(ligne?.calendar_end_time, "09:00");
    assert.match(String(ligne?.token_calendrier_public_hash || ""), /^[a-f0-9]{64}$/);
    assert.notEqual(ligne?.token_calendrier_public_hash, tokenActuel);

    console.log("workspace-settings test: PASS");
  } catch (error) {
    console.error("workspace-settings test: FAIL");
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
    supprimerFichiersTest();
  }
}

run();
