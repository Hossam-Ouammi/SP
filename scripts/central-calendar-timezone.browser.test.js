const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const racine = path.join(__dirname, "..");
const sourcesFullCalendar = [
  "@fullcalendar/core/index.global.js",
  "@fullcalendar/daygrid/index.global.js",
  "@fullcalendar/timegrid/index.global.js",
  "@fullcalendar/interaction/index.global.js",
];

async function inspecterFuseau(browser, fuseauAppareil) {
  const page = await browser.newPage();
  try {
    await page.emulateTimezone(fuseauAppareil);
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent('<main><div id="calendar"></div></main>');

    for (const source of sourcesFullCalendar) {
      await page.addScriptTag({ path: path.join(racine, "node_modules", source) });
    }

    const sourceCalendrier = fs.readFileSync(
      path.join(racine, "public", "js", "calendrier.js"),
      "utf8"
    );
    await page.addScriptTag({
      content: `${sourceCalendrier.replace(/^export /gm, "")}\nwindow.calendrierTest = { initialiserCalendrier, mettreAJourEvenements };`,
    });

    return await page.evaluate(() => {
      const calendrier = window.calendrierTest.initialiserCalendrier(
        document.getElementById("calendar"),
        { timezoneCentrale: "Africa/Casablanca" }
      );
      calendrier.gotoDate("2026-03-01");
      window.calendrierTest.mettreAJourEvenements(calendrier, [
        {
          id: 1,
          etudiant: "Élève test",
          date: "2026-03-01",
          heure_debut: "10:00",
          heure_fin: "11:00",
          statut_seance: "planifiee",
        },
      ]);
      const seance = calendrier.getEventById("1");
      return {
        timeZone: calendrier.getOption("timeZone"),
        dateVisible: calendrier.getDate().toISOString(),
        debutSeance: seance.start.toISOString(),
        jourEntete: document.querySelector(".fc-col-header-cell[data-date='2026-03-01']")?.textContent?.trim(),
      };
    });
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const newYork = await inspecterFuseau(browser, "America/New_York");
    const tokyo = await inspecterFuseau(browser, "Asia/Tokyo");
    assert.deepEqual(newYork, tokyo);
    assert.equal(newYork.timeZone, "Africa/Casablanca");
    assert.equal(newYork.debutSeance, "2026-03-01T10:00:00.000Z");
    assert.ok(newYork.jourEntete);
    console.log("central calendar timezone browser test: PASS");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
