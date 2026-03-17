const { all, get, run } = require("./db");

const typesCatalogueAutorises = new Set(["matiere", "compte"]);

function normaliserTypeCatalogue(type) {
  const typeNormalise = String(type || "").trim().toLowerCase();
  return typesCatalogueAutorises.has(typeNormalise) ? typeNormalise : "";
}

function normaliserValeurCatalogue(valeur) {
  return String(valeur || "").trim();
}

async function listerValeursCatalogueParType(type) {
  const typeNormalise = normaliserTypeCatalogue(type);

  if (!typeNormalise) {
    return [];
  }

  return all(
    `
      SELECT id, type, valeur, created_at
      FROM catalogue_options
      WHERE type = ?
      ORDER BY lower(valeur) ASC, id ASC
    `,
    [typeNormalise]
  );
}

async function listerCatalogueOptions() {
  const [matieres, comptes] = await Promise.all([
    listerValeursCatalogueParType("matiere"),
    listerValeursCatalogueParType("compte"),
  ]);

  return {
    matieres,
    comptes,
  };
}

async function trouverValeurCatalogue(type, valeur) {
  const typeNormalise = normaliserTypeCatalogue(type);
  const valeurNormalisee = normaliserValeurCatalogue(valeur);

  if (!typeNormalise || !valeurNormalisee) {
    return null;
  }

  return get(
    `
      SELECT id, type, valeur, created_at
      FROM catalogue_options
      WHERE type = ? AND lower(valeur) = lower(?)
    `,
    [typeNormalise, valeurNormalisee]
  );
}

async function ajouterValeurCatalogue(type, valeur) {
  const typeNormalise = normaliserTypeCatalogue(type);
  const valeurNormalisee = normaliserValeurCatalogue(valeur);

  if (!typeNormalise || !valeurNormalisee) {
    throw new Error("Type ou valeur de catalogue invalide.");
  }

  const resultat = await run(
    `
      INSERT INTO catalogue_options (type, valeur)
      VALUES (?, ?)
    `,
    [typeNormalise, valeurNormalisee]
  );

  return get(
    `
      SELECT id, type, valeur, created_at
      FROM catalogue_options
      WHERE id = ?
    `,
    [resultat.id]
  );
}

module.exports = {
  listerValeursCatalogueParType,
  listerCatalogueOptions,
  trouverValeurCatalogue,
  ajouterValeurCatalogue,
};
