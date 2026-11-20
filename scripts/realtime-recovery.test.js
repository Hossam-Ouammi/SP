const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/ui.js', 'utf8');
const functions = source.slice(source.indexOf('function fermerConnexionTempsReel()'), source.indexOf('function initialiserCalendrierSiNecessaire()'));
const timeouts = new Map(), intervals = new Map(), listeners = new Map();
let timerId = 0, refreshes = 0, failRead = false;
class EventSourceFake {
  static OPEN = 1;
  static CLOSED = 2;
  constructor() { this.events = {}; this.readyState = 1; }
  addEventListener(name, callback) { this.events[name] = callback; }
  close() { this.readyState = 2; }
}
const add = (name, callback) => listeners.set(name, callback);
const remove = name => listeners.delete(name);
const state = { source: null, synchronisationEnCours: false, synchronisationEnAttente: false };
const context = vm.createContext({
  Date, console, Promise,
  connexionTempsReel: state,
  etat: { utilisateur: { id: 1 } },
  navigator: { onLine: true },
  document: { visibilityState: 'visible', addEventListener: add, removeEventListener: remove },
  window: { EventSource: EventSourceFake, addEventListener: add, removeEventListener: remove,
    setTimeout: (callback, delay) => { timeouts.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: callback => { intervals.set(++timerId, callback); return timerId; },
    clearInterval: id => intervals.delete(id),
  },
  utilisateurDoitChangerMotDePasse: () => false,
  estHorsLigne: () => false,
  parserEvenementTempsReel: () => ({}), notifierMiseAJourTempsReel: () => {},
  recupererUtilisateurCourant: async () => ({ id: 1 }),
  afficherApplication: () => {},
  chargerSeances: async () => { refreshes++; if (failRead) throw new Error('temporary failure'); },
  elements: { detailModal: { classList: { contains: () => true } } },
  chargerOptionsSeancesDisponibles: async () => {}, chargerIndisponibilites: async () => {},
  chargerEquipeSiAutorise: async () => {}, chargerHistorique: async () => {},
  chargerMonetisationSiAutorise: async () => {}, chargerAdministrationSiAutorise: async () => {},
  chargerReglagesEspaceSiAutorise: async () => {},
});
vm.runInContext(functions, context);
(async () => {
  context.demarrerConnexionTempsReel();
  const first = state.source;
  first.events.connected();
  assert.equal(timeouts.get(state.synchronisationProgrammee).delay, 50);
  first.events['app-updated']({});
  assert.equal(timeouts.size, 1, 'burst signals coalesce');
  await context.synchroniserApplicationDepuisTempsReel();
  assert.equal(refreshes, 1);
  context.fermerConnexionTempsReel();
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);
  assert.equal(listeners.size, 0, 'logout removes lifecycle handlers');

  context.demarrerConnexionTempsReel();
  listeners.get('online')();
  assert.ok(state.synchronisationProgrammee, 'return online schedules catch-up');
  context.fermerConnexionTempsReel();
  context.demarrerConnexionTempsReel();
  context.document.visibilityState = 'hidden';
  listeners.get('visibilitychange')();
  assert.equal(timeouts.size, 0, 'hidden page does not poll');
  context.document.visibilityState = 'visible';
  state.derniereRepriseAt = 0;
  listeners.get('visibilitychange')();
  assert.equal(timeouts.size, 1, 'resume refreshes without a new server mutation');
  context.fermerConnexionTempsReel();
  context.demarrerConnexionTempsReel();
  failRead = true;
  await assert.rejects(context.synchroniserApplicationDepuisTempsReel(), /temporary failure/);
  assert.equal(timeouts.get(state.synchronisationProgrammee).delay, 3000, 'failed reads retry automatically');
  context.fermerConnexionTempsReel();
  context.demarrerConnexionTempsReel();
  state.source.events['session-invalidated']();
  assert.equal(state.source, null, 'scope invalidation drops old subscriptions');
  assert.ok(state.synchronisationProgrammee, 'scope is rechecked without manual reload');
  context.fermerConnexionTempsReel();
  console.log('realtime recovery: PASS (connection, resume, coalescing, retry, scope, cleanup)');
})().catch(error => { console.error(error); process.exitCode = 1; });
