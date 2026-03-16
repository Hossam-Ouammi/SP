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
const databasePath = path.join(databaseDirectory, "database.db");

fs.mkdirSync(databaseDirectory, { recursive: true });
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
          ELSE 'Maths'
        END,
        compte = CASE
          WHEN compte IN ('Yassine', 'Abdo') THEN compte
          ELSE 'Abdo'
        END,
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
    },
    {
      nom: "Abdo",
      email: "ami@test.com",
      motDePasse: "123456",
    },
  ];

  for (const utilisateur of utilisateurs) {
    const motDePasseHash = await bcrypt.hash(utilisateur.motDePasse, 10);

    await run(
      `
        INSERT INTO utilisateurs (nom, email, mot_de_passe)
        VALUES (?, ?, ?)
      `,
      [utilisateur.nom, utilisateur.email, motDePasseHash]
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
      mot_de_passe TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS seances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      etudiant TEXT NOT NULL,
      matiere TEXT NOT NULL,
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

  await ajouterColonneCompteSiNecessaire();
  await ajouterColonneEssaiSiNecessaire();
  await normaliserSeancesExistantes();
  await initialiserUtilisateursDeTest();
  await normaliserNomsUtilisateurs();
  await initialiserSeancesExemple();
  await initialiserHistoriqueExistant();
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
