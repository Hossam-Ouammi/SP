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
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    const ui = fs.readFileSync("public/js/ui.js", "utf8").replace(/^import[\s\S]*?from "[^"\n]+";\r?\n/gm, "")
      .replace('document?.addEventListener("DOMContentLoaded", initialiserApplication);', "");
    await page.addScriptTag({ content: `(function(){${ui}\nwindow.teamUI={etat,afficherEquipe,collecterTarifsEquipeFormulaire};})();` });
    await page.evaluate(() => {
      const { etat } = teamUI;
      etat.utilisateur = { id: 1, nom: "Hossam", scope: { roles: ["handler"] } };
      etat.equipe = [{ id: 2, nom: "Marie Dupont", statut_compte: "active" }, { id: 3, nom: "Alexandre Benali", statut_compte: "suspendu" }];
      etat.demandesEquipe = [];
      etat.tarificationEquipe = {
        matieres: [{ id: 10, libelle: "Mathématiques" }, { id: 11, libelle: "Physique-chimie" }],
        realisateurs: [{ id: 1, nom: "Hossam", est_handler: true, actif: true, tarifs_matieres: [{ matiere_id: 10, tarif_horaire: 100 }] },
          { id: 2, nom: "Marie", actif: true }, { id: 3, nom: "Alexandre", actif: false }],
      };
      document.querySelectorAll(".app-section").forEach(el => el.classList.add("hidden"));
      document.getElementById("home-section").classList.add("hidden");
      document.getElementById("equipe-section").classList.remove("hidden");
      teamUI.afficherEquipe();
    });
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 950 });
      assert.equal(await page.$$("#team-list .team-member-card").then(els => els.length), 2);
      assert.ok(await page.$eval("#equipe-section", el => el.scrollWidth <= el.clientWidth + 1), `No team page overflow at ${width}`);
      assert.ok(await page.$$eval("#team-list .team-member-card", els => els.every(el => el.getBoundingClientRect().height < 190 && el.scrollWidth <= el.clientWidth + 1)), `Compact professor cards at ${width}`);
      assert.ok(await page.$$eval("#team-list .team-actions .button", els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), "All action labels fit");
      assert.ok(await page.$eval(".team-requests-card", el => el.getBoundingClientRect().height < 120), "Empty requests remain compact");
      assert.deepEqual(await page.$$eval("#team-list .team-member-card:first-child .team-actions button", els => els.map(el => el.textContent)), ["Enregistrer", "Réinitialiser", "Retirer"]);
      assert.equal(await page.$$eval("#team-tarification-table input", els => els.length), 6);
      const tarifs = await page.evaluate(() => teamUI.collecterTarifsEquipeFormulaire());
      assert.equal(tarifs.length, 4, "Suspended professor rates remain disabled");
      assert.equal(tarifs[0].tarif_horaire, 100);
      if (width === 390) await page.screenshot({ path: path.join(require("node:os").tmpdir(), "sp-team-compact.png"), fullPage: true });
    }
    await page.evaluate(() => {
      teamUI.etat.demandesEquipe = [{ id: 4, nom: "Sofia Martin", email: "sofia@example.test", type_demande: "rattachement", description: "Professeur de maths" }];
      teamUI.afficherEquipe();
    });
    assert.equal(await page.$$("#team-pending-requests button").then(els => els.length), 2);
    await page.evaluate(() => { teamUI.etat.utilisateur.mode_lecture_seule = 1; teamUI.afficherEquipe(); });
    assert.ok(await page.$$eval("#team-list button, #team-list select, #team-pending-requests button, #team-tarification-table input", els => els.every(el => el.disabled)), "Read-only controls remain protected");
    assert.deepEqual(errors, []);
    console.log("compact team: PASS (PC/mobile, professor cards, subjects, rates, requests, read-only controls, no overflow)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
