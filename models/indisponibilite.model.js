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

async function creerIndisponibilite({ date, heureDebut, heureFin, raison, creePar }) {
  const resultat = await run(
    `
      INSERT INTO indisponibilites (
        date,
        heure_debut,
        heure_fin,
        raison,
        cree_par
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [date, heureDebut, heureFin, raison, creePar]
  );

  return trouverIndisponibiliteParId(resultat.id);
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

module.exports = {
  listerToutesLesIndisponibilites,
  trouverIndisponibiliteParId,
  creerIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
};
