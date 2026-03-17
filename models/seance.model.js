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

async function listerToutesLesSeances() {
  return all(
    `
      ${requeteSeanceComplete}
      ORDER BY seances.date ASC, seances.heure_debut ASC
    `
  );
}

async function trouverSeanceParId(id) {
  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.id = ?
    `,
    [id]
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
        statut_seance,
        prix,
        statut_paiement,
        description,
        cree_par,
        modifie_par
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.cree_par,
      donneesSeance.modifie_par,
    ]
  );

  return trouverSeanceParId(resultat.id);
}

async function mettreAJourSeance(id, donneesSeance) {
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
        statut_seance = ?,
        prix = ?,
        statut_paiement = ?,
        description = ?,
        modifie_par = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
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
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.modifie_par,
      id,
    ]
  );

  return trouverSeanceParId(id);
}

async function mettreAJourStatutSeance(id, statutSeance, utilisateurId) {
  await run(
    `
      UPDATE seances
      SET
        statut_seance = ?,
        modifie_par = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [statutSeance, utilisateurId, id]
  );

  return trouverSeanceParId(id);
}

async function supprimerSeance(id) {
  return run("DELETE FROM seances WHERE id = ?", [id]);
}

module.exports = {
  listerToutesLesSeances,
  trouverSeanceParId,
  creerSeance,
  mettreAJourSeance,
  mettreAJourStatutSeance,
  supprimerSeance,
};
