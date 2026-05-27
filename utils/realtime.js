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

function ajouterClientTempsReel({ res, utilisateurId, public: estPublic = false, scopes = [] }) {
  const client = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    res,
    utilisateurId: Number(utilisateurId) || null,
    public: estPublic === true,
    scopes: Array.isArray(scopes) ? scopes : [],
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

  if (typeof client.heartbeat.unref === "function") {
    client.heartbeat.unref();
  }
}

function diffuserMiseAJourApplication(payload = {}) {
  const message = {
    timestamp: Date.now(),
    ...payload,
  };

  for (const client of clientsTempsReel) {
    if (client.public && client.scopes.length > 0 && !client.scopes.includes(message.scope)) {
      continue;
    }

    const messageClient = client.public
      ? {
          timestamp: message.timestamp,
          scope: message.scope || "application",
          action: message.action || "application_updated",
        }
      : message;

    if (!ecrireEvenement(client, "app-updated", messageClient)) {
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
