const crypto = require("crypto");

const ROLES = ["super_admin", "handler", "professeur"];
const STATUTS_COMPTE = [
  "active",
  "en_attente_activation",
  "suspendu",
  "revoque",
  "archive",
];
const TIMEZONE_PAR_DEFAUT = "Africa/Casablanca";
const COULEUR_CALENDRIER_PAR_DEFAUT = "#2563eb";

function identifiantPublicAleatoire() {
  return `usr_${crypto.randomBytes(16).toString("hex")}`;
}

async function colonnesTable(all, nomTable) {
  // Les noms de tables sont des constantes de migration, jamais des entrees
  // utilisateur. PRAGMA ne permet pas de parametrer le nom de table.
  return all(`PRAGMA table_info(${nomTable})`);
}

async function ajouterColonnesSiNecessaire({ run, all }, nomTable, colonnes) {
  const existantes = new Set((await colonnesTable(all, nomTable)).map((colonne) => colonne.name));
  const ajoutees = new Set();

  for (const colonne of colonnes) {
    if (!existantes.has(colonne.nom)) {
      await run(`ALTER TABLE ${nomTable} ADD COLUMN ${colonne.definition}`);
      existantes.add(colonne.nom);
      ajoutees.add(colonne.nom);
    }
  }

  return ajoutees;
}

async function attribuerIdentifiantsPublics({ run, get, all }) {
  const utilisateurs = await all(`
    SELECT id, public_id
    FROM utilisateurs
    ORDER BY id ASC
  `);
  const dejaVus = new Set();

  for (const utilisateur of utilisateurs) {
    const publicId = String(utilisateur.public_id || "").trim();
    const clePublique = publicId.toLowerCase();

    if (publicId && !dejaVus.has(clePublique)) {
      dejaVus.add(clePublique);
      continue;
    }

    let candidat = "";

    do {
      candidat = identifiantPublicAleatoire();
    } while (
      dejaVus.has(candidat.toLowerCase()) ||
      (await get(
        "SELECT id FROM utilisateurs WHERE public_id = ? COLLATE NOCASE LIMIT 1",
        [candidat]
      ))
    );

    await run(
      "UPDATE utilisateurs SET public_id = ? WHERE id = ?",
      [candidat, utilisateur.id]
    );
    dejaVus.add(candidat.toLowerCase());
  }
}

async function assurerRole(run, utilisateurId, role, accordePar = null) {
  await run(
    `
      INSERT OR IGNORE INTO utilisateur_roles (utilisateur_id, role, accorde_par)
      VALUES (?, ?, ?)
    `,
    [utilisateurId, role, accordePar]
  );
}

async function assurerRattachementActif({ get, run }, { handlerId, professeurId, creePar }) {
  const rattachementActif = await get(
    `
      SELECT id, handler_id
      FROM rattachements_professeurs
      WHERE professeur_id = ? AND actif = 1
      ORDER BY id DESC
      LIMIT 1
    `,
    [professeurId]
  );

  // Une base qui aurait ete migree partiellement peut deja contenir un
  // rattachement vers un autre Handler. Ne jamais le reecrire silencieusement.
  if (rattachementActif) {
    return rattachementActif.handler_id === handlerId;
  }

  await run(
    `
      INSERT INTO rattachements_professeurs (
        handler_id,
        professeur_id,
        actif,
        cree_par
      )
      VALUES (?, ?, 1, ?)
    `,
    [handlerId, professeurId, creePar]
  );

  return true;
}

async function trouverHandlerLegacy(get) {
  // The migration is generic: it elects the former administrator (or, on a
  // very old installation without that flag, the first account) as the
  // initial Handler.  No account name or email participates in this choice.
  const compteMaitre = await get(
    `
      SELECT id
      FROM utilisateurs
      ORDER BY CASE WHEN COALESCE(est_admin, 0) = 1 THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `
  );

  return compteMaitre || null;
}

async function migrerDonneesLegacyVersHandler({ run }, handlerId) {
  await run(
    "UPDATE seances SET handler_id = ? WHERE handler_id IS NULL",
    [handlerId]
  );
  await run(
    "UPDATE indisponibilites SET handler_id = ? WHERE handler_id IS NULL",
    [handlerId]
  );
  await run(
    "UPDATE propositions_seances SET handler_id = ? WHERE handler_id IS NULL",
    [handlerId]
  );
  await run(
    "UPDATE public_reservation_devices SET handler_id = ? WHERE handler_id IS NULL",
    [handlerId]
  );
}

async function enregistrerSeancesAmbigues({ run }, handlerId) {
  // Les anciennes colonnes compte/utilisateur_id ne prouvent pas qui a donne la
  // seance. Elles ne sont donc jamais utilisees pour remplir intervenant_id.
  await run(
    `
      INSERT OR IGNORE INTO reconciliation_seances_legacy (
        seance_id,
        handler_id,
        raison
      )
      SELECT
        seances.id,
        COALESCE(seances.handler_id, ?),
        'intervenant_legacy_indetermine'
      FROM seances
      WHERE seances.intervenant_id IS NULL
    `,
    [handlerId]
  );
}

module.exports = {
  version: "2026090701_multi_handler_foundation",
  description: "Socle multi-role et multi-Handler non destructif",

  async up(context) {
    const { run, all } = context;

    const colonnesUtilisateursAjoutees = await ajouterColonnesSiNecessaire(context, "utilisateurs", [
      { nom: "public_id", definition: "public_id TEXT COLLATE NOCASE" },
      { nom: "statut_compte", definition: "statut_compte TEXT DEFAULT 'active'" },
      { nom: "timezone", definition: `timezone TEXT DEFAULT '${TIMEZONE_PAR_DEFAUT}'` },
      {
        nom: "couleur_calendrier",
        definition: `couleur_calendrier TEXT DEFAULT '${COULEUR_CALENDRIER_PAR_DEFAUT}'`,
      },
      { nom: "preferences_json", definition: "preferences_json TEXT DEFAULT '{}'" },
      {
        nom: "token_calendrier_public_hash",
        definition: "token_calendrier_public_hash TEXT",
      },
      {
        nom: "calendrier_public_actif",
        definition: "calendrier_public_actif INTEGER NOT NULL DEFAULT 0",
      },
    ]);

    await ajouterColonnesSiNecessaire(context, "seances", [
      { nom: "handler_id", definition: "handler_id INTEGER REFERENCES utilisateurs(id)" },
      {
        nom: "intervenant_id",
        definition: "intervenant_id INTEGER REFERENCES utilisateurs(id)",
      },
      {
        nom: "tarif_horaire_applique",
        definition: "tarif_horaire_applique INTEGER",
      },
    ]);

    await ajouterColonnesSiNecessaire(context, "indisponibilites", [
      { nom: "handler_id", definition: "handler_id INTEGER REFERENCES utilisateurs(id)" },
      {
        nom: "intervenant_id",
        definition: "intervenant_id INTEGER REFERENCES utilisateurs(id)",
      },
    ]);

    await ajouterColonnesSiNecessaire(context, "propositions_seances", [
      { nom: "handler_id", definition: "handler_id INTEGER REFERENCES utilisateurs(id)" },
      {
        nom: "intervenant_id",
        definition: "intervenant_id INTEGER REFERENCES utilisateurs(id)",
      },
    ]);

    await ajouterColonnesSiNecessaire(context, "public_reservation_devices", [
      { nom: "handler_id", definition: "handler_id INTEGER REFERENCES utilisateurs(id)" },
    ]);

    await run(`
      CREATE TABLE IF NOT EXISTS utilisateur_roles (
        utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('super_admin', 'handler', 'professeur')),
        accorde_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (utilisateur_id, role)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS rattachements_professeurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        professeur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
        debut_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fin_at TEXT,
        cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS reconciliation_seances_legacy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seance_id INTEGER NOT NULL UNIQUE REFERENCES seances(id) ON DELETE CASCADE,
        handler_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
        statut TEXT NOT NULL DEFAULT 'a_reconcilier'
          CHECK (statut IN ('a_reconcilier', 'resolue', 'ignoree')),
        raison TEXT NOT NULL DEFAULT 'intervenant_legacy_indetermine',
        intervenant_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        resolu_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        resolu_at TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS demandes_inscription (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT NOT NULL,
        role_demande TEXT NOT NULL,
        handler_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        statut TEXT NOT NULL DEFAULT 'pending'
          CHECK (statut IN ('pending', 'approved', 'rejected', 'activated')),
        utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        reviewed_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        refusal_reason TEXT,
        activated_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS tokens_compte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        demande_id INTEGER REFERENCES demandes_inscription(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('activation', 'reset_password')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const statutCompteVientDEtreAjoute = colonnesUtilisateursAjoutees.has("statut_compte");
    await run(`
      UPDATE utilisateurs
      SET statut_compte = CASE
        WHEN COALESCE(acces_active, 1) = 0 THEN 'suspendu'
        ELSE 'active'
      END
      WHERE ${
        statutCompteVientDEtreAjoute
          ? "1 = 1"
          : "statut_compte IS NULL OR trim(statut_compte) = ''"
      }
    `);
    await run(
      `
        UPDATE utilisateurs
        SET timezone = ?
        WHERE timezone IS NULL OR trim(timezone) = ''
      `,
      [TIMEZONE_PAR_DEFAUT]
    );
    await run(
      `
        UPDATE utilisateurs
        SET couleur_calendrier = ?
        WHERE couleur_calendrier IS NULL OR trim(couleur_calendrier) = ''
      `,
      [COULEUR_CALENDRIER_PAR_DEFAUT]
    );
    await run(`
      UPDATE utilisateurs
      SET preferences_json = '{}'
      WHERE preferences_json IS NULL OR trim(preferences_json) = ''
    `);
    await run(`
      UPDATE utilisateurs
      SET calendrier_public_actif = CASE
        WHEN COALESCE(calendrier_public_actif, 0) = 1
          AND COALESCE(trim(token_calendrier_public_hash), '') <> ''
        THEN 1
        ELSE 0
      END
    `);

    await attribuerIdentifiantsPublics(context);

    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_public_id_unique
      ON utilisateurs(public_id COLLATE NOCASE)
      WHERE public_id IS NOT NULL
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_statut_compte
      ON utilisateurs(statut_compte)
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_utilisateurs_generer_public_id
      AFTER INSERT ON utilisateurs
      FOR EACH ROW
      WHEN NEW.public_id IS NULL OR trim(NEW.public_id) = ''
      BEGIN
        UPDATE utilisateurs
        SET public_id = 'usr_' || lower(hex(randomblob(16)))
        WHERE id = NEW.id;
      END
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_utilisateur_roles_role
      ON utilisateur_roles(role, utilisateur_id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_rattachements_professeurs_handler_actif
      ON rattachements_professeurs(handler_id, actif, professeur_id)
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rattachements_professeurs_professeur_actif_unique
      ON rattachements_professeurs(professeur_id)
      WHERE actif = 1
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_reconciliation_seances_legacy_handler_statut
      ON reconciliation_seances_legacy(handler_id, statut, seance_id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_seances_handler_intervenant_date
      ON seances(handler_id, intervenant_id, date, heure_debut, heure_fin)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_indisponibilites_handler_intervenant_date
      ON indisponibilites(handler_id, intervenant_id, date, heure_debut, heure_fin)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_propositions_seances_handler_intervenant_statut
      ON propositions_seances(handler_id, intervenant_id, statut, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_public_reservation_devices_handler
      ON public_reservation_devices(handler_id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_demandes_inscription_statut_created
      ON demandes_inscription(statut, created_at, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_demandes_inscription_email
      ON demandes_inscription(email COLLATE NOCASE, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_demandes_inscription_handler_statut
      ON demandes_inscription(handler_id, statut, id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_tokens_compte_utilisateur_type
      ON tokens_compte(utilisateur_id, type, expires_at)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_tokens_compte_demande
      ON tokens_compte(demande_id)
    `);

    const handlerLegacy = await trouverHandlerLegacy(context.get);

    // A brand-new database may intentionally have no account until deployment
    // provisions its first SuperAdmin.  Schema migration must remain valid in
    // that state; there is simply no legacy data to attach yet.
    if (!handlerLegacy) {
      return;
    }

    await assurerRole(run, handlerLegacy.id, "super_admin", handlerLegacy.id);
    await assurerRole(run, handlerLegacy.id, "handler", handlerLegacy.id);
    await assurerRole(run, handlerLegacy.id, "professeur", handlerLegacy.id);
    await assurerRattachementActif(context, {
      handlerId: handlerLegacy.id,
      professeurId: handlerLegacy.id,
      creePar: handlerLegacy.id,
    });

    const utilisateursActifsLegacy = await all(`
      SELECT id
      FROM utilisateurs
      WHERE id <> ? AND statut_compte = 'active'
      ORDER BY id ASC
    `, [handlerLegacy.id]);

    for (const utilisateur of utilisateursActifsLegacy) {
      await assurerRole(run, utilisateur.id, "professeur", handlerLegacy.id);
      await assurerRattachementActif(context, {
        handlerId: handlerLegacy.id,
        professeurId: utilisateur.id,
        creePar: handlerLegacy.id,
      });
    }

    await migrerDonneesLegacyVersHandler(context, handlerLegacy.id);
    await enregistrerSeancesAmbigues(context, handlerLegacy.id);
  },

  ROLES,
  STATUTS_COMPTE,
};
