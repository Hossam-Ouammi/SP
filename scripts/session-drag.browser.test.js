const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const racine = path.join(__dirname, "..");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1300, height: 1000 });
    await page.setContent('<div id="calendar"></div>');
    await page.addStyleTag({ path: path.join(racine, "public", "css", "style.css") });
    for (const module of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({
        path: path.join(racine, "node_modules", "@fullcalendar", module, "index.global.js"),
      });
    }
    const source = fs.readFileSync(path.join(racine, "public", "js", "calendrier.js"), "utf8");
    await page.addScriptTag({
      content: `${source.replace(/^export /gm, "")}\nwindow.calendrierTest = { initialiserCalendrier, mettreAJourEvenements };`,
    });
    await page.evaluate(() => {
      window.deplacements = [];
      window.redimensionnements = [];
      const calendrier = window.calendrierTest.initialiserCalendrier(
        document.getElementById("calendar"),
        {
          onEventDrop(info) {
            window.deplacements.push(info.event.start.toISOString());
          },
          onEventResize(info) {
            window.redimensionnements.push({ debut: info.event.start.toISOString(), duree: (info.event.end - info.event.start) / 60000 });
          },
          canDragSeance: () => true,
          timezoneCentrale: "Africa/Casablanca",
        }
      );
      calendrier.gotoDate("2034-06-05");
      window.calendrierTest.mettreAJourEvenements(calendrier, [{
        id: 1,
        etudiant: "Test",
        date: "2034-06-05",
        heure_debut: "10:00",
        heure_fin: "11:00",
        statut_seance: "planifiee",
      }], [{
        id: 2,
        date: "2034-06-05",
        heure_debut: "08:00",
        heure_fin: "09:00",
      }]);
    });
    assert.equal(await page.$$("#calendar .fc-event-draggable").then((items) => items.length), 1);
    const origine = await page.$eval("#calendar .fc-event-draggable", (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 10 };
    });
    const destination = await page.evaluate(() => {
      const colonne = document.querySelector('.fc-timegrid-col[data-date="2034-06-06"]');
      const ligne = document.querySelector('.fc-timegrid-slot[data-time="12:00:00"]');
      const x = colonne.getBoundingClientRect();
      const y = ligne.getBoundingClientRect();
      return { x: x.x + x.width / 2, y: y.y + 10 };
    });
    await page.mouse.move(origine.x, origine.y);
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 16 });
    await page.waitForFunction(() => {
      const repere = document.querySelector(".calendar-drag-time-indicator");
      return repere && !repere.hidden && repere.textContent === "12:00";
    });
    const alignement = await page.evaluate(() => {
      const repere = document.querySelector(".calendar-drag-time-indicator").getBoundingClientRect();
      const axe = document.querySelector(".fc-timegrid-slot-label").getBoundingClientRect();
      const miroir = document.querySelector(".fc-timegrid-event.fc-event-mirror").getBoundingClientRect();
      return Math.abs(repere.left - axe.left) < 1 && Math.abs(repere.top + repere.height / 2 - miroir.top) < 1;
    });
    assert.ok(alignement, "The time indicator follows the start of the dragged session in the hour column");
    const demiHeure = await page.$eval('.fc-timegrid-slot[data-time="12:30:00"]', (el) => el.getBoundingClientRect().top + 10);
    await page.mouse.move(destination.x, demiHeure, { steps: 4 });
    await page.waitForFunction(() => document.querySelector(".calendar-drag-time-indicator")?.textContent === "12:30");
    await page.mouse.up();
    await page.waitForFunction(() => window.deplacements.length === 1);
    assert.equal(await page.$(".calendar-drag-time-indicator"), null);
    assert.equal(await page.evaluate(() => window.deplacements[0]), "2034-06-06T12:30:00.000Z");
    const pas = await page.$eval('.fc-timegrid-slot[data-time="12:30:00"]', (el) => el.getBoundingClientRect().height);
    async function tirerBord(bord, delta) {
      const position = await page.$eval(`#calendar .fc-timegrid-event:not(.fc-event-mirror) .fc-event-resizer-${bord}`, (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(position.x, position.y);
      await page.mouse.down();
      await page.mouse.move(position.x, position.y + delta, { steps: 12 });
      await page.mouse.up();
    }
    await tirerBord("start", -pas);
    await page.waitForFunction(() => window.redimensionnements.length === 1);
    assert.deepEqual(await page.evaluate(() => window.redimensionnements[0]), { debut: "2034-06-06T12:00:00.000Z", duree: 90 });
    await tirerBord("end", pas);
    await page.waitForFunction(() => window.redimensionnements.length === 2);
    assert.equal(await page.evaluate(() => window.redimensionnements[1].duree), 120);
    await tirerBord("end", pas);
    await page.waitForFunction(() => !document.querySelector(".fc-event-mirror"));
    assert.equal(await page.evaluate(() => window.redimensionnements.length), 2, "Cannot resize beyond two hours");
    await page.setViewport({ width: 375, height: 850 });
    await page.waitForFunction(() => !document.querySelector("#calendar .fc-event-resizer"));
    console.log("session drag browser test: PASS");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
