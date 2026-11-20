const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const html = ejs.render(fs.readFileSync("views/index.ejs", "utf8"), { user: {}, loginUsername: "", loginError: "" })
      .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<link[^>]*>/g, "");
    await page.setRequestInterception(true);
    page.on("request", request => request.respond({ status: 200, contentType: "text/html", body: html }));
    await page.goto("https://planning.example", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    const ui = fs.readFileSync("public/js/ui.js", "utf8").replace(/^import[\s\S]*?from "[^"\n]+";\r?\n/gm, "")
      .replace('document?.addEventListener("DOMContentLoaded", initialiserApplication);', "");
    await page.addScriptTag({ content: `(function(){${ui}\nwindow.settingsUI={etat,afficherReglagesEspace,creerCarteProfesseurEquipe};})();` });
    await page.evaluate(() => {
      const { etat } = settingsUI;
      etat.utilisateur = { id: 1, nom: "Hossam", public_id: "HD-001", scope: { roles: ["handler", "professeur"] } };
      etat.reglagesEspace = {
        calendrier: { modifiable: true, calendar_start_time: "08:00", calendar_end_time: "22:30" },
        calendrier_public: { actif: true, jeton_configure: true, lien_public: "https://planning.example/p/HD-001", timezone: "GMT+1" },
        liens_publics_equipe: [{ id: 2, nom: "Marie Dupont", public_id: "PR-002", actif: false, lien_public: "https://planning.example/p/PR-002" }],
        equipes: [{ nom: "Équipe Abdo", public_id: "HD-002" }, { nom: "Équipe Sarah", public_id: "HD-003" }],
      };
      document.querySelectorAll(".app-section").forEach(el => el.classList.add("hidden"));
      document.getElementById("calendrier-section").classList.remove("hidden");
      document.getElementById("home-section").classList.add("hidden");
      settingsUI.afficherReglagesEspace();
    });
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 950 });
      assert.equal(await page.$$eval("#calendrier-section h3, #calendrier-section h4", headings => headings.filter(h => h.textContent.trim() === "Calendrier").length), 1);
      assert.equal(await page.$$("#public-calendar-memberships .public-calendar-team-card").then(cards => cards.length), 2);
      assert.equal(await page.$$("#public-calendar-team-links .public-calendar-person").then(cards => cards.length), 2);
      assert.ok(await page.$eval("#calendar-settings-panel", el => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.$eval("#public-calendar-timezone-form", el => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.$eval("#public-calendar-team-links", el => el.scrollWidth <= el.clientWidth + 1));
      assert.ok(await page.evaluate(() => {
        const panel = document.getElementById("calendar-settings-panel").getBoundingClientRect();
        const header = document.querySelector(".topbar").getBoundingClientRect();
        const start = document.getElementById("calendar-start-time").getBoundingClientRect();
        const end = document.getElementById("calendar-end-time").getBoundingClientRect();
        const startLabel = document.getElementById("calendar-start-time").parentElement.getBoundingClientRect();
        const endLabel = document.getElementById("calendar-end-time").parentElement.getBoundingClientRect();
        return Math.abs(panel.width - header.width) < 1 && Math.abs(panel.left - header.left) < 1 &&
          start.right <= startLabel.right + 1 && end.right <= endLabel.right + 1 && start.right < end.left;
      }), "Public settings share the full page width; native time controls cannot overlap");
      assert.ok(await page.evaluate(() => Math.abs(document.getElementById("calendar-start-time").getBoundingClientRect().top - document.getElementById("calendar-end-time").getBoundingClientRect().top) < 1), "Start and end time share one row");
      assert.ok(await page.$eval("#public-calendar-team-links button", el => !el.disabled), "Public links remain copyable");
      assert.ok(await page.$eval("#calendar-settings-panel", el => el.getBoundingClientRect().height < 900), "Settings fit a compact phone page");
      if (width === 390) await page.screenshot({ path: path.join(require("node:os").tmpdir(), "sp-public-settings-compact.png") });
    }
    await page.evaluate(() => {
      document.getElementById("calendrier-section").classList.add("hidden");
      document.getElementById("equipe-section").classList.remove("hidden");
      document.getElementById("team-list").append(settingsUI.creerCarteProfesseurEquipe({ id: 2, nom: "Marie Dupont", statut_compte: "active" }));
    });
    assert.equal(await page.$eval("#team-list .public-calendar-avatar", el => el.textContent), "MD");
    assert.ok(await page.$eval("#team-list", el => el.scrollWidth <= el.clientWidth + 1));
    assert.deepEqual(errors, []);
    console.log("compact public settings: PASS (one title, phone/PC, visual teams, member links, no overflow)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
