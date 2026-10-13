const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const id of ["calendar", "unavailability-calendar"]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 1100 });
      await page.setContent(`<div id="${id}"></div>`);
      await page.addStyleTag({ path: path.resolve("public/css/style.css") });
      for (const name of ["core", "daygrid", "timegrid", "interaction"]) {
        await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
      }
      await page.addScriptTag({ content: fs.readFileSync("public/js/calendrier.js", "utf8").replace(/^export /gm, "") });
      await page.evaluate((id) => {
        window.changes = []; window.clicked = 0;
        window.cal = initialiserCalendrier(document.getElementById(id), {
          canResizeIndisponibilite: i => !i.est_seance_confidentielle,
          onIndisponibiliteResize: info => window.changes.push((info.event.end - info.event.start) / 60000),
          onIndisponibiliteClick: () => { window.clicked++; },
          timezoneCentrale: "Africa/Casablanca",
        });
        window.cal.gotoDate("2034-06-05");
        mettreAJourEvenements(window.cal, [], [
          { id: 1, date: "2034-06-05", heure_debut: "09:00", heure_fin: "12:00" },
          { id: 2, date: "2034-06-06", heure_debut: "09:00", heure_fin: "12:00", est_seance_confidentielle: true },
        ]);
      }, id);
      assert.equal(await page.$$(".fc-event-resizer-end").then(items => items.length), 1, "Only own declaration has handles");
      await page.hover(".fc-event-resizable");
      const position = await page.$eval(".fc-event-resizer-end", el => {
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const step = await page.$eval('.fc-timegrid-slot[data-time="12:00:00"]', el => el.getBoundingClientRect().height);
      await page.mouse.move(position.x, position.y);
      await page.mouse.down();
      await page.mouse.move(position.x, position.y + step, { steps: 10 });
      await page.mouse.up();
      await page.waitForFunction(() => window.changes.length === 1);
      assert.equal(await page.evaluate(() => window.changes[0]), 210, "Unavailability has no session two-hour limit");
      await page.setViewport({ width: 375, height: 1000 });
      const touch = await page.createCDPSession();
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
      const centre = await page.$eval(".fc-event-resizable", el => {
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 25 };
      });
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [centre] });
      await page.waitForFunction(() => document.querySelector(".fc-event-selected"));
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const handle = await page.$eval(".fc-event-selected .fc-event-resizer-end", el => {
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height };
      });
      assert.equal(handle.height, 14, "Touch grip uses larger hit area in both menus");
      const mobileStep = await page.$eval('.fc-timegrid-slot[data-time="12:00:00"]', el => el.getBoundingClientRect().height);
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: handle.x, y: handle.y }] });
      for (let i = 1; i <= 8; i++) await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x: handle.x, y: handle.y + mobileStep * i / 8 }],
      });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForFunction(() => window.changes.length === 2);
      assert.equal(await page.evaluate(() => window.changes[1]), 240);
      await page.close();
    }
    console.log("availability resize browser test: PASS");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
