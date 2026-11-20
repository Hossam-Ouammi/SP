const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const databasePath = path.join(os.tmpdir(), `sp-push-briefing-${require('node:crypto').randomUUID()}.db`);
process.env.DATABASE_PATH = databasePath;
process.env.NODE_ENV = 'test';
const { construireNotificationEvenement, utilisateurPeutRecevoirEvenementApplication } = require('../utils/push-notifications');

(async () => {
  try {
    const seance = { id: 42, handler_id: 10, intervenant_id: 20, etudiant: 'Noah', date: '2026-10-20', heure_debut: '16:00', heure_fin: '17:00', parent: 'Private parent', tarif_horaire: 100 };
    const base = { scope: 'seances', actorId: 10, actorName: 'Abdo', handlerId: 10, intervenantId: 20, seance };
    for (const [action, verb] of [['seance_added', 'ajouté'], ['seance_updated', 'modifié'], ['seance_status_updated', 'statut'], ['seance_deleted', 'supprimé']]) {
      const notification = construireNotificationEvenement({ ...base, action });
      assert.match(notification.body, new RegExp(`Abdo.*${verb}.*Noah.*20 octobre.*16:00.*17:00`));
      assert.equal(notification.url, '/?seance=42');
      assert.match(notification.tag, /42$/);
      assert.ok(!JSON.stringify(notification).includes('Private parent') && !JSON.stringify(notification).includes('tarif'));
    }
    assert.match(construireNotificationEvenement({ ...base, action: 'seance_added', nombreSeances: 3 }).body, /2 autres séances/);
    for (const payload of [{ ...base, handlerId: 99 }, { ...base, intervenantId: null }, { ...base, seance: null }]) {
      const notification = construireNotificationEvenement({ ...payload, action: 'seance_added' });
      assert.equal(notification.url, '/');
      assert.ok(!notification.body.includes('Noah'), 'Incomplete/mismatched target never leaks details');
    }
    const recipient = { utilisateur_id: 20, acces_active: 1, statut_compte: 'active' };
    assert.ok(utilisateurPeutRecevoirEvenementApplication(recipient, { utilisateurId: 20, handlerProfesseurIds: [10] }, base));
    assert.equal(utilisateurPeutRecevoirEvenementApplication({ ...recipient, utilisateur_id: 30 }, { utilisateurId: 30, handlerOwnIds: [30] }, base), false);

    const pushes = [], broadcasts = [];
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync('utils/realtime-route.js', 'utf8'), {
      module, console,
      require: name => ({
        './realtime': { diffuserMiseAJourApplication: payload => broadcasts.push(payload) },
        './push-notifications': { notifierEvenementApplicationPush: async payload => pushes.push(payload) },
        './offline-operations': { executerAvecRecuOffline: (controller, ...args) => controller(...args) },
      })[name],
    });
    const req = { method: 'POST', utilisateur: { id: 10, nom: 'Abdo' }, scope: {}, route: { path: '/' } };
    const res = { statusCode: 201, locals: { realtimeScope: { handlerId: 10, intervenantId: 20 } }, json() {} };
    await module.exports.notifierMiseAJourApplication(async (_req, response) => response.json({ seance, seances: [seance] }), 'seances')(req, res, error => { throw error; });
    assert.equal(pushes[0].seance.id, 42);
    assert.equal(broadcasts[0].seance, undefined, 'Student details must not enter the broadcast SSE payload');
    pushes.length = 0;
    await module.exports.notifierMiseAJourApplication(async (_req, response) => { response.locals.pushSeance = seance; response.json({ message: 'Supprimée' }); }, 'seances')({ ...req, method: 'DELETE' }, res, error => { throw error; });
    assert.equal(pushes[0].seance.id, 42, 'Deletion retains a private summary after row removal');
    console.log('push session briefing: PASS (summary, links, scoped delivery, safe fallback, deletion, no private SSE data)');
  } finally {
    await require('../models/db').fermerBaseDeDonnees();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(databasePath + suffix, { force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
