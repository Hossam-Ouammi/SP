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
    await page.setViewport({ width: 1200, height: 1000, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="outside">Outside calendar</div><div id="calendar"></div>');
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    for (const name of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    }
    await page.addScriptTag({ content: fs.readFileSync("public/js/calendrier.js", "utf8").replace(/^export /gm, "") });
    await page.evaluate(() => {
      window.forms = [];
      window.sessions = [{ id: 1, handler_id: 1, intervenant_id: 1, date: "2034-06-21", heure_debut: "10:00", heure_fin: "11:00", etudiant: "Elève", statut_seance: "planifiee" }];
      window.cal = initialiserCalendrier(document.getElementById("calendar"), {
        navigationZoom: true,
        selectionMobileRapide: true,
        onSlotClick: () => forms.push("creation"),
        onSelect: () => forms.push("selection"),
        onEventClick: () => forms.push("event"),
        onEventDrop: () => forms.push("drop"),
        canDragSeance: () => true,
        onDatesSet: () => { if (window.cal) mettreAJourEvenements(cal, sessions); },
      });
      cal.gotoDate("2034-06-05");
    });
    const type = () => page.evaluate(() => cal.view.type);
    const cooldown = () => page.waitForFunction(() => performance.now() >= (cal.__navigationTactileIgnoreJusqua || 0));
    assert.equal(await page.$eval("#calendar .fc-header-toolbar", el => getComputedStyle(el).display !== "none"), true);
    assert.equal(await page.evaluate(() => {
      const e = new WheelEvent("wheel", { ctrlKey: true, deltaY: 70, bubbles: true, cancelable: true });
      document.querySelector("#calendar .fc-timegrid-body").dispatchEvent(e);
      return e.defaultPrevented;
    }), true);
    assert.equal(await type(), "dayGridMonth", "Trackpad zoom-out opens Month");
    assert.equal(await page.$("#calendar .fc-dayGridMonth-button"), null);
    assert.equal(await page.$("#calendar .fc-timeGridWeek-button"), null);
    await page.waitForSelector('.calendar-zoom-toggle[aria-label="Zoomer : vue semaine"]');
    assert.equal(await page.$eval(".calendar-month-title", el => el.textContent), "juin 2034");
    await page.evaluate(() => cal.next());
    await page.waitForFunction(() => document.querySelector(".calendar-month-title")?.textContent === "juillet 2034");
    await page.evaluate(() => cal.prev());
    await page.waitForFunction(() => document.querySelector(".calendar-month-title")?.textContent === "juin 2034");
    await page.evaluate(() => document.querySelector("#calendar .fc-daygrid-body").dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -70, bubbles: true, cancelable: true })));
    assert.equal(await type(), "timeGridWeek", "Trackpad zoom-in returns to Week");
    assert.equal(await page.$(".calendar-month-heading"), null, "The extra heading is month-only");
    await cooldown();
    await page.click(".calendar-zoom-toggle");
    assert.equal(await type(), "dayGridMonth", "Corner button opens Month");
    assert.equal(await page.evaluate(() => cal.getDate().toISOString().slice(0, 7)), "2034-06");
    assert.equal(await page.$("#calendar .fc-event-draggable"), null, "Month does not allow session drag");
    await cooldown();
    await page.click('#calendar .fc-daygrid-day[data-date="2034-06-21"] .fc-daygrid-day-number');
    assert.equal(await type(), "timeGridWeek");
    assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), "2034-06-19");
    assert.deepEqual(await page.evaluate(() => forms), [], "A month day does not create a session");
    await cooldown();
    await page.evaluate(() => cal.changeView("dayGridMonth"));
    await page.evaluate(() => cal.trigger("select", { view: cal.view, start: new Date("2034-06-21"), end: new Date("2034-06-22"), allDay: true }));
    assert.deepEqual(await page.evaluate(() => forms), [], "Month selection never opens a form");
    await page.click('#calendar [data-seance-id="1"]');
    assert.equal(await type(), "timeGridWeek");
    assert.deepEqual(await page.evaluate(() => forms), [], "Month event opens its week instead of edit actions");
    await cooldown();
    await page.evaluate(() => cal.changeView("dayGridMonth"));
    await page.click('#calendar .fc-daygrid-day[data-date="2034-06-14"] .fc-daygrid-day-frame');
    assert.equal(await type(), "timeGridWeek", "The blank part of a month day also opens its week");
    assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), "2034-06-12");
    assert.deepEqual(await page.evaluate(() => forms), []);
    await cooldown();
    await page.setViewport({ width: 390, height: 1000, hasTouch: true });
    await page.waitForFunction(() => document.getElementById("calendar").dataset.calendarMobile === "true");
    assert.equal(await page.$eval("#calendar .fc-header-toolbar", el => getComputedStyle(el).display), "none");
    await page.evaluate(() => cal.gotoDate("2034-06-05"));
    const touch = await page.createCDPSession();
    const points = await page.$eval("#calendar .fc-timegrid-body", el => {
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 18 };
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
      { id: 1, x: points.x - 55, y: points.y }, { id: 2, x: points.x + 55, y: points.y },
    ] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
      { id: 1, x: points.x - 30, y: points.y }, { id: 2, x: points.x + 30, y: points.y },
    ] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => cal.view.type === "dayGridMonth");
    assert.equal(await page.evaluate(() => visualViewport.scale), 1, "Pinch only changes the calendar, not page zoom");
    await cooldown();
    const centreMois = await page.$eval('#calendar .fc-daygrid-day[data-date="2034-06-12"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
      { id: 1, x: centreMois.x - 20, y: centreMois.y }, { id: 2, x: centreMois.x + 20, y: centreMois.y },
    ] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
      { id: 1, x: centreMois.x - 40, y: centreMois.y }, { id: 2, x: centreMois.x + 40, y: centreMois.y },
    ] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => cal.view.type === "timeGridWeek");
    assert.equal(await page.evaluate(() => visualViewport.scale), 1, "Mobile zoom-in also leaves page scale unchanged");
    await cooldown();
    await page.evaluate(() => cal.changeView("dayGridMonth"));
    assert.deepEqual(await page.evaluate(() => forms), []);
    await page.tap('#calendar .fc-daygrid-day[data-date="2034-06-12"] .fc-daygrid-day-number');
    assert.equal(await type(), "timeGridWeek");
    assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), "2034-06-12");
    // Hidden navigation buttons remain functional for horizontal gestures.
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.$eval('.calendar-native-scroller', el => el.scrollTo({ left: el.scrollLeft + el.clientWidth, behavior: 'smooth' }));
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-19'));
    assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), "2034-06-19");
    await page.evaluate(() => {
      for (const [name, scale] of [["gesturestart", 1], ["gesturechange", .6], ["gestureend", .6]]) {
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "scale", { value: scale });
        document.getElementById("calendar").dispatchEvent(event);
      }
    });
    await page.waitForFunction(() => cal.view.type === "dayGridMonth");
    assert.equal(await type(), "dayGridMonth", "Safari gesture events also support zoom-out");
    await cooldown();
    const moisAvant = await page.evaluate(() => cal.view.currentStart.toISOString());
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.$eval('.calendar-native-scroller', el => el.scrollTo({ left: el.scrollLeft - el.clientWidth, behavior: 'smooth' }));
    await page.waitForFunction(previous => cal.view.currentStart.toISOString() !== previous, {}, moisAvant);
    assert.notEqual(await page.evaluate(() => cal.view.currentStart.toISOString()), moisAvant);
    assert.equal(await page.evaluate(() => {
      const event = new WheelEvent("wheel", { ctrlKey: true, deltaY: 100, bubbles: true, cancelable: true });
      document.getElementById("outside").dispatchEvent(event); return event.defaultPrevented;
    }), false, "Outside calendar browser gestures are untouched");
    await page.setViewport({ width: 1200, height: 1000, hasTouch: true });
    await page.waitForFunction(() => document.getElementById("calendar").dataset.calendarMobile === "false");
    assert.equal(await page.$eval("#calendar .fc-header-toolbar", el => getComputedStyle(el).display !== "none"), true);
    await page.evaluate(() => cal.destroy());
    assert.equal(await page.evaluate(() => {
      const event = new WheelEvent("wheel", { ctrlKey: true, deltaY: 100, bubbles: true, cancelable: true });
      document.getElementById("calendar").dispatchEvent(event); return event.defaultPrevented;
    }), false, "Destroy removes pinch listeners");
    assert.deepEqual(errors, []);
    console.log("calendar pinch/month: PASS (touch, trackpad, Safari events, month overview, day-to-week, mobile toolbar, week navigation, cleanup)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
