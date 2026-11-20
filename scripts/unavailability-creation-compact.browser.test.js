const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(ejs.render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
      .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, ''));
    await page.addStyleTag({ content: fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '') });
    await page.evaluate(() => {
      document.querySelectorAll('body > :not(#unavailability-detail-modal)').forEach(el => el.style.display = 'none');
      const modal = document.getElementById('unavailability-detail-modal');
      modal.classList.remove('hidden'); modal.classList.add('is-unavailability-creation-mode', 'is-unavailability-form-open');
      document.getElementById('unavailability-form-panel').classList.remove('hidden');
      document.getElementById('unavailability-detail-title').textContent = 'Nouvelle indisponibilité';
      document.getElementById('unavailability-modal-date').value = '2026-10-16';
      for (const select of modal.querySelectorAll('select')) {
        for (const label of select.id.includes('minute') ? ['00', '30'] : ['08', '09', '12']) select.add(new Option(label, label));
      }
    });
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 800 });
      const measures = await page.evaluate(() => {
        const modal = document.getElementById('unavailability-detail-modal'), panel = modal.querySelector('.modal-panel');
        const rect = el => el.getBoundingClientRect();
        const times = [...document.querySelectorAll('#unavailability-modal-time-fields > .field')].map(rect);
        const actions = [...panel.querySelectorAll('.form-actions button')].map(rect);
        const dateInput = document.getElementById('unavailability-modal-date');
        const date = rect(dateInput), dateField = rect(dateInput.closest('.field'));
        return { height: panel.scrollHeight, overflow: panel.scrollWidth > panel.clientWidth + 1,
          dateFits: Math.abs(date.width - dateField.width) < 1 && date.left >= dateField.left && date.right <= dateField.right + 1,
          dateNativeWidthReset: getComputedStyle(dateInput).appearance === 'none' && getComputedStyle(dateInput).minInlineSize === '0px',
          centeredTime: [...panel.querySelectorAll('.time-select-row select')].every(el => getComputedStyle(el).textAlign === 'center' && getComputedStyle(el).textAlignLast === 'center'),
          regularTime: [...panel.querySelectorAll('.time-select-row select')].every(el => {
            const s = getComputedStyle(el);
            return s.fontWeight === '400' && Math.abs(parseFloat(s.fontSize) * (parseFloat(s.zoom) || 1) - 13) < .1;
          }),
          timesRow: Math.abs(times[0].top - times[1].top) < 1,
          actionsRow: Math.abs(actions[0].top - actions[1].top) < 1,
          focusSafe: [...panel.querySelectorAll('select, input[type="date"]')].every(el => parseFloat(getComputedStyle(el).fontSize) >= 16),
          controls: times.every(r => r.width > 100), width: rect(panel).width };
      });
      assert.ok(measures.height < 480, JSON.stringify({ width, ...measures }));
      assert.ok(!measures.overflow && measures.timesRow && measures.actionsRow && measures.controls, JSON.stringify({ width, ...measures }));
      assert.ok(measures.width <= 480);
      assert.ok(measures.dateFits && measures.dateNativeWidthReset, `Date respects form width at ${width}: ${JSON.stringify(measures)}`);
      assert.ok(measures.centeredTime, `Centered start/end time at ${width}`);
      assert.ok(measures.regularTime, `Regular-sized start/end time at ${width}`);
      if (width <= 720) assert.ok(measures.focusSafe);
      await page.click('#unavailability-modal-full-day + span');
      assert.ok(await page.$eval('#unavailability-modal-full-day', el => el.checked));
      await page.click('#unavailability-modal-full-day + span');
    }
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'sp-unavailability-creation-compact.png') });
    console.log('compact availability creation: PASS (desktop/390/320, controls retained, no overflow, compact height)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
