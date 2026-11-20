const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1700, height: 1000 });
    const html = require('ejs').render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
      .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
    await page.setContent(html);
    await page.evaluate(() => {
      document.getElementById('dashboard-section').classList.remove('hidden');
      document.getElementById('aujourdhui-section').classList.add('hidden');
    });
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    for (const n of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${n}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    await page.evaluate(() => {
      window.sessions = [{ id: 1, date: '2034-06-11', heure_debut: '12:00', heure_fin: '13:00', etudiant: 'Test', statut_seance: 'planifiee' }];
      window.cal = initialiserCalendrier(document.getElementById('calendar'), {
        navigationZoom: true, canSelectRange: () => false,
        plageHoraire: { calendar_start_time: '09:00', calendar_end_time: '22:30' },
        onDatesSet: () => { if (window.cal) mettreAJourEvenements(cal, sessions); },
      });
      cal.gotoDate('2034-06-05');
    });
    const sample = () => page.evaluate(() => {
      const slots = document.querySelector('.fc-timegrid-body .fc-timegrid-slots > table');
      return { slot: document.querySelector('.fc-timegrid-slot-lane').getBoundingClientRect().height,
        body: document.querySelector('.fc-timegrid-body').getBoundingClientRect().height,
        table: slots.getBoundingClientRect().height, inline: slots.style.height,
        shell: document.querySelector('.calendar-native-shell')?.getBoundingClientRect().height };
    });
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const initial = await sample();
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => mettreAJourEvenements(cal, sessions));
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      const measured = await sample();
      assert.ok(Math.abs(measured.slot - initial.slot) < 1, 'Updating layout must not grow the half-hour cells');
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const nextWeek = await page.evaluate(() => new Date(cal.view.currentStart.getTime() + 7 * 86400000).toISOString().slice(0, 10));
      await page.$eval('.calendar-native-scroller', e => e.scrollTo({ left: e.scrollLeft + e.clientWidth, behavior: 'instant' }));
      await page.waitForFunction(next => cal.view.currentStart.toISOString().startsWith(next), {}, nextWeek);
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const client = await page.createCDPSession();
    const point = await page.$eval('.calendar-native-scroller', e => {
      const r = e.getBoundingClientRect(); window.heldScroller = e;
      return { x: r.left + 100, y: Math.max(10, r.top + 130) };
    });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.evaluate(() => {
      window.expected = new Date(cal.view.currentStart.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      heldScroller.scrollTo({ left: heldScroller.scrollLeft + heldScroller.clientWidth, behavior: 'instant' });
    });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => {
      window.sessions = [{ ...sessions[0], date: expected, etudiant: 'Updated during scroll' }];
      mettreAJourEvenements(cal, sessions);
    });
    assert.ok(await page.evaluate(() => heldScroller.isConnected), 'A live update never replaces the active touch target');
    assert.ok(Math.abs((await sample()).slot - initial.slot) < 1, 'Live update during scroll does not expand rows');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => cal.view.currentStart.toISOString().startsWith(expected));
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    assert.ok(Math.abs((await sample()).slot - initial.slot) < 1, 'Rows remain stable after applying a queued refresh');
    assert.equal(await page.evaluate(() => cal.getEvents().find(e => e.extendedProps.seance?.id === 1)?.extendedProps.seance.etudiant), 'Updated during scroll');
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.getElementById('calendar').dataset.calendarMobile === 'true');
    await page.waitForSelector('[data-calendar-native-ready="true"]');
    const mobileHeight = (await sample()).slot;
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => mettreAJourEvenements(cal, sessions));
      await page.waitForSelector('[data-calendar-native-ready="true"]');
      assert.ok(Math.abs((await sample()).slot - mobileHeight) < 1, 'Mobile refresh also preserves cell height');
    }
    console.log('stable calendar height: PASS (desktop refreshes + week navigation, live refresh during touch, mobile, stable half-hour rows)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
