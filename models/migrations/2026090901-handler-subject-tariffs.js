const BASELINE_EFFECTIVE_AT = "1970-01-01T00:00:00.000Z";

/**
 * A Handler owns its subject catalogue.  A rate is deliberately versioned
 * instead of overwritten: session snapshots remain the final accounting
 * source, while the version table also lets a late-created historic session
 * resolve the rate that was active on its date.
 */
module.exports = {
  version: "2026090901_handler_subject_tariffs",
  description:
    "Catalogue de matieres par Handler et tarifs historiques par realisateur/matiere",

  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS matieres_handler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        libelle TEXT NOT NULL,
        libelle_normalise TEXT NOT NULL,
        actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at TEXT,
        UNIQUE(handler_id, libelle_normalise)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS tarifs_realisateur_matiere (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        intervenant_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        matiere_id INTEGER NOT NULL REFERENCES matieres_handler(id) ON DELETE RESTRICT,
        tarif_horaire INTEGER NOT NULL CHECK (tarif_horaire >= 0 AND tarif_horaire <= 100000),
        effectif_depuis TEXT NOT NULL,
        effectif_jusqua TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (effectif_jusqua IS NULL OR effectif_jusqua > effectif_depuis)
      )
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_matieres_handler_actives
      ON matieres_handler(handler_id, actif, libelle_normalise, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_tarifs_realisateur_matiere_courants
      ON tarifs_realisateur_matiere(handler_id, intervenant_id, matiere_id, effectif_jusqua, id)
    `);

    // Database guards mirror the scoped route checks.  A shared Professor may
    // receive distinct rates in two Handler workspaces, but cannot be priced
    // in a workspace to which they are not actively attached.
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_matieres_handler_scope_insert
      BEFORE INSERT ON matieres_handler
      FOR EACH ROW
      WHEN NOT EXISTS (
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
      )
      BEGIN
        SELECT RAISE(ABORT, 'handler matiere invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_matieres_handler_scope_update
      BEFORE UPDATE OF handler_id ON matieres_handler
      FOR EACH ROW
      WHEN NOT EXISTS (
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
      )
      BEGIN
        SELECT RAISE(ABORT, 'handler matiere invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_tarifs_realisateur_matiere_scope_insert
      BEFORE INSERT ON tarifs_realisateur_matiere
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1 FROM matieres_handler
          WHERE id = NEW.matiere_id AND handler_id = NEW.handler_id
        )
        AND EXISTS (
          SELECT 1 FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1 FROM rattachements_professeurs
            INNER JOIN utilisateur_roles
              ON utilisateur_roles.utilisateur_id = rattachements_professeurs.professeur_id
            WHERE rattachements_professeurs.handler_id = NEW.handler_id
              AND rattachements_professeurs.professeur_id = NEW.intervenant_id
              AND rattachements_professeurs.actif = 1
              AND utilisateur_roles.role = 'professeur'
          )
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'scope tarif matiere invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_tarifs_realisateur_matiere_scope_update
      BEFORE UPDATE OF handler_id, intervenant_id, matiere_id
      ON tarifs_realisateur_matiere
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1 FROM matieres_handler
          WHERE id = NEW.matiere_id AND handler_id = NEW.handler_id
        )
        AND EXISTS (
          SELECT 1 FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1 FROM rattachements_professeurs
            INNER JOIN utilisateur_roles
              ON utilisateur_roles.utilisateur_id = rattachements_professeurs.professeur_id
            WHERE rattachements_professeurs.handler_id = NEW.handler_id
              AND rattachements_professeurs.professeur_id = NEW.intervenant_id
              AND rattachements_professeurs.actif = 1
              AND utilisateur_roles.role = 'professeur'
          )
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'scope tarif matiere invalide');
      END
    `);

    // Every existing Handler starts with the former global subjects plus the
    // subjects already present in its own sessions.  Future edits are scoped
    // to this table and never alter another Handler's catalogue.
    await run(`
      INSERT OR IGNORE INTO matieres_handler (
        handler_id, libelle, libelle_normalise, actif
      )
      SELECT handlers.utilisateur_id, catalogue.valeur, lower(trim(catalogue.valeur)), 1
      FROM utilisateur_roles AS handlers
      CROSS JOIN catalogue_options AS catalogue
      WHERE handlers.role = 'handler'
        AND catalogue.type = 'matiere'
        AND trim(COALESCE(catalogue.valeur, '')) <> ''
    `);
    await run(`
      INSERT OR IGNORE INTO matieres_handler (
        handler_id, libelle, libelle_normalise, actif
      )
      SELECT DISTINCT seances.handler_id, trim(seances.matiere), lower(trim(seances.matiere)), 1
      FROM seances
      INNER JOIN utilisateur_roles AS handlers
        ON handlers.utilisateur_id = seances.handler_id
        AND handlers.role = 'handler'
      WHERE seances.handler_id IS NOT NULL
        AND trim(COALESCE(seances.matiere, '')) <> ''
    `);

    // Existing sessions already received snapshots in newer versions.  Older
    // rows without one are frozen now using their former global rate, so a
    // later subject-rate edit cannot rewrite historic statements.
    await run(`
      UPDATE seances
      SET tarif_horaire_applique = (
        SELECT utilisateurs.tarif_horaire
        FROM utilisateurs
        WHERE utilisateurs.id = seances.intervenant_id
      )
      WHERE tarif_horaire_applique IS NULL
        AND intervenant_id IS NOT NULL
    `);

    // Seed an explicit baseline for every current subject/realisateur pair.
    // It preserves the former per-user rate until the Handler enters a
    // subject-specific value in the new grid.
    await run(
      `
        INSERT INTO tarifs_realisateur_matiere (
          handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
        )
        SELECT
          handlers.utilisateur_id,
          handlers.utilisateur_id,
          matieres.id,
          COALESCE(utilisateurs.tarif_horaire, 0),
          ?
        FROM utilisateur_roles AS handlers
        INNER JOIN utilisateurs
          ON utilisateurs.id = handlers.utilisateur_id
        INNER JOIN matieres_handler AS matieres
          ON matieres.handler_id = handlers.utilisateur_id
          AND matieres.actif = 1
        WHERE handlers.role = 'handler'
          AND NOT EXISTS (
            SELECT 1
            FROM tarifs_realisateur_matiere AS tarifs
            WHERE tarifs.handler_id = handlers.utilisateur_id
              AND tarifs.intervenant_id = handlers.utilisateur_id
              AND tarifs.matiere_id = matieres.id
              AND tarifs.effectif_jusqua IS NULL
          )
      `,
      [BASELINE_EFFECTIVE_AT]
    );
    await run(
      `
        INSERT INTO tarifs_realisateur_matiere (
          handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
        )
        SELECT
          rattachements.handler_id,
          rattachements.professeur_id,
          matieres.id,
          COALESCE(professeurs.tarif_horaire, 0),
          ?
        FROM rattachements_professeurs AS rattachements
        INNER JOIN utilisateurs AS professeurs
          ON professeurs.id = rattachements.professeur_id
        INNER JOIN matieres_handler AS matieres
          ON matieres.handler_id = rattachements.handler_id
          AND matieres.actif = 1
        WHERE rattachements.actif = 1
          AND NOT EXISTS (
            SELECT 1
            FROM tarifs_realisateur_matiere AS tarifs
            WHERE tarifs.handler_id = rattachements.handler_id
              AND tarifs.intervenant_id = rattachements.professeur_id
              AND tarifs.matiere_id = matieres.id
              AND tarifs.effectif_jusqua IS NULL
          )
      `,
      [BASELINE_EFFECTIVE_AT]
    );
  },
};
