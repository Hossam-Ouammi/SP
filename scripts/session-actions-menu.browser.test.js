const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const template = fs.readFileSync("views/index.ejs", "utf8");
    const detailActions = template.match(/<div class="detail-actions">[\s\S]*?<\/div>/)[0];
    await page.setContent(`<button id="origin">Séance</button><div id="detail">${detailActions}</div>`);
    await page.addStyleTag({ path: path.resolve("public/css/style.css") });
    await page.addScriptTag({ content: fs.readFileSync("public/js/seance-context-menu.js", "utf8").replace(/^export /gm, "") });
    await page.evaluate(() => {
      window.actions = [];
      window.menu = creerMenuContextuelSeance();
      window.open = (modifiable = true, options = {}) => window.menu.ouvrir({
        seance: { id: 1, etudiant: "Élève" },
        info: { el: document.getElementById("origin"), jsEvent: { clientX: 40, clientY: 40 } },
        peutModifier: () => modifiable, onAction: action => window.actions.push(action), ...options,
      });
    });
    for (const width of [1200, 375]) {
      await page.setViewport({ width, height: 800 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => window.open());
      assert.deepEqual(await page.$$eval("#seance-context-menu button", buttons => buttons.map(button => button.textContent)),
        ["Informations", "Dupliquer", "Supprimer"]);
      assert.equal(await page.$('#seance-context-menu [data-action="modifier"]'), null);
      await page.click('#seance-context-menu [data-action="information"]');
      assert.equal(await page.$eval("#seance-context-menu", el => el.hidden), true);
      assert.deepEqual(await page.$$eval("#detail .detail-actions button", buttons => buttons.map(button => button.textContent.trim())), ["Modifier", "Supprimer"]);
      assert.equal(await page.$("#duplicate-seance-button"), null);
      await page.evaluate(() => window.open(false));
      assert.deepEqual(await page.$$eval("#seance-context-menu button", buttons => buttons.map(button => button.disabled)), [false, true, true]);
      await page.evaluate(() => window.open(true, { actions: [["modifier", "Modifier"], ["dupliquer", "Dupliquer"], ["supprimer", "Supprimer"]] }));
      assert.deepEqual(await page.$$eval("#seance-context-menu button", buttons => buttons.map(button => button.textContent)), ["Modifier", "Dupliquer", "Supprimer"],
        "Le menu des indisponibilités reste inchangé");
    }
    assert.deepEqual(errors, []);
    console.log("session actions menu: PASS (PC/mobile, detail actions, read-only permissions, unavailability unchanged)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
