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
    await page.setViewport({ width: 1300, height: 1000 });
    await page.setContent('<div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve("public/css/style.css") });
    for (const module of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${module}/index.global.js`) });
    }
    for (const file of ["calendrier.js", "session-duplicate-ghost.js"]) {
      await page.addScriptTag({ content: fs.readFileSync(`public/js/${file}`, "utf8").replace(/^export /gm, "") });
    }
    await page.evaluate(() => {
      window.copies = []; window.cancellations = []; window.forms = 0;
      window.cal = initialiserCalendrier(document.getElementById("calendar"), {
        onSlotClick: () => window.forms++, onSelect: () => window.forms++,
      });
      window.cal.gotoDate("2034-06-05");
      window.startGhost = () => {
        window.ghost = commencerDuplicationFantome({
          element: document.getElementById("calendar"), calendrier: window.cal,
          seance: { etudiant: "Copie test", heure_debut: "10:00", duree_minutes: 90 },
          palette: { backgroundColor: "#e2f4eb", borderColor: "#9ec9b3", textColor: "#245a3f" },
          verifier: cible => cible.heure_debut === "10:00" || cible.heure_fin > "23:30" ? "Créneau interdit" : "",
          confirmer: cible => window.copies.push(cible), annuler: erreur => window.cancellations.push(erreur || "Escape"),
        });
      };
    });
    const point = (date, heure) => page.evaluate((date, heure) => {
      const col = document.querySelector(`.fc-timegrid-col[data-date="${date}"]`).getBoundingClientRect();
      const row = document.querySelector(`.fc-timegrid-slot-lane[data-time="${heure}:00"]`);
      row.scrollIntoView({ block: "center" });
      const rect = row.getBoundingClientRect();
      return { x: col.left + col.width / 2, y: rect.top + rect.height / 4 };
    }, date, heure);
    await page.evaluate(() => window.startGhost());
    assert.equal(await page.evaluate(() => window.copies.length), 0, "Aucune création au démarrage");
    const valid = await point("2034-06-06", "12:30");
    await page.mouse.move(valid.x, valid.y);
    await page.waitForFunction(() => document.querySelector(".calendar-duplicate-ghost")?.dataset.allowed === "true");
    assert.equal(await page.$eval(".calendar-duplicate-ghost", el => getComputedStyle(el).backgroundColor), "rgb(226, 244, 235)");
    assert.match(await page.$eval(".calendar-duplicate-ghost", el => el.textContent), /12:30 – 14:00/);
    await page.keyboard.press("Escape");
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.equal(await page.evaluate(() => window.copies.length), 0);

    await page.evaluate(() => window.startGhost());
    const invalid = await point("2034-06-06", "10:00");
    await page.mouse.move(invalid.x, invalid.y);
    await page.waitForFunction(() => document.querySelector(".calendar-duplicate-ghost")?.classList.contains("is-forbidden"));
    await page.mouse.click(invalid.x, invalid.y);
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.equal(await page.evaluate(() => window.copies.length), 0, "Pose interdite sans création");

    await page.evaluate(() => window.startGhost());
    const next = await page.$eval(".fc-next-button", el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(next.x, next.y);
    assert.ok(await page.$(".calendar-duplicate-ghost"), "Navigation sans perdre la copie");
    const future = await point("2034-06-13", "12:30");
    await page.mouse.move(future.x, future.y);
    await page.mouse.click(future.x, future.y);
    assert.deepEqual(await page.evaluate(() => window.copies), [{ date: "2034-06-13", heure_debut: "12:30" }]);
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.equal(await page.evaluate(() => window.forms), 0, "La pose ne crée pas de sélection/formulaire parasite");

    await page.evaluate(() => window.startGhost());
    await page.mouse.click(3, 3);
    assert.equal(await page.evaluate(() => window.copies.length), 1, "Hors calendrier : annulation");
    await page.evaluate(() => window.cal.changeView("dayGridMonth"));
    await page.evaluate(() => window.startGhost());
    const month = await page.$eval('.fc-daygrid-day[data-date="2034-06-15"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(month.x, month.y);
    await page.mouse.click(month.x, month.y);
    // The source time (10:00) is forbidden in this test, even in month view.
    assert.equal(await page.evaluate(() => window.copies.length), 1);
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.deepEqual(errors, []);
    console.log("session duplicate ghost: PASS (preview, colours, snapping, Escape, invalid/outside cancellation, week navigation)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
