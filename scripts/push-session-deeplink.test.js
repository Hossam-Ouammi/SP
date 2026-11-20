const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/ui.js', 'utf8');
const fn = source.slice(source.indexOf('async function ouvrirSeanceDepuisNotification()'), source.indexOf('async function initialiserApplication()'));

(async () => {
  const seance = { id: 42, date: '2026-10-20', etudiant: 'Noah' };
  for (const scenario of ['normal', 'login', 'password', 'deleted', 'forbidden', 'expired', 'offline', 'invalid']) {
    const calls = [], errors = [];
    let href = `https://app.example/?keep=1&seance=${scenario === 'invalid' ? 'abc' : '42'}#anchor`;
    const state = { utilisateur: scenario === 'login' ? null : { id: 1 }, seances: [seance], calendrier: { gotoDate: date => calls.push(['date', date]) } };
    const context = vm.createContext({ URL, Number, console, etat: state,
      window: { location: { get href() { return href; } }, history: { state: null, replaceState(_state, _title, url) { href = new URL(url, href).href; } } },
      utilisateurDoitChangerMotDePasse: () => scenario === 'password',
      estHorsLigne: () => scenario === 'offline',
      seanceEstMasqueePourConfidentialite: () => false,
      envoyerRequete: async url => {
        calls.push(['fetch', url]);
        if (['deleted', 'forbidden', 'expired'].includes(scenario)) throw Object.assign(new Error('denied'), { status: { deleted: 404, forbidden: 403, expired: 401 }[scenario] });
        return { seance };
      },
      afficherSectionApplication: section => calls.push(['section', section]),
      ouvrirDetailSeance: async record => calls.push(['detail', record.id]),
      afficherToast: message => errors.push(message),
    });
    vm.runInContext(fn, context);
    await context.ouvrirSeanceDepuisNotification();
    if (['normal', 'offline'].includes(scenario)) {
      assert.ok(calls.some(call => call[0] === 'detail' && call[1] === 42));
      assert.ok(calls.some(call => call[0] === 'section' && call[1] === 'dashboard'));
      assert.ok(calls.some(call => call[0] === 'date' && call[1] === seance.date));
      assert.equal(new URL(href).searchParams.has('seance'), false);
    } else {
      assert.ok(!calls.some(call => call[0] === 'detail'), 'Denied/missing session never shows stale details');
    }
    if (['login', 'password', 'expired'].includes(scenario)) assert.equal(new URL(href).searchParams.get('seance'), '42', 'Keep target through authentication');
    if (['login', 'password', 'invalid', 'offline'].includes(scenario)) assert.ok(!calls.some(call => call[0] === 'fetch'));
    if (['deleted', 'forbidden'].includes(scenario)) {
      assert.equal(errors.length, 1);
      assert.equal(new URL(href).searchParams.has('seance'), false);
    }
    assert.equal(new URL(href).searchParams.get('keep'), '1');
    assert.equal(new URL(href).hash, '#anchor');
  }
  // Exercise the existing service worker's real click handler, with and without an open app.
  for (const warm of [false, true]) {
    const handlers = {}, opened = [];
    const client = { url: 'https://app.example/', focus() { opened.push('focus'); }, navigate(url) { opened.push(url); return Promise.resolve(this); } };
    vm.runInNewContext(fs.readFileSync('public/service-worker.js', 'utf8'), { URL, self: {
      location: { origin: 'https://app.example' }, addEventListener: (name, handler) => handlers[name] = handler,
      clients: { matchAll: async () => warm ? [client] : [], openWindow: async url => opened.push(url) },
    } });
    let work;
    handlers.notificationclick({ notification: { close() {}, data: { url: '/?seance=42' } }, waitUntil: promise => work = promise });
    await work;
    assert.ok(opened.includes('/?seance=42'), 'Notification click retains the session link in cold/warm app');
  }
  console.log('push session links: PASS (cold/warm worker, details navigation, auth deferral, denied/deleted safety, offline, query cleanup)');
})().catch(error => { console.error(error); process.exitCode = 1; });
