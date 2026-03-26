const { run } = require("./db");

async function enregistrerEvenementAuth({
  utilisateurId = null,
  identifiant = "",
  actionType,
  resultat,
  adresseIp = null,
  userAgent = null,
  details = null,
}) {
  return run(
    `
      INSERT INTO journal_auth (
        utilisateur_id,
        identifiant,
        action_type,
        resultat,
        adresse_ip,
        user_agent,
        details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      utilisateurId,
      String(identifiant || "").slice(0, 190),
      String(actionType || "").slice(0, 80),
      String(resultat || "").slice(0, 80),
      adresseIp ? String(adresseIp).slice(0, 80) : null,
      userAgent ? String(userAgent).slice(0, 400) : null,
      details ? JSON.stringify(details) : null,
    ]
  );
}

async function listerJournalAuth(limite = 200) {
  const { all } = require("./db");
  return all(
    `
      SELECT
        journal_auth.*,
        utilisateurs.nom AS utilisateur_nom,
        utilisateurs.email AS utilisateur_email
      FROM journal_auth
      LEFT JOIN utilisateurs ON utilisateurs.id = journal_auth.utilisateur_id
      ORDER BY journal_auth.created_at DESC
      LIMIT ?
    `,
    [limite]
  );
}

async function supprimerAncienJournal(jours = 30) {
  const { run } = require("./db");
  return run(
    `
      DELETE FROM journal_auth
      WHERE created_at < DATETIME('now', ?)
    `,
    [`-${jours} days`]
  );
}

module.exports = {
  enregistrerEvenementAuth,
  listerJournalAuth,
  supprimerAncienJournal,
};
