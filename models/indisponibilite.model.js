const { all, get, run } = require("./db");

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserListeIdentifiants(valeurs = []) {
  return Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [valeurs])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );
}

function construireFiltreIndisponibilitesScopees(scope = {}) {
  const handlerIds = normaliserListeIdentifiants(scope.handlerIds);
  const intervenantId = normaliserIdentifiant(scope.intervenantId);

  if (handlerIds.length === 0) {
    return { clause: "1 = 0", parametres: [] };
  }

  const clauses = [
    `indisponibilites.handler_id IN (${handlerIds.map(() => "?").join(", ")})`,
  ];
  const parametres = [...handlerIds];

  if (intervenantId) {
    clauses.push("indisponibilites.intervenant_id = ?");
    parametres.push(intervenantId);
  }

  return { clause: clauses.join(" AND "), parametres };
}

const requeteIndisponibiliteComplete = `
  SELECT
    indisponibilites.*,
    createur.nom AS cree_par_nom
  FROM indisponibilites
  LEFT JOIN utilisateurs AS createur ON createur.id = indisponibilites.cree_par
  LEFT JOIN utilisateurs AS intervenant ON intervenant.id = indisponibilites.intervenant_id
`;

async function listerToutesLesIndisponibilites() {
  return all(
    `
      ${requeteIndisponibiliteComplete}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `
  );
}

async function listerIndisponibilitesScopees(scope = {}) {
  const filtre = construireFiltreIndisponibilitesScopees(scope);

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${filtre.clause}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    filtre.parametres
  );
}

async function trouverIndisponibiliteParId(id) {
  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.id = ?
    `,
    [id]
  );
}

async function trouverIndisponibiliteParIdScopee(id, scope = {}) {
  const indisponibiliteId = normaliserIdentifiant(id);

  if (!indisponibiliteId) {
    return null;
  }

  const filtre = construireFiltreIndisponibilitesScopees(scope);

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.id = ?
        AND ${filtre.clause}
    `,
    [indisponibiliteId, ...filtre.parametres]
  );
}

async function creerIndisponibilite({
  date,
  heureDebut,
  heureFin,
  jourComplet = 0,
  raison,
  creePar,
  handlerId = null,
  intervenantId = null,
}) {
  const resultat = await run(
    `
      INSERT INTO indisponibilites (
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        raison,
        cree_par,
        handler_id,
        intervenant_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      date,
      heureDebut,
      heureFin,
      jourComplet ? 1 : 0,
      raison,
      creePar,
      normaliserIdentifiant(handlerId),
      normaliserIdentifiant(intervenantId),
    ]
  );

  return trouverIndisponibiliteParId(resultat.id);
}

async function modifierIndisponibilite(
  id,
  {
    date,
    heureDebut,
    heureFin,
    jourComplet = 0,
    raison,
    handlerId = null,
    intervenantId = null,
  }
) {
  await run(
    `
      UPDATE indisponibilites
      SET
        date = ?,
        heure_debut = ?,
        heure_fin = ?,
        jour_complet = ?,
        raison = ?,
        handler_id = COALESCE(?, handler_id),
        intervenant_id = COALESCE(?, intervenant_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      date,
      heureDebut,
      heureFin,
      jourComplet ? 1 : 0,
      raison,
      normaliserIdentifiant(handlerId),
      normaliserIdentifiant(intervenantId),
      id,
    ]
  );

  return trouverIndisponibiliteParId(id);
}

async function supprimerIndisponibilite(id) {
  return run("DELETE FROM indisponibilites WHERE id = ?", [id]);
}

async function trouverIndisponibiliteChevauchante({
  date,
  heureDebut,
  heureFin,
  exclureId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const params = [date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    params.push(Number(exclureId));
  }

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
      LIMIT 1
    `,
    params
  );
}

async function trouverIndisponibiliteIntervenantChevauchante({
  handlerId,
  intervenantId,
  date,
  heureDebut,
  heureFin,
  exclureId = null,
}) {
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (!handler || !intervenant) {
    return null;
  }

  const clauses = [
    "indisponibilites.handler_id = ?",
    "indisponibilites.intervenant_id = ?",
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const parametres = [handler, intervenant, date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    parametres.push(Number(exclureId));
  }

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
      LIMIT 1
    `,
    parametres
  );
}

async function listerIndisponibilitesChevauchantes({
  date,
  heureDebut,
  heureFin,
  exclureId = null,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const params = [date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    params.push(Number(exclureId));
  }

  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (handler && intervenant) {
    clauses.push("indisponibilites.handler_id = ?", "indisponibilites.intervenant_id = ?");
    params.push(handler, intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

async function listerIndisponibilitesTouchantPlage({
  date,
  heureDebut,
  heureFin,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut <= ?",
    "indisponibilites.heure_fin >= ?",
  ];
  const params = [date, heureFin, heureDebut];
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (handler && intervenant) {
    clauses.push("indisponibilites.handler_id = ?", "indisponibilites.intervenant_id = ?");
    params.push(handler, intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

async function listerIndisponibilitesInclusesDansPlage({
  date,
  heureDebut,
  heureFin,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut >= ?",
    "indisponibilites.heure_fin <= ?",
  ];
  const params = [date, heureDebut, heureFin];
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (handler && intervenant) {
    clauses.push("indisponibilites.handler_id = ?", "indisponibilites.intervenant_id = ?");
    params.push(handler, intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

module.exports = {
  construireFiltreIndisponibilitesScopees,
  listerToutesLesIndisponibilites,
  listerIndisponibilitesScopees,
  listerIndisponibilitesChevauchantes,
  listerIndisponibilitesTouchantPlage,
  listerIndisponibilitesInclusesDansPlage,
  trouverIndisponibiliteParId,
  trouverIndisponibiliteParIdScopee,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
  trouverIndisponibiliteIntervenantChevauchante,
};
