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

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function normaliserListeIdentifiants(valeurs = []) {
  return Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [valeurs])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );
}

function normaliserSessionId(valeur) {
  return String(valeur || "").trim();
}

function normaliserExpirationSession(valeur) {
  if (valeur instanceof Date) {
    return Number.isFinite(valeur.getTime()) ? valeur.getTime() : null;
  }

  if (typeof valeur === "string") {
    const timestamp = Date.parse(valeur);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const timestamp = Number(valeur);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function clientSessionEstExpiree(client, maintenant = Date.now()) {
  return Boolean(
    !client?.public &&
      Number.isFinite(client.sessionExpiresAt) &&
      client.sessionExpiresAt <= maintenant
  );
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
  handlerIds = [],
  handlerOwnIds = [],
  intervenantIds = [],
  clientKey = "",
  sessionId = "",
  sessionExpiresAt = null,
}) {
  const client = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    res,
    utilisateurId: normaliserIdentifiant(utilisateurId),
    public: estPublic === true,
    scopes: Array.isArray(scopes) ? scopes : [],
    handlerIds: normaliserListeIdentifiants(handlerIds),
    handlerOwnIds: normaliserListeIdentifiants(handlerOwnIds),
    intervenantIds: normaliserListeIdentifiants(intervenantIds),
    clientKey: String(clientKey || ""),
    heartbeat: null,
    expiration: null,
    sessionId: normaliserSessionId(sessionId),
    sessionExpiresAt: normaliserExpirationSession(sessionExpiresAt),
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

  if (client.expiration) {
    clearTimeout(client.expiration);
  }

  clientsTempsReel.delete(client);
}

function fermerClientTempsReel(client, options = {}) {
  if (!client || !clientsTempsReel.has(client)) {
    return false;
  }

  ecrireEvenement(client, "session-invalidated", {
    reason: String(options.reason || "access_scope_changed"),
    timestamp: Date.now(),
  });

  try {
    if (typeof client.res?.end === "function") {
      client.res.end();
    } else if (typeof client.res?.destroy === "function") {
      client.res.destroy();
    }
  } catch (error) {
    // The client is removed below even if its socket has already disappeared.
  }

  retirerClientTempsReel(client);
  return true;
}

/**
 * Termine les flux SSE internes d'un utilisateur apres une modification qui
 * change son scope (suspension, transfert, retrait de role, etc.). Les scopes
 * sont captures a l'ouverture du flux : une simple rotation de session ne
 * suffit donc pas a empecher une ancienne connexion SSE de recevoir un event.
 */
function fermerFluxTempsReelUtilisateur(utilisateurId, options = {}) {
  const identifiant = normaliserIdentifiant(utilisateurId);

  if (!identifiant) {
    return 0;
  }

  let totalFermes = 0;

  for (const client of Array.from(clientsTempsReel)) {
    if (client.public || client.utilisateurId !== identifiant) {
      continue;
    }

    totalFermes += fermerClientTempsReel(client, options) ? 1 : 0;
  }

  return totalFermes;
}

function fermerFluxTempsReelSession(sessionId, options = {}) {
  const identifiant = normaliserSessionId(sessionId);

  if (!identifiant) {
    return 0;
  }

  let totalFermes = 0;

  for (const client of Array.from(clientsTempsReel)) {
    if (client.public || client.sessionId !== identifiant) {
      continue;
    }

    totalFermes += fermerClientTempsReel(client, {
      reason: options.reason || "session_revoked",
    })
      ? 1
      : 0;
  }

  return totalFermes;
}

function fermerFluxTempsReelPublicHandler(handlerId, options = {}) {
  const identifiant = normaliserIdentifiant(handlerId);

  if (!identifiant) {
    return 0;
  }

  let totalFermes = 0;

  for (const client of Array.from(clientsTempsReel)) {
    if (!client.public || !client.handlerIds.includes(identifiant)) {
      continue;
    }

    totalFermes += fermerClientTempsReel(client, {
      reason: options.reason || "public_calendar_access_revoked",
    })
      ? 1
      : 0;
  }

  return totalFermes;
}

function programmerExpirationClient(client) {
  if (!client || !Number.isFinite(client.sessionExpiresAt)) {
    return;
  }

  const delai = Math.max(client.sessionExpiresAt - Date.now(), 0);
  client.expiration = setTimeout(() => {
    fermerClientTempsReel(client, { reason: "session_expired" });
  }, delai);

  if (typeof client.expiration.unref === "function") {
    client.expiration.unref();
  }
}

function configurerHeartbeatClient(client, intervalMs = 25000) {
  if (!client?.res) {
    return;
  }

  programmerExpirationClient(client);

  client.heartbeat = setInterval(() => {
    if (clientSessionEstExpiree(client)) {
      fermerClientTempsReel(client, { reason: "session_expired" });
      return;
    }

    if (!ecrireEvenement(client, "ping", { timestamp: Date.now() })) {
      retirerClientTempsReel(client);
    }
  }, intervalMs);

  if (typeof client.heartbeat.unref === "function") {
    client.heartbeat.unref();
  }
}

function clientInterneEstDansCible(client, message) {
  const handlerId = normaliserIdentifiant(message?.handlerId);
  const intervenantId = normaliserIdentifiant(message?.intervenantId);

  // Un Handler reçoit les évènements de son espace propre. Un Professeur ne
  // reçoit une mutation ciblée que lorsque l'intervenant concerné est lui.
  if (handlerId && client.handlerOwnIds.includes(handlerId)) {
    return true;
  }

  if (handlerId && intervenantId && client.intervenantIds.includes(intervenantId)) {
    return true;
  }

  // Un réglage d'espace peut modifier l'interface de tous les Professeurs
  // rattachés (notamment les bornes du calendrier). Il est diffusé sans
  // métadonnée métier privée, voir serialiserMessageTempsReelPourClient.
  return Boolean(
    handlerId &&
      message?.scope === "settings" &&
      client.handlerIds.includes(handlerId)
  );
}

function clientEstHandlerCible(client, message) {
  const handlerId = normaliserIdentifiant(message?.handlerId);
  return Boolean(handlerId && client?.handlerOwnIds?.includes(handlerId));
}

function serialiserMessageTempsReelPourClient(client, message) {
  if (client.public) {
    return {
      timestamp: message.timestamp,
      scope: message.scope || "application",
      action: message.action || "application_updated",
    };
  }

  if (clientEstHandlerCible(client, message)) {
    return message;
  }

  // Les Professeurs reçoivent seulement le signal nécessaire au
  // rafraîchissement de leur interface. Ne jamais leur révéler l'acteur, le
  // message ou des identifiants qui concernent un autre membre de l'équipe.
  return {
    timestamp: message.timestamp,
    scope: message.scope || "application",
    action: message.action || "application_updated",
  };
}

function clientPublicEstDansCibleHandler(client, message) {
  const handlerId = normaliserIdentifiant(message?.handlerId);
  return Boolean(handlerId && client.handlerIds.includes(handlerId));
}

function messageCibleUneEquipe(message) {
  return Boolean(
    normaliserIdentifiant(message?.handlerId) ||
      normaliserIdentifiant(message?.intervenantId)
  );
}

function diffuserMiseAJourApplication(payload = {}) {
  const handlerId = normaliserIdentifiant(payload.handlerId ?? payload.handler_id);
  const intervenantId = normaliserIdentifiant(
    payload.intervenantId ?? payload.intervenant_id
  );
  const message = {
    timestamp: Date.now(),
    ...payload,
    handlerId: handlerId || undefined,
    intervenantId: intervenantId || undefined,
  };
  const estCibleEquipe = messageCibleUneEquipe(message);
  const acteurId = normaliserIdentifiant(message.actorId);

  for (const client of clientsTempsReel) {
    if (clientSessionEstExpiree(client)) {
      fermerClientTempsReel(client, { reason: "session_expired" });
      continue;
    }

    if (client.public) {
      if (
        (client.scopes.length > 0 && !client.scopes.includes(message.scope)) ||
        !clientPublicEstDansCibleHandler(client, message)
      ) {
        continue;
      }
    } else if (estCibleEquipe) {
      if (!clientInterneEstDansCible(client, message)) {
        continue;
      }
    } else if (!acteurId || client.utilisateurId !== acteurId) {
      // Une mutation dont l'equipe n'est pas connue ne doit jamais devenir
      // un broadcast interne. Son auteur reste le seul destinataire prudent.
      continue;
    }

    const messageClient = serialiserMessageTempsReelPourClient(client, message);

    if (!ecrireEvenement(client, "app-updated", messageClient)) {
      retirerClientTempsReel(client);
    }
  }
}

module.exports = {
  autoriserNouveauClientTempsReel,
  ajouterClientTempsReel,
  retirerClientTempsReel,
  fermerFluxTempsReelUtilisateur,
  fermerFluxTempsReelSession,
  fermerFluxTempsReelPublicHandler,
  configurerHeartbeatClient,
  diffuserMiseAJourApplication,
};
