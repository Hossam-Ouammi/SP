const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    const html = ejs.render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
      .replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<link[^>]*>/g, '');
    const css = fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '');
    const documentHtml = html.replace('</head>', () => `<style>${css}</style></head>`);
    const mark = fs.readFileSync('public/superprof-official-mark.svg', 'utf8');
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isNavigationRequest()) {
        return request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: documentHtml });
      }
      if (new URL(request.url()).pathname === '/superprof-official-mark.svg') {
        return request.respond({ status: 200, contentType: 'image/svg+xml', body: mark });
      }
      return request.abort();
    });
    await page.goto('https://planning.example');
    for (const n of ['core', 'daygrid', 'timegrid', 'interaction']) await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${n}/index.global.js`) });
    await page.addScriptTag({ content: fs.readFileSync('public/js/calendrier.js', 'utf8').replace(/^export /gm, '') });
    const ui = fs.readFileSync('public/js/ui.js', 'utf8').replace(/^import[\s\S]*?from "[^"\n]+";\r?\n/gm, '')
      .replace('document?.addEventListener("DOMContentLoaded", initialiserApplication);', '');
    await page.addScriptTag({ content: `(function() { ${ui}
      window.testUI = { etat, elements, afficherSectionApplication, mettreAJourNavigationProtegee, synchroniserNavigationSecondaire };
      demarrerHorlogeCalendriers = () => {};
      attacherEcouteurs();
    })();` });
    await page.evaluate(() => {
      testUI.etat.utilisateur = { id: 1, nom: 'Hossam', scope: { roles: ['handler', 'professeur'] } };
      testUI.etat.equipe = [];
      document.getElementById('current-user-name').textContent = 'Hossam';
      document.getElementById('current-user-public-id').textContent = 'ID : HD-001';
      testUI.mettreAJourNavigationProtegee();
      testUI.afficherSectionApplication('dashboard');
      for (const id of ['today-count', 'team-request-badge']) {
        const badge = document.getElementById(id);
        badge.textContent = '1';
        badge.classList.remove('hidden');
      }
    });
    const markupMarque = 'Gestion <span class="superprof-wordmark">Superprof</span>';
    const ongletHome = '[data-section-target="home"]';
    const topHome = () => page.$eval(ongletHome, e => e.getBoundingClientRect().top);
    const positionBouton = () => page.$eval('#nav-more-toggle', e => {
      const { x, y } = e.getBoundingClientRect();
      return { x, y };
    });
    const compteurDansOngletAujourdhui = () => page.$eval('#today-count', badge => {
      const r = badge.getBoundingClientRect();
      const tab = badge.closest('button').getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= tab.left && r.right <= tab.right &&
        r.top >= tab.top && r.bottom <= tab.bottom;
    });
    const layout = () => page.evaluate(() => {
      const menu = document.getElementById('workspace-menu'), app = document.getElementById('app-view');
      const r = menu.getBoundingClientRect(), content = app.getBoundingClientRect();
      return { left: r.left, width: r.width, height: r.height, content: content.left, right: content.right, hidden: getComputedStyle(menu).display === 'none',
        backdrop: document.getElementById('workspace-backdrop').hidden, scrollLocked: document.body.classList.contains('sidebar-open') };
    });
    assert.equal((await layout()).width, 72, 'A new browser starts with the sidebar collapsed');
    assert.equal(await page.$eval('#nav-more-toggle', e => e.getAttribute('aria-expanded')), 'false');
    await page.click('#nav-more-toggle');
    for (const width of [1440, 1024, 1920]) {
      await page.setViewport({ width, height: 1000 });
      await page.evaluate(() => testUI.synchroniserNavigationSecondaire());
      let state = await layout();
      assert.equal(state.width, 244);
      assert.equal(state.left, 0);
      assert.equal(state.height, 1000);
      assert.equal(state.hidden, false);
      assert.equal(state.backdrop, true);
      assert.equal(state.scrollLocked, false);
      await page.evaluate(() => { document.getElementById('offline-status').hidden = false; });
      assert.ok(await page.evaluate(() => {
        const indicator = document.getElementById('offline-status').getBoundingClientRect();
        const title = document.querySelector('.brand-title').getBoundingClientRect();
        return indicator.left >= title.right && Math.abs((indicator.top + indicator.bottom - title.top - title.bottom) / 2) < 1;
      }), 'Synchronization remains on the right of the brand');
      await page.evaluate(() => { document.getElementById('offline-status').hidden = true; });
      assert.ok(await page.evaluate(() => {
        const r = document.getElementById('logout-button').getBoundingClientRect();
        return r.height > 0 && r.bottom <= innerHeight && r.bottom > innerHeight - 80;
      }), 'Logout remains visible at the bottom');
      assert.ok(state.content >= state.width && state.right <= width + 1, 'Sidebar reserves space, never overlays content');
      assert.equal(await page.$eval('.brand-title', e => e.innerHTML), markupMarque);
      assert.ok(await page.$eval('.topbar-brand-mark', img => img.naturalWidth > 0 && img.offsetWidth === 30));
      assert.equal(await page.$eval('.desktop-sidebar-toggle-icon', e => getComputedStyle(e).display), 'block');
      assert.equal(await page.$eval('.sidebar-brand-mark', e => getComputedStyle(e).display), 'none');
      assert.equal(await page.$eval('.sidebar-brand-text small', e => getComputedStyle(e).display), 'none');
      assert.ok(await compteurDansOngletAujourdhui(), 'The count is inside the Today tab in expanded mode');
      const hautHome = await topHome();
      const positionInitiale = await positionBouton();
      await page.click('#nav-more-toggle');
      state = await layout();
      assert.equal(state.width, 72);
      assert.ok(state.content >= 72 && state.content < 244);
      assert.ok(await compteurDansOngletAujourdhui(), 'The count stays in the Today tab in compact mode');
      assert.equal(await page.$eval('#team-request-badge', badge => badge.offsetParent?.dataset.sectionTarget), 'equipe');
      assert.equal(await topHome(), hautHome, 'The navigation rows retain their vertical position on collapse');
      assert.deepEqual(await positionBouton(), positionInitiale, 'The toggle stays under the pointer after the sidebar changes width');
      assert.equal(await page.$eval(ongletHome + ' .sidebar-nav-label', e => getComputedStyle(e).display), 'none');
      assert.equal(await page.$eval(ongletHome, e => e.getAttribute('aria-label')), 'Home');
      assert.ok(await page.$eval(ongletHome, e => {
        const icon = e.querySelector('svg').getBoundingClientRect(), button = e.getBoundingClientRect();
        return Math.abs((icon.left + icon.right - button.left - button.right) / 2) < 1;
      }), 'The compact icon is centered');
      assert.equal(await page.$eval('[data-section-target="calendrier"]', e => e.getAttribute('aria-label')), 'Calendrier public');
      await page.keyboard.press('Escape');
      assert.equal((await layout()).hidden, false, 'Escape never hides persistent desktop sidebar');
      await page.click('[data-section-target="home"]');
      assert.equal((await layout()).width, 72, 'Navigation preserves compact mode');
      await page.click('#nav-more-toggle');
      assert.equal((await layout()).width, 244);
      await page.$eval('#calendar', e => e.scrollIntoView({ block: 'start' }));
      assert.equal(await page.$eval('#workspace-menu', e => e.getBoundingClientRect().top), 0, 'Sidebar remains fixed during document scroll');
      assert.deepEqual(await positionBouton(), positionInitiale, 'The sidebar toggle remains reachable while scrolling');
    }
    await page.evaluate(() => scrollTo(0, 0));
    if (process.env.SP_SIDEBAR_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.SP_SIDEBAR_SCREENSHOT_DIR, 'sp-desktop-sidebar.png') });
      await page.click('#nav-more-toggle');
      await page.screenshot({ path: path.join(process.env.SP_SIDEBAR_SCREENSHOT_DIR, 'sp-desktop-sidebar-compact.png') });
    }
    for (const width of [390, 320]) {
      await page.setViewport({ width, height: 844 });
      await page.waitForSelector('#workspace-menu', { hidden: true });
      assert.equal(await page.$eval('.desktop-sidebar-toggle-icon', e => getComputedStyle(e).display), 'none');
      assert.equal(await page.$eval('#sidebar-close', e => e.getAttribute('aria-label')), 'Fermer le menu');
      assert.equal(await page.$eval('.brand-title', e => e.innerHTML), markupMarque);
      assert.equal(await page.$eval('.topbar-brand-mark', img => getComputedStyle(img).display), 'none');
      assert.ok(await page.$eval('#app-view', e => e.getBoundingClientRect().left < 20));
      await page.click('#nav-more-toggle');
      assert.equal((await layout()).hidden, false);
      assert.equal(await page.$eval('#workspace-backdrop', e => e.hidden), false);
      assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-open')));
      assert.equal(await page.$eval('.sidebar-brand-mark', e => getComputedStyle(e).display), 'grid');
      assert.equal(await page.$eval('.sidebar-brand-text small', e => getComputedStyle(e).display), 'block');
      assert.notEqual(await page.$eval('[data-section-target="home"] .sidebar-nav-label', e => getComputedStyle(e).display), 'none');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('workspace-menu')).transform === 'none');
      await page.click('#sidebar-close');
      assert.equal((await layout()).hidden, true);
    }
    // Reload the real template with external scripts blocked to inspect first paint.
    await page.setViewport({ width: 1440, height: 650 });
    for (const [compact, sidebarWidth] of [[null, 72], [true, 72], [false, 244]]) {
      await page.evaluate(preference => {
        if (preference === null) localStorage.removeItem('sp-desktop-sidebar-compact');
        else localStorage.setItem('sp-desktop-sidebar-compact', String(preference));
      }, compact);
      await page.reload();
      assert.equal(await page.evaluate(() => Boolean(window.testUI)), false);
      const state = await layout();
      assert.equal(state.content, sidebarWidth, 'The default or saved width is applied before the main module loads');
      assert.equal(state.width, sidebarWidth, 'The sidebar occupies its final width on first paint');
    }
    assert.equal(await page.$eval('html', root => getComputedStyle(root).scrollbarWidth), 'none');
    const largeurInitiale = await page.$eval('#app-view', app => app.getBoundingClientRect().width);
    await page.$eval('#app-view', app => { app.style.minHeight = '200vh'; });
    assert.equal(await page.$eval('#app-view', app => app.getBoundingClientRect().width), largeurInitiale);
    await page.mouse.move(800, 300);
    await page.mouse.wheel({ deltaY: 400 });
    await page.waitForFunction(() => window.scrollY > 0);
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.$eval('html', root => getComputedStyle(root).scrollbarWidth), 'auto');
    assert.deepEqual(errors, []);
    console.log('desktop sidebar: PASS (first paint, hidden scrollbar with scrolling, desktop navigation, mobile drawer)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
