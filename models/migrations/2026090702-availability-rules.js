const VERSION = "2026090702_availability_rules";

/**
 * Availability is deliberately separate from the legacy `indisponibilites`
 * table. Existing blocks remain historical/business data; these rules model a
 * person's normal working schedule and explicit overrides.
 *
 * `jour_semaine` follows the ISO-like convention used by this module:
 * 0 = Monday, ... 6 = Sunday.
 */
module.exports = {
  version: VERSION,
  description: "Règles de disponibilités récurrentes, ponctuelles et exceptions scopees",

  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS disponibilites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        intervenant_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        type TEXT NOT NULL CHECK (type IN ('recurrente', 'ponctuelle')),
        jour_semaine INTEGER,
        date TEXT,
        heure_debut TEXT NOT NULL
          CHECK (
            heure_debut GLOB '[0-2][0-9]:[0-5][0-9]'
            AND substr(heure_debut, 1, 2) <= '23'
          ),
        heure_fin TEXT NOT NULL
          CHECK (
            heure_fin GLOB '[0-2][0-9]:[0-5][0-9]'
            AND substr(heure_fin, 1, 2) <= '23'
          ),
        actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
        cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (heure_debut < heure_fin),
        CHECK (
          (type = 'recurrente'
            AND jour_semaine BETWEEN 0 AND 6
            AND date IS NULL)
          OR
          (type = 'ponctuelle'
            AND date IS NOT NULL
            AND length(date) = 10
            AND date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
            AND substr(date, 6, 2) BETWEEN '01' AND '12'
            AND substr(date, 9, 2) BETWEEN '01' AND '31'
            AND jour_semaine IS NULL)
        )
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS exceptions_disponibilites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disponibilite_id INTEGER REFERENCES disponibilites(id) ON DELETE SET NULL,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        intervenant_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        date TEXT NOT NULL
          CHECK (
            length(date) = 10
            AND date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
            AND substr(date, 6, 2) BETWEEN '01' AND '12'
            AND substr(date, 9, 2) BETWEEN '01' AND '31'
          ),
        type TEXT NOT NULL CHECK (type IN ('indisponible', 'disponible')),
        heure_debut TEXT
          CHECK (
            heure_debut IS NULL
            OR (
              heure_debut GLOB '[0-2][0-9]:[0-5][0-9]'
              AND substr(heure_debut, 1, 2) <= '23'
            )
          ),
        heure_fin TEXT
          CHECK (
            heure_fin IS NULL
            OR (
              heure_fin GLOB '[0-2][0-9]:[0-5][0-9]'
              AND substr(heure_fin, 1, 2) <= '23'
            )
          ),
        raison TEXT,
        cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (heure_debut IS NULL AND heure_fin IS NULL)
          OR (heure_debut IS NOT NULL AND heure_fin IS NOT NULL AND heure_debut < heure_fin)
        )
      )
    `);

    // SQLite cannot express the active Handler/Professeur relationship as a
    // composite foreign key (the relationship uses a partial unique index).
    // These triggers provide a database-level guard in addition to route scope
    // checks: a rule is either the Handler's own availability or belongs to an
    // actively attached Professeur.
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_disponibilites_scope_insert
      BEFORE INSERT ON disponibilites
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1
          FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id
            AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1
            FROM rattachements_professeurs
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
        SELECT RAISE(ABORT, 'scope disponibilite invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_disponibilites_scope_update
      BEFORE UPDATE OF handler_id, intervenant_id ON disponibilites
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1
          FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id
            AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1
            FROM rattachements_professeurs
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
        SELECT RAISE(ABORT, 'scope disponibilite invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_exceptions_disponibilites_scope_insert
      BEFORE INSERT ON exceptions_disponibilites
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1
          FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id
            AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1
            FROM rattachements_professeurs
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
        SELECT RAISE(ABORT, 'scope exception disponibilite invalide');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_exceptions_disponibilites_scope_update
      BEFORE UPDATE OF handler_id, intervenant_id ON exceptions_disponibilites
      FOR EACH ROW
      WHEN NOT (
        EXISTS (
          SELECT 1
          FROM utilisateur_roles
          WHERE utilisateur_id = NEW.handler_id
            AND role = 'handler'
        )
        AND (
          NEW.intervenant_id = NEW.handler_id
          OR EXISTS (
            SELECT 1
            FROM rattachements_professeurs
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
        SELECT RAISE(ABORT, 'scope exception disponibilite invalide');
      END
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_disponibilites_scope_actif_type
      ON disponibilites(handler_id, intervenant_id, actif, type, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_disponibilites_ponctuelles_scope_date
      ON disponibilites(handler_id, intervenant_id, date, heure_debut, heure_fin)
      WHERE type = 'ponctuelle' AND actif = 1
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_disponibilites_recurrentes_scope_jour
      ON disponibilites(handler_id, intervenant_id, jour_semaine, heure_debut, heure_fin)
      WHERE type = 'recurrente' AND actif = 1
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_exceptions_disponibilites_scope_date
      ON exceptions_disponibilites(handler_id, intervenant_id, date, type, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_exceptions_disponibilites_regle_date
      ON exceptions_disponibilites(disponibilite_id, date, id)
      WHERE disponibilite_id IS NOT NULL
    `);
  },
};
