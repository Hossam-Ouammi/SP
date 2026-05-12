const crypto = require("crypto");

const { all, get, run } = require("./db");
const { recupererSecretAudit } = require("./audit-secret");

const secretHistorique = recupererSecretAudit();

function trierObjetRecursivement(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map(trierObjetRecursivement);
  }

  if (valeur && typeof valeur === "object") {
    return Object.keys(valeur)
      .sort()
      .reduce((objetTrie, cle) => {
        objetTrie[cle] = trierObjetRecursivement(valeur[cle]);
        return objetTrie;
      }, {});
  }

  return valeur;
}

function serialiserDetails(details) {
  return JSON.stringify(trierObjetRecursivement(details || {}));
}

function calculerHashEntree(entree) {
  const chargeUtile = JSON.stringify(
    trierObjetRecursivement({
      action_label: entree.action_label,
      action_type: entree.action_type,
      acteur_id: entree.acteur_id,
      acteur_nom: entree.acteur_nom,
      created_at: entree.created_at,
      details_json: entree.details_json,
      previous_hash: entree.previous_hash,
      seance_id: entree.seance_id,
      seance_libelle: entree.seance_libelle,
    })
  );

  return crypto
    .createHmac("sha256", secretHistorique)
    .update(chargeUtile)
    .digest("hex");
}

function lireDetailsJson(detailsJson) {
  try {
    return JSON.parse(detailsJson || "{}");
  } catch (error) {
    return {
      erreur_lecture: true,
    };
  }
}

function transformerEntreeHistorique(entree, integriteValide) {
  return {
    id: entree.id,
    seance_id: entree.seance_id,
    seance_libelle: entree.seance_libelle,
    action_type: entree.action_type,
    action_label: entree.action_label,
    acteur_id: entree.acteur_id,
    acteur_nom: entree.acteur_nom,
    created_at: entree.created_at,
    integrite_valide: integriteValide,
    details: lireDetailsJson(entree.details_json),
  };
}

async function recupererDernierHashHistorique() {
  const derniereEntree = await get(
    `
      SELECT entry_hash
      FROM historique_actions
      ORDER BY id DESC
      LIMIT 1
    `
  );

  return derniereEntree ? derniereEntree.entry_hash : "";
}

async function creerEntreeHistorique({
  seanceId,
  seanceLibelle,
  actionType,
  actionLabel,
  acteurId,
  acteurNom,
  details,
}) {
  const detailsJson = serialiserDetails(details);
  const previousHash = await recupererDernierHashHistorique();
  const createdAt = new Date().toISOString();
  const entree = {
    seance_id: seanceId || null,
    seance_libelle: seanceLibelle || "Seance inconnue",
    action_type: actionType,
    action_label: actionLabel,
    acteur_id: acteurId || null,
    acteur_nom: acteurNom || "Utilisateur inconnu",
    details_json: detailsJson,
    previous_hash: previousHash,
    created_at: createdAt,
  };
  const entryHash = calculerHashEntree(entree);

  const resultat = await run(
    `
      INSERT INTO historique_actions (
        seance_id,
        seance_libelle,
        action_type,
        action_label,
        acteur_id,
        acteur_nom,
        details_json,
        previous_hash,
        entry_hash,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entree.seance_id,
      entree.seance_libelle,
      entree.action_type,
      entree.action_label,
      entree.acteur_id,
      entree.acteur_nom,
      entree.details_json,
      entree.previous_hash,
      entryHash,
      entree.created_at,
    ]
  );

  return trouverEntreeHistoriqueParId(resultat.id);
}

async function listerEntreesHistoriqueBrutes(limit = 200) {
  return all(
    `
      SELECT
        id,
        seance_id,
        seance_libelle,
        action_type,
        action_label,
        acteur_id,
        acteur_nom,
        details_json,
        previous_hash,
        entry_hash,
        created_at
      FROM historique_actions
      ORDER BY id DESC
      LIMIT ?
    `,
    [limit]
  );
}

async function trouverEntreeHistoriqueParId(id) {
  return get(
    `
      SELECT
        id,
        seance_id,
        seance_libelle,
        action_type,
        action_label,
        acteur_id,
        acteur_nom,
        details_json,
        previous_hash,
        entry_hash,
        created_at
      FROM historique_actions
      WHERE id = ?
    `,
    [id]
  );
}

async function construireCarteIntegriteHistorique(entreesLimitee = null) {
  let entrees = entreesLimitee;

  if (Array.isArray(entreesLimitee)) {
    if (entreesLimitee.length === 0) {
      return new Map();
    }

    const idMaximum = entreesLimitee.reduce((maximum, entree) => {
      const id = Number(entree?.id || 0);
      return id > maximum ? id : maximum;
    }, 0);

    entrees = await all(
      `
        SELECT
          id,
          seance_id,
          seance_libelle,
          action_type,
          action_label,
          acteur_id,
          acteur_nom,
          details_json,
          previous_hash,
          entry_hash,
          created_at
        FROM historique_actions
        WHERE id <= ?
        ORDER BY id ASC
      `,
      [idMaximum]
    );
  } else {
    entrees = await all(
      `
        SELECT
          id,
          seance_id,
          seance_libelle,
          action_type,
          action_label,
          acteur_id,
          acteur_nom,
          details_json,
          previous_hash,
          entry_hash,
          created_at
        FROM historique_actions
        ORDER BY id ASC
      `
    );
  }

  const carteIntegrite = new Map();
  let hashPrecedentAttendu = "";
  let chaineValideJusquaIci = true;

  for (const entree of entrees) {
    const hashCalcule = calculerHashEntree(entree);
    const previousHashValide = String(entree.previous_hash || "") === hashPrecedentAttendu;
    const hashCourantValide = entree.entry_hash === hashCalcule;
    const integriteValide =
      chaineValideJusquaIci && previousHashValide && hashCourantValide;

    carteIntegrite.set(entree.id, integriteValide);
    hashPrecedentAttendu = String(entree.entry_hash || "");
    chaineValideJusquaIci = integriteValide;
  }

  return carteIntegrite;
}

async function listerEntreesHistorique(limit = 200) {
  const entrees = await listerEntreesHistoriqueBrutes(limit);
  const carteIntegrite = await construireCarteIntegriteHistorique(entrees);

  return entrees.map((entree) =>
    transformerEntreeHistorique(entree, carteIntegrite.get(entree.id) === true)
  );
}

async function recupererEntreeHistoriqueDetail(id) {
  const entree = await trouverEntreeHistoriqueParId(id);

  if (!entree) {
    return null;
  }

  const carteIntegrite = await construireCarteIntegriteHistorique([entree]);
  return transformerEntreeHistorique(entree, carteIntegrite.get(entree.id) === true);
}

async function supprimerEntreeHistoriqueParId(id) {
  const entreeCible = await trouverEntreeHistoriqueParId(id);

  if (!entreeCible) {
    return {
      deletedEntry: null,
      changes: 0,
    };
  }

  const entreesSuivantes = await all(
    `
      SELECT
        id,
        seance_id,
        seance_libelle,
        action_type,
        action_label,
        acteur_id,
        acteur_nom,
        details_json,
        previous_hash,
        entry_hash,
        created_at
      FROM historique_actions
      WHERE id > ?
      ORDER BY id ASC
    `,
    [id]
  );

  let hashPrecedent = String(entreeCible.previous_hash || "");

  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    const resultatSuppression = await run(
      "DELETE FROM historique_actions WHERE id = ?",
      [id]
    );

    for (const entree of entreesSuivantes) {
      const entreeRechainee = {
        ...entree,
        previous_hash: hashPrecedent,
      };
      const nouvelHash = calculerHashEntree(entreeRechainee);

      await run(
        `
          UPDATE historique_actions
          SET previous_hash = ?, entry_hash = ?
          WHERE id = ?
        `,
        [hashPrecedent, nouvelHash, entree.id]
      );

      hashPrecedent = nouvelHash;
    }

    await run("COMMIT");

    return {
      deletedEntry: entreeCible,
      changes: Number(resultatSuppression?.changes || 0),
    };
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
}

module.exports = {
  creerEntreeHistorique,
  listerEntreesHistorique,
  recupererEntreeHistoriqueDetail,
  supprimerEntreeHistoriqueParId,
};
