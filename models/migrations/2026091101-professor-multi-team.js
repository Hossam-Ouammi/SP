module.exports = {
  version: "2026091101_professor_multi_team",
  description: "Professeurs multi-equipes et demandes de rattachement",
  async up({ run }) {
    await run("DROP INDEX IF EXISTS idx_rattachements_professeurs_professeur_actif_unique");
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rattachements_professeurs_equipe_active_unique
      ON rattachements_professeurs(handler_id, professeur_id)
      WHERE actif = 1
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS demandes_rattachement_equipe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        professeur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        statut TEXT NOT NULL DEFAULT 'pending'
          CHECK (statut IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_demandes_rattachement_pending_unique
      ON demandes_rattachement_equipe(professeur_id, handler_id)
      WHERE statut = 'pending'
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_demandes_rattachement_handler_statut
      ON demandes_rattachement_equipe(handler_id, statut, created_at)
    `);
    await run("UPDATE utilisateurs SET tarif_horaire = 90 WHERE tarif_horaire = 0");
    await run(`
      UPDATE tarifs_realisateur_matiere
      SET tarif_horaire = 90
      WHERE tarif_horaire = 0 AND effectif_jusqua IS NULL
    `);
  },
};
