const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    for (const n of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${n}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.cal = initialiserCalendrier(document.getElementById('calendar'), { navigationZoom: true, canSelectRange: () => false });
      cal.gotoDate('2034-06-05');
    });
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const client = await page.createCDPSession();
    const point = await page.$eval('.calendar-native-scroller', e => {
      const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 110 };
    });
    await page.evaluate(() => {
      window.originalScroller = document.querySelector('.calendar-native-scroller');
      window.axisLeft = document.querySelector('.calendar-native-axis').getBoundingClientRect().left;
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    // One uninterrupted contact. Cross many initial buffers in both directions.
    // Position changes simulate the browser's native scroll, never touchend.
    for (let offset of [...Array.from({ length: 18 }, (_, i) => i + 1), ...Array.from({ length: 30 }, (_, i) => 17 - i)]) {
      const expected = new Date(Date.UTC(2034, 5, 5 + offset * 7)).toISOString().slice(0, 10);
      await page.waitForFunction(expected => Array.from(originalScroller.querySelectorAll('.calendar-native-page')).some(e => e.dataset.pagingPeriod === expected), { timeout: 3000 }, expected);
      await page.evaluate(expected => {
        const pages = [...originalScroller.querySelectorAll('.calendar-native-page')].sort((a, b) => Number(a.style.order) - Number(b.style.order));
        const index = pages.findIndex(e => e.dataset.pagingPeriod === expected);
        originalScroller.scrollTo({ left: index * originalScroller.clientWidth, behavior: 'instant' });
      }, expected);
      await page.waitForFunction(expected => {
        const r = originalScroller.getBoundingClientRect();
        const visible = [...originalScroller.querySelectorAll('.calendar-native-page')].find(e => Math.abs(e.getBoundingClientRect().left - r.left) < 1);
        return visible?.dataset.pagingPeriod === expected;
      }, {}, expected);
      assert.ok(await page.evaluate(() => originalScroller === document.querySelector('.calendar-native-scroller') && originalScroller.isConnected), 'Never replace the scrollport during contact');
      assert.equal(await page.evaluate(() => cal.view.currentStart.toISOString().slice(0, 10)), '2034-06-05', 'No mid-touch FullCalendar rebuild');
      assert.equal(await page.$eval('.calendar-native-axis', e => e.getBoundingClientRect().left), await page.evaluate(() => axisLeft));
      // Allow near-edge prefetch to run while the same finger is held.
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const end = new Date(Date.UTC(2034, 5, 5 - 12 * 7)).toISOString().slice(0, 10);
    await page.waitForFunction(end => cal.view.currentStart.toISOString().startsWith(end), { timeout: 3000 }, end);
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    assert.equal(await page.$$('.calendar-native-page').then(a => a.length), 7, 'Return to bounded preloading after release');
    for (const direction of [-1, 1]) {
      const before = await page.evaluate(() => cal.view.currentStart.getTime());
      const position = await page.$eval('.calendar-native-scroller', e => {
        const r = e.getBoundingClientRect();
        window.scrollports = new Set();
        const observer = event => {
          if (event.target.classList?.contains('calendar-native-scroller')) scrollports.add(event.target);
        };
        window.wheelObserver = observer;
        document.addEventListener('scroll', observer, true);
        return { x: r.left + 100, y: r.top + 110 };
      });
      // A real continuous browser-generated mouse/trackpad scroll stream, not
      // individual scrollTo calls or a sequence of separate released gestures.
      await client.send('Input.synthesizeScrollGesture', { ...position, xDistance: direction * 5000,
        yDistance: 0, speed: 1800, gestureSourceType: 'mouse' });
      await page.waitForFunction(before => cal.view.currentStart.getTime() !== before, { timeout: 3000 }, before);
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      const result = await page.evaluate(() => {
        document.removeEventListener('scroll', wheelObserver, true);
        return { date: cal.view.currentStart.getTime(), ports: scrollports.size };
      });
      assert.ok((result.date - before) * -direction >= 10 * 7 * 86400000, 'Continuous trackpad gesture crosses more than three weeks');
      assert.ok(result.ports <= 2, 'Only the original scrollport and the final recentered one are used');
    }
    assert.deepEqual(errors, []);
    console.log('continuous calendar buffer: PASS (18 weeks forward, 30 back, one contact, no scrollport rebuild, fixed hours, recenter after release)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
