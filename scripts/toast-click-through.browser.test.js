const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const source = fs.readFileSync('public/js/ui.js', 'utf8');
    const toastFunction = source.slice(source.indexOf('function afficherToast('), source.indexOf('\nfunction formatDate(', source.indexOf('function afficherToast(')));
    const container = fs.readFileSync('views/index.ejs', 'utf8').match(/<div id="toast-container"[^>]*><\/div>/)[0];
    for (const width of [1200, 390, 320]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 800, isMobile: width < 720, hasTouch: width < 720 });
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">${container}<button id="underneath" style="position:fixed;z-index:1;opacity:0;-webkit-tap-highlight-color:transparent">Action du calendrier</button>`);
      await page.addStyleTag({ content: fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '') });
      await page.addScriptTag({ content: `const elements={toastContainer:document.getElementById('toast-container')}; const estHorsLigne=()=>false; ${toastFunction}; window.hits=0; document.getElementById('underneath').onclick=()=>hits++;` });
      for (const type of ['success', 'error', 'warning']) {
        await page.evaluate(type => {
          elements.toastContainer.replaceChildren();
          afficherToast(type === 'success' ? 'Séance ajoutée avec succès.' : 'Ce créneau n’est pas disponible. Choisissez un autre horaire.', type, { title: type === 'success' ? '' : 'Vérifiez le créneau', dureeMs: 60000 });
        }, type);
        const info = await page.$eval('.toast', toast => {
          const r = toast.getBoundingClientRect(), button = document.getElementById('underneath');
          button.style.left = `${r.left}px`; button.style.top = `${r.top}px`;
          button.style.width = `${r.width}px`; button.style.height = `${r.height}px`;
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, fits: r.left >= 0 && r.right <= innerWidth && toast.scrollWidth <= toast.clientWidth + 1,
            live: toast.parentElement.getAttribute('aria-live'), pointer: getComputedStyle(toast).pointerEvents };
        });
        assert.ok(info.fits, `Notification fits ${width}px`);
        assert.ok(info.width <= 300 && info.height < 90, `Small notifications at ${width}px: ${JSON.stringify(info)}`);
        if (type === 'success') assert.ok(info.width < 260 && info.height <= 38, `Short messages stay small: ${JSON.stringify(info)}`);
        assert.equal(info.live, 'polite');
        assert.equal(info.pointer, 'none');
        const before = await page.evaluate(() => hits);
        if (width < 720) await page.touchscreen.tap(info.x, info.y);
        else await page.mouse.click(info.x, info.y);
        assert.equal(await page.evaluate(() => hits), before + 1, `Click/tap passes through ${type} notification at ${width}px`);
      }
      if (width === 390) {
        await page.evaluate(() => {
          elements.toastContainer.replaceChildren();
          afficherToast('Séance ajoutée', 'success', { dureeMs: 60000 });
          afficherToast('Créneau non disponible', 'warning', { dureeMs: 60000 });
          afficherToast('Connexion interrompue', 'error', { dureeMs: 60000 });
        });
        await page.waitForFunction(() => document.querySelector('.toast').getAnimations().every(animation => animation.playState === 'finished'));
        await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'sp-toast-refined.png') });
      }
      await page.evaluate(() => { elements.toastContainer.replaceChildren(); afficherToast('Enregistré', 'success', { dureeMs: 50 }); });
      await page.waitForFunction(() => !document.querySelector('.toast'));
      await page.close();
    }
    console.log('toast notifications: PASS (PC/mobile, click/tap through every type, readable layout, live announcements, automatic removal)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
