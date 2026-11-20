const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="calendar"></div><div style="height:1000px"></div>');
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    for (const name of ['core', 'daygrid', 'timegrid', 'interaction']) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    }
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.drops = []; window.resizes = [];
      window.cal = initialiserCalendrier(document.getElementById('calendar'), {
        canDragSeance: () => true,
        onEventDrop: info => window.drops.push(info.event.startStr),
        onEventResize: info => window.resizes.push((info.event.end - info.event.start) / 60000),
        navigationZoom: true,
      });
      window.cal.gotoDate('2034-06-05');
      mettreAJourEvenements(window.cal, [{ id: 1, etudiant: 'Test', date: '2034-06-06', heure_debut: '10:00', heure_fin: '11:00', statut_seance: 'planifiee' }]);
    });
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const client = await page.createCDPSession();
    const send = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const centre = await page.$eval('.fc-event-draggable', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + 12, action: getComputedStyle(el).touchAction };
    });
    assert.equal(centre.action, 'none', 'Browser pan is disabled BEFORE long press');
    const hour = await page.$eval('.fc-timegrid-slot[data-time="10:00:00"]', el => el.getBoundingClientRect().height * 2);
    const initial = await page.evaluate(() => ({ y: scrollY, x: document.querySelector('.calendar-native-scroller').scrollLeft, scale: visualViewport.scale }));
    await send('touchStart', [{ x: centre.x, y: centre.y }]);
    // Finger jitter during the hold used to let the browser steal the gesture.
    await send('touchMove', [{ x: centre.x + 2, y: centre.y + 2 }]);
    await page.waitForFunction(() => document.querySelector('.fc-event-mirror'));
    assert.equal(await page.evaluate(() => window.cal.__editionTactileEnCours), true);
    assert.equal(await page.evaluate(() => document.getElementById('calendar').dispatchEvent(new Event('gesturestart', { bubbles: true, cancelable: true }))), false);
    for (let i = 1; i <= 12; i++) {
      await send('touchMove', [{ x: centre.x + 4, y: centre.y + hour * 2 * i / 12 }]);
    }
    await send('touchEnd', []);
    await page.waitForFunction(() => window.drops.length === 1);
    assert.ok((await page.evaluate(() => window.drops[0])).includes('T12:00'));
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const after = await page.evaluate(() => ({ y: scrollY, x: document.querySelector('.calendar-native-scroller').scrollLeft, scale: visualViewport.scale }));
    assert.deepEqual(after, initial, 'Dragging neither scrolls the page/week nor zooms');
    assert.equal(await page.evaluate(() => window.cal.__editionTactileEnCours), false);
    const handle = await page.$eval('.fc-event-selected .fc-event-resizer-end', el => {
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await send('touchStart', [handle]);
    for (let i = 1; i <= 12; i++) await send('touchMove', [{ x: handle.x, y: handle.y + hour * i / 12 }]);
    await send('touchEnd', []);
    await page.waitForFunction(() => window.resizes.length === 1);
    assert.equal(await page.evaluate(() => window.resizes[0]), 120);
    assert.equal(await page.evaluate(() => scrollY), initial.y);
    assert.equal(await page.evaluate(() => window.cal.__editionTactileEnCours), false);
    // Cancellation must release the guard as well, without swallowing later pans.
    await send('touchStart', [handle]);
    await send('touchCancel', []);
    assert.equal(await page.evaluate(() => window.cal.__editionTactileEnCours), false);
    assert.equal(await page.evaluate(() => document.dispatchEvent(new Event('touchmove', { cancelable: true }))), true);
    assert.deepEqual(errors, []);
    console.log('calendar mobile editing browser test: PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
