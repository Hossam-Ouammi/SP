const clientsTempsReel = new Set();
const MAX_CLIENTS_TEMPS_REEL = lireNombreEntierEnv("REALTIME_MAX_CLIENTS", 300);
const MAX_CLIENTS_TEMPS_REEL_PUBLIC = lireNombreEntierEnv(
  "REALTIME_MAX_PUBLIC_CLIENTS",
  120
);
const MAX_CLIENTS_TEMPS_REEL_PAR_CLE = lireNombreEntierEnv(
  "REALTIME_MAX_CLIENTS_PER_KEY",
  6
);

function lireNombreEntierEnv(nom, valeurParDefaut) {
  const valeur = Number(process.env[nom]);

  if (!Number.isFinite(valeur)) {
    return valeurParDefaut;
  }

  return Math.max(Math.floor(valeur), 1);
}

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

function compterClientsTempsReel({ public: estPublic = null, clientKey = "" } = {}) {
  let total = 0;

  for (const client of clientsTempsReel) {
    if (estPublic !== null && client.public !== estPublic) {
      continue;
    }

    if (clientKey && client.clientKey !== clientKey) {
      continue;
    }

    total += 1;
  }

  return total;
}

function autoriserNouveauClientTempsReel({ public: estPublic = false, clientKey = "" } = {}) {
  if (clientsTempsReel.size >= MAX_CLIENTS_TEMPS_REEL) {
    return {
      ok: false,
      status: 429,
      message: "Trop de connexions temps réel ouvertes. Réessayez dans quelques instants.",
    };
  }

  if (
    estPublic &&
    compterClientsTempsReel({ public: true }) >= MAX_CLIENTS_TEMPS_REEL_PUBLIC
  ) {
    return {
      ok: false,
      status: 429,
      message: "Trop de connexions publiques ouvertes. Réessayez dans quelques instants.",
    };
  }

  if (
    clientKey &&
    compterClientsTempsReel({ clientKey }) >= MAX_CLIENTS_TEMPS_REEL_PAR_CLE
  ) {
    return {
      ok: false,
      status: 429,
      message: "Trop de connexions temps réel ouvertes pour cette session.",
    };
  }

  return { ok: true };
}

function ajouterClientTempsReel({
  res,
  utilisateurId,
  public: estPublic = false,
  scopes = [],
  clientKey = "",
}) {
  const client = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    res,
    utilisateurId: Number(utilisateurId) || null,
    public: estPublic === true,
    scopes: Array.isArray(scopes) ? scopes : [],
    clientKey: String(clientKey || ""),
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
  autoriserNouveauClientTempsReel,
  ajouterClientTempsReel,
  retirerClientTempsReel,
  configurerHeartbeatClient,
  diffuserMiseAJourApplication,
};
