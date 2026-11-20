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
    await page.setViewport({ width: Number(process.env.SP_NATIVE_WIDTH || 390), height: 1000, isMobile: true, hasTouch: true });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="calendar"></div>');
    await page.addStyleTag({ content: fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '') });
    for (const name of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.forms = [];
      window.cal = initialiserCalendrier(document.getElementById('calendar'), { navigationZoom: true, onSlotClick: s => forms.push(s) });
      cal.gotoDate('2034-06-05');
      mettreAJourEvenements(cal, [
        { id: 1, etudiant: 'CURRENT', date: '2034-06-11', heure_debut: '10:00', heure_fin: '11:00', statut_seance: 'planifiee' },
        { id: 2, etudiant: 'NEXT', date: '2034-06-12', heure_debut: '12:00', heure_fin: '13:00', statut_seance: 'planifiee' },
        { id: 3, etudiant: 'PREVIOUS', date: '2034-05-29', heure_debut: '14:00', heure_fin: '15:00', statut_seance: 'planifiee' },
      ]);
    });
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    const initial = await page.$eval('.calendar-native-scroller', el => ({ x: el.scrollLeft, w: el.clientWidth, snap: getComputedStyle(el).scrollSnapType, pages: el.querySelectorAll('.calendar-native-page').length }));
    assert.ok(Math.abs(initial.x - 3 * initial.w) < 1, JSON.stringify(initial));
    assert.equal(initial.snap, 'x mandatory');
    assert.equal(initial.pages, 7);
    assert.deepEqual(await page.$$eval('.calendar-native-page', pages => pages.map(p => p.dataset.pagingPeriod).sort()), ['2034-05-15', '2034-05-22', '2034-05-29', '2034-06-05', '2034-06-12', '2034-06-19', '2034-06-26'], 'Three weeks before and three after are loaded');
    const hourGeometry = await page.evaluate(() => {
      const original = document.querySelector('.calendar-native-page:not([aria-hidden]) .fc-timegrid-slot-label-cushion');
      const fixe = [...document.querySelectorAll('.calendar-native-hour-label')].find(el => el.textContent.trim());
      const rect = node => { const r = document.createRange(); r.selectNodeContents(node); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return { original: rect(original), fixe: rect(fixe) };
    });
    assert.ok(Math.abs(hourGeometry.original.width - hourGeometry.fixe.width) < .1, 'Fixed hours preserve exact glyph width and letter spacing');
    assert.ok(Math.abs(hourGeometry.original.y - hourGeometry.fixe.y) < .1, 'Fixed hours preserve exact text baseline: ' + JSON.stringify(hourGeometry));
    const cdp = await page.createCDPSession();
    const remoteScroller = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector(".calendar-native-scroller")' });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: remoteScroller.result.objectId });
    assert.equal(listeners.some(l => ['wheel', 'touchmove'].includes(l.type)), false, 'Native pager installs no continuous JavaScript input handlers');
    assert.equal(listeners.find(l => l.type === 'scroll').passive, true);
    const axisBefore = await page.$eval('.calendar-native-axis', el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; });
    const dayGeometry = () => page.evaluate(() => {
      const page = document.querySelector('.calendar-native-page:not([aria-hidden])');
      const header = page.querySelector('.fc-col-header-cell').getBoundingClientRect();
      const column = page.querySelector('.fc-timegrid-col[data-date]').getBoundingClientRect();
      return { headerX: header.x, columnX: column.x, headerWidth: header.width, columnWidth: column.width };
    });
    const dayBefore = await dayGeometry();
    const pos = await page.$eval('.calendar-native-scroller', el => { const r = el.getBoundingClientRect(); return { x: r.right - 15, y: r.top + 10, w: r.width }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pos.x, y: pos.y }] });
    await new Promise(resolve => setTimeout(resolve, 400));
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pos.x - pos.w * .6 * step / 6, y: pos.y }] });
    }
    const middle = await page.$eval('.calendar-native-scroller', el => ({ x: el.scrollLeft, w: el.clientWidth, date: cal.view.currentStart.toISOString().slice(0, 10), animations: el.getAnimations({ subtree: true }).length }));
    console.log('native held position', middle);
    assert.ok(middle.x > initial.x + 50 && middle.x < initial.x + middle.w - 10, 'Browser moves scrollLeft during touch, not CSS transforms');
    assert.equal(middle.date, '2034-06-05');
    assert.equal(middle.animations, 0);
    const dayDuring = await dayGeometry();
    assert.ok(Math.abs(dayBefore.headerX - dayDuring.headerX - (middle.x - initial.x)) < 1, 'Day headings follow the exact native horizontal scroll offset');
    assert.ok(Math.abs(dayDuring.headerX - dayDuring.columnX) < 1 && Math.abs(dayDuring.headerWidth - dayDuring.columnWidth) < 1, 'Dates stay aligned with their day columns halfway through a swipe: ' + JSON.stringify(dayDuring));
    assert.match(await page.$eval('.calendar-native-page[data-paging-period="2034-06-12"] .fc-col-header', el => el.textContent), /12/, 'Neighbor page already contains its own correct dates');
    assert.deepEqual(await page.$eval('.calendar-native-axis', el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; }), axisBefore, 'Hours retain their position and width during native scrolling');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await page.$eval('.calendar-native-scroller', el => el.scrollLeft), middle.x, 'Finger can hold the native scroll between weeks');
    await page.evaluate(() => { window.heldScroller = document.querySelector('.calendar-native-scroller'); cal.setOption('now', new Date()); });
    assert.equal(await page.evaluate(() => document.querySelector('.calendar-native-scroller') === heldScroller), true, 'Background clock update cannot replace the scroller under the finger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pos.x - pos.w * .3, y: pos.y }] });
    assert.ok(await page.$eval('.calendar-native-scroller', el => el.scrollLeft) < middle.x - 50, 'Reversing the finger reverses the same native scroll without restarting');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pos.x - pos.w * .6, y: pos.y }] });
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'sp-native-calendar-half.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'));
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    assert.deepEqual(await page.evaluate(() => forms), []);
    assert.deepEqual(await page.$eval('.calendar-native-axis', el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; }), axisBefore, 'Hours also retain their position and width after the week commits');
    const afterHours = await page.$eval('.calendar-native-hour-label', node => { const range = document.createRange(); range.selectNodeContents(node); const b = range.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    assert.deepEqual(afterHours, hourGeometry.fixe, 'The text does not jump when the real week replaces its preview');
    const wheelTarget = await page.$eval('.calendar-native-scroller', el => { const r = el.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 30, w: r.width }; });
    await page.mouse.move(wheelTarget.x, wheelTarget.y);
    await page.mouse.wheel({ deltaX: -wheelTarget.w * .9, deltaY: 0 });
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-05'));
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.evaluate(() => { const spacer = document.createElement('div'); spacer.id = 'vertical-scroll-space'; spacer.style.height = '800px'; document.body.appendChild(spacer); });
    await page.mouse.wheel({ deltaX: 0, deltaY: 180 });
    await page.waitForFunction(() => scrollY > 20);
    assert.ok((await page.evaluate(() => cal.view.currentStart.toISOString())).startsWith('2034-06-05'), 'Vertical scrolling never navigates weeks');
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => document.getElementById('vertical-scroll-space').remove());
    // FullCalendar methods must restore the original hierarchy before replacing it.
    await page.evaluate(() => { cal.changeView('dayGridMonth'); });
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"] .fc-daygrid-body');
    await page.evaluate(() => { cal.changeView('timeGridWeek', '2034-06-05'); cal.updateSize(); });
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.evaluate(() => { cal.setOption('validRange', { start: '2034-06-05', end: '2034-06-19' }); });
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    assert.equal(await page.$$eval('.calendar-native-page', nodes => nodes.length), 2, 'Public range has no previous page');
    assert.equal(await page.$eval('.calendar-native-scroller', el => el.scrollLeft), 0);
    await page.$eval('.calendar-native-scroller', el => el.scrollTo({ left: el.clientWidth, behavior: 'smooth' }));
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-12'));
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    assert.equal(await page.$$eval('.calendar-native-page', nodes => nodes.length), 2, 'Public range has no page after next week');
    await page.$eval('.calendar-native-scroller', el => el.scrollTo({ left: 99999, behavior: 'instant' }));
    assert.ok((await page.evaluate(() => cal.view.currentStart.toISOString())).startsWith('2034-06-12'));
    await page.evaluate(() => {
      cal.setOption('validRange', null);
      cal.__fournirEvenementsApercu = async target => {
        const date = target.view.currentStart.toISOString().slice(0, 10);
        return [{ title: 'ASYNC ' + date, start: date + 'T12:00:00', end: date + 'T13:00:00' }];
      };
      cal.gotoDate('2034-06-05');
    });
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    assert.match(await page.$eval('.calendar-native-page[data-paging-period="2034-06-12"]', el => el.textContent), /ASYNC 2034-06-12/);
    assert.equal(await page.$$eval('.calendar-native-page[aria-hidden="true"] [data-seance-id]', nodes => nodes.length), 0, 'Neighbor previews expose no actionable session identifiers');
    await page.$eval('.calendar-native-scroller', el => el.scrollTo({ left: 6 * el.clientWidth, behavior: 'smooth' }));
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith('2034-06-26'));
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    assert.equal(await page.$$eval('.calendar-native-page', nodes => nodes.length), 7, 'Buffer is rebuilt around the newly selected week');
    assert.match(await page.$eval('.calendar-native-page:not([aria-hidden])', el => el.dataset.pagingPeriod), /2034-06-26/, 'Scrolling across three pages commits the actual target week, not just the next one');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.$eval('.calendar-native-scroller', el => el.getAnimations({ subtree: true }).length), 0, 'Reduced motion never adds scripted animations');
    await page.evaluate(() => cal.destroy());
    assert.equal(await page.$('.calendar-native-shell'), null);
    assert.deepEqual(errors, []);
    console.log('native paging: PASS (browser touch scroll, held intermediate position, native snap, no Web Animations, public bounds, safe view changes and teardown)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
