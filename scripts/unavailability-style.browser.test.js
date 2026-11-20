const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ content: fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '') });
    for (const name of ['core','daygrid','timegrid','interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js','utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.interact = true;
      window.cal = initialiserCalendrier(document.getElementById('calendar'), {
        canInteractIndisponibilite: () => interact, onIndisponibiliteResize: () => {}, canResizeIndisponibilite: () => true,
      });
      cal.gotoDate('2034-06-05');
      window.block = { id: 11, date: '2034-06-07', heure_debut: '08:00', heure_fin: '12:00', intervenant_id: 1 };
    });
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      const styles = await page.evaluate(() => {
        const style = selector => { const s = getComputedStyle(document.querySelector(selector)); return { image: s.backgroundImage, color: s.backgroundColor, opacity: s.opacity, border: s.borderTopColor }; };
        interact = true; mettreAJourEvenements(cal, [], [block]);
        const reference = style('[data-indisponibilite-id="11"]');
        interact = false; mettreAJourEvenements(cal, [], [block]);
        const personal = style('[data-indisponibilite-id="11"]');
        cal.removeAllEvents();
        cal.addEvent({ start: '2034-06-07T08:00:00', end: '2034-06-07T12:00:00', display: 'background', classNames: ['calendar-availability-unavailable'] });
        const collective = style('.calendar-availability-unavailable');
        return { reference, personal, collective };
      });
      assert.equal(styles.reference.opacity, '0.6', `Readable shading at ${width}px`);
      assert.deepEqual(styles.personal, styles.reference, `Personal blocks match between modes at ${width}px`);
      assert.deepEqual(styles.collective, styles.reference, `Global shading matches personal blocks at ${width}px`);
    }
    console.log('unavailability style: PASS (same light shading in both modes and global view, PC/mobile)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
