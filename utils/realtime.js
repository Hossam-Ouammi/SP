const clientsTempsReel = new Set();

function ecrireEvenement(client, eventName, data) {
  if (!client?.res || client.res.writableEnded || client.res.destroyed) {
    return false;
  }

  try {
    client.res.write(`event: ${eventName}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    return false;
  }
}

function ajouterClientTempsReel({ res, utilisateurId }) {
  const client = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    res,
    utilisateurId: Number(utilisateurId) || null,
    heartbeat: null,
  };

  clientsTempsReel.add(client);
  return client;
}

function retirerClientTempsReel(client) {
  if (!client) {
    return;
  }

  if (client.heartbeat) {
    clearInterval(client.heartbeat);
  }

  clientsTempsReel.delete(client);
}

function configurerHeartbeatClient(client, intervalMs = 25000) {
  if (!client?.res) {
    return;
  }

  client.heartbeat = setInterval(() => {
    if (!ecrireEvenement(client, "ping", { timestamp: Date.now() })) {
      retirerClientTempsReel(client);
    }
  }, intervalMs);
}

function diffuserMiseAJourApplication(payload = {}) {
  const message = {
    timestamp: Date.now(),
    ...payload,
  };

  for (const client of clientsTempsReel) {
    if (!ecrireEvenement(client, "app-updated", message)) {
      retirerClientTempsReel(client);
    }
  }
}

module.exports = {
  ajouterClientTempsReel,
  retirerClientTempsReel,
  configurerHeartbeatClient,
  diffuserMiseAJourApplication,
};
