async function colonneExiste(all, table, colonne) {
  const colonnes = await all(`PRAGMA table_info(${table})`);
  return colonnes.some((element) => element.name === colonne);
}

module.exports = {
  version: "2026092001_remove_session_description",
  description: "Suppression definitive des descriptions de seance",
  async up({ run, all }) {
    if (await colonneExiste(all, "seances", "description")) {
      await run("ALTER TABLE seances DROP COLUMN description");
    }

    if (await colonneExiste(all, "propositions_seances", "description")) {
      await run("ALTER TABLE propositions_seances DROP COLUMN description");
    }
  },
};
