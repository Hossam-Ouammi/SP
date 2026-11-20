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
    await page.setViewport({ width: 390, height: 900 });
    await page.evaluate(() => { cal.changeView("timeGridWeek", "2034-06-05"); });
    await page.waitForFunction(() => document.getElementById("calendar").dataset.calendarMobile === "true");
    const mobilePoint = await point("2034-06-06", "12:30");
    const scrollAvant = await page.evaluate(() => scrollY);
    await page.evaluate(() => window.startGhost());
    assert.equal(await page.evaluate(() => document.body.style.position), "fixed");
    const touch = await page.createCDPSession();
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mobilePoint.x, y: mobilePoint.y, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.equal(await page.evaluate(() => scrollY), scrollAvant);
    assert.equal(await page.evaluate(() => copies.length), 2, "Mobile placement creates exactly one copy");
    await page.evaluate(() => window.startGhost());
    await page.tap(".calendar-duplicate-cancel");
    assert.equal(await page.$(".calendar-duplicate-ghost"), null);
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    const mobileInterdit = await point("2034-06-06", "10:00");
    await page.evaluate(() => window.startGhost());
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mobileInterdit.x, y: mobileInterdit.y, id: 1 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.equal(await page.evaluate(() => copies.length), 2, "Forbidden mobile placement unlocks without writing");
    for (const width of [1200, 390]) {
      await page.setViewport({ width, height: 900 });
      await page.evaluate(() => { cal.gotoDate('2034-06-05'); cal.updateSize(); });
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      await page.evaluate(() => window.startGhost());
      const edges = await page.evaluate(() => {
        const r = (document.querySelector('.calendar-native-scroller') || document.querySelector('.fc-timegrid-body')).getBoundingClientRect();
        const row = document.querySelector('.fc-timegrid-slot-lane[data-time="12:30:00"]').getBoundingClientRect();
        return { left: { x: r.left + 5, y: row.top + 5 }, right: { x: Math.min(r.right, innerWidth) - 5, y: row.top + 5 } };
      });
      const beforeCopy = await page.evaluate(() => copies.length);
      if (width > 720) await page.mouse.move(edges.right.x, edges.right.y);
      else await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [edges.right] });
      await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'));
      assert.ok(await page.$('.calendar-duplicate-ghost'), 'Auto-navigation preserves the ghost');
      // No extra movement: staying at the edge must advance another week.
      await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-19'));
      if (width > 720) await page.mouse.move(edges.left.x, edges.left.y);
      else await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [edges.left] });
      await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'));
      assert.equal(await page.evaluate(() => copies.length), beforeCopy, 'No write during edge navigation');
      const target = await point('2034-06-13', '12:30');
      if (width > 720) {
        await page.mouse.move(target.x, target.y);
        await page.mouse.click(target.x, target.y);
      } else {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      assert.equal(await page.evaluate(() => copies.length), beforeCopy + 1);
      assert.deepEqual(await page.evaluate(() => copies.at(-1)), { date: '2034-06-13', heure_debut: '12:30' });
      assert.equal(await page.$('.calendar-duplicate-ghost'), null);
      await new Promise(resolve => setTimeout(resolve, 1050));
      assert.ok((await page.evaluate(() => cal.view.currentStart.toISOString())).startsWith('2034-06-12'), 'Drop stops the automatic navigator');
    }
    assert.deepEqual(errors, []);
    console.log("session duplicate ghost: PASS (preview, colours, snapping, Escape, invalid/outside cancellation, week navigation)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
