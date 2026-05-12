const {
  ajouterClientTempsReel,
  retirerClientTempsReel,
  configurerHeartbeatClient,
} = require("../utils/realtime");

function ouvrirFluxTempsReel(req, res) {
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
  });

  configurerHeartbeatClient(client);
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  req.on("close", () => {
    retirerClientTempsReel(client);
  });
}

module.exports = {
  ouvrirFluxTempsReel,
};
