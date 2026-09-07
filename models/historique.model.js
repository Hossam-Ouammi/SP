const crypto = require("crypto");

const { all, get, run, executerTransactionImmediate } = require("./db");
const { recupererSecretAudit } = require("./audit-secret");

const secretHistorique = recupererSecretAudit();
const SIGNATURE_VERSION_LEGACY = 1;
const SIGNATURE_VERSION_SCOPE = 2;

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

function normaliserVersionSignature(entree) {
  const valeur = entree?.signature_version;

  // Rows written before the append-only migration do not carry a version.
  // They are the exact historical v1 payload and must remain verifiable.
  if (valeur === null || valeur === undefined || valeur === "") {
    return SIGNATURE_VERSION_LEGACY;
  }

  const version = Number(valeur);
  return [SIGNATURE_VERSION_LEGACY, SIGNATURE_VERSION_SCOPE].includes(version)
    ? version
    : null;
}

function construireChargeUtileSignatureV1(entree) {
  return {
    action_label: entree.action_label,
    action_type: entree.action_type,
    acteur_id: entree.acteur_id,
    acteur_nom: entree.acteur_nom,
    created_at: entree.created_at,
    details_json: entree.details_json,
    previous_hash: entree.previous_hash,
    seance_id: entree.seance_id,
    seance_libelle: entree.seance_libelle,
  };
}

function valeurScopeSignee(valeur) {
  return valeur === undefined ? null : valeur;
}

function calculerHashEntree(entree) {
  const version = normaliserVersionSignature(entree);

  if (!version) {
    return null;
  }

  const chargeUtileV1 = construireChargeUtileSignatureV1(entree);
  const chargeUtile =
    version === SIGNATURE_VERSION_SCOPE
      ? {
          ...chargeUtileV1,
          handler_id: valeurScopeSignee(entree.handler_id),
          intervenant_id: valeurScopeSignee(entree.intervenant_id),
          signature_version: SIGNATURE_VERSION_SCOPE,
        }
      : chargeUtileV1;
  const chargeUtileSerialisee = JSON.stringify(trierObjetRecursivement(chargeUtile));

  return crypto
    .createHmac("sha256", secretHistorique)
    .update(chargeUtileSerialisee)
    .digest("hex");
}

function calculerHashEntreeObligatoire(entree) {
  const hash = calculerHashEntree(entree);

  if (!hash) {
    throw new Error("Version de signature HMAC historique non prise en charge.");
  }

  return hash;
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
    handler_id: entree.handler_id || null,
    intervenant_id: entree.intervenant_id || null,
    seance_libelle: entree.seance_libelle,
    action_type: entree.action_type,
    action_label: entree.action_label,
    acteur_id: entree.acteur_id,
    acteur_nom: entree.acteur_nom,
    created_at: entree.created_at,
    signature_version: normaliserVersionSignature(entree),
    integrite_valide: integriteValide,
    details: lireDetailsJson(entree.details_json),
  };
}

function normaliserListeIds(valeurs) {
  return Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [])
        .map((valeur) => Number(valeur))
        .filter((valeur) => Number.isInteger(valeur) && valeur > 0)
    )
  );
}

function construireFiltreHistoriqueScope(scope = {}) {
  // A dual-role account remains in its operational scope until it reaches an
  // explicitly protected administrative route.
  if (scope?.estSuperAdmin && scope?.modeAdministration === true) {
    return { clause: "1 = 1", parametres: [] };
  }

  const handlerOwnIds = normaliserListeIds(scope?.handlerOwnIds);
  const handlerProfesseurIds = normaliserListeIds(scope?.handlerProfesseurIds);
  const intervenantId = Number(scope?.utilisateurId);
  const clauses = [];
  const parametres = [];

  if (handlerOwnIds.length > 0) {
    clauses.push(`historique_actions.handler_id IN (${handlerOwnIds.map(() => "?").join(", ")})`);
    parametres.push(...handlerOwnIds);
  }

  if (handlerProfesseurIds.length > 0 && Number.isInteger(intervenantId) && intervenantId > 0) {
    clauses.push(
      `(historique_actions.handler_id IN (${handlerProfesseurIds
        .map(() => "?")
        .join(", ")}) AND historique_actions.intervenant_id = ?)`
    );
    parametres.push(...handlerProfesseurIds, intervenantId);
  }

  return clauses.length > 0
    ? { clause: `(${clauses.join(" OR ")})`, parametres }
    : { clause: "1 = 0", parametres: [] };
}

const selectionHistoriqueActions = `
  id,
  seance_id,
  handler_id,
  intervenant_id,
  seance_libelle,
  action_type,
  action_label,
  acteur_id,
  acteur_nom,
  details_json,
  previous_hash,
  entry_hash,
  signature_version,
  created_at
`;

function estHeureHistoriqueValide(heure, options = {}) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""))) {
    return true;
  }

  return options.allowEndOfDay === true && heure === "24:00";
}

function calculerDureeMinutesSeanceHistorique(seance) {
  const dureeExistante = Number(seance?.duree_minutes);

  if (Number.isFinite(dureeExistante) && dureeExistante > 0) {
    return dureeExistante;
  }

  if (
    !estHeureHistoriqueValide(seance?.heure_debut) ||
    !estHeureHistoriqueValide(seance?.heure_fin, { allowEndOfDay: true })
  ) {
    return 0;
  }

  return Math.max(
    0,
    calculerMinutesDepuisHeure(seance.heure_fin) - calculerMinutesDepuisHeure(seance.heure_debut)
  );
}

function calculerMinutesDepuisHeure(heure) {
  if (heure === "24:00") {
    return 24 * 60;
  }

  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function construireSnapshotSeanceHistorique(seance) {
  const dureeMinutes = calculerDureeMinutesSeanceHistorique(seance);

  return {
    etudiant: String(seance?.etudiant || ""),
    parent: String(seance?.parent || ""),
    matiere: String(seance?.matiere || ""),
    compte: String(seance?.compte || ""),
    est_essai: Number(seance?.est_essai) === 1 || seance?.est_essai === true ? 1 : 0,
    date: String(seance?.date || ""),
    heure_debut: String(seance?.heure_debut || ""),
    heure_fin: String(seance?.heure_fin || ""),
    duree_minutes: dureeMinutes,
    statut_seance: String(seance?.statut_seance || ""),
    description: String(seance?.description || ""),
  };
}

function enrichirDetailsAvecSeance(details, snapshotSeance) {
  const detailsNormalises =
    details && typeof details === "object" && !Array.isArray(details) ? { ...details } : {};
  const seanceExistante =
    detailsNormalises.seance &&
    typeof detailsNormalises.seance === "object" &&
    !Array.isArray(detailsNormalises.seance)
      ? detailsNormalises.seance
      : {};

  detailsNormalises.seance = {
    ...snapshotSeance,
    ...seanceExistante,
  };

  return detailsNormalises;
}

async function detacherSeancesHistorique(seances = []) {
  const seancesNormalisees = Array.isArray(seances) ? seances : [seances];
  const snapshotsParId = new Map();

  seancesNormalisees.forEach((seance) => {
    const id = Number(seance?.id || 0);

    if (id > 0) {
      snapshotsParId.set(id, construireSnapshotSeanceHistorique(seance));
    }
  });

  if (snapshotsParId.size === 0) {
    return {
      historiqueChanges: 0,
      historiqueActionsChanges: 0,
    };
  }

  const idsCibles = Array.from(snapshotsParId.keys());
  const placeholders = idsCibles.map(() => "?").join(", ");
  const resultatHistorique = await run(
    `UPDATE historique SET seance_id = NULL WHERE seance_id IN (${placeholders})`,
    idsCibles
  ).catch(() => ({ changes: 0 }));
  const entrees = await all(
    `
      SELECT ${selectionHistoriqueActions}
      FROM historique_actions
      ORDER BY id ASC
    `
  );

  let previousHash = "";
  let historiqueActionsChanges = 0;

  for (const entree of entrees) {
    let seanceId = entree.seance_id;
    let detailsJson = entree.details_json;
    const snapshotSeance = snapshotsParId.get(Number(entree.seance_id || 0));

    if (snapshotSeance) {
      seanceId = null;
      detailsJson = serialiserDetails(
        enrichirDetailsAvecSeance(lireDetailsJson(entree.details_json), snapshotSeance)
      );
    }

    const entreeRechainee = {
      ...entree,
      seance_id: seanceId,
      details_json: detailsJson,
      previous_hash: previousHash,
    };
    const entryHash = calculerHashEntreeObligatoire(entreeRechainee);
    const entreeModifiee =
      Number(entree.seance_id || 0) !== Number(seanceId || 0) ||
      String(entree.details_json || "") !== String(detailsJson || "") ||
      String(entree.previous_hash || "") !== previousHash ||
      String(entree.entry_hash || "") !== entryHash;

    if (entreeModifiee) {
      const resultat = await run(
        `
          UPDATE historique_actions
          SET seance_id = ?, details_json = ?, previous_hash = ?, entry_hash = ?
          WHERE id = ?
        `,
        [seanceId, detailsJson, previousHash, entryHash, entree.id]
      );
      historiqueActionsChanges += Number(resultat?.changes || 0);
    }

    previousHash = entryHash;
  }

  return {
    historiqueChanges: Number(resultatHistorique?.changes || 0),
    historiqueActionsChanges,
  };
}

async function rechainerHistoriqueActions(mutateur = null) {
  const entrees = await all(
    `
      SELECT ${selectionHistoriqueActions}
      FROM historique_actions
      ORDER BY id ASC
    `
  );

  let previousHash = "";
  let changements = 0;

  for (const entree of entrees) {
    const entreeMutee =
      typeof mutateur === "function" ? mutateur({ ...entree }) || { ...entree } : { ...entree };
    const entreeRechainee = {
      ...entreeMutee,
      previous_hash: previousHash,
    };
    const entryHash = calculerHashEntreeObligatoire(entreeRechainee);
    const entreeModifiee =
      Number(entree.seance_id || 0) !== Number(entreeRechainee.seance_id || 0) ||
      String(entree.handler_id ?? "") !== String(entreeRechainee.handler_id ?? "") ||
      String(entree.intervenant_id ?? "") !== String(entreeRechainee.intervenant_id ?? "") ||
      Number(entree.acteur_id || 0) !== Number(entreeRechainee.acteur_id || 0) ||
      String(entree.details_json || "") !== String(entreeRechainee.details_json || "") ||
      String(entree.previous_hash || "") !== previousHash ||
      String(entree.entry_hash || "") !== entryHash;

    if (entreeModifiee) {
      const resultat = await run(
        `
          UPDATE historique_actions
          SET
            seance_id = ?,
            handler_id = ?,
            intervenant_id = ?,
            acteur_id = ?,
            details_json = ?,
            previous_hash = ?,
            entry_hash = ?
          WHERE id = ?
        `,
        [
          entreeRechainee.seance_id,
          entreeRechainee.handler_id,
          entreeRechainee.intervenant_id,
          entreeRechainee.acteur_id,
          entreeRechainee.details_json,
          previousHash,
          entryHash,
          entree.id,
        ]
      );
      changements += Number(resultat?.changes || 0);
    }

    previousHash = entryHash;
  }

  return changements;
}

async function detacherUtilisateurHistorique(utilisateurId) {
  const id = Number(utilisateurId);

  if (!Number.isInteger(id) || id <= 0) {
    return {
      historiqueChanges: 0,
      historiqueActionsChanges: 0,
    };
  }

  const resultatHistorique = await run(
    "UPDATE historique SET acteur_id = NULL WHERE acteur_id = ?",
    [id]
  ).catch(() => ({ changes: 0 }));
  const historiqueActionsChanges = await rechainerHistoriqueActions((entree) => {
    if (
      Number(entree.acteur_id) === id ||
      Number(entree.handler_id) === id ||
      Number(entree.intervenant_id) === id
    ) {
      return {
        ...entree,
        acteur_id: Number(entree.acteur_id) === id ? null : entree.acteur_id,
        // These two fields have ON DELETE SET NULL foreign keys.  v2 signs
        // them, so neutralise and rechain them *before* deleting the account
        // instead of letting SQLite invalidate an otherwise valid hash.
        handler_id: Number(entree.handler_id) === id ? null : entree.handler_id,
        intervenant_id:
          Number(entree.intervenant_id) === id ? null : entree.intervenant_id,
      };
    }

    return entree;
  });

  return {
    historiqueChanges: Number(resultatHistorique?.changes || 0),
    historiqueActionsChanges,
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
  handlerId,
  intervenantId,
  seanceLibelle,
  actionType,
  actionLabel,
  acteurId,
  acteurNom,
  details,
}) {
  // The tail read, v2 HMAC calculation and insert are a single SQLite
  // `BEGIN IMMEDIATE` unit. This prevents two simultaneous requests from
  // signing against the same previous hash.
  return executerTransactionImmediate(async () => {
    const detailsJson = serialiserDetails(details);
    const previousHash = await recupererDernierHashHistorique();
    const createdAt = new Date().toISOString();
    const entree = {
      seance_id: seanceId || null,
      handler_id:
        Number.isInteger(Number(handlerId)) && Number(handlerId) > 0 ? Number(handlerId) : null,
      intervenant_id:
        Number.isInteger(Number(intervenantId)) && Number(intervenantId) > 0
          ? Number(intervenantId)
          : null,
      seance_libelle: seanceLibelle || "Seance inconnue",
      action_type: actionType,
      action_label: actionLabel,
      acteur_id: acteurId || null,
      acteur_nom: acteurNom || "Utilisateur inconnu",
      details_json: detailsJson,
      previous_hash: previousHash,
      signature_version: SIGNATURE_VERSION_SCOPE,
      created_at: createdAt,
    };
    const entryHash = calculerHashEntreeObligatoire(entree);

    const resultat = await run(
      `
        INSERT INTO historique_actions (
          seance_id,
          handler_id,
          intervenant_id,
          seance_libelle,
          action_type,
          action_label,
          acteur_id,
          acteur_nom,
          details_json,
          previous_hash,
          entry_hash,
          signature_version,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entree.seance_id,
        entree.handler_id,
        entree.intervenant_id,
        entree.seance_libelle,
        entree.action_type,
        entree.action_label,
        entree.acteur_id,
        entree.acteur_nom,
        entree.details_json,
        entree.previous_hash,
        entryHash,
        entree.signature_version,
        entree.created_at,
      ]
    );

    return trouverEntreeHistoriqueParId(resultat.id);
  });
}

async function listerEntreesHistoriqueBrutes(limit = 200) {
  return all(
    `
      SELECT ${selectionHistoriqueActions}
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
      SELECT ${selectionHistoriqueActions}
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
        SELECT ${selectionHistoriqueActions}
        FROM historique_actions
        WHERE id <= ?
        ORDER BY id ASC
      `,
      [idMaximum]
    );
  } else {
    entrees = await all(
      `
        SELECT ${selectionHistoriqueActions}
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

function normaliserLimiteHistorique(limit, valeurParDefaut = 200) {
  const limite = Number(limit);

  if (!Number.isInteger(limite) || limite <= 0) {
    return valeurParDefaut;
  }

  return Math.min(limite, 500);
}

async function listerEntreesHistoriqueScopees(scope, limit = 200) {
  const filtre = construireFiltreHistoriqueScope(scope);
  const entrees = await all(
    `
      SELECT ${selectionHistoriqueActions}
      FROM historique_actions
      WHERE ${filtre.clause}
      ORDER BY id DESC
      LIMIT ?
    `,
    [...filtre.parametres, normaliserLimiteHistorique(limit)]
  );
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

async function recupererEntreeHistoriqueDetailScopee(id, scope) {
  const filtre = construireFiltreHistoriqueScope(scope);
  const entree = await get(
    `
      SELECT ${selectionHistoriqueActions}
      FROM historique_actions
      WHERE id = ?
        AND ${filtre.clause}
    `,
    [id, ...filtre.parametres]
  );

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
      SELECT ${selectionHistoriqueActions}
      FROM historique_actions
      WHERE id > ?
      ORDER BY id ASC
    `,
    [id]
  );

  let hashPrecedent = String(entreeCible.previous_hash || "");

  return executerTransactionImmediate(async () => {
    const resultatSuppression = await run(
      "DELETE FROM historique_actions WHERE id = ?",
      [id]
    );

    for (const entree of entreesSuivantes) {
      const entreeRechainee = {
        ...entree,
        previous_hash: hashPrecedent,
      };
      const nouvelHash = calculerHashEntreeObligatoire(entreeRechainee);

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

    return {
      deletedEntry: entreeCible,
      changes: Number(resultatSuppression?.changes || 0),
    };
  });
}

module.exports = {
  creerEntreeHistorique,
  detacherSeancesHistorique,
  detacherUtilisateurHistorique,
  listerEntreesHistorique,
  listerEntreesHistoriqueScopees,
  recupererEntreeHistoriqueDetail,
  recupererEntreeHistoriqueDetailScopee,
  supprimerEntreeHistoriqueParId,
};
