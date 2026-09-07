const {
  autoriserNouveauClientTempsReel,
  ajouterClientTempsReel,
  retirerClientTempsReel,
  configurerHeartbeatClient,
} = require("../utils/realtime");
const { normaliserIpClient } = require("../middleware/security.middleware");

function obtenirExpirationSession(req) {
  const expirationCookie = req.session?.cookie?.expires;

  if (expirationCookie instanceof Date && Number.isFinite(expirationCookie.getTime())) {
    return expirationCookie.getTime();
  }

  if (typeof expirationCookie === "string") {
    const timestamp = Date.parse(expirationCookie);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  const maxAge = Number(req.session?.cookie?.maxAge);
  return Number.isFinite(maxAge) && maxAge > 0 ? Date.now() + maxAge : null;
}

function ouvrirFluxTempsReel(req, res) {
  const clientKey = req.utilisateur?.id
    ? `user:${req.utilisateur.id}`
    : `ip:${normaliserIpClient(req)}`;
  const autorisation = autoriserNouveauClientTempsReel({ clientKey });

  if (!autorisation.ok) {
    return res.status(autorisation.status).json({ message: autorisation.message });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, private");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write("retry: 3000\n\n");

  const client = ajouterClientTempsReel({
    res,
    utilisateurId: req.utilisateur?.id,
    handlerIds: req.scope?.handlerIds,
    handlerOwnIds: req.scope?.handlerOwnIds,
    intervenantIds: req.scope?.intervenantIds,
    clientKey,
    sessionId: req.sessionID,
    sessionExpiresAt: obtenirExpirationSession(req),
  });

  configurerHeartbeatClient(client);
  if (!res.writableEnded && !res.destroyed) {
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  }

  req.on("close", () => {
    retirerClientTempsReel(client);
  });
}

module.exports = {
  ouvrirFluxTempsReel,
};
