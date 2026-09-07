async function colonnesTable(all, nomTable) {
  // The table name is a migration constant, never an external input.
  return all(`PRAGMA table_info(${nomTable})`);
}

module.exports = {
  version: "2026090709_historique_hmac_v2_scope",
  description:
    "Versionne les signatures HMAC de l'historique et signe le scope Handler/intervenant",

  async up({ run, all }) {
    const colonnes = await colonnesTable(all, "historique_actions");

    // The legacy bootstrap creates this table before versioned migrations.
    // Returning is defensive for an intentionally partial test schema only.
    if (colonnes.length === 0) {
      return;
    }

    const nomsColonnes = new Set(colonnes.map((colonne) => colonne.name));

    if (!nomsColonnes.has("signature_version")) {
      await run(`
        ALTER TABLE historique_actions
        ADD COLUMN signature_version INTEGER NOT NULL DEFAULT 1
          CHECK (signature_version IN (1, 2))
      `);
    }

    // Existing hashes are v1 by definition.  We deliberately do not rewrite
    // their payloads or hashes: v1 verification remains byte-compatible.
    await run(`
      UPDATE historique_actions
      SET signature_version = 1
      WHERE signature_version IS NULL
    `);
  },
};
