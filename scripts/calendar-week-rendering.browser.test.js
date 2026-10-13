const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({ width: 390, height: 700, hasTouch: true, isMobile: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve("public/css/style.css") });
    for (const name of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    }
    await page.addScriptTag({ content: fs.readFileSync("public/js/calendrier.js", "utf8").replace(/^export /gm, "") });
    await page.evaluate(() => {
      window.touchEnds = 0;
      window.formOpenings = 0;
      document.getElementById("calendar").addEventListener("touchend", () => window.touchEnds++);
      const indisponibilites = [];
      for (let day = 5; day <= 24; day++) {
        indisponibilites.push({ id: day, date: `2034-06-${String(day).padStart(2, "0")}`, intervenant_id: 77, heure_debut: "08:00", heure_fin: "20:00", jour_complet: 0 });
      }
      window.refresh = () => mettreAJourEvenements(window.cal, [], [], {
        vue: "central",
        disponibilites: { intervenants: [{ id: 77, nom: "Prof" }], indisponibilites, seances: [] },
      });
      window.cal = initialiserCalendrier(document.getElementById("calendar"), {
        onDatesSet: () => { if (window.cal) window.refresh(); },
        onSlotClick: () => window.formOpenings++,
        onSelect: () => window.formOpenings++,
      });
      window.cal.gotoDate("2034-06-05");
      window.refresh();
    });
    const presentation = () => page.$$eval("#calendar .fc-bg-event", (elements) => elements.map((el) => ({
      classes: el.className,
      background: getComputedStyle(el).backgroundColor,
    })));
    const assertGrey = async () => {
      const events = await presentation();
      assert.ok(events.length > 0, "Les indisponibilités collectives doivent être visibles");
      assert.ok(events.every((event) => event.classes.includes("calendar-availability-unavailable")), JSON.stringify(events));
      assert.ok(events.every((event) => event.background !== "rgb(55, 136, 216)"), JSON.stringify(events));
      assert.equal(await page.$$eval("#calendar .fc-highlight, #calendar .fc-event-mirror", (els) => els.length), 0);
    };
    await assertGrey();
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.cal.next());
      await assertGrey();
      await page.evaluate(() => window.cal.prev());
      await assertGrey();
    }
    const touch = await page.createCDPSession();
    for (const direction of [1, -1, 1, -1]) {
      const points = await page.evaluate(() => {
        const rect = document.querySelector("#calendar .fc-timegrid-body").getBoundingClientRect();
        return { left: rect.left + 65, right: rect.right - 30, y: rect.top + 90 };
      });
      const start = direction > 0 ? points.right : points.left;
      const end = direction > 0 ? points.left : points.right;
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y: points.y }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: end, y: points.y }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await assertGrey();
      await new Promise((resolve) => setTimeout(resolve, 1150));
      await assertGrey();
    }
    assert.equal(await page.evaluate(() => window.touchEnds), 4,
      "FullCalendar doit recevoir la fin de chaque balayage pour terminer ses interactions");
    const beforeScroll = await page.evaluate(() => ({
      y: scrollY, week: window.cal.view.currentStart.toISOString(),
      x: document.querySelector("#calendar .fc-timegrid-body").getBoundingClientRect().left + 85,
    }));
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: beforeScroll.x, y: 400 }] });
    for (const y of [360, 320, 280, 240]) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: beforeScroll.x + 3, y }] });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction((y) => scrollY > y, {}, beforeScroll.y);
    await new Promise((resolve) => setTimeout(resolve, 1150));
    await assertGrey();
    assert.equal(await page.evaluate(() => window.cal.view.currentStart.toISOString()), beforeScroll.week,
      "Le défilement vertical ne change pas la semaine");
    assert.equal(await page.evaluate(() => window.formOpenings), 0, "Défiler ne doit pas ouvrir de formulaire");
    await page.touchscreen.tap(beforeScroll.x, 350);
    await page.waitForFunction(() => window.formOpenings === 1);
    await assertGrey();
    assert.deepEqual(errors, []);
    console.log("calendar week rendering: PASS (collective unavailability stays grey after navigation)");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
