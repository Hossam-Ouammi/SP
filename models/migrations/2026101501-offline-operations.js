module.exports = {
  version: "2026101501",
  description: "Durable receipts for authenticated offline calendar operations",
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS offline_operations (
      utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (utilisateur_id, operation_id)
    )`);
  },
};
