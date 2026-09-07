const {
  DEFAULT_CALENDAR_START_TIME,
  DEFAULT_CALENDAR_END_TIME,
} = require("../../utils/calendar-hours");

async function colonnesTable(all, nomTable) {
  return all(`PRAGMA table_info(${nomTable})`);
}

async function ajouterColonneSiNecessaire(context, nom, definition) {
  const colonnes = await colonnesTable(context.all, "utilisateurs");
  if (!colonnes.some((colonne) => colonne.name === nom)) {
    await context.run(`ALTER TABLE utilisateurs ADD COLUMN ${definition}`);
  }
}

module.exports = {
  version: "2026090705_handler_calendar_hours",
  description: "Plage horaire métier centralisée par Handler",

  async up(context) {
    await ajouterColonneSiNecessaire(
      context,
      "calendar_start_time",
      `calendar_start_time TEXT NOT NULL DEFAULT '${DEFAULT_CALENDAR_START_TIME}'`
    );
    await ajouterColonneSiNecessaire(
      context,
      "calendar_end_time",
      `calendar_end_time TEXT NOT NULL DEFAULT '${DEFAULT_CALENDAR_END_TIME}'`
    );

    // An old/partially migrated database never needs manual intervention to
    // preserve its historical private calendar window.
    await context.run(
      `
        UPDATE utilisateurs
        SET calendar_start_time = ?
        WHERE calendar_start_time IS NULL OR trim(calendar_start_time) = ''
      `,
      [DEFAULT_CALENDAR_START_TIME]
    );
    await context.run(
      `
        UPDATE utilisateurs
        SET calendar_end_time = ?
        WHERE calendar_end_time IS NULL OR trim(calendar_end_time) = ''
      `,
      [DEFAULT_CALENDAR_END_TIME]
    );

    await context.run(`
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_calendar_hours
      ON utilisateurs(calendar_start_time, calendar_end_time)
    `);
  },
};
