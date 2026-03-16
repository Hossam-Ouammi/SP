const path = require("path");

const {
  creerPhoto,
  recupererPhotosParSeance,
  trouverPhotoParId,
} = require("../models/photo.model");
const { trouverSeanceParId } = require("../models/seance.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const {
  resoudreCheminScreenshot,
  supprimerFichiersTeleverses,
  verifierSignatureImage,
} = require("../utils/screenshot-storage");

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
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

async function verifierFichiersTeleverses(req) {
  const fichiers = Array.isArray(req.files) ? req.files : [];

  for (const fichier of fichiers) {
    const signatureValide = await verifierSignatureImage(
      fichier.path,
      fichier.originalname
    );

    if (!signatureValide) {
      await supprimerFichiersTeleverses(fichiers);
      return false;
    }
  }

  return true;
}

async function televerserPhotos(req, res) {
  const { seanceId } = req.params;

  if (!estIdentifiantValide(seanceId)) {
    await supprimerFichiersTeleverses(req.files);
    return res.status(400).json({
      message: "Identifiant de séance invalide.",
    });
  }

  const seance = await trouverSeanceParId(seanceId);

  if (!seance) {
    await supprimerFichiersTeleverses(req.files);
    return res.status(404).json({
      message: "Impossible d'ajouter des screenshots à une séance inexistante.",
    });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      message: "Aucun screenshot n'a été envoyé.",
    });
  }

  const signatureValide = await verifierFichiersTeleverses(req);

  if (!signatureValide) {
    return res.status(400).json({
      message: "Un screenshot n'est pas une image valide ou son format est refusé.",
    });
  }

  const photosExistantes = await recupererPhotosParSeance(seanceId);

  if (photosExistantes.length + req.files.length > 8) {
    await supprimerFichiersTeleverses(req.files);
    return res.status(400).json({
      message: "Une séance ne peut pas contenir plus de 8 screenshots.",
    });
  }

  for (const fichier of req.files) {
    await creerPhoto({
      seanceId,
      cheminFichier: fichier.filename,
      nomFichier: fichier.originalname,
    });
  }

  const photos = await recupererPhotosParSeance(seanceId);

  await creerEntreeHistorique({
    seanceId: seance.id,
    seanceLibelle: `${seance.matiere} - ${seance.etudiant}`,
    actionType: "screenshots_ajoutes",
    actionLabel: "Ajout de screenshots",
    acteurId: req.utilisateur?.id,
    acteurNom: req.utilisateur?.nom,
    details: {
      type: "screenshots",
      captures_ajoutees: req.files.map((fichier) => ({
        nom_fichier: fichier.originalname,
        taille_octets: fichier.size,
      })),
      total_screenshots: photos.length,
    },
  });

  return res.status(201).json({
    message: "Screenshots ajoutés avec succès.",
    photos: photos.map(transformerPhotoPourClient),
  });
}

async function recupererPhotosDuneSeance(req, res) {
  const { seanceId } = req.params;

  if (!estIdentifiantValide(seanceId)) {
    return res.status(400).json({
      message: "Identifiant de séance invalide.",
    });
  }

  const seance = await trouverSeanceParId(seanceId);

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
      message: "Identifiant de screenshot invalide.",
    });
  }

  const photo = await trouverPhotoParId(photoId);

  if (!photo) {
    return res.status(404).json({
      message: "Screenshot introuvable.",
    });
  }

  const cheminPhoto = await resoudreCheminScreenshot(photo);

  if (!cheminPhoto) {
    return res.status(404).json({
      message: "Le fichier screenshot est introuvable sur le serveur.",
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
  televerserPhotos,
  recupererPhotosDuneSeance,
  recupererFichierPhoto,
};
