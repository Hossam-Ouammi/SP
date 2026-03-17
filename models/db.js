const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const { recupererSecretAudit } = require("./audit-secret");
const {
  assurerDossiersScreenshots,
  migrerScreenshotVersStockagePrive,
} = require("../utils/screenshot-storage");

const databaseDirectory = path.join(__dirname, "..", "database");
const databasePath = process.env.DATABASE_PATH || path.join(databaseDirectory, "database.db");
const activerDonneesExemple = process.env.SEED_DEMO_DATA === "true";
const matieresParDefaut = ["Maths", "Physique chimie", "Python", "C++"];
const comptesParDefaut = ["Abdo", "Yassine"];

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
assurerDossiersScreenshots();

const db = new sqlite3.Database(databasePath);

db.serialize(() => {
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
    { champ: "etudiant", label: "Étudiant", avant: "-", apres: seance.etudiant },
    { champ: "matiere", label: "Matière", avant: "-", apres: seance.matiere },
    { champ: "compte", label: "Compte", avant: "-", apres: seance.compte || "Abdo" },
    {
      champ: "est_essai",
      label: "Séance d'essai",
      avant: "-",
      apres: Number(seance.est_essai) === 1 ? "Oui" : "Non",
    },
    { champ: "date", label: "Date", avant: "-", apres: seance.date },
    { champ: "heure_debut", label: "Heure de début", avant: "-", apres: seance.heure_debut },
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
        WHEN 'Revision des equations et exercices guides.' THEN 'Révision des équations et exercices guidés.'
        WHEN 'Mecanique et resolution d''exercices.' THEN 'Mécanique et résolution d''exercices.'
        WHEN 'Seance deplacee apres changement d''horaire.' THEN 'Séance déplacée après changement d''horaire.'
        WHEN 'Seance annulee a la demande de l''etudiant.' THEN 'Séance annulée à la demande de l''étudiant.'
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
        INSERT OR IGNORE INTO catalogue_options (type, valeur)
        VALUES ('compte', ?)
      `,
      [compte]
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
    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur)
        VALUES ('matiere', ?)
      `,
      [matiere.valeur]
    );
  }

  for (const compte of comptes) {
    await run(
      `
        INSERT OR IGNORE INTO catalogue_options (type, valeur)
        VALUES ('compte', ?)
      `,
      [compte.valeur]
    );
  }
}

async function initialiserUtilisateursDeTest() {
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
      email: "ami@test.com",
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
          session_version,
          doit_changer_mot_de_passe,
          mot_de_passe_change_at,
          echecs_connexion
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        utilisateur.nom,
        utilisateur.email,
        motDePasseHash,
        utilisateur.estAdmin,
        1,
        0,
        utilisateur.estAdmin ? 1 : 0,
        1,
        1,
        null,
        0,
      ]
    );
  }
}

async function normaliserNomsUtilisateurs() {
  await run(`
    UPDATE utilisateurs
    SET nom = 'Abdo'
    WHERE email = 'ami@test.com' OR nom = 'Ami'
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
    ["ami@test.com"]
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
      description: "Révision des équations et exercices guidés.",
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
      description: "Mécanique et résolution d'exercices.",
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
      description: "Séance déplacée après changement d'horaire.",
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
      description: "Séance annulée à la demande de l'étudiant.",
      cree_par: abdoUtilisateur.id,
      modifie_par: hossam.id,
    },
  ];

  for (const seance of seances) {
    await run(
      `
        INSERT INTO seances (
          titre,
          etudiant,
          matiere,
          compte,
          est_essai,
          date,
          heure_debut,
          heure_fin,
          statut_seance,
          prix,
          statut_paiement,
          description,
          cree_par,
          modifie_par
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        `${seance.matiere} - ${seance.etudiant}`,
        seance.etudiant,
        seance.matiere,
        seance.compte,
        seance.est_essai,
        seance.date,
        seance.heure_debut,
        seance.heure_fin,
        seance.statut_seance,
        0,
        "non_payee",
        seance.description,
        seance.cree_par,
        seance.modifie_par,
      ]
    );
  }
}

async function initialiserHistoriqueExistant() {
  const resultat = await get("SELECT COUNT(*) AS total FROM historique_actions");

  if (resultat.total > 0) {
    return;
  }

  const seances = await all(
    `
      SELECT
        seances.*,
        createur.nom AS createur_nom
      FROM seances
      LEFT JOIN utilisateurs AS createur ON createur.id = seances.cree_par
      ORDER BY seances.id ASC
    `
  );

  let hashPrecedent = "";

  for (const seance of seances) {
    const entree = {
      seance_id: seance.id,
      seance_libelle: `${seance.matiere} - ${seance.etudiant}`,
      action_type: "initialisation",
      action_label: "Initialisation de la séance",
      acteur_id: seance.cree_par,
      acteur_nom: seance.createur_nom || "Utilisateur inconnu",
      details_json: JSON.stringify({
        type: "creation",
        changements: construireListeCreationHistorique(seance),
      }),
      previous_hash: hashPrecedent,
      created_at: seance.created_at || new Date().toISOString(),
    };
    const entryHash = calculerHashHistorique(entree);

    await run(
      `
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entree.seance_id,
        entree.seance_libelle,
        entree.action_type,
        entree.action_label,
        entree.acteur_id,
        entree.acteur_nom,
        entree.details_json,
        entree.previous_hash,
        entryHash,
        entree.created_at,
      ]
    );

    hashPrecedent = entryHash;
  }
}

async function migrerScreenshotsVersStockagePrive() {
  const photos = await all(`
    SELECT id, chemin_fichier
    FROM photos
    ORDER BY id ASC
  `);

  for (const photo of photos) {
    await migrerScreenshotVersStockagePrive(photo);
  }
}

async function initialiserBaseDeDonnees() {
  await run(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mot_de_passe TEXT NOT NULL,
      est_admin INTEGER DEFAULT 0,
      acces_active INTEGER DEFAULT 1,
      mode_lecture_seule INTEGER DEFAULT 0,
      peut_voir_monetisation INTEGER DEFAULT 0,
      session_version INTEGER DEFAULT 1,
      doit_changer_mot_de_passe INTEGER DEFAULT 0,
      mot_de_passe_change_at TEXT,
      echecs_connexion INTEGER DEFAULT 0,
      premier_echec_connexion_at TEXT,
      bloque_jusqua TEXT,
      dernier_login_at TEXT,
      dernier_login_ip TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_nom_unique
    ON utilisateurs (nom COLLATE NOCASE)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS seances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      etudiant TEXT NOT NULL,
      matiere TEXT NOT NULL,
      parent TEXT,
      compte TEXT,
      est_essai INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      statut_seance TEXT NOT NULL,
      prix REAL NOT NULL,
      statut_paiement TEXT NOT NULL,
      description TEXT,
      cree_par INTEGER NOT NULL,
      modifie_par INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cree_par) REFERENCES utilisateurs (id),
      FOREIGN KEY (modifie_par) REFERENCES utilisateurs (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER NOT NULL,
      chemin_fichier TEXT NOT NULL,
      nom_fichier TEXT NOT NULL,
      FOREIGN KEY (seance_id) REFERENCES seances (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS historique_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER,
      seance_libelle TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_label TEXT NOT NULL,
      acteur_id INTEGER,
      acteur_nom TEXT NOT NULL,
      details_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (acteur_id) REFERENCES utilisateurs (id)
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
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS catalogue_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      valeur TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogue_type_valeur_unique
    ON catalogue_options (type, valeur COLLATE NOCASE)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS journal_auth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER,
      identifiant TEXT NOT NULL,
      action_type TEXT NOT NULL,
      resultat TEXT NOT NULL,
      adresse_ip TEXT,
      user_agent TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs (id)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_journal_auth_created_at
    ON journal_auth (created_at DESC)
  `);

  await ajouterColonnesSecuriteUtilisateursSiNecessaire();
  await ajouterColonneCompteSiNecessaire();
  await ajouterColonneEssaiSiNecessaire();
  await ajouterColonneParentSiNecessaire();
  await initialiserCatalogueParDefaut();
  await normaliserSeancesExistantes();
  await synchroniserCatalogueDepuisSeances();
  await initialiserUtilisateursDeTest();
  await normaliserNomsUtilisateurs();
  await normaliserRolesUtilisateurs();
  await marquerComptesTemporairesCommeASecuriser();

  if (activerDonneesExemple) {
    await initialiserSeancesExemple();
    await initialiserHistoriqueExistant();
  }

  await migrerScreenshotsVersStockagePrive();
}

module.exports = {
  db,
  run,
  get,
  all,
  initialiserBaseDeDonnees,
  databasePath,
};
