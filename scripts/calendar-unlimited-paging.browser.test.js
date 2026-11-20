const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    for (const n of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${n}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.cal = initialiserCalendrier(document.getElementById('calendar'), { navigationZoom: true, canSelectRange: () => false });
      cal.gotoDate('2034-06-05');
    });
    const client = await page.createCDPSession();
    const start = Date.UTC(2034, 5, 5);
    let offset = 0;
    for (const direction of [...Array(12).fill(1), ...Array(24).fill(-1), ...Array(12).fill(1)]) {
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      const contact = await page.$eval('.calendar-native-scroller', e => {
        const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 110 };
      });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact] });
      await page.evaluate(direction => {
        const e = document.querySelector('.calendar-native-scroller');
        window.settled = false;
        e.addEventListener('scrollend', () => { window.settled = true; }, { once: true });
        e.scrollTo({ left: (direction > 0 ? 6 : 0) * e.clientWidth, behavior: 'instant' });
      }, direction);
      // Scroll has already reached its snap/end before the finger is released.
      // Previously scrollend was discarded and the finite buffer never renewed.
      await page.waitForFunction(() => settled);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      offset += direction * 3;
      const expected = new Date(start + offset * 7 * 86400000).toISOString().slice(0, 10);
      await page.waitForFunction(expected => cal.view.currentStart.toISOString().startsWith(expected), { timeout: 2500 }, expected);
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      assert.equal(await page.$$('.calendar-native-page').then(a => a.length), 7, 'Bounded seven-page buffer renews indefinitely');
      assert.ok(await page.$eval('.calendar-native-scroller', e => Math.abs(e.scrollLeft - e.clientWidth * 3) < 1), 'New week is recentered');
    }
    assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), '2034-06-05');
    console.log('unlimited calendar paging: PASS (144 week offsets, both directions, held scrollend, seven-page memory bound)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
