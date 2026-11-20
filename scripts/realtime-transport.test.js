const assert = require('node:assert/strict');
const express = require('express');
const { ouvrirFluxTempsReel } = require('../controllers/realtime.controller');
const { diffuserMiseAJourApplication } = require('../utils/realtime');

(async () => {
  const app = express();
  app.get('/events', (req, res) => {
    req.utilisateur = { id: 10 };
    req.scope = { handlerIds: [10], handlerOwnIds: [10], intervenantIds: [10] };
    ouvrirFluxTempsReel(req, res);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/events`, { signal: abort.signal });
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: connected/);
    await new Promise(resolve => setTimeout(resolve, 100));
    diffuserMiseAJourApplication({ scope: 'seances', handlerId: 10, intervenantId: 10 });
    const timer = setTimeout(() => abort.abort(), 2000);
    try {
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: app-updated/);
    } finally { clearTimeout(timer); }
    console.log('realtime transport: PASS (open stream receives a later mutation)');
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
