const { get, run } = require("./db");

async function trouverUtilisateurParEmail(email) {
  return get(
    `
      SELECT id, nom, email, mot_de_passe
      FROM utilisateurs
      WHERE email = ?
    `,
    [email]
  );
}

async function trouverUtilisateurParNomOuEmail(identifiant) {
  return get(
    `
      SELECT id, nom, email, mot_de_passe
      FROM utilisateurs
      WHERE lower(nom) = lower(?) OR lower(email) = lower(?)
    `,
    [identifiant, identifiant]
  );
}

async function trouverUtilisateurParId(id) {
  return get(
    `
      SELECT id, nom, email
      FROM utilisateurs
      WHERE id = ?
    `,
    [id]
  );
}

async function trouverUtilisateurAvecMotDePasseParId(id) {
  return get(
    `
      SELECT id, nom, email, mot_de_passe
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
      SET mot_de_passe = ?
      WHERE id = ?
    `,
    [motDePasseHash, id]
  );
}

module.exports = {
  trouverUtilisateurParEmail,
  trouverUtilisateurParNomOuEmail,
  trouverUtilisateurParId,
  trouverUtilisateurAvecMotDePasseParId,
  creerUtilisateur,
  mettreAJourMotDePasseUtilisateur,
};
