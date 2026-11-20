const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

(async () => {
  let conflict = false, writes = 0;
  let row = { id: 1, handler_id: 1, intervenant_id: 1, date: '2034-06-05', heure_debut: '10:00', heure_fin: '11:00', duree_minutes: 60, etudiant: 'Test', statut_seance: 'planifiee', offline_revision: 'r1' };
  const html = ejs.render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (['/js/offline.js', '/js/offline-status.js', '/js/http.js', '/css/style.css'].includes(pathname)) {
      res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(fs.readFileSync(`public${pathname}`)); return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/auth/me') { res.end(JSON.stringify({ utilisateur: { id: 1, nom: 'Test' }, scope: { handlerOwnIds: [1] } })); return; }
    if (pathname === '/api/seances') { res.end(JSON.stringify({ seances: [row] })); return; }
    if (pathname === '/api/seances/1/horaire') {
      let body = ''; for await (const part of req) body += part;
      if (conflict) { res.statusCode = 409; res.end(JSON.stringify({ message: 'Cette séance a été modifiée sur un autre appareil.' })); return; }
      writes++;
      const data = JSON.parse(body);
      row = { ...row, ...data, heure_fin: `${String(Number(data.heure_debut.slice(0, 2)) + 1).padStart(2, '0')}:00`, offline_revision: `r${writes + 1}` };
      res.end(JSON.stringify({ seance: row })); return;
    }
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addStyleTag({ url: '/css/style.css' });
    await page.evaluate(async () => {
      window.off = await import('/js/offline.js');
      window.api = (await import('/js/http.js')).envoyerRequete;
      await api('/api/auth/me'); await api('/api/seances');
      (await import('/js/offline-status.js')).initialiserInterfaceOffline(() => {});
      window.panelWasVisible = false;
      new MutationObserver(() => { if (!document.getElementById('offline-status').hidden) panelWasVisible = true; })
        .observe(document.getElementById('offline-status'), { attributes: true });
    });
    await page.evaluate(() => api('/api/seances/1/horaire', { method: 'PATCH', body: JSON.stringify({ date: '2034-06-05', heure_debut: '11:00' }) }));
    assert.equal(writes, 1);
    assert.equal(await page.evaluate(() => panelWasVisible), false, 'Actual online idempotent mutation never flashes the status');
    await page.setOfflineMode(true);
    await page.waitForFunction(() => !document.getElementById('offline-status').hidden);
    await page.evaluate(() => api('/api/seances/1/horaire', { method: 'PATCH', body: JSON.stringify({ date: '2034-06-05', heure_debut: '12:00' }) }));
    await page.waitForFunction(() => document.querySelector('[data-offline-title]').textContent === 'Synchronisation');
    await page.click('[data-offline-toggle]');
    assert.equal(await page.$$eval('[data-offline-operations] li', a => a.length), 1);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'sp-offline-pending-dialog.png') });
    await page.setOfflineMode(false);
    // No manual synchronization call: the real online listener must replay.
    await page.waitForFunction(async () => (await off.etatOffline()).pending === 0);
    assert.equal(writes, 2);
    assert.equal(row.heure_debut, '12:00');
    await page.waitForFunction(() => document.getElementById('offline-status').hidden && !document.getElementById('offline-status-dialog').open);
    await page.setOfflineMode(true);
    await page.evaluate(() => api('/api/seances/1/horaire', { method: 'PATCH', body: JSON.stringify({ date: '2034-06-05', heure_debut: '13:00' }) }));
    conflict = true;
    await page.setOfflineMode(false);
    await page.waitForFunction(() => document.getElementById('offline-status').classList.contains('has-conflict'));
    await page.click('[data-offline-toggle]');
    assert.match(await page.$eval('[data-offline-operations]', e => e.textContent), /autre appareil/);
    assert.equal(row.heure_debut, '12:00', 'Conflict never overwrites the server');
    assert.deepEqual(errors, []);
    console.log('offline status replay: PASS (real IndexedDB queue, silent online mutation, offline dialog, automatic reconnect replay, red conflict details)');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
