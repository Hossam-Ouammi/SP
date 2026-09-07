const {
  FUSEAU_PUBLIC_PAR_DEFAUT,
  validerFuseauCalendrierPublic,
} = require("../../utils/public-calendar-timezone");

async function colonneExiste(all, table, colonne) {
  const colonnes = await all(`PRAGMA table_info(${table})`);
  return colonnes.some((entree) => entree.name === colonne);
}

module.exports = {
  version: "2026090707_public_calendar_timezone",
  description:
    "Fuseau de représentation du calendrier public séparé des heures métier centrales",

  async up({ run, all }) {
    const colonneAjoutee = !(await colonneExiste(
      all,
      "utilisateurs",
      "public_calendar_timezone"
    ));
    if (colonneAjoutee) {
      await run(
        `
          ALTER TABLE utilisateurs
          ADD COLUMN public_calendar_timezone TEXT NOT NULL DEFAULT '${FUSEAU_PUBLIC_PAR_DEFAUT}'
        `
      );
    }

    // Les déploiements antérieurs utilisaient `timezone` pour le calendrier
    // public. Nous copions donc une zone IANA valide telle quelle afin de
    // préserver l'affichage existant. Les nouveaux choix courts GMT/GMT+1/GMT+2
    // sont, eux, des décalages explicites appliqués après le calcul central.
    const utilisateurs = await all(`
      SELECT id, timezone, public_calendar_timezone
      FROM utilisateurs
      ORDER BY id ASC
    `);

    for (const utilisateur of utilisateurs) {
      const actuel = validerFuseauCalendrierPublic(utilisateur.public_calendar_timezone);
      const herite = validerFuseauCalendrierPublic(utilisateur.timezone);
      // Après `ALTER TABLE ... DEFAULT 'GMT'`, `actuel` vaut forcément GMT
      // pour les lignes déjà présentes. Il ne faut donc pas le laisser
      // masquer leur ancienne zone IANA lors de la première migration.
      const fuseau = colonneAjoutee
        ? herite || FUSEAU_PUBLIC_PAR_DEFAUT
        : actuel || herite || FUSEAU_PUBLIC_PAR_DEFAUT;

      if (String(utilisateur.public_calendar_timezone || "").trim() !== fuseau) {
        await run(
          "UPDATE utilisateurs SET public_calendar_timezone = ? WHERE id = ?",
          [fuseau, utilisateur.id]
        );
      }
    }
  },
};
