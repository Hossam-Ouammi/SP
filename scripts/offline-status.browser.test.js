const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const html = ejs.render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
      .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
    await page.setContent(html);
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    await page.addScriptTag({ content: `
      window.state = { owner: 1, offline: false, pending: 0, syncing: false, operations: [], error: '' };
      window.syncCalls = 0; window.abandoned = [];
      async function etatOffline() { return structuredClone(state); }
      async function synchroniserOffline() { syncCalls++; }
      async function abandonnerOperation(id) { abandoned.push(id); state.operations = []; state.pending = 0; window.dispatchEvent(new Event('sp-offline-state')); }
      ${fs.readFileSync('public/js/offline-status.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')}
      initialiserInterfaceOffline(() => {});
    ` });
    const setState = async update => {
      await page.evaluate(update => { Object.assign(state, update); window.dispatchEvent(new Event('sp-offline-state')); }, update);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    };
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      await setState({ offline: false, pending: 1, syncing: true, error: '', operations: [{ id: 'a', label: 'Séance · 06/11/2026 10:00', status: 'pending' }] });
      assert.equal(await page.$eval('#offline-status', e => e.hidden), true, 'Normal online mutation/replay has no visible panel');
      await setState({ offline: true, pending: 0, syncing: false, operations: [] });
      assert.equal(await page.$eval('[data-offline-title]', e => e.textContent), 'Hors ligne');
      assert.equal(await page.$eval('#offline-status', e => e.hidden), false);
      assert.equal(await page.$eval('.offline-indicator', e => getComputedStyle(e).backgroundColor), 'rgb(255, 247, 230)', 'Offline button is amber');
      assert.ok(await page.evaluate(() => {
        const indicator = document.getElementById('offline-status').getBoundingClientRect();
        const title = document.querySelector('.brand-title').getBoundingClientRect();
        const header = document.querySelector('.topbar').getBoundingClientRect();
        return Math.abs((indicator.top + indicator.bottom - title.top - title.bottom) / 2) < 1 && indicator.left >= title.right && indicator.right <= header.right && header.right <= innerWidth + 1;
      }), `Indicator on the brand row, right-aligned without overlap at ${width}px`);
      await setState({ pending: 1, operations: [{ id: 'a', label: '<unsafe> Séance · 06/11/2026 10:00', status: 'pending' }] });
      assert.ok(await page.evaluate(() => {
        const indicator = document.getElementById('offline-status').getBoundingClientRect();
        const title = document.querySelector('.brand-title');
        const range = document.createRange(); range.selectNodeContents(title);
        return indicator.left >= range.getBoundingClientRect().right && document.querySelector('.topbar').scrollWidth <= document.querySelector('.topbar').clientWidth + 1;
      }), `Long synchronization label fits beside the brand at ${width}px`);
      assert.equal(await page.$eval('[data-offline-title]', e => e.textContent), 'Synchronisation');
      assert.equal(await page.$eval('.offline-indicator', e => getComputedStyle(e).backgroundColor), 'rgb(239, 246, 255)', 'Pending button is blue');
      assert.equal(await page.$eval('.offline-indicator-icon', e => getComputedStyle(e).animationName), 'offline-sync-spin');
      assert.equal(await page.$eval('[data-offline-chevron]', e => getComputedStyle(e).display === 'none'), false, 'Dropdown chevron is visible for pending changes');
      await page.click('[data-offline-toggle]');
      assert.equal(await page.$eval('#offline-status-dialog', e => e.open), true);
      assert.match(await page.$eval('[data-offline-operations]', e => e.textContent), /<unsafe> Séance/);
      assert.equal(await page.$('unsafe'), null, 'Labels rendered safely as text');
      assert.ok(await page.$eval('#offline-status-dialog', e => e.scrollWidth <= e.clientWidth + 1));
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval('#offline-status-dialog', e => e.open), false);
      await page.click('[data-offline-toggle]');
      await setState({ offline: false, syncing: true });
      assert.equal(await page.$eval('#offline-status', e => e.hidden), true);
      assert.equal(await page.$eval('#offline-status-dialog', e => e.open), false, 'Reconnect hides/closes normal sync UI automatically');
      await setState({ syncing: false, error: 'Connexion au serveur impossible' });
      assert.ok(await page.$eval('#offline-status', e => !e.hidden && e.classList.contains('has-conflict')));
      assert.equal(await page.$eval('.offline-indicator', e => getComputedStyle(e).backgroundColor), 'rgb(255, 240, 241)', 'Error button is red');
      await page.click('[data-offline-toggle]');
      assert.match(await page.$eval('[data-offline-text]', e => e.textContent), /Connexion au serveur/);
      await page.click('[data-offline-sync]');
      await page.click('[data-offline-close]');
      await setState({ error: '', operations: [{ id: 'a', label: 'Séance', status: 'conflict', error: 'Ce créneau a changé' }] });
      await page.click('[data-offline-toggle]');
      assert.match(await page.$eval('[data-offline-operations]', e => e.textContent), /Ce créneau a changé/);
      assert.equal(await page.$eval('.offline-indicator-icon', e => getComputedStyle(e).animationName), 'none');
      page.once('dialog', d => d.accept());
      await page.click('[data-offline-operations] button');
      await page.waitForFunction(() => document.getElementById('offline-status').hidden);
    }
    await setState({ owner: null, offline: true });
    assert.equal(await page.$eval('#offline-status', e => e.hidden), true);
    assert.equal(await page.evaluate(() => syncCalls), 3);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(require('os').tmpdir(), 'sp-offline-indicator.png') });
    console.log('offline status UI: PASS (online silent, offline indicator, pending dialog, red errors, retry, discard, PC/mobile)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
