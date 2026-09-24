module.exports = {
  version: "2026092002_public_calendars_enabled_by_default",
  description: "Activation par defaut de tous les calendriers publics personnels",
  async up({ run }) {
    await run(`
      UPDATE utilisateurs
      SET calendrier_public_actif = 1
      WHERE COALESCE(calendrier_public_actif, 0) <> 1
    `);
  },
};
