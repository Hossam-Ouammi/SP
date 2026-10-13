module.exports = {
  version: "2026092601",
  description: "Idempotent personal availability week duplication",
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS availability_week_copies (
      intervenant_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      source_week TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (intervenant_id, source_week)
    )`);
  },
};
