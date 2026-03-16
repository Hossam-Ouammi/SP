const express = require("express");
const multer = require("multer");
const path = require("path");

const {
  televerserPhotos,
  recupererPhotosDuneSeance,
} = require("../controllers/photos.controller");
const { verifierAuthentification } = require("../middleware/auth.middleware");

const router = express.Router();

const stockage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, path.join(__dirname, "..", "public", "uploads"));
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname);
    const nomSansExtension = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const nomUnique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${nomSansExtension}${extension}`;
    callback(null, nomUnique);
  },
});

function filtrerImages(req, file, callback) {
  if (file.mimetype.startsWith("image/")) {
    callback(null, true);
  } else {
    callback(new Error("Seuls les fichiers image sont autorises."));
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

router.get("/seance/:seanceId", recupererPhotosDuneSeance);
router.post("/seance/:seanceId", upload.array("screenshots", 8), televerserPhotos);

module.exports = router;
