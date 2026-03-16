const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const storageUploadsDirectory = path.join(__dirname, "..", "storage", "uploads");
const legacyPublicUploadsDirectory = path.join(__dirname, "..", "public", "uploads");
const extensionsAutorisees = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const mimeTypesAutorises = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function assurerDossiersScreenshots() {
  fs.mkdirSync(storageUploadsDirectory, { recursive: true });
  fs.mkdirSync(legacyPublicUploadsDirectory, { recursive: true });
}

function extraireNomFichierScreenshot(photoOuChemin) {
  const chemin =
    typeof photoOuChemin === "string"
      ? photoOuChemin
      : String(photoOuChemin?.chemin_fichier || "");

  return path.basename(chemin.replace(/\\/g, "/"));
}

function extensionImageAutorisee(nomFichier) {
  return extensionsAutorisees.has(path.extname(String(nomFichier || "")).toLowerCase());
}

function mimeTypeImageAutorise(mimeType) {
  return mimeTypesAutorises.has(String(mimeType || "").toLowerCase());
}

function construireCheminPriveDepuisNom(nomFichier) {
  return path.join(storageUploadsDirectory, nomFichier);
}

function construireCheminPublicLegacyDepuisNom(nomFichier) {
  return path.join(legacyPublicUploadsDirectory, nomFichier);
}

async function fichierExiste(chemin) {
  try {
    await fsPromises.access(chemin);
    return true;
  } catch (error) {
    return false;
  }
}

async function deplacerFichier(source, destination) {
  try {
    await fsPromises.rename(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }

    await fsPromises.copyFile(source, destination);
    await fsPromises.unlink(source);
  }
}

async function migrerScreenshotVersStockagePrive(photo) {
  const nomFichier = extraireNomFichierScreenshot(photo);

  if (!nomFichier) {
    return null;
  }

  assurerDossiersScreenshots();

  const cheminPrive = construireCheminPriveDepuisNom(nomFichier);

  if (await fichierExiste(cheminPrive)) {
    return cheminPrive;
  }

  const cheminLegacy = construireCheminPublicLegacyDepuisNom(nomFichier);

  if (await fichierExiste(cheminLegacy)) {
    await deplacerFichier(cheminLegacy, cheminPrive);
    return cheminPrive;
  }

  return null;
}

async function resoudreCheminScreenshot(photo) {
  const nomFichier = extraireNomFichierScreenshot(photo);

  if (!nomFichier) {
    return null;
  }

  const cheminPrive = construireCheminPriveDepuisNom(nomFichier);

  if (await fichierExiste(cheminPrive)) {
    return cheminPrive;
  }

  const cheminLegacy = construireCheminPublicLegacyDepuisNom(nomFichier);

  if (await fichierExiste(cheminLegacy)) {
    return cheminLegacy;
  }

  return null;
}

async function supprimerFichiersTeleverses(fichiers = []) {
  await Promise.all(
    fichiers.map(async (fichier) => {
      const chemin =
        fichier?.path || construireCheminPriveDepuisNom(String(fichier?.filename || ""));

      if (!chemin) {
        return;
      }

      try {
        await fsPromises.unlink(chemin);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Suppression de screenshot temporaire impossible :", error);
        }
      }
    })
  );
}

async function verifierSignatureImage(cheminFichier, nomOriginal) {
  if (!extensionImageAutorisee(nomOriginal || cheminFichier)) {
    return false;
  }

  let descripteur;

  try {
    descripteur = await fsPromises.open(cheminFichier, "r");
    const tampon = Buffer.alloc(12);
    const { bytesRead } = await descripteur.read(tampon, 0, tampon.length, 0);
    const donnees = tampon.subarray(0, bytesRead);
    const extension = path.extname(String(nomOriginal || cheminFichier)).toLowerCase();

    const estPng =
      donnees.length >= 8 &&
      donnees[0] === 0x89 &&
      donnees[1] === 0x50 &&
      donnees[2] === 0x4e &&
      donnees[3] === 0x47 &&
      donnees[4] === 0x0d &&
      donnees[5] === 0x0a &&
      donnees[6] === 0x1a &&
      donnees[7] === 0x0a;
    const estJpeg =
      donnees.length >= 3 &&
      donnees[0] === 0xff &&
      donnees[1] === 0xd8 &&
      donnees[2] === 0xff;
    const enteteGif = donnees.subarray(0, 6).toString("ascii");
    const estGif = enteteGif === "GIF87a" || enteteGif === "GIF89a";
    const estWebp =
      donnees.length >= 12 &&
      donnees.subarray(0, 4).toString("ascii") === "RIFF" &&
      donnees.subarray(8, 12).toString("ascii") === "WEBP";

    if (extension === ".png") {
      return estPng;
    }

    if (extension === ".jpg" || extension === ".jpeg") {
      return estJpeg;
    }

    if (extension === ".gif") {
      return estGif;
    }

    if (extension === ".webp") {
      return estWebp;
    }

    return false;
  } finally {
    await descripteur?.close().catch(() => {});
  }
}

module.exports = {
  assurerDossiersScreenshots,
  storageUploadsDirectory,
  extensionImageAutorisee,
  mimeTypeImageAutorise,
  extraireNomFichierScreenshot,
  construireCheminPriveDepuisNom,
  migrerScreenshotVersStockagePrive,
  resoudreCheminScreenshot,
  supprimerFichiersTeleverses,
  verifierSignatureImage,
};
