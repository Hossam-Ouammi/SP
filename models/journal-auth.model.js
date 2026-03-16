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

module.exports = {
  enregistrerEvenementAuth,
};
