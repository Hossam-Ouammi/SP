const crypto = require("crypto");

const { get, run } = require("./db");

function genererTokenPublic() {
  return crypto.randomBytes(24).toString("hex");
}

async function genererTokenPublicUnique() {
  for (;;) {
    const tokenPublic = genererTokenPublic();
    const appareilExistant = await get(
      `
        SELECT id
        FROM public_reservation_devices
        WHERE token_public = ?
      `,
      [tokenPublic]
    );

    if (!appareilExistant) {
      return tokenPublic;
    }
  }
}

async function trouverAppareilReservationPubliqueParToken(tokenPublic) {
  return get(
    `
      SELECT
        id,
        token_public,
        etudiant_nom,
        parent_nom,
        created_at,
        updated_at,
        last_used_at
      FROM public_reservation_devices
      WHERE token_public = ?
      LIMIT 1
    `,
    [String(tokenPublic || "").trim()]
  );
}

async function creerAppareilReservationPublique({ etudiantNom, parentNom }) {
  const tokenPublic = await genererTokenPublicUnique();
  const resultat = await run(
    `
      INSERT INTO public_reservation_devices (
        token_public,
        etudiant_nom,
        parent_nom,
        updated_at,
        last_used_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [tokenPublic, etudiantNom, parentNom]
  );

  return trouverAppareilReservationPubliqueParId(resultat.id);
}

async function trouverAppareilReservationPubliqueParId(id) {
  return get(
    `
      SELECT
        id,
        token_public,
        etudiant_nom,
        parent_nom,
        created_at,
        updated_at,
        last_used_at
      FROM public_reservation_devices
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
}

async function mettreAJourProfilAppareilReservationPublique(id, { etudiantNom, parentNom }) {
  await run(
    `
      UPDATE public_reservation_devices
      SET
        etudiant_nom = ?,
        parent_nom = ?,
        updated_at = CURRENT_TIMESTAMP,
        last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [etudiantNom, parentNom, id]
  );

  return trouverAppareilReservationPubliqueParId(id);
}

async function mettreAJourDerniereUtilisationAppareilReservationPublique(id) {
  await run(
    `
      UPDATE public_reservation_devices
      SET
        last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id]
  );
}

module.exports = {
  trouverAppareilReservationPubliqueParToken,
  creerAppareilReservationPublique,
  mettreAJourProfilAppareilReservationPublique,
  mettreAJourDerniereUtilisationAppareilReservationPublique,
};
