const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const port = 3321;
const baseUrl = `http://127.0.0.1:${port}`;
const databasePath = path.join(root, "database", ".smoke-test.db");
const tinyPngPath = path.join(root, "database", ".smoke-test.png");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanupPath(target) {
  try {
    fs.rmSync(target, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

class SessionClient {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = "";
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  storeCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];

    for (const entry of setCookies) {
      const firstPart = String(entry || "").split(";")[0];
      const separatorIndex = firstPart.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const name = firstPart.slice(0, separatorIndex).trim();
      const value = firstPart.slice(separatorIndex + 1).trim();
      this.cookies.set(name, value);
    }

    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken) {
      this.csrfToken = csrfToken;
    }
  }

  async request(method, pathname, body = undefined, extraHeaders = {}) {
    const headers = { "x-requested-with": "XMLHttpRequest", ...extraHeaders };
    const cookie = this.cookieHeader();

    if (cookie) {
      headers.cookie = cookie;
    }

    let payload = body;

    if (body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    if (body instanceof URLSearchParams) {
      headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      payload = body;
    }

    const response = await fetch(baseUrl + pathname, {
      method,
      headers,
      body: payload,
      redirect: "manual",
    });

    this.storeCookies(response);

    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch (error) {
      json = null;
    }

    return {
      status: response.status,
      headers: response.headers,
      text,
      json,
    };
  }
}

async function waitForServer() {
  for (let index = 0; index < 80; index += 1) {
    await sleep(500);

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server still starting.
    }
  }

  throw new Error("Le serveur de test n'a pas demarre a temps.");
}

async function executerInitialisationBaseIsolee() {
  const script = `
const { initialiserBaseDeDonnees, fermerBaseDeDonnees } = require("./models/db");

(async () => {
  try {
    await initialiserBaseDeDonnees();
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(0);
  } catch (error) {
    console.error(error);
    await fermerBaseDeDonnees().catch(() => {});
    process.exit(1);
  }
})();
`;

  await new Promise((resolve, reject) => {
    const processus = spawn("node", ["-e", script], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        NODE_ENV: "development",
        SEED_DEMO_DATA: "",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let erreur = "";

    processus.stderr.on("data", (chunk) => {
      erreur += chunk.toString();
    });

    processus.on("error", reject);
    processus.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Initialisation isolee de la base echouee (${code}) : ${erreur.trim()}`
        )
      );
    });
  });
}

async function run() {
  cleanupPath(databasePath);
  cleanupPath(`${databasePath}-wal`);
  cleanupPath(`${databasePath}-shm`);
  cleanupPath(tinyPngPath);

  const server = spawn("node", ["app.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      NODE_ENV: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();
    console.log("OK health");

    const admin = new SessionClient();
    const user = new SessionClient();
    const publicReservation = new SessionClient();

    let response = await admin.request(
      "POST",
      "/",
      new URLSearchParams({
        username: "Hossam",
        mot_de_passe: "123456",
      })
    );
    assert(response.status === 303, `POST / attendu=303 recu=${response.status}`);
    response = await admin.request("GET", "/api/auth/me");
    assert(response.status === 200, `auth/me admin attendu=200 recu=${response.status}`);
    console.log("OK fallback login form");

    response = await admin.request(
      "PATCH",
      "/api/auth/password",
      {
        mot_de_passe_actuel: "123456",
        nouveau_mot_de_passe: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `password admin attendu=200 recu=${response.status}`);
    console.log("OK password admin");

    response = await user.request("POST", "/api/auth/login", {
      username: "ami@test.com",
      mot_de_passe: "123456",
    });
    assert(response.status === 200, `login alias Abdo attendu=200 recu=${response.status}`);
    response = await user.request(
      "PATCH",
      "/api/auth/password",
      {
        mot_de_passe_actuel: "123456",
        nouveau_mot_de_passe: "User!Test1234",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 200, `password user attendu=200 recu=${response.status}`);
    console.log("OK alias Abdo + password user");

    response = await admin.request("GET", "/api/admin");
    assert(response.status === 200, `admin attendu=200 recu=${response.status}`);
    const abdo = response.json.administration.comptes.find(
      (compte) => compte.email === "abdo@test.com"
    );
    assert(abdo, "Le compte Abdo n'a pas ete trouve dans l'administration.");
    response = await admin.request(
      "PATCH",
      "/api/admin/monetisation-access",
      {
        utilisateur_id: abdo.id,
        peut_voir_monetisation: true,
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(
      response.status === 200,
      `monetisation access attendu=200 recu=${response.status}`
    );

    response = await admin.request(
      "PATCH",
      "/api/admin/unavailability-access",
      {
        utilisateur_id: abdo.id,
        peut_voir_indisponibilites: false,
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `disable indispo attendu=200 recu=${response.status}`);
    response = await user.request("GET", "/api/indisponibilites");
    assert(response.status === 403, `indispo 403 attendu recu=${response.status}`);
    response = await admin.request(
      "PATCH",
      "/api/admin/unavailability-access",
      {
        utilisateur_id: abdo.id,
        peut_voir_indisponibilites: true,
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `enable indispo attendu=200 recu=${response.status}`);
    response = await admin.request(
      "POST",
      "/api/indisponibilites",
      {
        date: "2026-04-08",
        heure_debut: "12:00",
        heure_fin: "13:00",
        raison: "Smoke test",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 201, `create indispo attendu=201 recu=${response.status}`);
    console.log("OK indisponibilites permissions");

    response = await admin.request(
      "POST",
      "/api/seances",
      {
        etudiant: "Client prive",
        parent: "",
        matiere: "Python",
        compte: "Hossam",
        est_essai: false,
        date: "2026-04-09",
        heure_debut: "09:00",
        duree_minutes: 60,
        statut_seance: "faite",
        description: "Admin private",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 201, `seance Hossam attendu=201 recu=${response.status}`);
    const privateSeanceId = Number(response.json.seance.id);
    response = await user.request("GET", "/api/seances/options");
    const comptesDisponibles = response.json.options.comptes.map((compte) =>
      typeof compte === "string" ? compte : compte.valeur
    );
    assert(
      !comptesDisponibles.includes("Hossam"),
      "Le compte Hossam ne devrait pas etre visible."
    );
    response = await user.request("GET", "/api/seances");
    const maskedSeance = response.json.seances.find(
      (seance) => Number(seance.id) === privateSeanceId
    );
    assert(
      maskedSeance && maskedSeance.est_masquee_pour_confidentialite,
      "La seance Hossam devrait etre masquee."
    );
    console.log("OK Hossam privacy");

    response = await user.request(
      "POST",
      "/api/seances",
      {
        etudiant: "Sara",
        parent: "Parent A",
        matiere: "Maths",
        compte: "Abdo",
        est_essai: false,
        date: "2026-04-10",
        heure_debut: "10:00",
        duree_minutes: 60,
        statut_seance: "faite",
        description: "Facturable",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 201, `seance facturable attendu=201 recu=${response.status}`);
    const billableSeanceId = Number(response.json.seance.id);

    response = await user.request(
      "POST",
      "/api/seances",
      {
        etudiant: "Yanis",
        parent: "",
        matiere: "Physique chimie",
        compte: "Yassine",
        est_essai: true,
        date: "2026-04-11",
        heure_debut: "11:00",
        duree_minutes: 60,
        statut_seance: "faite",
        description: "Essai gratuit",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 201, `seance gratuite attendu=201 recu=${response.status}`);

    response = await user.request(
      "POST",
      "/api/seances",
      {
        etudiant: "Nadia",
        parent: "",
        matiere: "Maths",
        compte: "Abdo",
        est_essai: false,
        date: "2026-06-10",
        heure_debut: "10:00",
        duree_minutes: 60,
        statut_seance: "planifiee",
        description: "Blocage futur pour lien public",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 201, `blocage public compte attendu=201 recu=${response.status}`);
    response = await user.request(
      "POST",
      "/api/seances",
      {
        etudiant: "Omar",
        parent: "",
        matiere: "Python",
        compte: "Yassine",
        est_essai: false,
        date: "2026-06-11",
        heure_debut: "11:00",
        duree_minutes: 60,
        statut_seance: "planifiee",
        description: "Autre compte futur",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 201, `blocage public autre compte attendu=201 recu=${response.status}`);

    response = await publicReservation.request("GET", "/reservation");
    assert(response.status === 200, `page reservation attendu=200 recu=${response.status}`);
    response = await publicReservation.request(
      "GET",
      "/api/reservation-public?week_start=2026-06-08"
    );
    assert(response.status === 200, `planning public attendu=200 recu=${response.status}`);
    assert(
      response.json.planning.blocages.some(
        (blocage) =>
          blocage.date === "2026-06-10" &&
          blocage.heure_debut === "11:00" &&
          blocage.heure_fin === "12:00"
      ),
      "Le creneau reserve a 10:00 Maroc doit apparaitre a 11:00 France en ete."
    );
    assert(
      response.json.planning.blocages.some(
        (blocage) =>
          blocage.date === "2026-06-11" &&
          blocage.heure_debut === "12:00" &&
          blocage.heure_fin === "13:00"
      ),
      "Les autres seances du calendrier central doivent aussi bloquer la page publique."
    );
    response = await publicReservation.request("POST", "/api/reservation-public/reserver", {
      date: "2026-06-10",
      heure_debut: "13:00",
      duree_minutes: 60,
      etudiant: "Nora Test",
      parent: "Parent Nora",
      matiere: "Maths",
    });
    assert(response.status === 410, `reservation desactivee attendu=410 recu=${response.status}`);
    response = await user.request("GET", "/api/seances");
    assert(
      !response.json.seances.some(
        (seance) => seance.etudiant === "Nora Test" || seance.etudiant === "Winter France Test"
      ),
      "La page publique ne doit plus creer de seance."
    );
    console.log("OK calendrier public");

    response = await admin.request("GET", "/api/admin");
    assert(response.status === 200, `admin catalogue attendu=200 recu=${response.status}`);
    const matierePhysique = response.json.administration.catalogue.matieres.find(
      (matiere) => matiere.valeur === "Physique chimie"
    );
    const compteYassine = response.json.administration.catalogue.comptes.find(
      (compte) => compte.valeur === "Yassine"
    );
    assert(matierePhysique, "La matiere Physique chimie devrait exister.");
    assert(compteYassine, "Le compte Yassine devrait exister.");

    response = await admin.request(
      "DELETE",
      `/api/admin/catalogue-items/${matierePhysique.id}`,
      {
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `delete matiere utilisee attendu=200 recu=${response.status}`);
    response = await admin.request(
      "DELETE",
      `/api/admin/catalogue-items/${compteYassine.id}`,
      {
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `delete compte utilise attendu=200 recu=${response.status}`);

    response = await user.request("GET", "/api/seances/options");
    const matieresApresSuppression = response.json.options.matieres.map((matiere) =>
      typeof matiere === "string" ? matiere : matiere.valeur
    );
    const comptesApresSuppression = response.json.options.comptes.map((compte) =>
      typeof compte === "string" ? compte : compte.valeur
    );
    assert(
      !matieresApresSuppression.includes("Physique chimie"),
      "La matiere supprimee ne devrait plus etre proposee pour les nouvelles seances."
    );
    assert(
      !comptesApresSuppression.includes("Yassine"),
      "Le compte supprime ne devrait plus etre propose pour les nouvelles seances."
    );

    await executerInitialisationBaseIsolee();
    response = await user.request("GET", "/api/seances/options");
    const matieresApresReinitialisation = response.json.options.matieres.map((matiere) =>
      typeof matiere === "string" ? matiere : matiere.valeur
    );
    const comptesApresReinitialisation = response.json.options.comptes.map((compte) =>
      typeof compte === "string" ? compte : compte.valeur
    );
    assert(
      !matieresApresReinitialisation.includes("Physique chimie"),
      "La matiere supprimee ne doit pas revenir apres reinitialisation."
    );
    assert(
      !comptesApresReinitialisation.includes("Yassine"),
      "Le compte supprime ne doit pas revenir apres reinitialisation."
    );

    response = await user.request("GET", "/api/seances");
    const seanceLegacyCatalogue = response.json.seances.find(
      (seance) => seance.etudiant === "Yanis"
    );
    assert(
      seanceLegacyCatalogue &&
        seanceLegacyCatalogue.matiere === "Physique chimie" &&
        seanceLegacyCatalogue.compte === "Yassine",
      "La suppression catalogue ne doit pas modifier les anciennes seances."
    );
    response = await user.request(
      "PUT",
      `/api/seances/${seanceLegacyCatalogue.id}`,
      {
        etudiant: "Yanis",
        parent: "",
        matiere: "Physique chimie",
        compte: "Yassine",
        est_essai: true,
        date: "2026-04-11",
        heure_debut: "11:00",
        duree_minutes: 60,
        statut_seance: "faite",
        description: "Essai gratuit modifie",
      },
      { "x-csrf-token": user.csrfToken }
    );
    assert(response.status === 200, `edition legacy catalogue attendu=200 recu=${response.status}`);
    assert(
      response.json.seance.matiere === "Physique chimie" &&
        response.json.seance.compte === "Yassine",
      "Une ancienne seance doit garder sa matiere et son compte supprimes du catalogue."
    );

    response = await admin.request("GET", "/api/admin");
    const matierePhysiqueSupprimee =
      response.json.administration.catalogue.matieres_supprimees.find(
        (matiere) => matiere.valeur === "Physique chimie"
      );
    const compteYassineSupprime =
      response.json.administration.catalogue.comptes_supprimes.find(
        (compte) => compte.valeur === "Yassine"
      );
    assert(matierePhysiqueSupprimee, "La matiere supprimee devrait etre restaurable.");
    assert(compteYassineSupprime, "Le compte supprime devrait etre restaurable.");

    response = await admin.request(
      "POST",
      `/api/admin/catalogue-items/${matierePhysiqueSupprimee.id}/restore`,
      {
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `restore matiere attendu=200 recu=${response.status}`);
    response = await admin.request(
      "POST",
      `/api/admin/catalogue-items/${compteYassineSupprime.id}/restore`,
      {
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `restore compte attendu=200 recu=${response.status}`);
    response = await user.request("GET", "/api/seances/options");
    const matieresApresRestauration = response.json.options.matieres.map((matiere) =>
      typeof matiere === "string" ? matiere : matiere.valeur
    );
    const comptesApresRestauration = response.json.options.comptes.map((compte) =>
      typeof compte === "string" ? compte : compte.valeur
    );
    assert(
      matieresApresRestauration.includes("Physique chimie"),
      "La matiere restauree devrait revenir dans les options."
    );
    assert(
      comptesApresRestauration.includes("Yassine"),
      "Le compte restaure devrait revenir dans les options."
    );
    console.log("OK suppression catalogue conserve seances");

    response = await user.request("GET", "/api/monetisation?mois=2026-04");
    assert(response.status === 200, `monetisation attendu=200 recu=${response.status}`);
    assert(
      !response.json.monetisation.ordre_comptes.includes("Hossam"),
      "Hossam ne doit pas apparaitre dans la monetisation user."
    );
    assert(
      Number(response.json.monetisation.periode.nombre_seances_essai_faites) >= 1,
      "La seance gratuite devrait etre comptee."
    );
    response = await admin.request("GET", "/api/monetisation?mode=global");
    assert(response.status === 200, `monetisation Hossam attendu=200 recu=${response.status}`);
    assert(
      response.json.monetisation.ordre_comptes.includes("Hossam"),
      "Hossam doit voir son propre compte dans la monetisation."
    );
    response = await user.request(
      "GET",
      "/api/monetisation/releve?mode=annual&annee=2026&compte=Abdo&compte=Yassine"
    );
    assert(response.status === 200, `releve pdf attendu=200 recu=${response.status}`);
    assert(
      (response.headers.get("content-type") || "").includes("application/pdf"),
      "Le relevé PDF devrait etre renvoye avec le bon content-type."
    );
    assert(
      (response.headers.get("content-disposition") || "").includes(".pdf"),
      "Le relevé PDF devrait proposer un nom de fichier .pdf."
    );
    console.log("OK monetisation");

    response = await admin.request(
      "POST",
      "/api/admin/reset-password",
      {
        utilisateur_id: abdo.id,
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `reset password attendu=200 recu=${response.status}`);
    const abdoResetPassword = String(response.json.mot_de_passe_temporaire || "");
    const tempSession = new SessionClient();
    response = await tempSession.request("POST", "/api/auth/login", {
      username: "Abdo",
      mot_de_passe: abdoResetPassword,
    });
    assert(response.status === 200, `login reset Abdo attendu=200 recu=${response.status}`);
    response = await tempSession.request("GET", "/api/seances");
    assert(
      response.status === 403,
      `compte temporaire attendu=403 recu=${response.status}`
    );
    console.log("OK temp password flow");
    response = await admin.request(
      "POST",
      "/api/admin/sessions/revoke-user",
      {
        utilisateur_id: abdo.id,
        mot_de_passe_actuel: "Admin!Test1234",
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(response.status === 200, `revoke sessions attendu=200 recu=${response.status}`);
    response = await user.request("GET", "/api/auth/me");
    assert(
      response.status === 401,
      `session Abdo invalidee attendu=401 recu=${response.status}`
    );
    console.log("OK session revoke");

    console.log("Smoke tests passed.");
  } catch (error) {
    console.error("Smoke tests failed.");
    console.error(error.message || error);

    if (stderr.trim()) {
      console.error(stderr.trim());
    }

    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => {
      let resolved = false;

      function finish() {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve();
      }

      server.once("exit", finish);
      server.kill("SIGKILL");
      setTimeout(finish, 1000);
    });
    cleanupPath(databasePath);
    cleanupPath(`${databasePath}-wal`);
    cleanupPath(`${databasePath}-shm`);
    cleanupPath(tinyPngPath);
  }
}

run();
