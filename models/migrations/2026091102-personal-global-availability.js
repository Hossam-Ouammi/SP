module.exports = {
  version: "2026091102_personal_global_availability",
  description: "Disponibilite personnelle globale et liens publics individuels",
  async up({ run }) {
    await run(`
      CREATE INDEX IF NOT EXISTS idx_indisponibilites_intervenant_date_heures
      ON indisponibilites(intervenant_id, date, heure_debut, heure_fin)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_seances_intervenant_date_heures
      ON seances(intervenant_id, date, heure_debut, heure_fin)
    `);
  },
};
