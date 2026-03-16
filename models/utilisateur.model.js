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

async function creerUtilisateur({ nom, email, motDePasse }) {
  return run(
    `
      INSERT INTO utilisateurs (nom, email, mot_de_passe)
      VALUES (?, ?, ?)
    `,
    [nom, email, motDePasse]
  );
}

module.exports = {
  trouverUtilisateurParEmail,
  trouverUtilisateurParId,
  creerUtilisateur,
};
