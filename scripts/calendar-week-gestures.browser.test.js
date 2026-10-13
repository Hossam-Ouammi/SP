const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on("pageerror", (error) => erreurs.push(error.message));
    await page.setViewport({ width: 1200, height: 1000, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve("public/css/style.css") });
    for (const nom of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${nom}/index.global.js`) });
    }
    await page.addScriptTag({ content: fs.readFileSync("public/js/calendrier.js", "utf8").replace(/^export /gm, "") });
    await page.evaluate(() => {
      window.selections = [];
      window.clics = [];
      window.cal = initialiserCalendrier(document.getElementById("calendar"), {
        selectionMobileRapide: true,
        onSelect: (selection) => window.selections.push(selection),
        onSlotClick: (selection) => window.clics.push(selection),
      });
      window.cal.gotoDate("2034-06-05");
    });
    const date = () => page.evaluate(() => window.cal.view.currentStart.toISOString().slice(0, 10));
    const wheel = async (deltaX, deltaY = 0) => {
      const cible = await page.$eval("#calendar .fc-toolbar-title", (element) => {
        const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.move(cible.x, cible.y);
      await page.mouse.wheel({ deltaX, deltaY });
    };
    // Keep one momentum burst within one browser task: separate Puppeteer
    // round trips can exceed the intentional 500 ms gesture-idle threshold.
    await page.evaluate(() => {
      const cible = document.querySelector("#calendar .fc-toolbar-title");
      for (const deltaX of [100, 90, 70]) {
        cible.dispatchEvent(new WheelEvent("wheel", { deltaX, bubbles: true, cancelable: true }));
      }
    });
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-12"));
    assert.equal(await date(), "2034-06-12");
    await wheel(-100);
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-05"));
    await wheel(0, 120);
    assert.equal(await date(), "2034-06-05", "La molette verticale ne change pas la semaine");

    await page.setViewport({ width: 390, height: 1000, hasTouch: true });
    await page.waitForFunction(() => document.querySelector('#calendar[data-calendar-mobile="true"]') &&
      document.querySelector("#calendar .fc-timegrid-body").getBoundingClientRect().right <= innerWidth);
    const touch = await page.createCDPSession();
    async function glisser(direction) {
      await page.$eval("#calendar", (element) => element.scrollIntoView({ block: "start" }));
      const points = await page.evaluate(() => {
        const rect = document.querySelector("#calendar .fc-timegrid-body").getBoundingClientRect();
        return { gauche: rect.left + 75, droite: rect.right - 35, y: rect.top + 8 };
      });
      const debut = direction > 0 ? points.droite : points.gauche;
      const fin = direction > 0 ? points.gauche : points.droite;
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: debut, y: points.y }] });
      for (let i = 1; i <= 4; i++) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: debut + (fin - debut) * i / 4, y: points.y }] });
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await glisser(1);
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-12"));
    await glisser(-1);
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-05"));
    assert.deepEqual(await page.evaluate(() => [window.selections.length, window.clics.length]), [0, 0], "Un balayage ne crée pas de séance/indisponibilité");

    await page.evaluate(() => window.cal.setOption("validRange", { start: "2034-06-05", end: "2034-06-19" }));
    await glisser(-1);
    assert.equal(await date(), "2034-06-05", "Impossible d'aller avant la semaine publique actuelle");
    await glisser(1);
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-12"));
    await glisser(1);
    assert.equal(await date(), "2034-06-12", "Impossible de dépasser la semaine publique suivante");
    await glisser(-1);
    await page.waitForFunction(() => window.cal.view.currentStart.toISOString().startsWith("2034-06-05"));
    await page.evaluate(() => window.cal.destroy());
    assert.deepEqual(erreurs, []);
    console.log("calendar week gestures: PASS (trackpad, touch, no selection, public two-week bounds)");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
