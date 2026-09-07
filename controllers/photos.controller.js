const path = require("path");

const {
  recupererPhotosParSeance,
  trouverPhotoParId,
} = require("../models/photo.model");
const { trouverSeanceParIdScopee } = require("../models/seance.model");
const { construireFiltreLectureSeances } = require("../models/access-scope.model");
const { resoudreCheminScreenshot } = require("../utils/screenshot-storage");

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function construireScopeLecturePhotos(req) {
  return construireFiltreLectureSeances(req.scope);
}

function transformerPhotoPourClient(photo) {
  return {
    id: photo.id,
    seance_id: photo.seance_id,
    nom_fichier: photo.nom_fichier,
    url: `/api/photos/${photo.id}/file`,
    download_url: `/api/photos/${photo.id}/file?download=1`,
  };
}

function construireNomTelechargement(photo) {
  const nomParDefaut = `screenshot-${photo.id || "seance"}.bin`;
  return path
    .basename(String(photo.nom_fichier || nomParDefaut))
    .replace(/[\r\n"]/g, "-");
}

async function recupererPhotosDuneSeance(req, res) {
  const { seanceId } = req.params;

  if (!estIdentifiantValide(seanceId)) {
    return res.status(400).json({
      message: "Identifiant de séance invalide.",
    });
  }

  const seance = await trouverSeanceParIdScopee(
    seanceId,
    construireScopeLecturePhotos(req)
  );

  if (!seance) {
    return res.status(404).json({
      message: "Séance introuvable.",
    });
  }

  const photos = await recupererPhotosParSeance(seanceId);

  return res.json({ photos: photos.map(transformerPhotoPourClient) });
}

async function recupererFichierPhoto(req, res) {
  const { photoId } = req.params;

  if (!estIdentifiantValide(photoId)) {
    return res.status(400).json({
      message: "Identifiant de capture d’écran invalide.",
    });
  }

  const photo = await trouverPhotoParId(photoId);

  if (!photo) {
    return res.status(404).json({
      message: "Capture d’écran introuvable.",
    });
  }

  const seance = await trouverSeanceParIdScopee(
    photo.seance_id,
    construireScopeLecturePhotos(req)
  );

  if (!seance) {
    return res.status(404).json({
      message: "Séance introuvable.",
    });
  }

  const cheminPhoto = await resoudreCheminScreenshot(photo);

  if (!cheminPhoto) {
    return res.status(404).json({
      message: "Le fichier de capture d’écran est introuvable sur le serveur.",
    });
  }

  const telechargementForce = String(req.query.download || "") === "1";
  const nomTelechargement = construireNomTelechargement(photo);
  const nomEncode = encodeURIComponent(nomTelechargement);

  res.setHeader(
    "Content-Disposition",
    `${telechargementForce ? "attachment" : "inline"}; filename="${nomTelechargement}"; filename*=UTF-8''${nomEncode}`
  );
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  return res.sendFile(cheminPhoto);
}

module.exports = {
  recupererPhotosDuneSeance,
  recupererFichierPhoto,
};
