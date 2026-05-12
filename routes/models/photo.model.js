const { all, get, run } = require("./db");

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

async function trouverPhotoParId(photoId) {
  return get(
    `
      SELECT id, seance_id, chemin_fichier, nom_fichier
      FROM photos
      WHERE id = ?
    `,
    [photoId]
  );
}

module.exports = {
  creerPhoto,
  recupererPhotosParSeance,
  trouverPhotoParId,
};
