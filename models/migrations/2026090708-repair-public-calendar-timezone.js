const { validerFuseauCalendrierPublic } = require("../../utils/public-calendar-timezone");

function obtenirFuseauPublicHistorique() {
  return (
    validerFuseauCalendrierPublic(process.env.PUBLIC_RESERVATION_TIMEZONE) ||
    "Europe/Paris"
  );
}

module.exports = {
  version: "2026090708_repair_public_calendar_timezone",
  description:
    "Corrige sans écraser les choix explicites une ancienne reprise erronée du fuseau personnel",

  async up({ run, all }) {
    const fuseauPublicHistorique = obtenirFuseauPublicHistorique();

    // Une version de développement de 0707 avait, par erreur, copié
    // `utilisateurs.timezone` dans le fuseau public. On ne corrige que les
    // comptes dont la valeur publique est encore exactement cette valeur
    // personnelle et qui ne possèdent aucune trace d'un choix explicite dans
    // l'historique. Cela rend la réparation sûre pour les déploiements ayant
    // déjà exécuté cette version, sans écraser une préférence modifiée par UI.
    const candidats = await all(`
      SELECT u.id, u.timezone, u.public_calendar_timezone
      FROM utilisateurs u
      WHERE NOT EXISTS (
        SELECT 1
        FROM historique_actions h
        WHERE h.handler_id = u.id
          AND h.action_type = 'fuseau_calendrier_public_modifie'
      )
      ORDER BY u.id ASC
    `);

    for (const candidat of candidats) {
      const fuseauPersonnel = validerFuseauCalendrierPublic(candidat.timezone);
      const fuseauActuel = validerFuseauCalendrierPublic(
        candidat.public_calendar_timezone
      );

      if (
        !fuseauPersonnel ||
        fuseauActuel !== fuseauPersonnel ||
        fuseauActuel === fuseauPublicHistorique
      ) {
        continue;
      }

      await run(
        "UPDATE utilisateurs SET public_calendar_timezone = ? WHERE id = ?",
        [fuseauPublicHistorique, candidat.id]
      );
    }
  },
};
