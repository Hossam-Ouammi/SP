const { all, run } = require("./db");

async function creerPhoto({ seanceId, cheminFichier, nomFichier }) {
  return run(
    `
      INSERT INTO photos (seance_id, chemin_fichier, nom_fichier)
      VALUES (?, ?, ?)
    `,
    [seanceId, cheminFichier, nomFichier]
  );
}

async function recupererPhotosParSeance(seanceId) {
  return all(
    `
      SELECT id, seance_id, chemin_fichier, nom_fichier
      FROM photos
      WHERE seance_id = ?
      ORDER BY id DESC
    `,
    [seanceId]
  );
}

module.exports = {
  creerPhoto,
  recupererPhotosParSeance,
};
