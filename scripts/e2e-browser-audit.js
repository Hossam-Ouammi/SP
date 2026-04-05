const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const root = path.join(__dirname, "..");
const port = 3328;
const baseUrl = `http://127.0.0.1:${port}`;
const databasePath = path.join(root, "database", "e2e-browser-audit.db");
const artifactsDir = path.join(root, "database", "e2e-browser-artifacts");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function initialiserDonnees() {
  const admin = new SessionClient();
  const user = new SessionClient();

  let response = await admin.request(
    "POST",
    "/",
    new URLSearchParams({
      username: "Hossam",
      mot_de_passe: "123456",
    })
  );
  assert(response.status === 303, `login admin attendu=303 recu=${response.status}`);

  response = await admin.request(
    "PATCH",
    "/api/auth/password",
    {
      mot_de_passe_actuel: "123456",
      nouveau_mot_de_passe: "Admin!E2E1234",
    },
    { "x-csrf-token": admin.csrfToken }
  );
  assert(response.status === 200, `password admin attendu=200 recu=${response.status}`);

  response = await user.request("POST", "/api/auth/login", {
    username: "ami@test.com",
    mot_de_passe: "123456",
  });
  assert(response.status === 200, `login user attendu=200 recu=${response.status}`);

  response = await user.request(
    "PATCH",
    "/api/auth/password",
    {
      mot_de_passe_actuel: "123456",
      nouveau_mot_de_passe: "User!E2E1234",
    },
    { "x-csrf-token": user.csrfToken }
  );
  assert(response.status === 200, `password user attendu=200 recu=${response.status}`);

  response = await admin.request("GET", "/api/admin");
  const abdo = response.json?.administration?.comptes?.find(
    (compte) => compte.email === "abdo@test.com"
  );
  assert(abdo, "Le compte Abdo est introuvable dans l'administration.");

  response = await admin.request(
    "PATCH",
    "/api/admin/monetisation-access",
    {
      utilisateur_id: abdo.id,
      peut_voir_monetisation: true,
      mot_de_passe_actuel: "Admin!E2E1234",
    },
    { "x-csrf-token": admin.csrfToken }
  );
  assert(
    response.status === 200,
    `monetisation user attendu=200 recu=${response.status}`
  );

  response = await admin.request("GET", "/api/seances/options");
  const matiere = response.json?.options?.matieres?.[0]?.valeur || "Maths";
  const compteAbdo =
    response.json?.options?.comptes?.find(
      (compte) => String(compte?.valeur || compte).toLowerCase() === "abdo"
    )?.valeur || "Abdo";
  const compteHossam =
    response.json?.options?.comptes?.find(
      (compte) => String(compte?.valeur || compte).toLowerCase() === "hossam"
    )?.valeur || "Hossam";

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

async function forcerModeMonetisation(page, mode) {
  if (mode === "monthly") {
    await page.reload({ waitUntil: "networkidle2" });
    await ouvrirSection(page, "monetisation");
    return;
  }

  const selector =
    mode === "annual"
      ? '#monetisation-mode-option-one-button[data-mode="annual"], #monetisation-mode-option-two-button[data-mode="annual"]'
      : '#monetisation-mode-option-one-button[data-mode="global"], #monetisation-mode-option-two-button[data-mode="global"]';

  await page.waitForSelector(selector);
  await page.click(selector);
  await sleep(800);
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
  cleanupPath(databasePath);
  cleanupPath(`${databasePath}-wal`);
  cleanupPath(`${databasePath}-shm`);
  cleanupPath(artifactsDir);
  ensureDir(artifactsDir);

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
    const { admin, user } = await initialiserDonnees();
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const adminPage = await browser.newPage();
      await adminPage.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
      await appliquerSessionPage(adminPage, admin);
      await attendreApplicationChargee(adminPage);

      await capturerElement(
        adminPage,
        ".workspace-nav",
        path.join(artifactsDir, "admin-desktop-nav.png")
      );

      await ouvrirSection(adminPage, "monetisation");
      await adminPage.waitForFunction(() => {
        const montant = document.getElementById("monetisation-total-amount");
        return montant && montant.textContent && montant.textContent.trim() !== "";
      });

      await adminPage.screenshot({
        path: path.join(artifactsDir, "admin-monetisation-desktop.png"),
        fullPage: true,
      });

      const pdfMonthlyUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-mensuel-ui.pdf")
      );
      await forcerModeMonetisation(adminPage, "annual");
      const pdfAnnualUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-annuel-ui.pdf")
      );
      await forcerModeMonetisation(adminPage, "global");
      const pdfGlobalUi = await telechargerReleveViaUI(
        adminPage,
        path.join(artifactsDir, "releve-global-ui.pdf")
      );

      const mobilePage = await browser.newPage();
      await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
      await appliquerSessionPage(mobilePage, admin);
      await attendreApplicationChargee(mobilePage);
      await ouvrirSection(mobilePage, "monetisation");
      await mobilePage.screenshot({
        path: path.join(artifactsDir, "admin-monetisation-mobile.png"),
        fullPage: true,
      });

      const userPage = await browser.newPage();
      await userPage.setViewport({ width: 1366, height: 1200, deviceScaleFactor: 1 });
      await appliquerSessionPage(userPage, user);
      await attendreApplicationChargee(userPage);
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

      const comptesAdmin = ["Abdo", "Hossam"];
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
          compte: "Abdo",
        })
          .toString() + "&compte=Hossam",
        path.join(artifactsDir, "releve-mensuel-direct.pdf")
      );
      const pdfAnnualDirect = await telechargerReleveDirect(
        admin,
        new URLSearchParams({
          mode: "annual",
          annee: "2026",
          format: "pdf",
          compte: "Abdo",
        })
          .toString() + "&compte=Hossam",
        path.join(artifactsDir, "releve-annuel-direct.pdf")
      );
      const pdfGlobalDirect = await telechargerReleveDirect(
        admin,
        new URLSearchParams({
          mode: "global",
          format: "pdf",
          compte: "Abdo",
        })
          .toString() + "&compte=Hossam",
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
          adminDesktopScreenshot: path.join(artifactsDir, "admin-monetisation-desktop.png"),
          adminMobileScreenshot: path.join(artifactsDir, "admin-monetisation-mobile.png"),
          userDesktopScreenshot: path.join(artifactsDir, "user-monetisation-desktop.png"),
        },
        push: {
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
