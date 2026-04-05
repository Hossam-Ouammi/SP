const { get, run } = require("./db");

function normaliserEmailUtilisateur(email) {
  const emailNormalise = String(email || "").trim().toLowerCase();

  if (emailNormalise === "ami@test.com") {
    return "abdo@test.com";
  }

  return emailNormalise;
}

async function trouverUtilisateurParEmail(email) {
  const emailNormalise = normaliserEmailUtilisateur(email);
  return get(
    `
      SELECT
        id,
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire,
        created_at
      FROM utilisateurs
      WHERE email = ?
    `,
    [emailNormalise]
  );
}

async function trouverUtilisateurParNom(nom) {
  return get(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire,
        created_at
      FROM utilisateurs
      WHERE lower(nom) = lower(?)
    `,
    [nom]
  );
}

async function trouverUtilisateurParNomOuEmail(identifiant) {
  const identifiantNormalise = String(identifiant || "").trim();
  const emailNormalise = normaliserEmailUtilisateur(identifiantNormalise);

  return get(
    `
      SELECT
        id,
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        echecs_connexion,
        premier_echec_connexion_at,
        bloque_jusqua,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire
      FROM utilisateurs
      WHERE lower(nom) = lower(?) OR lower(email) = lower(?)
    `,
    [identifiantNormalise, emailNormalise]
  );
}

async function trouverUtilisateurParId(id) {
  return get(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire,
        created_at
      FROM utilisateurs
      WHERE id = ?
    `,
    [id]
  );
}

async function trouverUtilisateurAvecMotDePasseParId(id) {
  return get(
    `
      SELECT
        id,
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        echecs_connexion,
        premier_echec_connexion_at,
        bloque_jusqua,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire
      FROM utilisateurs
      WHERE id = ?
    `,
    [id]
  );
}

async function creerUtilisateur({
  nom,
  email,
  motDePasse,
  estAdmin = 0,
  accesActive = 1,
  modeLectureSeule = 0,
  peutVoirMonetisation = 0,
  peutVoirAujourdhui = 0,
  peutVoirIndisponibilites = 0,
  doitChangerMotDePasse = 1,
  tarifHoraire = 100,
}) {
  const emailNormalise = normaliserEmailUtilisateur(email);

  return run(
    `
      INSERT INTO utilisateurs (
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        doit_changer_mot_de_passe,
        tarif_horaire,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      nom,
      emailNormalise,
      motDePasse,
      estAdmin ? 1 : 0,
      accesActive ? 1 : 0,
      modeLectureSeule ? 1 : 0,
      peutVoirMonetisation ? 1 : 0,
      peutVoirAujourdhui ? 1 : 0,
      peutVoirIndisponibilites ? 1 : 0,
      doitChangerMotDePasse ? 1 : 0,
      tarifHoraire,
    ]
  );
}

async function mettreAJourMotDePasseUtilisateur(id, motDePasseHash) {
  return run(
    `
      UPDATE utilisateurs
      SET
        mot_de_passe = ?,
        session_version = session_version + 1,
        doit_changer_mot_de_passe = 0,
        mot_de_passe_change_at = CURRENT_TIMESTAMP,
        echecs_connexion = 0,
        premier_echec_connexion_at = NULL,
        bloque_jusqua = NULL
      WHERE id = ?
    `,
    [motDePasseHash, id]
  );
}

async function reinitialiserMotDePasseUtilisateur(id, motDePasseHash) {
  return run(
    `
      UPDATE utilisateurs
      SET
        mot_de_passe = ?,
        session_version = session_version + 1,
        doit_changer_mot_de_passe = 1,
        mot_de_passe_change_at = NULL,
        echecs_connexion = 0,
        premier_echec_connexion_at = NULL,
        bloque_jusqua = NULL
      WHERE id = ?
    `,
    [motDePasseHash, id]
  );
}

async function mettreAJourEtatConnexionReussie(id, adresseIp) {
  return run(
    `
      UPDATE utilisateurs
      SET
        echecs_connexion = 0,
        premier_echec_connexion_at = NULL,
        bloque_jusqua = NULL,
        dernier_login_at = CURRENT_TIMESTAMP,
        dernier_login_ip = ?
      WHERE id = ?
    `,
    [adresseIp, id]
  );
}

async function mettreAJourEtatEchecConnexion(
  id,
  { echecsConnexion, premierEchecConnexionAt, bloqueJusqua }
) {
  return run(
    `
      UPDATE utilisateurs
      SET
        echecs_connexion = ?,
        premier_echec_connexion_at = ?,
        bloque_jusqua = ?
      WHERE id = ?
    `,
    [echecsConnexion, premierEchecConnexionAt, bloqueJusqua, id]
  );
}
async function listerCompteUtilisateurs() {
  const { all } = require("./db");
  return all(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        tarif_horaire,
        created_at
      FROM utilisateurs
      ORDER BY id ASC
    `
  );
}
module.exports = {
  normaliserEmailUtilisateur,
  trouverUtilisateurParEmail,
  trouverUtilisateurParNom,
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  creerUtilisateur,
  mettreAJourMotDePasseUtilisateur,
  reinitialiserMotDePasseUtilisateur,
  mettreAJourEtatConnexionReussie,
  mettreAJourEtatEchecConnexion,
  listerCompteUtilisateurs,
};
