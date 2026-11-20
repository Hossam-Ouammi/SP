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
    page.on('pageerror', error => errors.push(error.message));
    const html = ejs.render(fs.readFileSync('views/index.ejs', 'utf8'), { user: {}, loginUsername: '', loginError: '' })
      .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync('public/css/style.css', 'utf8').replace(/^\uFEFF/, '') });
    const ui = fs.readFileSync('public/js/ui.js', 'utf8').replace(/^import[\s\S]*?from "[^"\n]+";\r?\n/gm, '')
      .replace('document?.addEventListener("DOMContentLoaded", initialiserApplication);', '');
    await page.addScriptTag({ content: `(function(){${ui}\nwindow.creationUI={mettreAJourVisibiliteStatutSeance};})();` });
    await page.evaluate(() => {
      document.querySelector('#app-view').classList.add('hidden');
      document.querySelector('#login-view').classList.add('hidden');
      document.getElementById('seance-modal').classList.remove('hidden');
      creationUI.mettreAJourVisibiliteStatutSeance('creation');
      for (const [id, value] of [['etudiant', 'Benjamin Alexandre'], ['parent', 'Marie Dupont'], ['date', '2026-10-16']]) document.getElementById(id).value = value;
      for (const [id, labels] of [['seance-handler', ['Mon équipe', 'Équipe Abdo']], ['seance-intervenant', ['Hossam', 'Un professeur de mon équipe']], ['heure-debut-hour-select', ['14', '15']], ['heure-debut-minute-select', ['00', '30']]]) {
        const select = document.getElementById(id);
        for (const label of labels) select.add(new Option(label, label));
        select.closest('.field').classList.remove('hidden');
      }
      for (const label of ['Maths', 'Physique chimie', 'Python', 'C++']) {
        const option = document.createElement('label'); option.className = 'checkbox-option';
        const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'matiere'; input.value = label;
        const span = document.createElement('span'); span.textContent = label;
        option.append(input, span); document.getElementById('matiere-options').append(option);
      }
    });
    for (const width of [1200, 768, 390, 320]) {
      await page.setViewport({ width, height: 800 });
      const measures = await page.evaluate(() => {
        const modal = document.getElementById('seance-modal'), panel = modal.querySelector('.modal-panel');
        modal.classList.remove('is-seance-creation'); const original = panel.scrollHeight;
        modal.classList.add('is-seance-creation');
        const student = document.getElementById('etudiant').getBoundingClientRect();
        const parent = document.getElementById('parent').getBoundingClientRect();
        const date = document.getElementById('date').getBoundingClientRect();
        const time = document.querySelector('#seance-start-time-field .time-select-row').getBoundingClientRect();
        return { original, compact: panel.scrollHeight, width: panel.getBoundingClientRect().width,
          overflow: panel.scrollWidth > panel.clientWidth + 1,
          scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth,
          inner: [...panel.querySelectorAll('*')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 2).map(el => [el.id || el.className, el.clientWidth, el.scrollWidth]),
          bad: [...panel.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > panel.getBoundingClientRect().left + panel.clientWidth).map(el => [el.id || el.className, Math.round(el.getBoundingClientRect().width)]),
          identityRow: Math.abs(student.top - parent.top) < 2, dateRow: Math.abs(date.top - time.top) < 2,
          durations: getComputedStyle(document.querySelector('#seance-duration-field .checkbox-options')).gridTemplateColumns.split(' ').length,
          focusSafe: ['etudiant', 'parent', 'date', 'heure-debut-hour-select', 'heure-debut-minute-select'].every(id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize) >= 16),
          touchAction: getComputedStyle(document.body).touchAction,
          centeredTime: [...document.querySelectorAll('#seance-modal .time-select-row select')].every(el => getComputedStyle(el).textAlign === 'center' && getComputedStyle(el).textAlignLast === 'center'),
          regularText: ['etudiant', 'parent', 'date', 'seance-handler', 'seance-intervenant', 'heure-debut-hour-select', 'heure-debut-minute-select'].every(id => {
            const style = getComputedStyle(document.getElementById(id));
            return style.fontWeight === '400' && Math.abs(parseFloat(style.fontSize) * (parseFloat(style.zoom) || 1) - 13) < .1;
          }),
          textFits: ['etudiant', 'parent'].every(id => {
            const input = document.getElementById(id), style = getComputedStyle(input);
            const canvas = document.createElement('canvas').getContext('2d');
            canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            return canvas.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          }),
          fields: ['etudiant','parent','date','seance-handler','seance-intervenant','heure-debut-hour-select','heure-debut-minute-select','seance-duration-field','seance-trial-field','matiere-options'].every(id => document.getElementById(id).getBoundingClientRect().width > 0) };
      });
      assert.equal(measures.overflow, false, `No overflow at ${width}: ${JSON.stringify(measures)}`);
      assert.ok(measures.compact < measures.original * .8, `Form substantially shorter at ${width}: ${JSON.stringify(measures)}`);
      assert.ok(measures.compact < 720, `Form fits a compact height at ${width}: ${JSON.stringify(measures)}`);
      assert.ok(measures.width <= 780);
      assert.equal(measures.identityRow, width > 720);
      assert.ok(measures.dateRow && measures.fields && measures.textFits, `Readable input text at ${width}: ${JSON.stringify(measures)}`);
      assert.equal(measures.durations, 3);
      assert.ok(measures.centeredTime, `Centered session time at ${width}`);
      assert.ok(measures.regularText, `Consistent regular 13px control text at ${width}`);
      assert.equal(measures.touchAction, 'manipulation', 'Disable double-tap, retain deliberate pinch zoom');
      if (width <= 720) assert.ok(measures.focusSafe, 'Native input fonts prevent automatic focus zoom');
      await page.$eval('#seance-duration-field input[value="90"]', input => { input.checked = false; });
      await page.click('#seance-duration-field input[value="90"] + span');
      assert.ok(await page.$eval('#seance-duration-field input[value="90"]', input => input.checked));
    }
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'sp-session-creation-compact.png') });
    await page.evaluate(() => creationUI.mettreAJourVisibiliteStatutSeance('modification'));
    assert.equal(await page.$eval('#seance-modal', modal => modal.classList.contains('is-seance-creation')), false, 'Edit form is unchanged');
    assert.deepEqual(errors, []);
    console.log('compact session creation: PASS (all fields, shorter form, PC/768/390/320, no overflow, edit unchanged)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
