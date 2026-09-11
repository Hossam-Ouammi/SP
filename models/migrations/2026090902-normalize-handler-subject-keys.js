function normaliserCleMatiere(valeur) {
  return String(valeur || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function choisirMatiereCanonique(matieres, cleNormalisee, tarifsParMatiere) {
  return [...matieres].sort((premiere, seconde) => {
    // Prefer the single subject that carries the existing rate history.  It
    // avoids rewriting a historical tariff row (and its active attachment
    // guard) merely to normalize a display-key collision.
    const premiereAvecTarif = (tarifsParMatiere.get(Number(premiere.id)) || 0) > 0 ? 1 : 0;
    const secondeAvecTarif = (tarifsParMatiere.get(Number(seconde.id)) || 0) > 0 ? 1 : 0;
    if (premiereAvecTarif !== secondeAvecTarif) {
      return secondeAvecTarif - premiereAvecTarif;
    }

    const premiereActive = Number(premiere.actif) === 1 ? 1 : 0;
    const secondeActive = Number(seconde.actif) === 1 ? 1 : 0;
    if (premiereActive !== secondeActive) {
      return secondeActive - premiereActive;
    }

    const premiereDejaNormalisee =
      String(premiere.libelle_normalise || "") === cleNormalisee ? 1 : 0;
    const secondeDejaNormalisee =
      String(seconde.libelle_normalise || "") === cleNormalisee ? 1 : 0;
    if (premiereDejaNormalisee !== secondeDejaNormalisee) {
      return secondeDejaNormalisee - premiereDejaNormalisee;
    }

    return Number(premiere.id) - Number(seconde.id);
  })[0];
}

function creerErreurCollisionNormalisation(collisions) {
  const resume = collisions
    .map(
      ({ handlerId, cleNormalisee, matieres }) =>
        `handler ${handlerId}, matiere « ${cleNormalisee} » (ids ${matieres
          .map((matiere) => matiere.id)
          .join(", ")})`
    )
    .join("; ");
  const erreur = new Error(
    `Collision de normalisation des matieres avec historiques tarifaires concurrents : ${resume}. ` +
      "Aucune donnee n'a ete modifiee ; reconciliez ces tarifs avant de relancer la migration."
  );
  erreur.code = "HANDLER_SUBJECT_NORMALIZATION_COLLISION";
  erreur.collisions = collisions;
  return erreur;
}

async function chargerMatieresEtTarifs(all) {
  const [matieres, tarifs] = await Promise.all([
    all(`
      SELECT id, handler_id, libelle, libelle_normalise, actif
      FROM matieres_handler
      ORDER BY handler_id ASC, id ASC
    `),
    all(`
      SELECT id, matiere_id
      FROM tarifs_realisateur_matiere
      ORDER BY id ASC
    `),
  ]);

  const tarifsParMatiere = new Map();
  for (const tarif of tarifs) {
    const matiereId = Number(tarif.matiere_id);
    tarifsParMatiere.set(matiereId, (tarifsParMatiere.get(matiereId) || 0) + 1);
  }

  return { matieres, tarifsParMatiere };
}

/**
 * SQLite's built-in lower() only folds ASCII.  2026090901 used it while the
 * application uses Unicode/NFKC French lower-casing, which made a migrated
 * label such as "Économie" impossible to resolve.  This repair is separate
 * and append-only so databases where 0901 has already run are corrected too.
 */
module.exports = {
  version: "2026090902_normalize_handler_subject_keys",
  description:
    "Normalisation Unicode des cles de matieres Handler et detection des collisions tarifaires",

  async up({ run, all }) {
    const { matieres, tarifsParMatiere } = await chargerMatieresEtTarifs(all);
    const groupes = new Map();

    for (const matiere of matieres) {
      const cleNormalisee = normaliserCleMatiere(matiere.libelle);
      // 0901 never created empty labels.  Do not invent a shared key for a
      // row injected outside the application; leaving it untouched is safer
      // than merging unrelated invalid data.
      if (!cleNormalisee) {
        continue;
      }

      const cleGroupe = `${Number(matiere.handler_id)}:${cleNormalisee}`;
      const groupe = groupes.get(cleGroupe) || {
        handlerId: Number(matiere.handler_id),
        cleNormalisee,
        matieres: [],
      };
      groupe.matieres.push(matiere);
      groupes.set(cleGroupe, groupe);
    }

    const collisions = Array.from(groupes.values()).filter(
      (groupe) => groupe.matieres.length > 1
    );
    const collisionsAvecTarifsConcurrents = collisions.filter((groupe) => {
      const matieresAvecTarif = groupe.matieres.filter(
        (matiere) => (tarifsParMatiere.get(Number(matiere.id)) || 0) > 0
      );
      return matieresAvecTarif.length > 1;
    });

    // Merging two independently-versioned rate histories can create an
    // ambiguous interval.  Failing the enclosing migration transaction is
    // deliberately safer than silently choosing one rate or losing history.
    if (collisionsAvecTarifsConcurrents.length > 0) {
      throw creerErreurCollisionNormalisation(collisionsAvecTarifsConcurrents);
    }

    for (const groupe of groupes.values()) {
      const canonique = choisirMatiereCanonique(
        groupe.matieres,
        groupe.cleNormalisee,
        tarifsParMatiere
      );

      for (const matiere of groupe.matieres) {
        if (Number(matiere.id) === Number(canonique.id)) {
          continue;
        }

        // At most one member of this group can have rate rows here (the
        // conflicting case above aborts), and it was selected as canonical.
        // Every duplicate is therefore unreferenced and can be deleted
        // without rewriting historical tariff rows or bypassing their scope
        // trigger.
        await run("DELETE FROM matieres_handler WHERE id = ?", [matiere.id]);
      }

      if (String(canonique.libelle_normalise || "") !== groupe.cleNormalisee) {
        await run(
          "UPDATE matieres_handler SET libelle_normalise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [groupe.cleNormalisee, canonique.id]
        );
      }
    }
  },
};
