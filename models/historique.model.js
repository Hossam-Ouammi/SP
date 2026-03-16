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
    seance_libelle: seanceLibelle || "Séance inconnue",
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

async function construireCarteIntegriteHistorique() {
  const entrees = await all(
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

  let hashPrecedentAttendu = "";
  const carteIntegrite = new Map();

  for (const entree of entrees) {
    const hashCalcule = calculerHashEntree(entree);
    const integriteValide =
      entree.previous_hash === hashPrecedentAttendu &&
      entree.entry_hash === hashCalcule;

    carteIntegrite.set(entree.id, integriteValide);
    hashPrecedentAttendu = entree.entry_hash;
  }

  return carteIntegrite;
}

async function listerEntreesHistorique(limit = 200) {
  const [entrees, carteIntegrite] = await Promise.all([
    listerEntreesHistoriqueBrutes(limit),
    construireCarteIntegriteHistorique(),
  ]);

  return entrees.map((entree) =>
    transformerEntreeHistorique(entree, carteIntegrite.get(entree.id) === true)
  );
}

async function recupererEntreeHistoriqueDetail(id) {
  const [entree, carteIntegrite] = await Promise.all([
    trouverEntreeHistoriqueParId(id),
    construireCarteIntegriteHistorique(),
  ]);

  if (!entree) {
    return null;
  }

  return transformerEntreeHistorique(entree, carteIntegrite.get(entree.id) === true);
}

module.exports = {
  creerEntreeHistorique,
  listerEntreesHistorique,
  recupererEntreeHistoriqueDetail,
};
