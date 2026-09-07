const { all, get, run } = require("./db");

const requeteIndisponibiliteComplete = `
  SELECT
    indisponibilites.*,
    createur.nom AS cree_par_nom
  FROM indisponibilites
  LEFT JOIN utilisateurs AS createur ON createur.id = indisponibilites.cree_par
`;

async function listerToutesLesIndisponibilites() {
  return all(
    `
      ${requeteIndisponibiliteComplete}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `
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

async function creerIndisponibilite({
  date,
  heureDebut,
  heureFin,
  jourComplet = 0,
  raison,
  creePar,
}) {
  const resultat = await run(
    `
      INSERT INTO indisponibilites (
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        raison,
        cree_par
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [date, heureDebut, heureFin, jourComplet ? 1 : 0, raison, creePar]
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
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [date, heureDebut, heureFin, jourComplet ? 1 : 0, raison, id]
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

async function listerIndisponibilitesChevauchantes({
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
}) {
  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.date = ?
        AND indisponibilites.heure_debut <= ?
        AND indisponibilites.heure_fin >= ?
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    [date, heureFin, heureDebut]
  );
}

async function listerIndisponibilitesInclusesDansPlage({
  date,
  heureDebut,
  heureFin,
}) {
  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.date = ?
        AND indisponibilites.heure_debut >= ?
        AND indisponibilites.heure_fin <= ?
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    [date, heureDebut, heureFin]
  );
}

module.exports = {
  listerToutesLesIndisponibilites,
  listerIndisponibilitesChevauchantes,
  listerIndisponibilitesTouchantPlage,
  listerIndisponibilitesInclusesDansPlage,
  trouverIndisponibiliteParId,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
};
