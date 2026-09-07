const { all, get, run } = require("./db");

const requetePropositionComplete = `
  SELECT
    propositions_seances.*,
    proposeur.nom AS proposee_par_nom,
    traiteur.nom AS traitee_par_nom,
    indisponibilites.date AS indisponibilite_date,
    indisponibilites.heure_debut AS indisponibilite_heure_debut,
    indisponibilites.heure_fin AS indisponibilite_heure_fin,
    indisponibilites.jour_complet AS indisponibilite_jour_complet,
    COALESCE(
      propositions_seances.indisponibilite_date_originale,
      indisponibilites.date
    ) AS indisponibilite_date_originale,
    COALESCE(
      propositions_seances.indisponibilite_heure_debut_originale,
      indisponibilites.heure_debut
    ) AS indisponibilite_heure_debut_originale,
    COALESCE(
      propositions_seances.indisponibilite_heure_fin_originale,
      indisponibilites.heure_fin
    ) AS indisponibilite_heure_fin_originale,
    COALESCE(
      propositions_seances.indisponibilite_jour_complet_original,
      indisponibilites.jour_complet,
      0
    ) AS indisponibilite_jour_complet_original
  FROM propositions_seances
  LEFT JOIN utilisateurs AS proposeur ON proposeur.id = propositions_seances.proposee_par
  LEFT JOIN utilisateurs AS traiteur ON traiteur.id = propositions_seances.traitee_par
  LEFT JOIN indisponibilites ON indisponibilites.id = propositions_seances.indisponibilite_id
`;

async function listerPropositionsSeances({ statut = "en_attente", limite = 100 } = {}) {
  const limiteNormalisee = Math.min(Math.max(Number(limite) || 100, 1), 300);
  const clauses = [];
  const parametres = [];

  if (statut) {
    clauses.push("propositions_seances.statut = ?");
    parametres.push(statut);
  }

  return all(
    `
      ${requetePropositionComplete}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY propositions_seances.id DESC
      LIMIT ?
    `,
    [...parametres, limiteNormalisee]
  );
}

async function trouverPropositionSeanceParId(id) {
  return get(
    `
      ${requetePropositionComplete}
      WHERE propositions_seances.id = ?
    `,
    [id]
  );
}

async function trouverPropositionAccepteeParSeanceId(seanceId) {
  return get(
    `
      ${requetePropositionComplete}
      WHERE propositions_seances.seance_id = ?
        AND propositions_seances.statut = 'acceptee'
      ORDER BY propositions_seances.id DESC
      LIMIT 1
    `,
    [seanceId]
  );
}

async function creerPropositionSeance(donnees) {
  const resultat = await run(
    `
      INSERT INTO propositions_seances (
        titre,
        etudiant,
        parent,
        matiere,
        compte,
        est_essai,
        date,
        heure_debut,
        heure_fin,
        duree_minutes,
        statut_seance,
        prix,
        statut_paiement,
        description,
        indisponibilite_id,
        indisponibilite_date_originale,
        indisponibilite_heure_debut_originale,
        indisponibilite_heure_fin_originale,
        indisponibilite_jour_complet_original,
        proposee_par,
        seance_source_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      donnees.titre,
      donnees.etudiant,
      donnees.parent,
      donnees.matiere,
      donnees.compte,
      donnees.est_essai,
      donnees.date,
      donnees.heure_debut,
      donnees.heure_fin,
      donnees.duree_minutes,
      donnees.statut_seance,
      donnees.prix,
      donnees.statut_paiement,
      donnees.description,
      donnees.indisponibilite_id || null,
      donnees.indisponibilite_date_originale || null,
      donnees.indisponibilite_heure_debut_originale || null,
      donnees.indisponibilite_heure_fin_originale || null,
      donnees.indisponibilite_jour_complet_original ? 1 : 0,
      donnees.proposee_par,
      donnees.seance_source_id || null,
    ]
  );

  return trouverPropositionSeanceParId(resultat.id);
}

async function mettreAJourPropositionSeance(id, donnees) {
  await run(
    `
      UPDATE propositions_seances
      SET
        titre = ?,
        etudiant = ?,
        parent = ?,
        matiere = ?,
        compte = ?,
        est_essai = ?,
        date = ?,
        heure_debut = ?,
        heure_fin = ?,
        duree_minutes = ?,
        statut_seance = ?,
        prix = ?,
        statut_paiement = ?,
        description = ?,
        indisponibilite_id = COALESCE(?, indisponibilite_id),
        indisponibilite_date_originale = COALESCE(?, indisponibilite_date_originale),
        indisponibilite_heure_debut_originale = COALESCE(?, indisponibilite_heure_debut_originale),
        indisponibilite_heure_fin_originale = COALESCE(?, indisponibilite_heure_fin_originale),
        indisponibilite_jour_complet_original = COALESCE(
          ?,
          indisponibilite_jour_complet_original
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND statut = 'en_attente'
    `,
    [
      donnees.titre,
      donnees.etudiant,
      donnees.parent,
      donnees.matiere,
      donnees.compte,
      donnees.est_essai,
      donnees.date,
      donnees.heure_debut,
      donnees.heure_fin,
      donnees.duree_minutes,
      donnees.statut_seance,
      donnees.prix,
      donnees.statut_paiement,
      donnees.description,
      donnees.indisponibilite_id || null,
      donnees.indisponibilite_date_originale || null,
      donnees.indisponibilite_heure_debut_originale || null,
      donnees.indisponibilite_heure_fin_originale || null,
      donnees.indisponibilite_jour_complet_original === undefined
        ? null
        : donnees.indisponibilite_jour_complet_original
          ? 1
          : 0,
      id,
    ]
  );

  return trouverPropositionSeanceParId(id);
}

async function marquerPropositionSeanceAcceptee(id, { acteurId, seanceId }) {
  await run(
    `
      UPDATE propositions_seances
      SET
        statut = 'acceptee',
        traitee_par = ?,
        seance_id = ?,
        traitee_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND statut = 'en_attente'
    `,
    [acteurId, seanceId, id]
  );

  return trouverPropositionSeanceParId(id);
}

async function marquerPropositionSeanceRefusee(id, { acteurId }) {
  await run(
    `
      UPDATE propositions_seances
      SET
        statut = 'refusee',
        traitee_par = ?,
        traitee_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND statut = 'en_attente'
    `,
    [acteurId, id]
  );

  return trouverPropositionSeanceParId(id);
}

async function detacherSeancesPropositions(seances = []) {
  const ids = seances
    .map((seance) => Number(seance?.id || seance))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) {
    return { changes: 0 };
  }

  const placeholders = ids.map(() => "?").join(", ");

  return run(
    `
      UPDATE propositions_seances
      SET
        seance_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE seance_id IN (${placeholders})
    `,
    ids
  );
}

module.exports = {
  listerPropositionsSeances,
  trouverPropositionSeanceParId,
  trouverPropositionAccepteeParSeanceId,
  creerPropositionSeance,
  mettreAJourPropositionSeance,
  marquerPropositionSeanceAcceptee,
  marquerPropositionSeanceRefusee,
  detacherSeancesPropositions,
};
