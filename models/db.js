const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const { recupererSecretAudit } = require("./audit-secret");
const { assurerDossiersScreenshots } = require("../utils/screenshot-storage");

const databaseDirectory = path.join(__dirname, "..", "database");
const databasePath = process.env.DATABASE_PATH || path.join(databaseDirectory, "database.db");
const activerDonneesExemple = process.env.SEED_DEMO_DATA === "true" && process.env.NODE_ENV !== "production";
const matieresParDefaut = ["Maths", "Physique chimie", "Python", "C++"];
const comptesParDefaut = ["Abdo", "Yassine", "Hossam"];
const tarifsComptesParDefaut = {
  abdo: 90,
  yassine: 130,
  hossam: 150,
};

function obtenirTarifHoraireCompteParDefaut(compte) {
  const cle = String(compte || "").trim().toLowerCase();
  return tarifsComptesParDefaut[cle] ?? 100;
}

function normaliserValeurCatalogueSupprimee(valeur) {
  return String(valeur || "").trim().toLowerCase();
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
assurerDossiersScreenshots();

const db = new sqlite3.Database(databasePath);

db.serialize(() => {
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
      } else {
        resolve({
          id: this.lastID,
          changes: this.changes,
        });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

function fermerBaseDeDonnees() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function ajouterJours(dateReference, nombreDeJours) {
  const nouvelleDate = new Date(dateReference);
  nouvelleDate.setDate(nouvelleDate.getDate() + nombreDeJours);
  return nouvelleDate;
}

function formaterDate(date) {
  return date.toISOString().split("T")[0];
}

function trierObjetRecursivement(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map(trierObjetRecursivement);
  }

  if (valeur && typeof valeur === "object") {
    return Object.keys(valeur)
      .sort()
      .reduce((objetTrie, cle) => {
        objetTrie[cle] = trierObjetRecursivement(valeur[cle]);
        return objetTrie;
      }, {});
  }

  return valeur;
}

function calculerHashHistorique(entree) {
  const chargeUtile = JSON.stringify(
    trierObjetRecursivement({
      action_label: entree.action_label,
      action_type: entree.action_type,
      acteur_id: entree.acteur_id,
      acteur_nom: entree.acteur_nom,
      created_at: entree.created_at,
      details_json: entree.details_json,
      previous_hash: entree.previous_hash,
      seance_id: entree.seance_id,
      seance_libelle: entree.seance_libelle,
    })
  );

  return crypto
    .createHmac("sha256", recupererSecretAudit())
    .update(chargeUtile)
    .digest("hex");
}

function construireListeCreationHistorique(seance) {
  return [
    { champ: "etudiant", label: "Etudiant", avant: "-", apres: seance.etudiant },
    { champ: "matiere", label: "Matiere", avant: "-", apres: seance.matiere },
    { champ: "compte", label: "Compte", avant: "-", apres: seance.compte || "Abdo" },
    {
      champ: "est_essai",
      label: "Seance d'essai",
      avant: "-",
      apres: Number(seance.est_essai) === 1 ? "Oui" : "Non",
    },
    { champ: "date", label: "Date", avant: "-", apres: seance.date },
    { champ: "heure_debut", label: "Heure de debut", avant: "-", apres: seance.heure_debut },
    { champ: "heure_fin", label: "Heure de fin", avant: "-", apres: seance.heure_fin },
    {
      champ: "statut_seance",
      label: "Statut",
      avant: "-",
      apres: seance.statut_seance,
    },
    {
      champ: "description",
      label: "Description",
      avant: "-",
      apres: seance.description || "Aucune description",
    },
  ];
}

async function ajouterColonneCompteSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonneCompteExiste = colonnes.some((colonne) => colonne.name === "compte");

  if (!colonneCompteExiste) {
    await run("ALTER TABLE seances ADD COLUMN compte TEXT");
  }

  await run(
    `
      UPDATE seances
      SET compte = COALESCE(NULLIF(compte, ''), 'Abdo')
    `
  );
}

async function ajouterColonneEssaiSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonneEssaiExiste = colonnes.some((colonne) => colonne.name === "est_essai");

  if (!colonneEssaiExiste) {
    await run("ALTER TABLE seances ADD COLUMN est_essai INTEGER");
  }

  await run(
    `
      UPDATE seances
      SET est_essai = COALESCE(est_essai, 0)
    `
  );
}

async function ajouterColonnesSecuriteUtilisateursSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(utilisateurs)");
  const colonnesExistantes = new Set(colonnes.map((colonne) => colonne.name));
  const migrations = [
    {
      nom: "est_admin",
      sql: "ALTER TABLE utilisateurs ADD COLUMN est_admin INTEGER DEFAULT 0",
    },
    {
      nom: "acces_active",
      sql: "ALTER TABLE utilisateurs ADD COLUMN acces_active INTEGER DEFAULT 1",
    },
    {
      nom: "mode_lecture_seule",
      sql: "ALTER TABLE utilisateurs ADD COLUMN mode_lecture_seule INTEGER DEFAULT 0",
    },
    {
      nom: "peut_voir_monetisation",
      sql: "ALTER TABLE utilisateurs ADD COLUMN peut_voir_monetisation INTEGER DEFAULT 0",
    },
    {
      nom: "peut_voir_aujourdhui",
      sql: "ALTER TABLE utilisateurs ADD COLUMN peut_voir_aujourdhui INTEGER DEFAULT 0",
    },
    {
      nom: "peut_voir_indisponibilites",
      sql: "ALTER TABLE utilisateurs ADD COLUMN peut_voir_indisponibilites INTEGER DEFAULT 0",
    },
    {
      nom: "session_version",
      sql: "ALTER TABLE utilisateurs ADD COLUMN session_version INTEGER DEFAULT 1",
    },
    {
      nom: "doit_changer_mot_de_passe",
      sql: "ALTER TABLE utilisateurs ADD COLUMN doit_changer_mot_de_passe INTEGER DEFAULT 0",
    },
    {
      nom: "mot_de_passe_change_at",
      sql: "ALTER TABLE utilisateurs ADD COLUMN mot_de_passe_change_at TEXT",
    },
    {
      nom: "echecs_connexion",
      sql: "ALTER TABLE utilisateurs ADD COLUMN echecs_connexion INTEGER DEFAULT 0",
    },
    {
      nom: "premier_echec_connexion_at",
      sql: "ALTER TABLE utilisateurs ADD COLUMN premier_echec_connexion_at TEXT",
    },
    {
      nom: "bloque_jusqua",
      sql: "ALTER TABLE utilisateurs ADD COLUMN bloque_jusqua TEXT",
    },
    {
      nom: "dernier_login_at",
      sql: "ALTER TABLE utilisateurs ADD COLUMN dernier_login_at TEXT",
    },
    {
      nom: "dernier_login_ip",
      sql: "ALTER TABLE utilisateurs ADD COLUMN dernier_login_ip TEXT",
    },
    {
      nom: "tarif_horaire",
      sql: "ALTER TABLE utilisateurs ADD COLUMN tarif_horaire INTEGER DEFAULT 100",
    },
    {
      nom: "created_at",
      sql: "ALTER TABLE utilisateurs ADD COLUMN created_at TEXT",
    },
  ];

  for (const migration of migrations) {
    if (!colonnesExistantes.has(migration.nom)) {
      await run(migration.sql);
    }
  }

  await run(`
    UPDATE utilisateurs
    SET
      est_admin = COALESCE(est_admin, 0),
      acces_active = COALESCE(acces_active, 1),
      mode_lecture_seule = COALESCE(mode_lecture_seule, 0),
      peut_voir_monetisation = COALESCE(peut_voir_monetisation, 0),
      peut_voir_aujourdhui = COALESCE(peut_voir_aujourdhui, 0),
      peut_voir_indisponibilites = COALESCE(peut_voir_indisponibilites, 0),
      session_version = COALESCE(session_version, 1),
      doit_changer_mot_de_passe = COALESCE(doit_changer_mot_de_passe, 0),
      echecs_connexion = COALESCE(echecs_connexion, 0),
      created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
  `);
}

async function normaliserRolesUtilisateurs() {
  await run(
    `
      UPDATE utilisateurs
      SET
        est_admin = CASE
          WHEN lower(email) = 'hossam@test.com' THEN 1
          ELSE 0
        END,
        mode_lecture_seule = COALESCE(mode_lecture_seule, 0),
        peut_voir_monetisation = CASE
          WHEN lower(email) = 'hossam@test.com' THEN 1
          ELSE COALESCE(peut_voir_monetisation, 0)
        END,
        peut_voir_aujourdhui = CASE
          WHEN lower(email) = 'hossam@test.com' THEN 1
          ELSE COALESCE(peut_voir_aujourdhui, 0)
        END,
        peut_voir_indisponibilites = CASE
          WHEN lower(email) = 'hossam@test.com' THEN 1
          ELSE COALESCE(peut_voir_indisponibilites, 0)
        END
    `
  );
}

async function ajouterColonneParentSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonneParentExiste = colonnes.some((colonne) => colonne.name === "parent");

  if (!colonneParentExiste) {
    await run("ALTER TABLE seances ADD COLUMN parent TEXT");
  }

  await run(`
    UPDATE seances
    SET parent = COALESCE(parent, '')
  `);
}

async function ajouterColonneUtilisateurIdSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonneExiste = colonnes.some((colonne) => colonne.name === "utilisateur_id");

  if (!colonneExiste) {
    await run("ALTER TABLE seances ADD COLUMN utilisateur_id INTEGER REFERENCES utilisateurs(id)");
  }
}

async function ajouterColonneJourCompletIndisponibilitesSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(indisponibilites)");
  const colonneJourCompletExiste = colonnes.some(
    (colonne) => colonne.name === "jour_complet"
  );

  if (!colonneJourCompletExiste) {
    await run("ALTER TABLE indisponibilites ADD COLUMN jour_complet INTEGER DEFAULT 0");
  }

  await run(`
    UPDATE indisponibilites
    SET jour_complet = COALESCE(jour_complet, 0)
  `);
}

async function ajouterColonnesSeancesSystemeSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonnesExistantes = new Set(colonnes.map((colonne) => colonne.name));
  const migrations = [
    {
      nom: "duree_minutes",
      sql: "ALTER TABLE seances ADD COLUMN duree_minutes INTEGER",
    },
    {
      nom: "created_at",
      sql: "ALTER TABLE seances ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
    {
      nom: "updated_at",
      sql: "ALTER TABLE seances ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
    {
      nom: "revision",
      sql: "ALTER TABLE seances ADD COLUMN revision INTEGER DEFAULT 1",
    },
    {
      nom: "deleted_at",
      sql: "ALTER TABLE seances ADD COLUMN deleted_at TEXT",
    },
    {
      nom: "deleted_by",
      sql: "ALTER TABLE seances ADD COLUMN deleted_by INTEGER REFERENCES utilisateurs(id)",
    },
  ];

  for (const migration of migrations) {
    if (!colonnesExistantes.has(migration.nom)) {
      await run(migration.sql);
    }
  }

  await run(`
    UPDATE seances
    SET
      duree_minutes = COALESCE(
        duree_minutes,
        CASE
          WHEN heure_debut IS NOT NULL
            AND heure_fin IS NOT NULL
            AND length(heure_debut) = 5
            AND length(heure_fin) = 5
          THEN
            (
              (CAST(substr(heure_fin, 1, 2) AS INTEGER) * 60 + CAST(substr(heure_fin, 4, 2) AS INTEGER))
              - (CAST(substr(heure_debut, 1, 2) AS INTEGER) * 60 + CAST(substr(heure_debut, 4, 2) AS INTEGER))
            )
          ELSE NULL
        END
      ),
      created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
      updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP),
      revision = COALESCE(revision, 1)
  `);
}

async function ajouterColonnesReservationPubliqueSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(seances)");
  const colonneExiste = colonnes.some(
    (colonne) => colonne.name === "public_reservation_device_id"
  );

  if (!colonneExiste) {
    await run(
      "ALTER TABLE seances ADD COLUMN public_reservation_device_id INTEGER REFERENCES public_reservation_devices(id)"
    );
  }
}

async function ajouterColonnesIndisponibilitesSystemeSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(indisponibilites)");
  const colonnesExistantes = new Set(colonnes.map((colonne) => colonne.name));
  const migrations = [
    {
      nom: "cree_par",
      sql: "ALTER TABLE indisponibilites ADD COLUMN cree_par INTEGER REFERENCES utilisateurs(id)",
    },
    {
      nom: "created_at",
      sql: "ALTER TABLE indisponibilites ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
    {
      nom: "updated_at",
      sql: "ALTER TABLE indisponibilites ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
  ];

  for (const migration of migrations) {
    if (!colonnesExistantes.has(migration.nom)) {
      await run(migration.sql);
    }
  }

  if (colonnesExistantes.has("utilisateur_id")) {
    await run(`
      UPDATE indisponibilites
      SET cree_par = COALESCE(cree_par, utilisateur_id)
    `);
  }

  await run(`
    UPDATE indisponibilites
    SET
      jour_complet = COALESCE(jour_complet, 0),
      created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
      updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
  `);
}

async function ajouterColonneCreatedAtCatalogueSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(catalogue_options)");
  const colonneCreatedAtExiste = colonnes.some((colonne) => colonne.name === "created_at");

  if (!colonneCreatedAtExiste) {
    await run("ALTER TABLE catalogue_options ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP");
  }

  await run(`
    UPDATE catalogue_options
    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
  `);
}

async function ajouterColonneTarifHoraireCatalogueSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(catalogue_options)");
  const colonneTarifExiste = colonnes.some((colonne) => colonne.name === "tarif_horaire");

  if (!colonneTarifExiste) {
    await run("ALTER TABLE catalogue_options ADD COLUMN tarif_horaire INTEGER");
  }

  await run(`
    UPDATE catalogue_options
    SET tarif_horaire = COALESCE(
      tarif_horaire,
      (
        SELECT utilisateurs.tarif_horaire
        FROM utilisateurs
        WHERE lower(trim(utilisateurs.nom)) = lower(trim(catalogue_options.valeur))
          AND utilisateurs.tarif_horaire IS NOT NULL
        ORDER BY utilisateurs.est_admin DESC, utilisateurs.id ASC
        LIMIT 1
      ),
      CASE
        WHEN type <> 'compte' THEN 0
        WHEN lower(trim(valeur)) = 'abdo' THEN 90
        WHEN lower(trim(valeur)) = 'yassine' THEN 130
        WHEN lower(trim(valeur)) = 'hossam' THEN 150
        ELSE 100
      END
    )
  `);
}

async function ajouterColonnesPushSubscriptionsSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(push_subscriptions)");
  const colonnesExistantes = new Set(colonnes.map((colonne) => colonne.name));

  if (colonnesExistantes.size === 0) {
    return;
  }

  const migrations = [
    {
      nom: "expiration_time",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN expiration_time TEXT",
    },
    {
      nom: "device_label",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN device_label TEXT DEFAULT ''",
    },
    {
      nom: "user_agent",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN user_agent TEXT DEFAULT ''",
    },
    {
      nom: "actif",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN actif INTEGER DEFAULT 1",
    },
    {
      nom: "updated_at",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
    {
      nom: "last_used_at",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN last_used_at TEXT DEFAULT CURRENT_TIMESTAMP",
    },
    {
      nom: "last_today_reminder_key",
      sql: "ALTER TABLE push_subscriptions ADD COLUMN last_today_reminder_key TEXT",
    },
  ];

  for (const migration of migrations) {
    if (!colonnesExistantes.has(migration.nom)) {
      await run(migration.sql);
    }
  }

  await run(`
    UPDATE push_subscriptions
    SET
      actif = COALESCE(actif, 1),
      updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
      last_used_at = COALESCE(last_used_at, updated_at, CURRENT_TIMESTAMP),
      device_label = COALESCE(device_label, ''),
      user_agent = COALESCE(user_agent, '')
  `);
}

async function ajouterColonnesJournalAuthSiNecessaire() {
  const colonnes = await all("PRAGMA table_info(journal_auth)");
  const colonnesExistantes = new Set(colonnes.map((colonne) => colonne.name));

  if (colonnesExistantes.size === 0) {
    return;
  }

  const migrations = [
    {
      nom: "identifiant",
      sql: "ALTER TABLE journal_auth ADD COLUMN identifiant TEXT DEFAULT ''",
    },
    {
      nom: "adresse_ip",
      sql: "ALTER TABLE journal_auth ADD COLUMN adresse_ip TEXT",
    },
    {
      nom: "details_json",
      sql: "ALTER TABLE journal_auth ADD COLUMN details_json TEXT",
    },
  ];

  for (const migration of migrations) {
    if (!colonnesExistantes.has(migration.nom)) {
      await run(migration.sql);
    }
  }

  const colonnesApresMigration = await all("PRAGMA table_info(journal_auth)");
  const colonnesApresMigrationExistantes = new Set(
    colonnesApresMigration.map((colonne) => colonne.name)
  );

  if (
    colonnesApresMigrationExistantes.has("ip_adresse") &&
    colonnesApresMigrationExistantes.has("adresse_ip")
  ) {
    await run(`
      UPDATE journal_auth
      SET adresse_ip = COALESCE(NULLIF(adresse_ip, ''), NULLIF(ip_adresse, ''))
    `);
  }

  await run(`
    UPDATE journal_auth
    SET identifiant = COALESCE(
      NULLIF(identifiant, ''),
      (
        SELECT COALESCE(utilisateurs.nom, utilisateurs.email, '')
        FROM utilisateurs
        WHERE utilisateurs.id = journal_auth.utilisateur_id
      ),
      ''
    )
  `);

  if (
    colonnesApresMigrationExistantes.has("details") &&
    colonnesApresMigrationExistantes.has("details_json")
  ) {
    const lignesLegacy = await all(`
      SELECT id, details, details_json
      FROM journal_auth
      WHERE COALESCE(details, '') <> ''
    `);

    for (const ligne of lignesLegacy) {
      if (ligne.details_json) {
        continue;
      }

      let detailsJson = null;

      try {
        JSON.parse(ligne.details);
        detailsJson = ligne.details;
      } catch (error) {
        detailsJson = JSON.stringify({
          legacy_details: ligne.details,
        });
      }

      await run(
        `
          UPDATE journal_auth
          SET details_json = ?
          WHERE id = ?
        `,
        [detailsJson, ligne.id]
      );
    }
  }
}

async function synchroniserHistoriqueActionsSiNecessaire() {
  const tables = await all(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name IN ('historique', 'historique_actions')
  `);
  const tablesExistantes = new Set(tables.map((table) => table.name));

  if (!tablesExistantes.has("historique_actions") || !tablesExistantes.has("historique")) {
    return;
  }

  const totalHistoriqueActions = await get(
    "SELECT COUNT(*) AS total FROM historique_actions"
  );

  if (Number(totalHistoriqueActions?.total || 0) > 0) {
    return;
  }

  const colonnesHistorique = await all("PRAGMA table_info(historique)");
  const colonnesHistoriqueExistantes = new Set(
    colonnesHistorique.map((colonne) => colonne.name)
  );
  const expressionActeurNom = colonnesHistoriqueExistantes.has("acteur_nom")
    ? "COALESCE(acteur_nom, 'Utilisateur inconnu')"
    : "'Utilisateur inconnu'";

  await run(`
    INSERT INTO historique_actions (
      seance_id,
      seance_libelle,
      action_type,
      action_label,
      acteur_id,
      acteur_nom,
      details_json,
      previous_hash,
      entry_hash,
      created_at
    )
    SELECT
      seance_id,
      COALESCE(seance_libelle, 'Seance inconnue'),
      action_type,
      action_label,
      acteur_id,
      ${expressionActeurNom},
      COALESCE(details_json, '{}'),
      COALESCE(previous_hash, ''),
      COALESCE(hash, ''),
      COALESCE(created_at, CURRENT_TIMESTAMP)
    FROM historique
    ORDER BY id ASC
  `);
}

async function marquerComptesTemporairesCommeASecuriser() {
  const utilisateurs = await all(`
    SELECT id, mot_de_passe, doit_changer_mot_de_passe, mot_de_passe_change_at
    FROM utilisateurs
    ORDER BY id ASC
  `);

  for (const utilisateur of utilisateurs) {
    const motDePasseTemporaire = await bcrypt.compare("123456", utilisateur.mot_de_passe);
    const doitChangerMotDePasse =
      motDePasseTemporaire || Number(utilisateur.doit_changer_mot_de_passe) === 1;

    if (doitChangerMotDePasse) {
      await run(
        `
          UPDATE utilisateurs
          SET doit_changer_mot_de_passe = 1
          WHERE id = ?
        `,
        [utilisateur.id]
      );
      continue;
    }

    if (!utilisateur.mot_de_passe_change_at) {
      await run(
        `
          UPDATE utilisateurs
          SET mot_de_passe_change_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [utilisateur.id]
      );
    }
  }
}

async function normaliserSeancesExistantes() {
  await run(
    `
      UPDATE seances
      SET
        matiere = CASE
          WHEN lower(matiere) LIKE '%math%' THEN 'Maths'
          WHEN lower(matiere) LIKE '%phys%' OR lower(matiere) LIKE '%chim%' THEN 'Physique chimie'
          WHEN lower(matiere) LIKE '%python%' THEN 'Python'
          WHEN lower(matiere) LIKE '%c++%' OR lower(matiere) LIKE '%cpp%' THEN 'C++'
          WHEN trim(COALESCE(matiere, '')) = '' THEN 'Maths'
          ELSE trim(matiere)
        END,
        compte = CASE
          WHEN lower(trim(COALESCE(compte, ''))) = 'yassine' THEN 'Yassine'
          WHEN lower(trim(COALESCE(compte, ''))) IN ('abdo', 'ami') THEN 'Abdo'
          WHEN trim(COALESCE(compte, '')) = '' THEN 'Abdo'
          ELSE trim(compte)
        END,
        parent = COALESCE(parent, ''),
        est_essai = CASE
          WHEN est_essai IN (0, 1) THEN est_essai
          ELSE 0
        END,
        prix = 0,
        statut_paiement = 'non_payee'
    `
  );

  await run(
    `
      UPDATE seances
      SET description = CASE description
        WHEN 'Révision des équations et exercices guidés.' THEN 'Revision des equations et exercices guides.'
        WHEN 'Revision des equations et exercices guides.' THEN 'Revision des equations et exercices guides.'
        WHEN 'Mécanique et résolution d''exercices.' THEN 'Mecanique et resolution d''exercices.'
        WHEN 'Mecanique et resolution d''exercices.' THEN 'Mecanique et resolution d''exercices.'
        WHEN 'Séance déplacée après changement d''horaire.' THEN 'Seance deplacee apres changement d''horaire.'
        WHEN 'Seance deplacee apres changement d''horaire.' THEN 'Seance deplacee apres changement d''horaire.'
        WHEN 'Séance annulée à la demande de l''étudiant.' THEN 'Seance annulee a la demande de l''etudiant.'
        WHEN 'Seance annulee a la demande de l''etudiant.' THEN 'Seance annulee a la demande de l''etudiant.'
        ELSE description
      END
    `
  );

  await run(
    `
      UPDATE seances
      SET titre = matiere || ' - ' || etudiant
    `
  );
}

async function initialiserCatalogueParDefaut() {
  for (const matiere of matieresParDefaut) {
    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur)
        VALUES ('matiere', ?)
      `,
      [matiere]
    );
  }

  for (const compte of comptesParDefaut) {
    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur, tarif_horaire)
        VALUES ('compte', ?, ?)
      `,
      [compte, obtenirTarifHoraireCompteParDefaut(compte)]
    );
  }
}

async function synchroniserCatalogueDepuisSeances() {
  const matieres = await all(`
    SELECT DISTINCT trim(matiere) AS valeur
    FROM seances
    WHERE trim(COALESCE(matiere, '')) <> ''
    ORDER BY trim(matiere) ASC
  `);

  const comptes = await all(`
    SELECT DISTINCT trim(compte) AS valeur
    FROM seances
    WHERE trim(COALESCE(compte, '')) <> ''
    ORDER BY trim(compte) ASC
  `);

  for (const matiere of matieres) {
    const suppression = await get(
      `
        SELECT 1
        FROM catalogue_options_supprimees
        WHERE type = 'matiere' AND valeur_normalisee = ?
        LIMIT 1
      `,
      [normaliserValeurCatalogueSupprimee(matiere.valeur)]
    );

    if (suppression) {
      continue;
    }

    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur)
        VALUES ('matiere', ?)
      `,
      [matiere.valeur]
    );
  }

  for (const compte of comptes) {
    const suppression = await get(
      `
        SELECT 1
        FROM catalogue_options_supprimees
        WHERE type = 'compte' AND valeur_normalisee = ?
        LIMIT 1
      `,
      [normaliserValeurCatalogueSupprimee(compte.valeur)]
    );

    if (suppression) {
      continue;
    }

    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur, tarif_horaire)
        VALUES ('compte', ?, ?)
      `,
      [compte.valeur, obtenirTarifHoraireCompteParDefaut(compte.valeur)]
    );
  }
}

async function initialiserUtilisateursInitiaux() {
  const resultat = await get("SELECT COUNT(*) AS total FROM utilisateurs");

  if (resultat.total > 0) {
    return;
  }

  const utilisateurs = [
    {
      nom: "Hossam",
      email: "hossam@test.com",
      motDePasse: "123456",
      estAdmin: 1,
    },
    {
      nom: "Abdo",
      email: "abdo@test.com",
      motDePasse: "123456",
      estAdmin: 0,
    },
  ];

  for (const utilisateur of utilisateurs) {
    const motDePasseHash = await bcrypt.hash(utilisateur.motDePasse, 10);

    await run(
      `
        INSERT INTO utilisateurs (
          nom,
          email,
          mot_de_passe,
          est_admin,
          acces_active,
          mode_lecture_seule,
          peut_voir_monetisation,
          peut_voir_aujourdhui,
          peut_voir_indisponibilites,
          session_version,
          doit_changer_mot_de_passe,
          mot_de_passe_change_at,
          echecs_connexion,
          tarif_horaire,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        utilisateur.nom,
        utilisateur.email,
        motDePasseHash,
        utilisateur.estAdmin,
        1,
        0,
        utilisateur.estAdmin ? 1 : 0,
        utilisateur.estAdmin ? 1 : 0,
        utilisateur.estAdmin ? 1 : 0,
        1,
        1,
        null,
        0,
        obtenirTarifHoraireCompteParDefaut(utilisateur.nom)
      ]
    );
  }
}

async function normaliserNomsUtilisateurs() {
  await run(`
    UPDATE utilisateurs
    SET nom = 'Abdo'
    WHERE lower(email) IN ('abdo@test.com', 'ami@test.com') OR nom = 'Ami'
  `);
}

async function normaliserEmailsUtilisateurs() {
  await run(`
    UPDATE utilisateurs
    SET email = 'abdo@test.com'
    WHERE lower(email) = 'ami@test.com'
      AND NOT EXISTS (
        SELECT 1
        FROM utilisateurs AS utilisateurs_existants
        WHERE lower(utilisateurs_existants.email) = 'abdo@test.com'
      )
  `);
}

async function initialiserSeancesExemple() {
  const resultat = await get("SELECT COUNT(*) AS total FROM seances");

  if (resultat.total > 0) {
    return;
  }

  const hossam = await get(
    "SELECT id FROM utilisateurs WHERE email = ?",
    ["hossam@test.com"]
  );
  const abdoUtilisateur = await get(
    "SELECT id FROM utilisateurs WHERE email = ?",
    ["abdo@test.com"]
  );

  if (!hossam || !abdoUtilisateur) {
    return;
  }

  const maintenant = new Date();
  const seances = [
    {
      etudiant: "Yassine",
      matiere: "Maths",
      compte: "Yassine",
      est_essai: 1,
      date: formaterDate(ajouterJours(maintenant, 1)),
      heure_debut: "18:00",
      heure_fin: "19:30",
      statut_seance: "planifiee",
      description: "Revision des equations et exercices guides.",
      cree_par: hossam.id,
      modifie_par: hossam.id,
    },
    {
      etudiant: "Abdo",
      matiere: "Physique chimie",
      compte: "Abdo",
      est_essai: 0,
      date: formaterDate(ajouterJours(maintenant, -2)),
      heure_debut: "17:00",
      heure_fin: "18:00",
      statut_seance: "faite",
      description: "Mecanique et resolution d'exercices.",
      cree_par: abdoUtilisateur.id,
      modifie_par: abdoUtilisateur.id,
    },
    {
      etudiant: "Lina",
      matiere: "Python",
      compte: "Yassine",
      est_essai: 0,
      date: formaterDate(ajouterJours(maintenant, 4)),
      heure_debut: "19:00",
      heure_fin: "20:00",
      statut_seance: "reportee",
      description: "Seance deplacee apres changement d'horaire.",
      cree_par: hossam.id,
      modifie_par: abdoUtilisateur.id,
    },
    {
      etudiant: "Adam",
      matiere: "C++",
      compte: "Abdo",
      est_essai: 0,
      date: formaterDate(ajouterJours(maintenant, 2)),
      heure_debut: "15:30",
      heure_fin: "16:30",
      statut_seance: "annulee",
      description: "Seance annulee a la demande de l'etudiant.",
      cree_par: abdoUtilisateur.id,
      modifie_par: hossam.id,
    },
  ];

  for (const seance of seances) {
    await run(
      `
        INSERT INTO seances (
          etudiant,
          matiere,
          compte,
          est_essai,
          date,
          heure_debut,
          heure_fin,
          statut_seance,
          description,
          cree_par,
          modifie_par,
          titre
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        seance.etudiant,
        seance.matiere,
        seance.compte,
        seance.est_essai,
        seance.date,
        seance.heure_debut,
        seance.heure_fin,
        seance.statut_seance,
        seance.description,
        seance.cree_par,
        seance.modifie_par,
        `${seance.matiere} - ${seance.etudiant}`,
      ]
    );
  }
}

async function initialiserBaseDeDonnees() {
  await run(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      mot_de_passe TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS seances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT,
      etudiant TEXT NOT NULL,
      parent TEXT DEFAULT '',
      matiere TEXT NOT NULL,
      compte TEXT DEFAULT 'Abdo',
      est_essai INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      duree_minutes INTEGER,
      statut_seance TEXT NOT NULL DEFAULT 'planifiee',
      prix REAL DEFAULT 0,
      statut_paiement TEXT DEFAULT 'non_payee',
      description TEXT,
      cree_par INTEGER REFERENCES utilisateurs(id),
      modifie_par INTEGER REFERENCES utilisateurs(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revision INTEGER DEFAULT 1,
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES utilisateurs(id),
      utilisateur_id INTEGER REFERENCES utilisateurs(id),
      public_reservation_device_id INTEGER REFERENCES public_reservation_devices(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS public_reservation_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_public TEXT NOT NULL UNIQUE,
      etudiant_nom TEXT NOT NULL DEFAULT '',
      parent_nom TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS indisponibilites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      heure_debut TEXT,
      heure_fin TEXT,
      jour_complet INTEGER DEFAULT 0,
      raison TEXT,
      cree_par INTEGER REFERENCES utilisateurs(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS historique (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER REFERENCES seances(id),
      acteur_id INTEGER REFERENCES utilisateurs(id),
      action_type TEXT NOT NULL,
      action_label TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      previous_hash TEXT,
      hash TEXT NOT NULL,
      seance_libelle TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS historique_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER REFERENCES seances(id),
      seance_libelle TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_label TEXT NOT NULL,
      acteur_id INTEGER REFERENCES utilisateurs(id),
      acteur_nom TEXT NOT NULL,
      details_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
      chemin_fichier TEXT NOT NULL,
      nom_fichier TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS catalogue_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      valeur TEXT NOT NULL,
      tarif_horaire INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(type, valeur)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS catalogue_options_supprimees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      valeur_normalisee TEXT NOT NULL,
      valeur TEXT NOT NULL,
      deleted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(type, valeur_normalisee)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS journal_auth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER REFERENCES utilisateurs(id),
      identifiant TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      resultat TEXT NOT NULL,
      adresse_ip TEXT,
      user_agent TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      ip TEXT PRIMARY KEY,
      raison TEXT,
      cree_par INTEGER REFERENCES utilisateurs(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      selector TEXT NOT NULL UNIQUE,
      validator_hash TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      device_label TEXT NOT NULL,
      user_agent TEXT,
      adresse_ip TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time TEXT,
      device_label TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_today_reminder_key TEXT
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_journal_auth_date ON journal_auth(created_at)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_historique_actions_date ON historique_actions(created_at)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_photos_seance_id ON photos(seance_id)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_options_supprimees_type_valeur
    ON catalogue_options_supprimees(type, valeur_normalisee)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_seances_date_heure ON seances(date, heure_debut, heure_fin)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_seances_compte_date ON seances(compte, date, heure_debut, heure_fin)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_indisponibilites_date_heure ON indisponibilites(date, heure_debut, heure_fin)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_public_reservation_devices_token ON public_reservation_devices(token_public)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(utilisateur_id)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_last_used ON trusted_devices(last_used_at)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(utilisateur_id)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(actif)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used ON push_subscriptions(last_used_at)
  `);

  await ajouterColonneCompteSiNecessaire();
  await ajouterColonneEssaiSiNecessaire();
  await ajouterColonnesSecuriteUtilisateursSiNecessaire();
  await normaliserRolesUtilisateurs();
  await ajouterColonneParentSiNecessaire();
  await ajouterColonneUtilisateurIdSiNecessaire();
  await ajouterColonnesSeancesSystemeSiNecessaire();
  await ajouterColonnesReservationPubliqueSiNecessaire();
  await ajouterColonneJourCompletIndisponibilitesSiNecessaire();
  await ajouterColonnesIndisponibilitesSystemeSiNecessaire();
  await ajouterColonneCreatedAtCatalogueSiNecessaire();
  await ajouterColonneTarifHoraireCatalogueSiNecessaire();
  await ajouterColonnesPushSubscriptionsSiNecessaire();
  await ajouterColonnesJournalAuthSiNecessaire();
  await synchroniserHistoriqueActionsSiNecessaire();
  await initialiserUtilisateursInitiaux();
  await normaliserEmailsUtilisateurs();
  await normaliserNomsUtilisateurs();
  await marquerComptesTemporairesCommeASecuriser();
  await initialiserCatalogueParDefaut();
  await synchroniserCatalogueDepuisSeances();

  if (activerDonneesExemple) {
    await initialiserSeancesExemple();
    await normaliserSeancesExistantes();
    await synchroniserCatalogueDepuisSeances();
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  fermerBaseDeDonnees,
  initialiserBaseDeDonnees,
  calculerHashHistorique,
  construireListeCreationHistorique,
};
