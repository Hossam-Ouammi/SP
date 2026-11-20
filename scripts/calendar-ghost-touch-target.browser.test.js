const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="height:150px"></div><div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    for (const n of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${n}/index.global.js`) });
    for (const n of ['calendrier', 'session-duplicate-ghost']) await page.addScriptTag({ content: fs.readFileSync(`public/js/${n}.js`, 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.copies = [];
      window.drops = [];
      window.cal = initialiserCalendrier(document.getElementById('calendar'), { navigationZoom: true,
        canDragSeance: () => true, onEventDrop: info => drops.push(info.event.startStr) });
      cal.gotoDate('2034-06-05');
      window.source = { id: 1, etudiant: 'Source', date: '2034-06-05', heure_debut: '10:00', heure_fin: '11:00', statut_seance: 'planifiee' };
      mettreAJourEvenements(cal, [source]);
      cal.on('datesSet', () => mettreAJourEvenements(cal, [source]));
    });
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const start = await page.$eval('[data-seance-id="1"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 12 }; });
    await page.evaluate(() => {
      window.ghost = commencerDuplicationFantome({ element: document.getElementById('calendar'), calendrier: cal,
        seance: source, verifier: () => '', confirmer: value => copies.push(value) });
    });
    const client = await page.createCDPSession();
    const send = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await send('touchStart', [start]);
    // A real datesSet replaces session nodes under the finger. The touch must
    // survive that update and still reach the edge navigator and final drop.
    await page.evaluate(() => mettreAJourEvenements(cal, []));
    const edges = await page.evaluate(() => {
      const r = document.getElementById('calendar').getBoundingClientRect();
      return { right: { x: r.right - 8, y: 420 }, middle: { x: r.left + r.width / 2, y: 420 } };
    });
    for (let i = 1; i <= 10; i++) await send('touchMove', [{ x: start.x + (edges.right.x - start.x) * i / 10, y: start.y + (edges.right.y - start.y) * i / 10 }]);
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'), { timeout: 3000 });
    await send('touchMove', [edges.middle]);
    await send('touchEnd', []);
    assert.equal(await page.evaluate(() => copies.length), 1, 'Detached event nodes cannot strand mobile placement');
    assert.equal(await page.$('.calendar-duplicate-ghost'), null);
    await page.evaluate(() => cal.gotoDate('2034-06-05'));
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const original = await page.$eval('[data-seance-id="1"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 12 }; });
    await send('touchStart', [original]);
    await page.waitForSelector('.fc-event-mirror');
    await send('touchMove', [edges.right]);
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'), { timeout: 3000 });
    await send('touchMove', [edges.middle]);
    await send('touchEnd', []);
    await page.waitForFunction(() => drops.length === 1, { timeout: 3000 });
    assert.ok((await page.evaluate(() => drops[0])).startsWith('2034-06-15'), 'Real touch drag remains usable after datesSet replaces session DOM');
    await page.evaluate(() => { drops.length = 0; cal.gotoDate('2034-06-05'); });
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const held = await page.$eval('[data-seance-id="1"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 12 }; });
    await send('touchStart', [held]);
    await page.waitForSelector('.fc-event-mirror');
    await send('touchMove', [edges.right]);
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'), { timeout: 3000 });
    await send('touchEnd', []);
    await page.waitForFunction(() => drops.length === 1, { timeout: 3000 });
    assert.ok((await page.evaluate(() => drops[0])).startsWith('2034-06-18'), 'Releasing without another movement uses the displayed week, never the previous week');
    console.log('ghost touch-target replacement: PASS');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
