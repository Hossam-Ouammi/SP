const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const puppeteer = require("puppeteer");

const root = path.join(__dirname, "..");
// Keep browser-audit state out of the working tree by default.  A CI job can
// set E2E_BROWSER_AUDIT_DIR when it deliberately wants to retain artifacts.
const auditRuntimeDir = process.env.E2E_BROWSER_AUDIT_DIR
  ? path.resolve(process.env.E2E_BROWSER_AUDIT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "gestion-seances-e2e-"));
const databasePath = path.join(auditRuntimeDir, "e2e-browser-audit.db");
const artifactsDir = path.join(auditRuntimeDir, "artifacts");
const devEmailOutboxDir = path.join(auditRuntimeDir, "dev-emails");
let port = 0;
let baseUrl = "";

// These values are deliberately confined to this disposable E2E database.
// They are passed as an explicit bootstrap environment; the application itself
// still ships without a default account or password.
const fixture = Object.freeze({
  admin: {
    nom: "Hossam E2E",
    email: "hossam.e2e@example.test",
    motDePasseInitial: "BootstrapAdminE2E!2026",
    motDePasseFinal: "Admin!E2E1234",
  },
  utilisateur: {
    nom: "Abdo E2E",
    email: "abdo.e2e@example.test",
    motDePasseInitial: "BootstrapUserE2E!2026",
    motDePasseFinal: "User!E2E1234",
  },
  matiere: "Maths E2E",
});

function libelleIntervenantMonetisation(intervenant) {
  const publicId = String(intervenant?.public_id || "").trim();
  const nom = String(intervenant?.nom || "").trim();
  return publicId ? `${publicId} — ${nom}` : nom;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lireEmailsBoiteSortieDeveloppement() {
  if (!fs.existsSync(devEmailOutboxDir)) {
    return [];
  }

  return fs
    .readdirSync(devEmailOutboxDir)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => {
      const chemin = path.join(devEmailOutboxDir, nom);
      return JSON.parse(fs.readFileSync(chemin, "utf8"));
    });
}

async function attendreEmailBoiteSortieDeveloppement(predicat, timeoutMs = 5000) {
  const limite = Date.now() + timeoutMs;

  while (Date.now() <= limite) {
    const email = lireEmailsBoiteSortieDeveloppement().find(predicat);
    if (email) {
      return email;
    }
    await sleep(50);
  }

  throw new Error("L'email de développement attendu n'a pas été déposé dans la boîte sortante isolée.");
}

async function obtenirPortLibre() {
  const net = require("net");
  const serveur = net.createServer();

  await new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", resolve);
  });

  const adresse = serveur.address();
  const portLibre = typeof adresse === "object" && adresse ? Number(adresse.port) : 0;
  await new Promise((resolve, reject) =>
    serveur.close((erreur) => (erreur ? reject(erreur) : resolve()))
  );

  if (!Number.isInteger(portLibre) || portLibre <= 0) {
    throw new Error("Impossible de réserver un port HTTP pour l'audit navigateur.");
  }

  return portLibre;
}

function cleanupPath(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class SessionClient {
  constructor(defaultHeaders = {}) {
    this.cookies = new Map();
    this.csrfToken = "";
    this.defaultHeaders = defaultHeaders;
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
    const headers = {
      ...this.defaultHeaders,
      ...extraHeaders,
    };
    const cookie = this.cookieHeader();

    if (cookie) {
      headers.cookie = cookie;
    }

    // Node's fetch does not synthesize the Origin header that browsers send
    // for unsafe same-origin requests. Keep this HTTP fixture faithful to a
    // real browser so the provenance middleware is exercised, not bypassed.
    if (
      !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase()) &&
      !headers.origin &&
      !headers.referer
    ) {
      headers.origin = baseUrl;
    }

    let payload = body;

    if (body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    if (body instanceof URLSearchParams) {
      headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    }

    const response = await fetch(baseUrl + pathname, {
      method,
      headers,
      body: payload,
      redirect: "manual",
    });

    this.storeCookies(response);

    const buffer = Buffer.from(await response.arrayBuffer());
    const text = buffer.toString("utf8");
    let json = null;

    try {
      json = JSON.parse(text);
    } catch (error) {
      json = null;
    }

    return {
      status: response.status,
      headers: response.headers,
      buffer,
      text,
      json,
    };
  }
}

async function waitForServer() {
  for (let index = 0; index < 80; index += 1) {
    await sleep(250);

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server still starting.
    }
  }

  throw new Error("Le serveur E2E n'a pas demarre a temps.");
}

function initialiserFixtureIsole(environnement) {
  return new Promise((resolve, reject) => {
    const processus = spawn(process.execPath, ["scripts/e2e-browser-audit-seed.js"], {
      cwd: root,
      env: environnement,
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
          `Initialisation du fixture navigateur E2E echouee (${code}) : ${erreur.trim()}`
        )
      );
    });
  });
}

async function initialiserDonnees() {
  const admin = new SessionClient();
  const user = new SessionClient();

  let response = await admin.request(
    "POST",
    "/",
    new URLSearchParams({
      username: fixture.admin.email,
      mot_de_passe: fixture.admin.motDePasseInitial,
    })
  );
  assert(response.status === 303, `login admin attendu=303 recu=${response.status}`);

  // The form endpoint deliberately redirects on both success and failure.
  // Verify the session explicitly so a missing bootstrap account is reported
  // at the real cause rather than later as a misleading 401 on password edit.
  response = await admin.request("GET", "/api/auth/me");
  assert(response.status === 200, `session admin attendue=200 recu=${response.status}`);

  response = await admin.request(
    "PATCH",
    "/api/auth/password",
    {
      mot_de_passe_actuel: fixture.admin.motDePasseInitial,
      nouveau_mot_de_passe: fixture.admin.motDePasseFinal,
    },
    { "x-csrf-token": admin.csrfToken }
  );
  assert(response.status === 200, `password admin attendu=200 recu=${response.status}`);

  response = await user.request("POST", "/api/auth/login", {
    username: fixture.utilisateur.email,
    mot_de_passe: fixture.utilisateur.motDePasseInitial,
  });
  assert(response.status === 200, `login user attendu=200 recu=${response.status}`);

  response = await user.request(
    "PATCH",
    "/api/auth/password",
    {
      mot_de_passe_actuel: fixture.utilisateur.motDePasseInitial,
      nouveau_mot_de_passe: fixture.utilisateur.motDePasseFinal,
    },
    { "x-csrf-token": user.csrfToken }
  );
  assert(response.status === 200, `password user attendu=200 recu=${response.status}`);

  response = await admin.request("GET", "/api/admin");
  const abdo = response.json?.administration?.comptes?.find(
    (compte) => compte.email === fixture.utilisateur.email
  );
  assert(abdo, "Le compte Abdo est introuvable dans l'administration.");

  response = await admin.request("GET", "/api/seances/options");
  const matiere =
    response.json?.options?.matieres?.find(
      (option) => String(option?.valeur || option) === fixture.matiere
    )?.valeur || fixture.matiere;
  const compteAbdo =
    response.json?.options?.comptes?.find(
      (compte) => String(compte?.valeur || compte) === fixture.utilisateur.nom
    )?.valeur || fixture.utilisateur.nom;
  const compteHossam =
    response.json?.options?.comptes?.find(
      (compte) => String(compte?.valeur || compte) === fixture.admin.nom
    )?.valeur || fixture.admin.nom;
  const intervenantAbdo = response.json?.options?.intervenants?.find(
    (intervenant) => Number(intervenant?.id) === Number(abdo.id)
  );
  const intervenantHossam = response.json?.options?.intervenants?.find(
    (intervenant) => intervenant?.nom === fixture.admin.nom
  );
  assert(intervenantAbdo, "Le professeur E2E doit etre disponible dans les options.");
  assert(intervenantHossam, "Le Handler E2E doit etre disponible dans les options.");

  const seancesFixtures = [
    {
      etudiant: "Desktop Avril",
      matiere,
      compte: compteAbdo,
      date: "2026-04-02",
      heure_debut: "10:00",
      duree_minutes: 60,
      statut_seance: "faite",
      est_essai: 0,
      intervenant_id: intervenantAbdo.id,
    },
    {
      etudiant: "Desktop Mars",
      matiere,
      compte: compteAbdo,
      date: "2026-03-12",
      heure_debut: "11:30",
      duree_minutes: 60,
      statut_seance: "faite",
      est_essai: 0,
      intervenant_id: intervenantAbdo.id,
    },
    {
      etudiant: "Client prive",
      matiere,
      compte: compteHossam,
      date: "2026-04-03",
      heure_debut: "12:00",
      duree_minutes: 60,
      statut_seance: "faite",
      est_essai: 0,
      intervenant_id: intervenantHossam.id,
    },
  ];

  for (const seance of seancesFixtures) {
    response = await admin.request(
      "POST",
      "/api/seances",
      {
        parent: "",
        description: "",
        ...seance,
      },
      { "x-csrf-token": admin.csrfToken }
    );
    assert(
      response.status === 201,
      `creation fixture ${seance.etudiant} attendu=201 recu=${response.status}`
    );
  }

  return {
    admin,
    user,
    comptesMonetisation: [fixture.utilisateur.nom, fixture.admin.nom],
    intervenantsMonetisation: [
      { id: Number(intervenantAbdo.id), nom: fixture.utilisateur.nom },
      { id: Number(intervenantHossam.id), nom: fixture.admin.nom },
    ],
  };
}

async function appliquerSessionPage(page, client) {
  const cookies = Array.from(client.cookies.entries()).map(([name, value]) => ({
    name,
    value,
    url: baseUrl,
    path: "/",
  }));

  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

async function attendreApplicationChargee(page) {
  await page.goto(`${baseUrl}/`, {
    waitUntil: "networkidle2",
  });
  await page.waitForFunction(() => {
    const app = document.getElementById("app-view");
    return app && !app.classList.contains("hidden");
  });
}

async function verifierParcoursConnexion(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#login-form");

  // A rejected login must not leave the primary button permanently disabled.
  // This used to prevent the user from correcting a typo without reloading.
  await page.type("#login-username", "identifiant-invalide-e2e");
  await page.type("#login-password", "MotDePasseInvalide!2026");
  await page.click("#login-button");
  await page.waitForFunction(() => {
    const erreur = document.getElementById("login-error");
    return erreur && !erreur.classList.contains("hidden") && erreur.textContent.trim();
  });
  const etatApresEchec = await page.$eval("#login-button", (bouton) => ({
    disabled: bouton.disabled,
    text: bouton.textContent.trim(),
  }));
  assert(!etatApresEchec.disabled, "Un échec de connexion doit laisser le bouton réutilisable.");
  assert(
    etatApresEchec.text === "Se connecter",
    "Le libellé du bouton doit être restauré après un échec de connexion."
  );
  await page.$eval("#login-form", (formulaire) => formulaire.reset());

  await page.type("#login-password", "MotDePasseDeControle!2026");
  await page.click("#login-show-password");
  const motDePasseVisible = await page.$eval("#login-password", (input) => input.type);
  assert(motDePasseVisible === "text", "L'affichage du mot de passe de connexion doit fonctionner.");

  await page.click("#show-account-request-button");
  await page.waitForFunction(() => {
    const formulaire = document.getElementById("account-request-form");
    return formulaire && !formulaire.classList.contains("hidden");
  });
  await page.click("#account-request-form [data-login-lifecycle-back]");
  await page.waitForFunction(() => {
    const formulaire = document.getElementById("login-form");
    return formulaire && !formulaire.classList.contains("hidden");
  });

  await page.click("#show-password-reset-button");
  await page.waitForFunction(() => {
    const formulaire = document.getElementById("password-reset-request-form");
    return formulaire && !formulaire.classList.contains("hidden");
  });
  await page.type("#password-reset-identifier", fixture.admin.email);
  const reponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/account-lifecycle/password-resets") &&
      response.status() === 202,
    { timeout: 15000 }
  );
  await page.click("#password-reset-submit-button");
  const reponse = await reponsePromise;
  assert(reponse, "La demande de récupération du mot de passe doit atteindre l'API.");
  await page.waitForFunction(() => {
    const notification = document.getElementById("password-reset-notification");
    return notification && !notification.classList.contains("hidden") && notification.textContent.trim();
  });

  const emailReinitialisation = await attendreEmailBoiteSortieDeveloppement(
    (email) => String(email?.to || "").toLowerCase() === fixture.admin.email.toLowerCase()
  );
  assert(
    /r[ée]initialisation/i.test(String(emailReinitialisation.subject || "")),
    "L'email de récupération doit avoir un objet explicite."
  );
  assert(
    /#reset-password\?token=[A-Za-z0-9_-]{43}/.test(String(emailReinitialisation.text || "")),
    "L'email de récupération doit contenir un lien de réinitialisation à jeton unique."
  );
}

async function verifierLienReinitialisationAvecSession(page, client) {
  // A one-time link can be opened from a browser which is already connected.
  // The random value has the exact URL-safe 43-character format generated by
  // the API; it is deliberately not submitted, so this check stays entirely
  // client-side and does not consume a real reset token.
  const token = crypto.randomBytes(32).toString("base64url");
  assert(token.length === 43, "Le jeton de regression doit avoir le format attendu.");

  await appliquerSessionPage(page, client);
  await page.goto(`${baseUrl}/#reset-password?token=${token}`, {
    waitUntil: "networkidle2",
  });

  await page.waitForFunction(() => {
    const loginView = document.getElementById("login-view");
    const appView = document.getElementById("app-view");
    const tokenForm = document.getElementById("account-token-form");

    return (
      loginView &&
      appView &&
      tokenForm &&
      !loginView.classList.contains("hidden") &&
      appView.classList.contains("hidden") &&
      !tokenForm.classList.contains("hidden")
    );
  });

  const affichage = await page.evaluate(() => ({
    connexionVisible: !document.getElementById("login-view")?.classList.contains("hidden"),
    applicationMasquee: document.getElementById("app-view")?.classList.contains("hidden"),
    formulaireJetonVisible: !document
      .getElementById("account-token-form")
      ?.classList.contains("hidden"),
    titre: document.getElementById("account-token-title")?.textContent?.trim() || "",
  }));

  assert(affichage.connexionVisible, "Le lien de reset doit afficher la racine connexion.");
  assert(affichage.applicationMasquee, "Le lien de reset doit masquer l'application connectee.");
  assert(affichage.formulaireJetonVisible, "Le formulaire de nouveau mot de passe doit etre visible.");
  assert(
    affichage.titre === "R\u00e9initialisez votre mot de passe",
    "Le lien de reset doit afficher le bon formulaire."
  );
}

async function ouvrirSection(page, section) {
  await page.waitForSelector(`[data-section-target="${section}"]`);
  await page.click(`[data-section-target="${section}"]`);
  await page.waitForFunction(
    (cible) => {
      const sectionElement = document.getElementById(`${cible}-section`);
      return sectionElement && !sectionElement.classList.contains("hidden");
    },
    {},
    section
  );
}

async function verifierNavigationInteractive(page, profil) {
  const sectionsVisibles = await page.$$eval(
    ".workspace-nav [data-section-target]",
    (boutons) =>
      boutons
        .filter((bouton) => {
          const style = window.getComputedStyle(bouton);
          return !bouton.classList.contains("hidden") && style.display !== "none";
        })
        .map((bouton) => String(bouton.dataset.sectionTarget || "").trim())
        .filter(Boolean)
  );

  assert(sectionsVisibles.length > 0, `Aucun menu visible pour ${profil}.`);

  for (const section of sectionsVisibles) {
    await ouvrirSection(page, section);
    const etat = await page.evaluate((cible) => {
      const bouton = document.querySelector(`[data-section-target="${cible}"]`);
      const panneau = document.getElementById(`${cible}-section`);
      return {
        boutonActif: bouton?.classList.contains("is-active") || false,
        panneauVisible: Boolean(panneau && !panneau.classList.contains("hidden")),
      };
    }, section);

    assert(
      etat.boutonActif && etat.panneauVisible,
      `Le menu ${section} doit ouvrir sa section pour ${profil}.`
    );
  }
}

async function verifierDashboardCentral(page, { estHandler, nomsRealisateurs }) {
  await ouvrirSection(page, "dashboard");
  await page.waitForSelector("#calendar .fc-timegrid");

  if (estHandler) {
    const calendrierCentral = await page.evaluate(() => ({
      mode: document.getElementById("calendar")?.getAttribute("data-central-calendar-mode") || "",
      anciensFiltres: document.querySelectorAll("[data-central-calendar-view]").length,
      ancienneLegende: Boolean(document.getElementById("central-calendar-availability-legend")),
    }));

    assert(
      calendrierCentral.mode === "central",
      "Le Dashboard Handler doit utiliser le calendrier central unifié."
    );
    assert(
      calendrierCentral.anciensFiltres === 0 && !calendrierCentral.ancienneLegende,
      "Le Dashboard unifié ne doit plus afficher les anciens filtres Séances/Disponibilités."
    );
  }

  await page.click("#add-seance-button");
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal && !modal.classList.contains("hidden");
  });
  const formulaireAjout = await page.evaluate(() => ({
    date: document.getElementById("date")?.value || "",
    selecteurVisible: !document.getElementById("seance-intervenant-field")?.classList.contains("hidden"),
    realisateurs: Array.from(document.getElementById("seance-intervenant")?.options || []).map(
      (option) => option.textContent.trim()
    ),
  }));
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(formulaireAjout.date),
    "La nouvelle séance doit recevoir la date du jour."
  );
  assert(
    formulaireAjout.selecteurVisible === estHandler,
    "Le choix du Réalisateur doit être visible uniquement pour le Handler."
  );
  if (estHandler) {
    nomsRealisateurs.forEach((nom) => {
      assert(
        formulaireAjout.realisateurs.some((libelle) => libelle.includes(nom)),
        `Le Réalisateur ${nom} doit être disponible dans le formulaire.`
      );
    });
  }
  await page.click('#seance-modal button[data-close-modal="seance-modal"]');
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal?.classList.contains("hidden");
  });

  const creneau = await page.evaluate(() => {
    const colonne = document.querySelector("#calendar .fc-timegrid-col[data-date]");
    const slotDebut = document.querySelector(
      '#calendar .fc-timegrid-slot-lane[data-time="10:00:00"]'
    );
    const slotFin = document.querySelector(
      '#calendar .fc-timegrid-slot-lane[data-time="11:00:00"]'
    );
    const colonneBox = colonne?.getBoundingClientRect();
    const slotDebutBox = slotDebut?.getBoundingClientRect();
    const slotFinBox = slotFin?.getBoundingClientRect();

    if (
      !colonneBox ||
      !slotDebutBox ||
      !slotFinBox ||
      colonneBox.width <= 0 ||
      slotDebutBox.height <= 0 ||
      slotFinBox.height <= 0
    ) {
      return null;
    }

    return {
      x: colonneBox.left + colonneBox.width / 2,
      yDebut: slotDebutBox.top + slotDebutBox.height / 2,
      yFin: slotFinBox.top + slotFinBox.height / 2,
    };
  });
  assert(creneau, "Le créneau 10:00 du Dashboard doit être cliquable.");
  await page.mouse.click(creneau.x, creneau.yDebut);
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal && !modal.classList.contains("hidden");
  });
  const selectionCalendrier = await page.evaluate(() => ({
    heureDebut: document.getElementById("heure_debut")?.value || "",
    duree: document.querySelector(".duration-checkbox:checked")?.value || "",
  }));
  assert(
    selectionCalendrier.heureDebut === "10:00" && selectionCalendrier.duree === "60",
    "Un clic sur 10:00 doit préremplir une nouvelle séance de 60 minutes."
  );
  await page.click('#seance-modal button[data-close-modal="seance-modal"]');
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal?.classList.contains("hidden");
  });

  await page.mouse.move(creneau.x, creneau.yDebut);
  await page.mouse.down();
  await page.mouse.move(creneau.x, creneau.yFin, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal && !modal.classList.contains("hidden");
  });
  const selectionGlissee = await page.evaluate(() => ({
    heureDebut: document.getElementById("heure_debut")?.value || "",
    duree: document.querySelector(".duration-checkbox:checked")?.value || "",
  }));
  assert(
    selectionGlissee.heureDebut === "10:00" && selectionGlissee.duree === "90",
    "Un glisser de trois créneaux doit préremplir une séance de 90 minutes."
  );
  await page.click('#seance-modal button[data-close-modal="seance-modal"]');
  await page.waitForFunction(() => {
    const modal = document.getElementById("seance-modal");
    return modal?.classList.contains("hidden");
  });
}

async function capturerElement(page, selector, filePath) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  assert(element, `Element introuvable: ${selector}`);
  await element.screenshot({ path: filePath });
}

async function definirPermissionNotifications(page, setting) {
  const session = await page.target().createCDPSession();
  await session.send("Browser.setPermission", {
    origin: baseUrl,
    permission: { name: "notifications" },
    setting,
  });
}

async function lireEtatPush(page) {
  await page.waitForFunction(() => {
    const label = document.getElementById("push-permission-label");
    return label && label.textContent && label.textContent.trim() !== "-";
  });

  return page.evaluate(() => ({
    status: document.getElementById("push-status-label")?.textContent?.trim() || "",
    permission:
      document.getElementById("push-permission-label")?.textContent?.trim() || "",
    info: document.getElementById("push-settings-info")?.textContent?.trim() || "",
    error: document.getElementById("push-settings-error")?.textContent?.trim() || "",
  }));
}

async function activerPushDepuisUI(page) {
  const responsePromise = page
    .waitForResponse((response) => response.url().includes("/api/push/subscribe"), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.click("#push-enable-button");
  await sleep(2000);
  const response = await responsePromise;
  const etat = await lireEtatPush(page);
  return {
    responseStatus: response?.status() || null,
    etat,
  };
}

async function testerPushDepuisUI(page) {
  const responsePromise = page
    .waitForResponse((response) => response.url().includes("/api/push/test"), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.click("#push-test-button");
  const response = await responsePromise;
  return response?.status() || null;
}

async function installerCaptureTelechargementUi(page) {
  await page.evaluate(() => {
    if (window.__e2eDownloadCaptureInstalled) {
      return;
    }

    window.__e2eDownloadCaptureInstalled = true;
    window.__e2eLastDownload = null;
    window.__e2ePendingDownloadBlob = null;

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = function capturerCreateObjectURL(blob) {
      window.__e2ePendingDownloadBlob = blob || null;
      return originalCreateObjectURL(blob);
    };

    HTMLAnchorElement.prototype.click = function capturerClicLien(...args) {
      if (this.download && this.href && this.href.startsWith("blob:")) {
        window.__e2eLastDownload = {
          fileName: this.download,
          href: this.href,
          blob: window.__e2ePendingDownloadBlob || null,
        };
      }

      return originalAnchorClick.apply(this, args);
    };
  });
}

async function telechargerReleveViaUI(page, filePath) {
  await installerCaptureTelechargementUi(page);
  await page.evaluate(() => {
    window.__e2eLastDownload = null;
    window.__e2ePendingDownloadBlob = null;
  });

  const responsePromise = page
    .waitForResponse((response) => response.url().includes("/api/monetisation/releve"), {
      timeout: 15000,
    })
    .catch(() => null);

  await page.click("#monetisation-download-statement-button");
  await page.waitForFunction(() => Boolean(window.__e2eLastDownload?.blob), {
    timeout: 15000,
  });

  const response = await responsePromise;
  const download = await page.evaluate(async () => {
    const capture = window.__e2eLastDownload || null;
    const blob = capture?.blob || null;

    if (!blob) {
      return null;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";

    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return {
      fileName: capture?.fileName || "",
      contentType: blob.type || "",
      size: blob.size || bytes.length,
      signature: binary.slice(0, 4),
      base64: window.btoa(binary),
    };
  });

  assert(download, "Le telechargement UI n'a produit aucun fichier.");
  fs.writeFileSync(filePath, Buffer.from(download.base64, "base64"));

  return {
    status: response?.status() || null,
    contentType: download.contentType || response?.headers()?.["content-type"] || "",
    size: download.size,
    signature: download.signature,
    fileName: download.fileName || path.basename(filePath),
  };
}

async function telechargerReleveDirect(client, query, filePath) {
  const response = await client.request("GET", `/api/monetisation/releve?${query}`);
  fs.writeFileSync(filePath, response.buffer);
  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    size: response.buffer.length,
    signature: response.buffer.slice(0, 4).toString("utf8"),
  };
}

async function appliquerFiltreMonetisation(page, { du, au, intervenantIds, globale = false }) {
  await page.waitForSelector("#monetisation-filter-form");

  const estGlobale = await page.$eval("#monetisation-global-toggle", (element) => element.checked);
  if (globale) {
    if (!estGlobale) {
      await page.click("#monetisation-global-toggle");
    }

    const champsDesactives = await page.evaluate(() => ({
      de: document.getElementById("monetisation-date-start")?.disabled === true,
      a: document.getElementById("monetisation-date-end")?.disabled === true,
    }));
    assert(
      champsDesactives.de && champsDesactives.a,
      "Les dates doivent être désactivées lorsque la Monétisation globale est cochée."
    );
  } else {
    if (estGlobale) {
      await page.click("#monetisation-global-toggle");
    }

    await page.$eval(
      "#monetisation-date-start",
      (element, valeur) => {
        element.value = valeur;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      },
      du
    );
    await page.$eval(
      "#monetisation-date-end",
      (element, valeur) => {
        element.value = valeur;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      },
      au
    );
  }

  const idsDemandes = new Set((intervenantIds || []).map((id) => String(id)));
  const idsDisponibles = await page.$$eval(
    '#monetisation-report-accounts input[name="monetisation-intervenants"]',
    (casesACocher) => casesACocher.map((caseACocher) => String(caseACocher.value || ""))
  );
  assert(idsDisponibles.length > 0, "Aucun réalisateur sélectionnable dans le formulaire de monétisation.");
  assert(
    Array.from(idsDemandes).every((identifiant) => idsDisponibles.includes(identifiant)),
    "La sélection de monétisation contient un réalisateur absent de la liste déroulante."
  );
  await page.$eval(
    "#monetisation-report-accounts-dropdown",
    (listeDeroulante, identifiants) => {
      const idsSelectionnes = new Set(identifiants);
      listeDeroulante.open = true;
      listeDeroulante
        .querySelectorAll('input[name="monetisation-intervenants"]')
        .forEach((caseACocher) => {
          if (caseACocher.checked !== idsSelectionnes.has(String(caseACocher.value))) {
            caseACocher.click();
          }
        });
    },
    Array.from(idsDemandes)
  );

  const reponsePromise = page
    .waitForResponse(
      (response) => {
        const url = response.url();
        return (
          response.status() === 200 &&
          url.includes("/api/monetisation?") &&
          (globale
            ? url.includes("mode=global") && !url.includes("du=") && !url.includes("au=")
            : url.includes(`du=${du}`) && url.includes(`au=${au}`))
        );
      },
      { timeout: 15000 }
    )
    .catch(() => null);
  await page.click("#monetisation-calculate-button");
  const reponse = await reponsePromise;
  assert(reponse, "Le calcul de monétisation n'a pas appelé l'API attendue.");
  await page.waitForFunction(() => {
    const bouton = document.getElementById("monetisation-calculate-button");
    return bouton && !bouton.disabled && bouton.textContent?.trim() === "Calculer";
  });
  await page.waitForFunction(() =>
    !document.getElementById("monetisation-results")?.classList.contains("hidden")
  );

  return reponse.json();
}

async function appliquerFiltreStatistiques(page, { du, au, globale = false }) {
  await page.waitForSelector("#stats-filter-form");

  if (globale) {
    const estCoche = await page.$eval("#stats-global-toggle", (element) => element.checked);
    if (!estCoche) {
      await page.click("#stats-global-toggle");
    }

    const champsDesactives = await page.evaluate(() => ({
      de: document.getElementById("stats-date-start")?.disabled === true,
      a: document.getElementById("stats-date-end")?.disabled === true,
    }));
    assert(
      champsDesactives.de && champsDesactives.a,
      "Les dates doivent être désactivées lorsque les Statistiques globales sont cochées."
    );
  } else {
    const estCoche = await page.$eval("#stats-global-toggle", (element) => element.checked);
    if (estCoche) {
      await page.click("#stats-global-toggle");
    }

    await page.$eval(
      "#stats-date-start",
      (element, valeur) => {
        element.value = valeur;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      },
      du
    );
    await page.$eval(
      "#stats-date-end",
      (element, valeur) => {
        element.value = valeur;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      },
      au
    );
  }

  const reponsePromise = page
    .waitForResponse(
      (response) => {
        const url = response.url();
        return (
          response.status() === 200 &&
          url.includes("/api/statistiques?") &&
          (globale ? url.includes("globale=1") && !url.includes("du=") && !url.includes("au=") : url.includes(`du=${du}`) && url.includes(`au=${au}`))
        );
      },
      { timeout: 15000 }
    )
    .catch(() => null);

  await page.click("#stats-calculate-button");
  const reponse = await reponsePromise;
  assert(reponse, "Le calcul Statistiques n'a pas appelé l'API attendue.");
  await page.waitForFunction(() => {
    const bouton = document.getElementById("stats-calculate-button");
    const resultats = document.getElementById("stats-results");
    return (
      bouton &&
      !bouton.disabled &&
      bouton.textContent?.trim() === "Calculer" &&
      resultats &&
      !resultats.classList.contains("hidden") &&
      resultats.hidden === false
    );
  });

  return reponse.json();
}

async function sauvegarderHtmlReleve(client, query, filePath) {
  const response = await client.request("GET", `/api/monetisation/releve?${query}`);
  assert(response.status === 200, `releve html attendu=200 recu=${response.status}`);
  fs.writeFileSync(filePath, response.text, "utf8");
}

async function screenshotHtmlFile(browser, htmlFilePath, imageFilePath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 1600, deviceScaleFactor: 1 });
  await page.goto(`file:///${htmlFilePath.replace(/\\/g, "/")}`, {
    waitUntil: "networkidle2",
  });
  await page.screenshot({ path: imageFilePath, fullPage: true });
  await page.close();
}

async function run() {
  port = await obtenirPortLibre();
  baseUrl = `http://127.0.0.1:${port}`;
  cleanupPath(databasePath);
  cleanupPath(`${databasePath}-wal`);
  cleanupPath(`${databasePath}-shm`);
  cleanupPath(artifactsDir);
  cleanupPath(devEmailOutboxDir);
  ensureDir(artifactsDir);

  const environnementE2E = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATABASE_PATH: databasePath,
    NODE_ENV: "test",
    SEED_DEMO_DATA: "",
    SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
    AUDIT_SECRET: crypto.randomBytes(48).toString("hex"),
    PUSH_ENABLE_IN_MEMORY_REMINDERS: "false",
    // The browser gives Chromium a real third-party Push endpoint. Keep this
    // deterministic E2E check offline while exercising subscription storage,
    // endpoint validation and the test-notification route. The application
    // honours this flag only under NODE_ENV=test.
    PUSH_TEST_DELIVERY_MODE: "mock",
    // Account emails are captured in this disposable outbox so the recovery
    // flow is genuinely checked without querying a real SMTP server.
    ACCOUNT_EMAIL_DRY_RUN: "true",
    ACCOUNT_EMAIL_DEV_OUTBOX_DIR: devEmailOutboxDir,
    BACKUP_SEANCES_ENABLED: "false",
    INITIAL_SUPERADMIN_NAME: fixture.admin.nom,
    INITIAL_SUPERADMIN_EMAIL: fixture.admin.email,
    INITIAL_SUPERADMIN_PASSWORD: fixture.admin.motDePasseInitial,
  };

  await initialiserFixtureIsole(environnementE2E);

  const server = spawn(process.execPath, ["app.js"], {
    cwd: root,
    env: environnementE2E,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const loginPage = await browser.newPage();
      await verifierParcoursConnexion(loginPage);
      await loginPage.close();

      const { admin, user, comptesMonetisation, intervenantsMonetisation } = await initialiserDonnees();

      const lifecyclePage = await browser.newPage();
      await verifierLienReinitialisationAvecSession(lifecyclePage, admin);
      await lifecyclePage.close();

      const adminPage = await browser.newPage();
      await adminPage.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
      await appliquerSessionPage(adminPage, admin);
      await attendreApplicationChargee(adminPage);
      await verifierNavigationInteractive(adminPage, "le Handler");

      await capturerElement(
        adminPage,
        ".workspace-nav",
        path.join(artifactsDir, "admin-desktop-nav.png")
      );
      await verifierDashboardCentral(adminPage, {
        estHandler: true,
        nomsRealisateurs: [fixture.admin.nom, fixture.utilisateur.nom],
      });
      await adminPage.evaluate(() => window.scrollTo({ top: 0, left: 0 }));
      await adminPage.waitForFunction(() => window.scrollY === 0);
      await adminPage.screenshot({
        path: path.join(artifactsDir, "admin-dashboard-desktop.png"),
        fullPage: true,
      });

      await ouvrirSection(adminPage, "statistiques");
      const statistiquesInitiales = await adminPage.evaluate(() => ({
        resultatsMasques:
          document.getElementById("stats-results")?.classList.contains("hidden") === true &&
          document.getElementById("stats-results")?.hidden === true &&
          document.getElementById("stats-results")?.hasAttribute("inert") === true,
        datesActives:
          document.getElementById("stats-date-start")?.disabled === false &&
          document.getElementById("stats-date-end")?.disabled === false,
        datesDefinies:
          Boolean(document.getElementById("stats-date-start")?.value) &&
          Boolean(document.getElementById("stats-date-end")?.value),
        appelAutomatique: performance
          .getEntriesByType("resource")
          .some((entry) => entry.name.includes("/api/statistiques?")),
      }));
      assert(
        statistiquesInitiales.resultatsMasques &&
          statistiquesInitiales.datesActives &&
          statistiquesInitiales.datesDefinies &&
          !statistiquesInitiales.appelAutomatique,
        "Les Statistiques doivent rester vides avant Calculer, avec une période prête à être choisie."
      );

      const statistiquesPeriode = await appliquerFiltreStatistiques(adminPage, {
        du: "2026-04-01",
        au: "2026-04-30",
      });
      assert(
        Array.isArray(statistiquesPeriode?.statistiques?.intervenants),
        "Le calcul Statistiques doit renvoyer les réalisateurs de la période."
      );

      await adminPage.$eval("#stats-date-end", (element) => {
        element.value = "2026-04-29";
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const resultatsPerimes = await adminPage.$eval(
        "#stats-results",
        (element) => element.hidden === true && element.hasAttribute("inert")
      );
      assert(
        resultatsPerimes,
        "Une modification de période doit masquer les statistiques devenues périmées."
      );

      const statistiquesGlobales = await appliquerFiltreStatistiques(adminPage, {
        globale: true,
      });
      assert(
        statistiquesGlobales?.periode?.globale === true &&
          statistiquesGlobales?.periode?.du === null &&
          statistiquesGlobales?.periode?.au === null,
        "Le mode global opérationnel ne doit pas transmettre de période datée."
      );

      await ouvrirSection(adminPage, "monetisation");
      await adminPage.waitForFunction(() => {
        const selecteur = document.getElementById("monetisation-report-accounts");
        return selecteur && selecteur.querySelectorAll('input[name="monetisation-intervenants"]').length > 0;
      });
      const monetisationInitiale = await adminPage.evaluate(() => ({
        estListeDeroulanteMultiple: (() => {
          const listeDeroulante = document.getElementById("monetisation-report-accounts-dropdown");
          const selecteur = document.getElementById("monetisation-report-accounts");
          return (
            listeDeroulante?.tagName === "DETAILS" &&
            selecteur?.getAttribute("role") === "group" &&
            selecteur.querySelector('input[type="checkbox"]') !== null
          );
        })(),
        periodeGlobaleDisponible:
          document.getElementById("monetisation-global-toggle")?.checked === false &&
          document.getElementById("monetisation-date-start")?.disabled === false &&
          document.getElementById("monetisation-date-end")?.disabled === false,
        resultatsMasques: document
          .getElementById("monetisation-results")
          ?.classList.contains("hidden"),
        releveMasque: document
          .getElementById("monetisation-download-statement-button")
          ?.closest("#monetisation-results")
          ?.classList.contains("hidden"),
        releveDirectementMasqueEtDesactive: (() => {
          const bouton = document.getElementById("monetisation-download-statement-button");
          return bouton?.hidden === true && bouton?.disabled === true;
        })(),
      }));
      assert(
        monetisationInitiale.estListeDeroulanteMultiple &&
          monetisationInitiale.periodeGlobaleDisponible,
        "La Monétisation doit proposer une sélection multiple et une période globale facultative."
      );
      assert(
        monetisationInitiale.resultatsMasques &&
          monetisationInitiale.releveMasque &&
          monetisationInitiale.releveDirectementMasqueEtDesactive,
        "Les résultats et le téléchargement du relevé ne doivent pas s'afficher avant Calculer."
      );

      await adminPage.screenshot({
        path: path.join(artifactsDir, "admin-monetisation-desktop.png"),
        fullPage: true,
      });

      await appliquerFiltreMonetisation(adminPage, {
        du: "2026-04-01",
        au: "2026-04-30",
        intervenantIds: intervenantsMonetisation.map(({ id }) => id),
      });
      const pdfMonthlyUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-mensuel-ui.pdf")
      );
      await appliquerFiltreMonetisation(adminPage, {
        du: "2026-03-01",
        au: "2026-04-30",
        intervenantIds: intervenantsMonetisation.map(({ id }) => id),
      });
      const pdfAnnualUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-annuel-ui.pdf")
      );
      const monetisationGlobale = await appliquerFiltreMonetisation(adminPage, {
        globale: true,
        intervenantIds: intervenantsMonetisation.map(({ id }) => id),
      });
      assert(
        monetisationGlobale?.monetisation?.periode?.mode_selectionne === "global" &&
          monetisationGlobale?.monetisation?.periode?.du === null &&
          monetisationGlobale?.monetisation?.periode?.au === null,
        "La Monétisation globale ne doit transmettre aucune date et doit garder les réalisateurs choisis."
      );
      const pdfGlobalUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-global-ui.pdf")
      );

      const mobilePage = await browser.newPage();
      await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
      await appliquerSessionPage(mobilePage, admin);
      await attendreApplicationChargee(mobilePage);
      await ouvrirSection(mobilePage, "monetisation");
      const ongletMobileActifVisible = await mobilePage.evaluate(() => {
        const navigation = document.querySelector(".workspace-nav");
        const onglet = document.querySelector(
          '.workspace-nav [data-section-target="monetisation"].is-active'
        );
        if (!navigation || !onglet) {
          return false;
        }

        const cadreNavigation = navigation.getBoundingClientRect();
        const cadreOnglet = onglet.getBoundingClientRect();
        const tolerance = 2;
        return (
          cadreOnglet.left >= cadreNavigation.left - tolerance &&
          cadreOnglet.right <= cadreNavigation.right + tolerance
        );
      });
      assert(
        ongletMobileActifVisible,
        "L'onglet actif mobile doit être entièrement lisible dans la navigation horizontale."
      );
      await mobilePage.screenshot({
        path: path.join(artifactsDir, "admin-monetisation-mobile.png"),
        fullPage: true,
      });

      const userPage = await browser.newPage();
      await userPage.setViewport({ width: 1366, height: 1200, deviceScaleFactor: 1 });
      await appliquerSessionPage(userPage, user);
      await attendreApplicationChargee(userPage);
      await verifierNavigationInteractive(userPage, "le Professeur");
      await verifierDashboardCentral(userPage, {
        estHandler: false,
        nomsRealisateurs: [],
      });
      await ouvrirSection(userPage, "monetisation");
      await userPage.screenshot({
        path: path.join(artifactsDir, "user-monetisation-desktop.png"),
        fullPage: true,
      });
      const userMonetisationState = await userPage.evaluate(() => ({
        reportSelectionVisible:
          !document
            .getElementById("monetisation-report-accounts-section")
            ?.classList.contains("hidden"),
        pageText: document.body.innerText,
      }));
      assert(
        userMonetisationState.reportSelectionVisible,
        "Le professeur doit accéder à son formulaire de monétisation sans autorisation du Handler."
      );
      assert(
        !/Hossam/.test(userMonetisationState.pageText) &&
          !/Client prive/.test(userMonetisationState.pageText),
        "Le professeur ne doit pas voir les données de monétisation des autres réalisateurs."
      );

      const pushPage = await browser.newPage();
      const pushLogs = [];
      pushPage.on("console", (message) => {
        pushLogs.push(`console:${message.type()}:${message.text()}`);
      });
      pushPage.on("pageerror", (error) => {
        pushLogs.push(`pageerror:${error.message}`);
      });
      await pushPage.setViewport({ width: 1366, height: 1000, deviceScaleFactor: 1 });
      await appliquerSessionPage(pushPage, admin);

      await definirPermissionNotifications(pushPage, "prompt");
      await attendreApplicationChargee(pushPage);
      await ouvrirSection(pushPage, "utilisateur");
      const pushPromptState = await lireEtatPush(pushPage);

      await definirPermissionNotifications(pushPage, "denied");
      await pushPage.reload({ waitUntil: "networkidle2" });
      await ouvrirSection(pushPage, "utilisateur");
      const pushDeniedBefore = await lireEtatPush(pushPage);
      await pushPage.click("#push-enable-button");
      await sleep(1000);
      const pushDeniedAfter = await lireEtatPush(pushPage);

      await definirPermissionNotifications(pushPage, "granted");
      await pushPage.reload({ waitUntil: "networkidle2" });
      await ouvrirSection(pushPage, "utilisateur");
      const pushGrantedBefore = await lireEtatPush(pushPage);
      const pushActivation = await activerPushDepuisUI(pushPage);
      const pushTestStatus =
        pushActivation.responseStatus === 201 ? await testerPushDepuisUI(pushPage) : null;
      assert(
        pushActivation.responseStatus === 201,
        `L'activation Push E2E doit répondre 201, reçu ${pushActivation.responseStatus ?? "aucune réponse"}.`
      );
      assert(
        pushTestStatus === 200,
        `Le test Push E2E doit répondre 200, reçu ${pushTestStatus ?? "aucune réponse"}.`
      );
      const erreursPushNavigateur = pushLogs.filter((log) =>
        /^(?:console:error|pageerror):/i.test(log)
      );
      assert(
        erreursPushNavigateur.length === 0,
        `Erreurs navigateur Push inattendues : ${erreursPushNavigateur.join(" | ")}`
      );
      await pushPage.evaluate(() => {
        const section = document.getElementById("utilisateur-section");
        if (section) {
          section.classList.remove("hidden");
        }
      });
      try {
        await pushPage.$eval("#push-settings-card", (element) => {
          element.scrollIntoView({ block: "center", inline: "nearest" });
        });
        await capturerElement(
          pushPage,
          "#push-settings-card",
          path.join(artifactsDir, "admin-push-settings.png")
        );
      } catch (error) {
        await pushPage.screenshot({
          path: path.join(artifactsDir, "admin-push-settings.png"),
          fullPage: true,
        });
      }

      const comptesAdmin = comptesMonetisation;
      await sauvegarderHtmlReleve(
        admin,
        new URLSearchParams({
          format: "html",
          mois: "2026-04",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-mensuel.html")
      );
      await sauvegarderHtmlReleve(
        admin,
        new URLSearchParams({
          format: "html",
          mode: "annual",
          annee: "2026",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-annuel.html")
      );
      await sauvegarderHtmlReleve(
        admin,
        new URLSearchParams({
          format: "html",
          mode: "global",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-global.html")
      );

      await screenshotHtmlFile(
        browser,
        path.join(artifactsDir, "releve-mensuel.html"),
        path.join(artifactsDir, "releve-mensuel-html-preview.png")
      );
      await screenshotHtmlFile(
        browser,
        path.join(artifactsDir, "releve-annuel.html"),
        path.join(artifactsDir, "releve-annuel-html-preview.png")
      );
      await screenshotHtmlFile(
        browser,
        path.join(artifactsDir, "releve-global.html"),
        path.join(artifactsDir, "releve-global-html-preview.png")
      );

      const pdfMonthlyDirect = await telechargerReleveDirect(
        admin,
        new URLSearchParams({
          mois: "2026-04",
          format: "pdf",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-mensuel-direct.pdf")
      );
      const pdfAnnualDirect = await telechargerReleveDirect(
        admin,
        new URLSearchParams({
          mode: "annual",
          annee: "2026",
          format: "pdf",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-annuel-direct.pdf")
      );
      const pdfGlobalDirect = await telechargerReleveDirect(
        admin,
        new URLSearchParams({
          mode: "global",
          format: "pdf",
          compte: comptesAdmin[0],
        })
          .toString() + `&compte=${encodeURIComponent(comptesAdmin[1])}`,
        path.join(artifactsDir, "releve-global-direct.pdf")
      );
      const qualiteUiWarnings = pushLogs.filter((log) =>
        /Password field is not contained in a form|Password forms should have \(optionally hidden\) username fields|Input elements should have autocomplete attributes|apple-mobile-web-app-capable/i.test(
          log
        )
      );

      assert(pdfMonthlyUi.status === 200, `pdf monthly ui attendu=200 recu=${pdfMonthlyUi.status}`);
      assert(pdfAnnualUi.status === 200, `pdf annual ui attendu=200 recu=${pdfAnnualUi.status}`);
      assert(pdfGlobalUi.status === 200, `pdf global ui attendu=200 recu=${pdfGlobalUi.status}`);
      assert(pdfMonthlyUi.size > 0, "Le pdf mensuel via UI est vide.");
      assert(pdfAnnualUi.size > 0, "Le pdf annuel via UI est vide.");
      assert(pdfGlobalUi.size > 0, "Le pdf global via UI est vide.");
      assert(pdfMonthlyUi.signature === "%PDF", "La signature du pdf mensuel UI est invalide.");
      assert(pdfAnnualUi.signature === "%PDF", "La signature du pdf annuel UI est invalide.");
      assert(pdfGlobalUi.signature === "%PDF", "La signature du pdf global UI est invalide.");
      assert(
        qualiteUiWarnings.length === 0,
        `Warnings UI inattendus detectes: ${qualiteUiWarnings.join(" | ")}`
      );

      const summary = {
        responsive: {
          adminDashboardDesktopScreenshot: path.join(artifactsDir, "admin-dashboard-desktop.png"),
          adminDesktopScreenshot: path.join(artifactsDir, "admin-monetisation-desktop.png"),
          adminMobileScreenshot: path.join(artifactsDir, "admin-monetisation-mobile.png"),
          userDesktopScreenshot: path.join(artifactsDir, "user-monetisation-desktop.png"),
        },
        push: {
          deliveryMode: "mock-test-only",
          prompt: pushPromptState,
          deniedBefore: pushDeniedBefore,
          deniedAfter: pushDeniedAfter,
          grantedBefore: pushGrantedBefore,
          activation: pushActivation,
          testStatus: pushTestStatus,
          logs: pushLogs,
          qualityWarnings: qualiteUiWarnings,
        },
        monetisationPermissions: {
          userReportSelectionVisible: userMonetisationState.reportSelectionVisible,
          userContainsHossam:
            /Hossam/.test(userMonetisationState.pageText) ||
            /Client prive/.test(userMonetisationState.pageText),
        },
        pdfDownloads: {
          monthly: {
            ui: pdfMonthlyUi,
            direct: pdfMonthlyDirect,
          },
          annual: {
            ui: pdfAnnualUi,
            direct: pdfAnnualDirect,
          },
          global: {
            ui: pdfGlobalUi,
            direct: pdfGlobalDirect,
          },
        },
        htmlPreviews: {
          monthly: path.join(artifactsDir, "releve-mensuel-html-preview.png"),
          annual: path.join(artifactsDir, "releve-annuel-html-preview.png"),
          global: path.join(artifactsDir, "releve-global-html-preview.png"),
        },
      };

      fs.writeFileSync(
        path.join(artifactsDir, "summary.json"),
        JSON.stringify(summary, null, 2),
        "utf8"
      );

      console.log(JSON.stringify(summary, null, 2));
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    server.kill("SIGTERM");
    await sleep(500);

    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
