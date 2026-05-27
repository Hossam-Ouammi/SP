const { all, get, run } = require("./db");

const typesCatalogueAutorises = new Set(["matiere", "compte"]);
const tarifsHorairesParDefautComptes = {
  abdo: 90,
  yassine: 130,
  hossam: 150,
};

function normaliserTypeCatalogue(type) {
  const typeNormalise = String(type || "").trim().toLowerCase();
  return typesCatalogueAutorises.has(typeNormalise) ? typeNormalise : "";
}

function normaliserValeurCatalogue(valeur) {
  return String(valeur || "").trim();
}

function normaliserValeurCataloguePourSuppression(valeur) {
  return normaliserValeurCatalogue(valeur).toLowerCase();
}

function obtenirTarifHoraireCatalogueParDefaut(type, valeur) {
  if (type !== "compte") {
    return 0;
  }

  return (
    tarifsHorairesParDefautComptes[normaliserValeurCatalogue(valeur).toLowerCase()] || 100
  );
}

async function listerValeursCatalogueParType(type) {
  const typeNormalise = normaliserTypeCatalogue(type);

  if (!typeNormalise) {
    return [];
  }

  return all(
    `
      SELECT id, type, valeur, tarif_horaire, created_at
      FROM catalogue_options
      WHERE type = ?
      ORDER BY lower(valeur) ASC, id ASC
    `,
    [typeNormalise]
  );
}

async function listerCatalogueOptions() {
  const [matieres, comptes, matieresSupprimees, comptesSupprimes] = await Promise.all([
    listerValeursCatalogueParType("matiere"),
    listerValeursCatalogueParType("compte"),
    listerValeursCatalogueSupprimeesParType("matiere"),
    listerValeursCatalogueSupprimeesParType("compte"),
  ]);

  return {
    matieres,
    comptes,
    matieres_supprimees: matieresSupprimees,
    comptes_supprimes: comptesSupprimes,
  };
}

async function listerValeursCatalogueSupprimeesParType(type) {
  const typeNormalise = normaliserTypeCatalogue(type);

  if (!typeNormalise) {
    return [];
  }

  return all(
    `
      SELECT id, type, valeur, valeur_normalisee, deleted_at
      FROM catalogue_options_supprimees
      WHERE type = ?
      ORDER BY deleted_at DESC, lower(valeur) ASC, id DESC
    `,
    [typeNormalise]
  );
}

async function trouverValeurCatalogueSupprimeeParId(id) {
  return get(
    `
      SELECT id, type, valeur, valeur_normalisee, deleted_at
      FROM catalogue_options_supprimees
      WHERE id = ?
    `,
    [id]
  );
}

async function trouverValeurCatalogue(type, valeur) {
  const typeNormalise = normaliserTypeCatalogue(type);
  const valeurNormalisee = normaliserValeurCatalogue(valeur);

  if (!typeNormalise || !valeurNormalisee) {
    return null;
  }

  return get(
    `
      SELECT id, type, valeur, tarif_horaire, created_at
      FROM catalogue_options
      WHERE type = ? AND lower(valeur) = lower(?)
    `,
    [typeNormalise, valeurNormalisee]
  );
}

async function trouverValeurCatalogueParId(id) {
  return get(
    `
      SELECT id, type, valeur, tarif_horaire, created_at
      FROM catalogue_options
      WHERE id = ?
    `,
    [id]
  );
}

async function ajouterValeurCatalogue(type, valeur) {
  const typeNormalise = normaliserTypeCatalogue(type);
  const valeurNormalisee = normaliserValeurCatalogue(valeur);
  const valeurSuppression = normaliserValeurCataloguePourSuppression(valeurNormalisee);
  const tarifHoraire = obtenirTarifHoraireCatalogueParDefaut(
    typeNormalise,
    valeurNormalisee
  );

  if (!typeNormalise || !valeurNormalisee) {
    throw new Error("Type ou valeur de catalogue invalide.");
  }

  await run("BEGIN IMMEDIATE TRANSACTION");

  let resultat;

  try {
    await run(
      `
        DELETE FROM catalogue_options_supprimees
        WHERE type = ? AND valeur_normalisee = ?
      `,
      [typeNormalise, valeurSuppression]
    );
    resultat = await run(
      `
        INSERT INTO catalogue_options (type, valeur, tarif_horaire)
        VALUES (?, ?, ?)
      `,
      [typeNormalise, valeurNormalisee, tarifHoraire]
    );
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }

  return get(
    `
      SELECT id, type, valeur, tarif_horaire, created_at
      FROM catalogue_options
      WHERE id = ?
    `,
    [resultat.id]
  );
}

async function mettreAJourTarifHoraireCompteCatalogue(id, tarifHoraire) {
  return run(
    `
      UPDATE catalogue_options
      SET tarif_horaire = ?
      WHERE id = ? AND type = 'compte'
    `,
    [Number(tarifHoraire), id]
  );
}

async function compterUtilisationValeurCatalogue(type, valeur) {
  const typeNormalise = normaliserTypeCatalogue(type);
  const valeurNormalisee = normaliserValeurCatalogue(valeur);

  if (!typeNormalise || !valeurNormalisee) {
    return 0;
  }

  const colonne = typeNormalise === "matiere" ? "matiere" : "compte";
  const resultat = await get(
    `
      SELECT COUNT(*) AS total
      FROM seances
      WHERE lower(trim(COALESCE(${colonne}, ''))) = lower(?)
    `,
    [valeurNormalisee]
  );

  return Number(resultat?.total || 0);
}

async function supprimerValeurCatalogueParId(id) {
  const elementCatalogue = await trouverValeurCatalogueParId(id);

  if (!elementCatalogue) {
    return { changes: 0 };
  }

  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    await run(
      `
        INSERT INTO catalogue_options_supprimees (
          type,
          valeur_normalisee,
          valeur,
          deleted_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(type, valeur_normalisee) DO UPDATE SET
          valeur = excluded.valeur,
          deleted_at = CURRENT_TIMESTAMP
      `,
      [
        elementCatalogue.type,
        normaliserValeurCataloguePourSuppression(elementCatalogue.valeur),
        elementCatalogue.valeur,
      ]
    );
    const resultat = await run(
      `
        DELETE FROM catalogue_options
        WHERE id = ?
      `,
      [id]
    );
    await run("COMMIT");
    return resultat;
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
}

module.exports = {
  listerValeursCatalogueParType,
  listerCatalogueOptions,
  trouverValeurCatalogue,
  trouverValeurCatalogueParId,
  listerValeursCatalogueSupprimeesParType,
  trouverValeurCatalogueSupprimeeParId,
  ajouterValeurCatalogue,
  mettreAJourTarifHoraireCompteCatalogue,
  compterUtilisationValeurCatalogue,
  supprimerValeurCatalogueParId,
};
