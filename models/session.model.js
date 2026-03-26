const { all, run, get } = require("./db");

async function listerToutesLesSessions() {
  return all(`
    SELECT
      sid,
      sess,
      expires_at,
      created_at,
      updated_at
    FROM sessions
    ORDER BY expires_at DESC
  `);
}

async function trouverSessionParId(sid) {
  return get(`SELECT * FROM sessions WHERE sid = ?`, [sid]);
}

async function supprimerSession(sid) {
  return run(`DELETE FROM sessions WHERE sid = ?`, [sid]);
}

async function supprimerSessionsUtilisateur(utilisateurId) {
  // Cette approche depend de la structure du JSON dans 'sess'
  // SQLite ne traite pas nativement le JSON dans cette version sans extension specific.
  // On va utiliser LIKE pour trouver l'ID de l'utilisateur dans le chaine JSON.
  const motif = `%"id":${utilisateurId}%`;
  return run(`DELETE FROM sessions WHERE sess LIKE ?`, [motif]);
}

async function compterSessionsActives() {
  const resultat = await get(`SELECT COUNT(*) AS total FROM sessions WHERE expires_at > ?`, [
    Date.now(),
  ]);
  return resultat?.total || 0;
}

module.exports = {
  listerToutesLesSessions,
  trouverSessionParId,
  supprimerSession,
  supprimerSessionsUtilisateur,
  compterSessionsActives,
};
