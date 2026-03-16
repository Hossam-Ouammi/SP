const { get, run } = require("./db");

async function trouverUtilisateurParEmail(email) {
  return get(
    `
      SELECT id, nom, email, mot_de_passe, session_version, doit_changer_mot_de_passe
      FROM utilisateurs
      WHERE email = ?
    `,
    [email]
  );
}

async function trouverUtilisateurParNomOuEmail(identifiant) {
  return get(
    `
      SELECT
        id,
        nom,
        email,
        mot_de_passe,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        echecs_connexion,
        premier_echec_connexion_at,
        bloque_jusqua,
        dernier_login_at,
        dernier_login_ip
      FROM utilisateurs
      WHERE lower(nom) = lower(?) OR lower(email) = lower(?)
    `,
    [identifiant, identifiant]
  );
}

async function trouverUtilisateurParId(id) {
  return get(
    `
      SELECT
        id,
        nom,
        email,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        dernier_login_at,
        dernier_login_ip
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
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        echecs_connexion,
        premier_echec_connexion_at,
        bloque_jusqua,
        dernier_login_at,
        dernier_login_ip
      FROM utilisateurs
      WHERE id = ?
    `,
    [id]
  );
}

async function creerUtilisateur({ nom, email, motDePasse }) {
  return run(
    `
      INSERT INTO utilisateurs (nom, email, mot_de_passe)
      VALUES (?, ?, ?)
    `,
    [nom, email, motDePasse]
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

module.exports = {
  trouverUtilisateurParEmail,
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  creerUtilisateur,
  mettreAJourMotDePasseUtilisateur,
  mettreAJourEtatConnexionReussie,
  mettreAJourEtatEchecConnexion,
};
