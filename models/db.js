const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const databaseDirectory = path.join(__dirname, "..", "database");
const databasePath = path.join(databaseDirectory, "database.db");

fs.mkdirSync(databaseDirectory, { recursive: true });

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
      nom: "Ami",
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

async function initialiserSeancesExemple() {
  const resultat = await get("SELECT COUNT(*) AS total FROM seances");

  if (resultat.total > 0) {
    return;
  }

  const hossam = await get(
    "SELECT id FROM utilisateurs WHERE email = ?",
    ["hossam@test.com"]
  );
  const ami = await get("SELECT id FROM utilisateurs WHERE email = ?", ["ami@test.com"]);

  if (!hossam || !ami) {
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
      cree_par: ami.id,
      modifie_par: ami.id,
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
      modifie_par: ami.id,
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
      cree_par: ami.id,
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

  await ajouterColonneCompteSiNecessaire();
  await ajouterColonneEssaiSiNecessaire();
  await normaliserSeancesExistantes();
  await initialiserUtilisateursDeTest();
  await initialiserSeancesExemple();
}

module.exports = {
  db,
  run,
  get,
  all,
  initialiserBaseDeDonnees,
  databasePath,
};
