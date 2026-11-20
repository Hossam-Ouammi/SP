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
    await page.addScriptTag({ content: `(function(){${ui}\nwindow.compactUI={etat,mettreAJourMonetisation,afficherListeHistorique,mettreAJourResumeCompteConnecte,mettreAJourNavigationProtegee,afficherVueAdministration};})();` });
    await page.evaluate(() => {
      const { etat } = compactUI;
      etat.utilisateur = { id: 1, nom: "Hossam", acces_active: 1, public_id: "HD-001", scope: { roles: ["handler"] } };
      etat.monetisation = {
        montant_total: 1250,
        intervenants: [{ id: 1, nom: "Hossam", montant_du: 750, seances_facturables: 5, seances_essai_faites: 2, tarifs_horaires_appliques: [150] },
          { id: 2, nom: "Marie Dupont", montant_du: 500, seances_facturables: 4, seances_essai_faites: 1 }],
        equipes: [{ handler_id: 1, handler_nom: "Hossam", montant_total: 750, seances_facturables: 5, seances_essai_faites: 1 },
          { handler_id: 2, handler_nom: "Abdo", montant_total: 500, seances_facturables: 4, seances_essai_faites: 2 }],
      };
      etat.monetisationResultatsVisibles = false;
      compactUI.mettreAJourMonetisation();
      etat.historique = [
        { id: 1, action_type: "seance_creee", action_label: "Séance créée", seance_libelle: "Mathématiques — Benjamin", acteur_nom: "Hossam", created_at: "2026-10-15 10:30:00" },
        { id: 2, action_type: "seance_modifiee", action_label: "Séance modifiée", seance_libelle: "Physique-chimie — Marie", acteur_nom: "Hossam", created_at: "2026-10-15 11:00:00" },
      ];
      compactUI.afficherListeHistorique();
      compactUI.mettreAJourResumeCompteConnecte();
      document.getElementById("home-section").classList.add("hidden");
    });
    assert.equal(await page.$eval("#monetisation-results", el => getComputedStyle(el).display), "none", "Results remain hidden before calculation");
    await page.evaluate(() => { compactUI.etat.monetisationResultatsVisibles = true; compactUI.mettreAJourMonetisation(); });
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 950 });
      for (const section of ["monetisation", "historique", "utilisateur"]) {
        await page.evaluate(section => {
          document.querySelectorAll(".app-section").forEach(el => el.classList.add("hidden"));
          document.getElementById(`${section}-section`).classList.remove("hidden");
          scrollTo(0, 0);
        }, section);
        assert.ok(await page.$eval(`#${section}-section`, el => el.scrollWidth <= el.clientWidth + 1), `${section} fits ${width}px`);
        if (width === 390) await page.screenshot({ path: path.join(require("node:os").tmpdir(), `sp-compact-${section}.png`), fullPage: true });
        if (section === "monetisation") {
          assert.match(await page.$eval("#monetisation-total-amount", el => el.textContent), /1.?250/);
          assert.equal(await page.$$("#monetisation-totals-by-team .monetisation-account-card").then(els => els.length), 2);
          assert.equal(await page.$$("#monetisation-totals-by-intervenant .monetisation-account-card").then(els => els.length), 2);
          assert.ok(await page.evaluate(() => Math.abs(document.getElementById("monetisation-date-start").getBoundingClientRect().top - document.getElementById("monetisation-date-end").getBoundingClientRect().top) < 1));
        } else if (section === "historique") {
          assert.ok(await page.$$eval("#history-list .history-item", els => els.every(el => el.getBoundingClientRect().height < 140)), "History rows stay compact");
          assert.equal(await page.$eval("#history-count", el => el.textContent), "2");
        } else {
          assert.ok(await page.$eval("#user-password-form", el => el.getClientRects().length > 0));
          assert.equal(await page.$$("#user-password-form input[type='password']").then(els => els.length), 3);
          assert.ok(await page.$eval("#push-settings-card", el => el.getClientRects().length > 0));
          assert.ok(await page.$eval("#utilisateur-section > .panel", el => el.getBoundingClientRect().height < 500), "Default settings are genuinely compact");
          assert.equal(await page.$eval("#settings-security", el => el.open), false, "Password section is collapsed by default");
          await page.click("#settings-security > summary");
          assert.ok(await page.$eval("#current-password", el => el.getClientRects().length > 0));
          await page.click("#settings-notifications > summary");
          assert.equal(await page.$eval("#settings-security", el => el.open), false, "Only one settings section stays open");
          assert.ok(await page.$eval("#push-enable-button", el => el.getClientRects().length > 0));
          await page.click("#settings-notifications > summary");
        }
      }
    }
    await page.evaluate(() => {
      compactUI.etat.utilisateur.scope.roles = ["super_admin", "handler"];
      compactUI.mettreAJourResumeCompteConnecte();
      document.getElementById("admin-tools-panel").classList.remove("hidden");
      document.querySelectorAll("#utilisateur-section .settings-disclosure").forEach(el => { el.open = false; });
    });
    await page.setViewport({ width: 390, height: 950 });
    assert.ok(await page.$eval("#utilisateur-section > .panel", el => el.getBoundingClientRect().height < 650), "SuperAdmin also gets a compact overview");
    await page.screenshot({ path: path.join(require("node:os").tmpdir(), "sp-settings-admin-reorganized.png"), fullPage: true });
    for (const width of [1200, 320]) {
      await page.setViewport({ width, height: 950 });
      for (const view of ["accounts", "access", "security", "password", "notifications", "maintenance", "danger"]) {
        await page.evaluate(() => { document.getElementById("settings-administration").open = true; });
        await page.evaluate(view => compactUI.afficherVueAdministration(view), view);
        assert.ok(await page.$eval("#utilisateur-section", el => el.scrollWidth <= el.clientWidth + 1), `Admin ${view} fits ${width}px`);
        if (view === "password") assert.ok(await page.$eval("#current-password", el => el.getClientRects().length > 0), "Admin password shortcut opens its disclosure");
        if (view === "notifications") assert.ok(await page.$eval("#push-enable-button", el => el.getClientRects().length > 0), "Admin notification shortcut opens its disclosure");
        if (view === "danger") {
          assert.ok(await page.$eval("#admin-delete-user-password", el => el.required));
          assert.ok(await page.$eval("#admin-delete-user-form .security-notice", el => el.textContent.includes("définitive")), "Destructive-action warnings stay intact");
        }
      }
    }
    await page.evaluate(() => {
      compactUI.etat.utilisateur.scope.roles = ["handler"];
      compactUI.etat.utilisateur.doit_changer_mot_de_passe = 1;
      document.getElementById("settings-security").open = false;
      compactUI.mettreAJourResumeCompteConnecte();
    });
    assert.ok(await page.$eval("#current-password", el => el.getClientRects().length > 0));
    assert.ok(await page.$eval("#password-security-notice", el => el.getClientRects().length > 0), "Mandatory password change remains visible");
    assert.deepEqual(errors, []);
    console.log("compact sections: PASS (revenue totals/filters, history rows, password/notifications, phone/PC, no overflow)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
