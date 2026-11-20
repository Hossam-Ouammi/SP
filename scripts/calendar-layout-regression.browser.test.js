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
    await page.setViewport({ width: 1200, height: 1000 });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    for (const name of ["core", "daygrid", "timegrid", "interaction"]) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync("public/js/calendrier.js", "utf8").replace(/^export /gm, "") });
    await page.evaluate(() => {
      window.forms = 0;
      window.cal = initialiserCalendrier(document.getElementById("calendar"), {
        navigationZoom: true, canInteractIndisponibilite: () => false,
        onSlotClick: () => forms++, onSelect: () => forms++, onIndisponibiliteClick: () => forms++,
      });
      cal.gotoDate("2034-06-05");
      window.sessions = [{ id: 1, date: "2034-06-07", heure_debut: "16:00", heure_fin: "17:00", etudiant: "Sybille", intervenant_id: 1, handler_id: 1, statut_seance: "planifiee" }];
      window.blocks = [
        { id: 11, date: "2034-06-07", heure_debut: "08:00", heure_fin: "16:30", intervenant_id: 1 },
        { id: 12, date: "2034-06-07", heure_debut: "16:00", heure_fin: "19:00", intervenant_id: 1 },
      ];
      mettreAJourEvenements(cal, sessions);
    });
    await page.evaluate(() => {
      for (let i = 0; i < 25; i++) mettreAJourEvenements(cal, sessions, blocks);
    });
    assert.equal(await page.evaluate(() => cal.getEventSources().length), 1, 'Repeated refreshes never accumulate empty event sources');
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 1000 });
      await page.evaluate(() => mettreAJourEvenements(cal, sessions));
      const columnWidths = await page.evaluate(() => {
        const sheet = [...document.querySelectorAll('style')].find(el => el.textContent.includes('Center hour labels within'));
        const centered = sheet.textContent;
        sheet.textContent = centered.replace(/\/\* Center hour labels within[\s\S]*?(?=\/\* Keep unavailable periods)/, '');
        cal.updateSize();
        const original = document.querySelector('.fc-timegrid-slot-label').getBoundingClientRect().width;
        sheet.textContent = centered;
        cal.updateSize();
        return { original, centered: document.querySelector('.fc-timegrid-slot-label').getBoundingClientRect().width };
      });
      assert.ok(Math.abs(columnWidths.original - columnWidths.centered) < 1, `Original hour-column width preserved at ${width}px: ${JSON.stringify(columnWidths)}`);
      const hourCenters = await page.$$eval('.fc-timegrid-slot-label-cushion', labels => labels.map(label => {
        const text = label.getBoundingClientRect(), cell = label.closest('td').getBoundingClientRect();
        return Math.abs((text.left + text.right - cell.left - cell.right) / 2);
      }));
      assert.ok(hourCenters.length && hourCenters.every(offset => offset < 1), `Centered hour column at ${width}px: ${hourCenters}`);
      const hourLines = await page.$$eval('.fc-timegrid-slot-label-cushion', labels => labels.map(label => {
        const text = label.getBoundingClientRect(), cell = label.closest('td').getBoundingClientRect();
        const style = getComputedStyle(label.closest('td'));
        return { offset: Math.abs((text.top + text.bottom) / 2 - cell.top), top: text.top - cell.top, border: style.borderTopColor };
      }));
      assert.ok(hourLines.every((line, index) => (index === 0 ? line.top >= 0 : line.offset < 1) && line.border === 'rgba(0, 0, 0, 0)'), `First hour stays below header; other hours sit on lines: ${JSON.stringify(hourLines)}`);
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      const firstHour = await page.evaluate(() => {
        const header = document.querySelector('.calendar-native-page-header').getBoundingClientRect();
        const hour = document.querySelector('.calendar-native-hour-label').getBoundingClientRect();
        return hour.top - header.bottom;
      });
      assert.ok(firstHour >= 0, `Fixed first hour never overlaps the days at ${width}px: ${firstHour}`);
      assert.ok(await page.evaluate(() => {
        const wrapper = document.querySelector('.calendar-native-page-header');
        const line = getComputedStyle(wrapper, '::after');
        const corner = getComputedStyle(document.querySelector('.calendar-native-corner'));
        return line.content === '""' && line.position === 'absolute' && line.bottom === '0px' &&
          line.borderTopStyle === 'solid' && line.borderTopWidth === '1px' &&
          line.borderTopColor === corner.borderBottomColor && getComputedStyle(wrapper).position === 'relative';
      }), `Day/hour divider is actually painted outside the collapsed table at ${width}px`);
      const solo = await page.$eval('[data-seance-id="1"]', el => el.getBoundingClientRect().width);
      await page.evaluate(() => mettreAJourEvenements(cal, sessions, blocks));
      const shaded = await page.$eval('[data-seance-id="1"]', el => el.getBoundingClientRect().width);
      assert.ok(Math.abs(shaded - solo) < 1, `Read-only shading must not shrink sessions at ${width}px: ${solo} / ${shaded}`);
      assert.equal(await page.$$('.fc-bg-event[data-indisponibilite-id]').then(els => els.length), 2);
      await page.$eval('[data-indisponibilite-id="11"]', el => el.click());
      await page.click('[data-indisponibilite-id="11"]');
      assert.equal(await page.evaluate(() => forms), 0);
      const corner = await page.$eval(".calendar-zoom-cell", el => {
        const cell = el.getBoundingClientRect(), button = el.querySelector("button").getBoundingClientRect(), icon = el.querySelector(".calendar-corner-month").getBoundingClientRect();
        return { full: Math.abs(cell.width - button.width) <= 2 && Math.abs(cell.height - button.height) <= 2,
          centered: Math.abs((icon.left + icon.right - cell.left - cell.right) / 2) < 1 && Math.abs((icon.top + icon.bottom - cell.top - cell.bottom) / 2) < 1,
          x: cell.left + 3, y: cell.top + 3 };
      });
      assert.ok(corner.full && corner.centered, "The whole corner is clickable, with centered arrows");
      assert.equal(await page.$(".calendar-zoom-toggle circle"), null, "No magnifying glass remains");
      await page.mouse.click(corner.x, corner.y);
      await page.waitForFunction(() => cal.view.type === "dayGridMonth");
      await page.click(".calendar-month-heading .calendar-zoom-toggle");
      await page.waitForFunction(() => cal.view.type === "timeGridWeek");
      await page.evaluate(() => cal.gotoDate("2034-06-05"));
    }
    await page.evaluate(() => cal.setOption('slotMinTime', '09:00:00'));
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    assert.ok(await page.evaluate(() => {
      const label = document.querySelector('.calendar-native-hour-label');
      const header = document.querySelector('.calendar-native-page-header');
      return label.textContent.includes('09') && label.getBoundingClientRect().top >= header.getBoundingClientRect().bottom;
    }), 'A calendar starting at 09 h keeps the first label entirely below the days');
    for (const [date, month] of [['2034-09-04', 'Sep'], ['2034-11-06', 'Nov']]) {
      await page.evaluate(date => cal.gotoDate(date), date);
      await page.waitForFunction(month => document.querySelector('.calendar-corner-month')?.textContent === month, {}, month);
      assert.equal(await page.$('.calendar-zoom-cell .calendar-zoom-toggle svg'), null, 'Week corner shows the month instead of an icon');
    }
    assert.deepEqual(errors, []);
    console.log("calendar layout regression: PASS (read-only shading, unchanged session widths, full-cell zoom, centered arrows, PC/mobile)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
