const { AUTO_LOGIN_MAX_AGE_MS } = require("../../config/security.config");

function joursExpirationAppareil() {
  return Math.floor(AUTO_LOGIN_MAX_AGE_MS / (24 * 60 * 60 * 1000));
}

module.exports = {
  version: "2026090803_trusted_device_expiration",
  description:
    "Ajoute une expiration serveur absolue aux appareils de connexion automatique",

  async up({ run, all }) {
    const colonnes = await all("PRAGMA table_info(trusted_devices)");

    if (!colonnes.some((colonne) => colonne.name === "expires_at")) {
      await run("ALTER TABLE trusted_devices ADD COLUMN expires_at TEXT");
    }

    // Preserve the original 90-day lifetime for already-issued cookies rather
    // than extending them from the deployment date. SQLite timestamps are UTC;
    // writing an ISO value keeps Date.parse behaviour unambiguous in Node.
    await run(
      `
        UPDATE trusted_devices
        SET expires_at = strftime(
          '%Y-%m-%dT%H:%M:%fZ',
          COALESCE(NULLIF(trim(created_at), ''), 'now'),
          '+${joursExpirationAppareil()} days'
        )
        WHERE expires_at IS NULL
          OR trim(expires_at) = ''
      `
    );

    await run(
      "CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires_at ON trusted_devices(expires_at)"
    );
  },
};
