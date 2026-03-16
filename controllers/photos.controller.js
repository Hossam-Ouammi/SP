const { creerPhoto, recupererPhotosParSeance } = require("../models/photo.model");
const { trouverSeanceParId } = require("../models/seance.model");
const { creerEntreeHistorique } = require("../models/historique.model");

async function televerserPhotos(req, res) {
  const { seanceId } = req.params;
  const seance = await trouverSeanceParId(seanceId);

  if (!seance) {
    return res.status(404).json({
      message: "Impossible d'ajouter des screenshots à une séance inexistante.",
    });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      message: "Aucun screenshot n'a été envoyé.",
    });
  }

  for (const fichier of req.files) {
    await creerPhoto({
      seanceId,
      cheminFichier: `/uploads/${fichier.filename}`,
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
    photos,
  });
}

async function recupererPhotosDuneSeance(req, res) {
  const { seanceId } = req.params;
  const seance = await trouverSeanceParId(seanceId);

  if (!seance) {
    return res.status(404).json({
      message: "Séance introuvable.",
    });
  }

  const photos = await recupererPhotosParSeance(seanceId);

  return res.json({ photos });
}

module.exports = {
  televerserPhotos,
  recupererPhotosDuneSeance,
};
