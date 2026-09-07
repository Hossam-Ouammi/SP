async function creerProtectionsScope(run) {
  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_disponibilites_scope_insert
    BEFORE INSERT ON disponibilites
    FOR EACH ROW
    WHEN NOT (
      EXISTS (
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
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
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
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
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
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
        SELECT 1 FROM utilisateur_roles
        WHERE utilisateur_id = NEW.handler_id AND role = 'handler'
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
}

async function creerIndexes(run) {
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
}

module.exports = {
  version: "2026090706_availability_midnight",
  description: "Support explicite de la fin de journée 24:00 pour les disponibilités",

  async up({ run, all }) {
    const colonnes = await all("PRAGMA table_info(disponibilites)");
    if (colonnes.length === 0) {
      return;
    }

    await run("DROP TRIGGER IF EXISTS trg_disponibilites_scope_insert");
    await run("DROP TRIGGER IF EXISTS trg_disponibilites_scope_update");
    await run("DROP TRIGGER IF EXISTS trg_exceptions_disponibilites_scope_insert");
    await run("DROP TRIGGER IF EXISTS trg_exceptions_disponibilites_scope_update");
    await run("DROP INDEX IF EXISTS idx_disponibilites_scope_actif_type");
    await run("DROP INDEX IF EXISTS idx_disponibilites_ponctuelles_scope_date");
    await run("DROP INDEX IF EXISTS idx_disponibilites_recurrentes_scope_jour");
    await run("DROP INDEX IF EXISTS idx_exceptions_disponibilites_scope_date");
    await run("DROP INDEX IF EXISTS idx_exceptions_disponibilites_regle_date");

    await run(
      "ALTER TABLE exceptions_disponibilites RENAME TO exceptions_disponibilites_legacy_calendar_hours"
    );
    await run(
      "ALTER TABLE disponibilites RENAME TO disponibilites_legacy_calendar_hours"
    );

    await run(`
      CREATE TABLE disponibilites (
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
            (heure_fin GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(heure_fin, 1, 2) <= '23')
            OR heure_fin = '24:00'
          ),
        actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
        cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (heure_debut < heure_fin OR heure_fin = '24:00'),
        CHECK (
          (type = 'recurrente' AND jour_semaine BETWEEN 0 AND 6 AND date IS NULL)
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
      CREATE TABLE exceptions_disponibilites (
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
            OR (heure_debut GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(heure_debut, 1, 2) <= '23')
          ),
        heure_fin TEXT
          CHECK (
            heure_fin IS NULL
            OR (heure_fin GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(heure_fin, 1, 2) <= '23')
            OR heure_fin = '24:00'
          ),
        raison TEXT,
        cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          (heure_debut IS NULL AND heure_fin IS NULL)
          OR (
            heure_debut IS NOT NULL AND heure_fin IS NOT NULL
            AND (heure_debut < heure_fin OR heure_fin = '24:00')
          )
        )
      )
    `);

    await run(`
      INSERT INTO disponibilites (
        id, handler_id, intervenant_id, type, jour_semaine, date, heure_debut,
        heure_fin, actif, cree_par, created_at, updated_at
      )
      SELECT
        id, handler_id, intervenant_id, type, jour_semaine, date, heure_debut,
        heure_fin, actif, cree_par, created_at, updated_at
      FROM disponibilites_legacy_calendar_hours
    `);
    await run(`
      INSERT INTO exceptions_disponibilites (
        id, disponibilite_id, handler_id, intervenant_id, date, type, heure_debut,
        heure_fin, raison, cree_par, created_at, updated_at
      )
      SELECT
        id, disponibilite_id, handler_id, intervenant_id, date, type, heure_debut,
        heure_fin, raison, cree_par, created_at, updated_at
      FROM exceptions_disponibilites_legacy_calendar_hours
    `);
    await run("DROP TABLE exceptions_disponibilites_legacy_calendar_hours");
    await run("DROP TABLE disponibilites_legacy_calendar_hours");

    await creerProtectionsScope(run);
    await creerIndexes(run);
  },
};
