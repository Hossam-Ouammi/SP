const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const storageUploadsDirectory = path.join(__dirname, "..", "storage", "uploads");
const legacyPublicUploadsDirectory = path.join(__dirname, "..", "public", "uploads");

function assurerDossiersScreenshots() {
  fs.mkdirSync(storageUploadsDirectory, { recursive: true, mode: 0o700 });
}

function extraireNomFichierScreenshot(photoOuChemin) {
  const chemin =
    typeof photoOuChemin === "string"
      ? photoOuChemin
      : String(photoOuChemin?.chemin_fichier || "");

  return path.basename(chemin.replace(/\\/g, "/"));
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

  return migrerScreenshotVersStockagePrive(photo);
}

module.exports = {
  assurerDossiersScreenshots,
  storageUploadsDirectory,
  extraireNomFichierScreenshot,
  construireCheminPriveDepuisNom,
  migrerScreenshotVersStockagePrive,
  resoudreCheminScreenshot,
};
