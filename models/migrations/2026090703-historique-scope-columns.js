async function colonnesTable(all, nomTable) {
  // The table name is a migration constant and never comes from user input.
  return all(`PRAGMA table_info(${nomTable})`);
}

async function ajouterColonnesSiNecessaire({ run, all }, nomTable, colonnes) {
  const existantes = new Set((await colonnesTable(all, nomTable)).map((colonne) => colonne.name));

  for (const colonne of colonnes) {
    if (!existantes.has(colonne.nom)) {
      await run(`ALTER TABLE ${nomTable} ADD COLUMN ${colonne.definition}`);
      existantes.add(colonne.nom);
    }
  }
}

async function trouverHandlerLegacy(get) {
  return get(`
    SELECT utilisateurs.id
    FROM utilisateurs
    INNER JOIN utilisateur_roles
      ON utilisateur_roles.utilisateur_id = utilisateurs.id
      AND utilisateur_roles.role = 'handler'
    ORDER BY utilisateurs.id ASC
    LIMIT 1
  `);
}

module.exports = {
  version: "2026090703_historique_scope_columns",
  description: "Colonnes de scope Handler/intervenant de l'historique",

  async up(context) {
    const { run, get } = context;

    await ajouterColonnesSiNecessaire(context, "historique_actions", [
      {
        nom: "handler_id",
        definition: "handler_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL",
      },
      {
        nom: "intervenant_id",
        definition: "intervenant_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL",
      },
    ]);

    // This migration does not touch any signed field in historique_actions;
    // the existing HMAC chain therefore remains verifiable.
    // A linked session can safely contribute its already-scoped owner.
    await run(`
      UPDATE historique_actions
      SET handler_id = (
        SELECT seances.handler_id
        FROM seances
        WHERE seances.id = historique_actions.seance_id
      )
      WHERE handler_id IS NULL
        AND seance_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM seances
          WHERE seances.id = historique_actions.seance_id
            AND seances.handler_id IS NOT NULL
        )
    `);

    // Intervenant is copied only when it is an explicit session field. No
    // legacy `compte`/text account is ever used as an inference source.
    await run(`
      UPDATE historique_actions
      SET intervenant_id = (
        SELECT seances.intervenant_id
        FROM seances
        WHERE seances.id = historique_actions.seance_id
      )
      WHERE intervenant_id IS NULL
        AND seance_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM seances
          WHERE seances.id = historique_actions.seance_id
            AND seances.intervenant_id IS NOT NULL
        )
    `);

    const handlerLegacy = await trouverHandlerLegacy(get);

    // Every remaining legacy entry belongs to the initial Handler universe.
    // It stays deliberately unassigned to an intervenant.  Empty new
    // installations legitimately have no Handler and therefore no entries to
    // backfill.
    if (handlerLegacy?.id) {
      await run(
        `
          UPDATE historique_actions
          SET handler_id = ?
          WHERE handler_id IS NULL
        `,
        [handlerLegacy.id]
      );
    }

    await run(`
      CREATE INDEX IF NOT EXISTS idx_historique_actions_handler_intervenant_date
      ON historique_actions(handler_id, intervenant_id, created_at DESC, id DESC)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_historique_actions_handler_date
      ON historique_actions(handler_id, created_at DESC, id DESC)
    `);
  },
};
