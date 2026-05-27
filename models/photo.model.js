const { all, get } = require("./db");

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
  recupererPhotosParSeance,
  trouverPhotoParId,
};
