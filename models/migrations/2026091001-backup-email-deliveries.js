/*
 * Technical delivery ledger for the lightweight CSV backups sent by email.
 *
 * This is deliberately not part of `historique_actions`: an automated
 * operational backup must not drown the business audit trail.  The unique
 * slot/recipient key makes a confirmed delivery idempotent across a PM2
 * restart or a second command invocation.
 */
module.exports = {
  version: "2026091001_backup_email_deliveries",
  description: "Journal technique idempotent des sauvegardes email CSV",

  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS backup_email_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('handler', 'admin')),
        scope_key TEXT NOT NULL,
        handler_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        recipient_email TEXT NOT NULL COLLATE NOCASE,
        occurrence_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sending'
          CHECK (status IN ('sending', 'sent', 'failed')),
        session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
        attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
        attempt_token TEXT NOT NULL,
        message_id TEXT,
        last_error_code TEXT,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (backup_type, scope_key, recipient_email, occurrence_key)
      )
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_backup_email_deliveries_cleanup
      ON backup_email_deliveries(status, delivered_at, updated_at)
    `);
  },
};
