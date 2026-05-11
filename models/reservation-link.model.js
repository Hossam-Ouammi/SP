const crypto = require("crypto");

const { all, get, run } = require("./db");

function genererTokenPublic() {
  return crypto.randomBytes(24).toString("hex");
}

async function genererTokenPublicUnique() {
  for (;;) {
    const tokenPublic = genererTokenPublic();
    const lienExistant = await get(
      `
        SELECT id
        FROM liens_reservation
        WHERE token_public = ?
      `,
      [tokenPublic]
    );

    if (!lienExistant) {
      return tokenPublic;
    }
  }
}

async function listerLiensReservationUtilisateur(utilisateurId) {
  return all(
    `
      SELECT
        id,
        utilisateur_id,
        token_public,
        etudiant,
        parent,
        matiere,
        compte,
        duree_minutes,
        actif,
        created_at,
        updated_at,
        last_accessed_at
      FROM liens_reservation
      WHERE utilisateur_id = ?
        AND actif = 1
      ORDER BY created_at DESC, id DESC
    `,
    [utilisateurId]
  );
}

async function trouverLienReservationParIdEtUtilisateur(id, utilisateurId) {
  return get(
    `
      SELECT
        id,
        utilisateur_id,
        token_public,
        etudiant,
        parent,
        matiere,
        compte,
        duree_minutes,
        actif,
        created_at,
        updated_at,
        last_accessed_at
      FROM liens_reservation
      WHERE id = ? AND utilisateur_id = ?
    `,
    [id, utilisateurId]
  );
}

async function creerLienReservation({
  utilisateurId,
  etudiant,
  parent,
  matiere,
  compte,
  dureeMinutes,
}) {
  const tokenPublic = await genererTokenPublicUnique();
  const resultat = await run(
    `
      INSERT INTO liens_reservation (
        utilisateur_id,
        token_public,
        etudiant,
        parent,
        matiere,
        compte,
        duree_minutes,
        actif,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `,
    [utilisateurId, tokenPublic, etudiant, parent, matiere, compte, dureeMinutes]
  );

  return trouverLienReservationParIdEtUtilisateur(resultat.id, utilisateurId);
}

async function desactiverLienReservation(id, utilisateurId) {
  await run(
    `
      UPDATE liens_reservation
      SET
        actif = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND utilisateur_id = ?
    `,
    [id, utilisateurId]
  );

  return trouverLienReservationParIdEtUtilisateur(id, utilisateurId);
}

async function trouverLienReservationActifParToken(tokenPublic) {
  return get(
    `
      SELECT
        liens_reservation.id,
        liens_reservation.utilisateur_id,
        liens_reservation.token_public,
        liens_reservation.etudiant,
        liens_reservation.parent,
        liens_reservation.matiere,
        liens_reservation.compte,
        liens_reservation.duree_minutes,
        liens_reservation.actif,
        liens_reservation.created_at,
        liens_reservation.updated_at,
        liens_reservation.last_accessed_at,
        utilisateurs.nom AS utilisateur_nom,
        utilisateurs.email AS utilisateur_email,
        utilisateurs.acces_active AS utilisateur_acces_active,
        utilisateurs.mode_lecture_seule AS utilisateur_mode_lecture_seule,
        utilisateurs.doit_changer_mot_de_passe AS utilisateur_doit_changer_mot_de_passe
      FROM liens_reservation
      INNER JOIN utilisateurs ON utilisateurs.id = liens_reservation.utilisateur_id
      WHERE liens_reservation.token_public = ?
        AND liens_reservation.actif = 1
      LIMIT 1
    `,
    [tokenPublic]
  );
}

async function mettreAJourDernierAccesLienReservation(id) {
  return run(
    `
      UPDATE liens_reservation
      SET
        last_accessed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id]
  );
}

module.exports = {
  listerLiensReservationUtilisateur,
  trouverLienReservationParIdEtUtilisateur,
  creerLienReservation,
  desactiverLienReservation,
  trouverLienReservationActifParToken,
  mettreAJourDernierAccesLienReservation,
};
