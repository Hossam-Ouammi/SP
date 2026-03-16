const express = require("express");
const multer = require("multer");
const path = require("path");

const {
  televerserPhotos,
  recupererPhotosDuneSeance,
  recupererFichierPhoto,
} = require("../controllers/photos.controller");
const {
  verifierAuthentification,
  verifierCompteSecurise,
} = require("../middleware/auth.middleware");
const {
  assurerDossiersScreenshots,
  storageUploadsDirectory,
  extensionImageAutorisee,
  mimeTypeImageAutorise,
} = require("../utils/screenshot-storage");

const router = express.Router();
assurerDossiersScreenshots();

const stockage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, storageUploadsDirectory);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const nomSansExtension = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const nomUnique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${nomSansExtension}${extension}`;
    callback(null, nomUnique);
  },
});

function filtrerImages(req, file, callback) {
  if (
    mimeTypeImageAutorise(file.mimetype) &&
    extensionImageAutorisee(file.originalname)
  ) {
    callback(null, true);
  } else {
    callback(new Error("Seuls les screenshots PNG, JPG, GIF ou WebP sont autorises."));
  }
}

const upload = multer({
  storage: stockage,
  fileFilter: filtrerImages,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.use(verifierAuthentification);
router.use(verifierCompteSecurise);

router.get("/:photoId/file", recupererFichierPhoto);
router.get("/seance/:seanceId", recupererPhotosDuneSeance);
router.post("/seance/:seanceId", upload.array("screenshots", 8), televerserPhotos);

module.exports = router;
