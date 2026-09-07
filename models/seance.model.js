const { all, get, run } = require("./db");

const requeteSeanceComplete = `
  SELECT
    seances.*,
    createur.nom AS cree_par_nom,
    modificateur.nom AS modifie_par_nom,
    (
      SELECT COUNT(*)
      FROM photos
      WHERE photos.seance_id = seances.id
    ) AS nombre_photos
  FROM seances
  LEFT JOIN utilisateurs AS createur ON createur.id = seances.cree_par
  LEFT JOIN utilisateurs AS modificateur ON modificateur.id = seances.modifie_par
`;

async function listerToutesLesSeances(utilisateurId = null) {
  const clauseWhere = utilisateurId ? "WHERE seances.utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [utilisateurId] : [];

  return all(
    `
      ${requeteSeanceComplete}
      ${clauseWhere}
      ORDER BY seances.date ASC, seances.heure_debut ASC
    `,
    parametres
  );
}

async function listerSeancesPourMonetisation(utilisateurId = null) {
  const clauseWhere = utilisateurId ? "WHERE utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [utilisateurId] : [];

  return all(
    `
      SELECT
        id,
        etudiant,
        matiere,
        compte,
        est_essai,
        date,
        heure_debut,
        heure_fin,
        duree_minutes,
        statut_seance
      FROM seances
      ${clauseWhere}
    `,
    parametres
  );
}

async function trouverSeanceParId(id, utilisateurId = null) {
  const clauseWhereExtra = utilisateurId ? "AND seances.utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [id, utilisateurId] : [id];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.id = ? ${clauseWhereExtra}
    `,
    parametres
  );
}

async function trouverSeanceCompteChevauchante({
  date,
  heureDebut,
  heureFin,
  compte,
  exclureSeanceId = null,
}) {
  const clauseExclusion = exclureSeanceId ? "AND seances.id <> ?" : "";
  const parametres = exclureSeanceId
    ? [date, compte, heureFin, heureDebut, exclureSeanceId]
    : [date, compte, heureFin, heureDebut];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.date = ?
        AND lower(seances.compte) = lower(?)
        AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'
        AND seances.heure_debut < ?
        AND seances.heure_fin > ?
        ${clauseExclusion}
      ORDER BY seances.heure_debut ASC
      LIMIT 1
    `,
    parametres
  );
}

async function trouverSeanceChevauchante({
  date,
  heureDebut,
  heureFin,
  exclureSeanceId = null,
}) {
  const clauseExclusion = exclureSeanceId ? "AND seances.id <> ?" : "";
  const parametres = exclureSeanceId
    ? [date, heureFin, heureDebut, exclureSeanceId]
    : [date, heureFin, heureDebut];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.date = ?
        AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'
        AND seances.heure_debut < ?
        AND seances.heure_fin > ?
        ${clauseExclusion}
      ORDER BY seances.heure_debut ASC, seances.id ASC
      LIMIT 1
    `,
    parametres
  );
}

async function creerSeance(donneesSeance) {
  const resultat = await run(
    `
      INSERT INTO seances (
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
        cree_par,
        modifie_par,
        utilisateur_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      donneesSeance.titre,
      donneesSeance.etudiant,
      donneesSeance.parent,
      donneesSeance.matiere,
      donneesSeance.compte,
      donneesSeance.est_essai,
      donneesSeance.date,
      donneesSeance.heure_debut,
      donneesSeance.heure_fin,
      donneesSeance.duree_minutes,
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.cree_par,
      donneesSeance.modifie_par,
      donneesSeance.utilisateur_id,
    ]
  );

  return trouverSeanceParId(resultat.id, donneesSeance.utilisateur_id);
}

async function mettreAJourSeance(id, donneesSeance, utilisateurId = null) {
  await run(
    `
      UPDATE seances
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
        modifie_par = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? ${utilisateurId ? "AND utilisateur_id = ?" : ""}
    `,
    [
      donneesSeance.titre,
      donneesSeance.etudiant,
      donneesSeance.parent,
      donneesSeance.matiere,
      donneesSeance.compte,
      donneesSeance.est_essai,
      donneesSeance.date,
      donneesSeance.heure_debut,
      donneesSeance.heure_fin,
      donneesSeance.duree_minutes,
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.modifie_par,
      id,
      ...(utilisateurId ? [utilisateurId] : []),
    ]
  );

  return trouverSeanceParId(id, utilisateurId);
}

async function mettreAJourStatutSeance(id, statutSeance, acteurId, utilisateurId = null) {
  const clauseWhere = utilisateurId ? "AND utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [statutSeance, acteurId, id, utilisateurId] : [statutSeance, acteurId, id];

  await run(
    `
      UPDATE seances
      SET
        statut_seance = ?,
        modifie_par = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? ${clauseWhere}
    `,
    parametres
  );

  return trouverSeanceParId(id, utilisateurId);
}

async function supprimerSeance(id, utilisateurId = null) {
  const clauseWhere = utilisateurId ? "AND utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [id, utilisateurId] : [id];

  return run(`DELETE FROM seances WHERE id = ? ${clauseWhere}`, parametres);
}

module.exports = {
  listerToutesLesSeances,
  listerSeancesPourMonetisation,
  trouverSeanceParId,
  trouverSeanceCompteChevauchante,
  trouverSeanceChevauchante,
  creerSeance,
  mettreAJourSeance,
  mettreAJourStatutSeance,
  supprimerSeance,
};
