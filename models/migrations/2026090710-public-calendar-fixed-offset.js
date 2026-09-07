const { validerOffsetCalendrierPublic } = require("../../utils/public-calendar-timezone");

const OFFSET_PAR_DEFAUT = "GMT";

module.exports = {
  version: "2026090710_public_calendar_fixed_offset",
  description:
    "Normalise le calendrier public vers les offsets fixes GMT, GMT+1 et GMT+2",

  async up({ run, all }) {
    const colonnes = await all("PRAGMA table_info(utilisateurs)");
    if (!colonnes.some((colonne) => colonne.name === "public_calendar_timezone")) {
      return;
    }

    const utilisateurs = await all(
      "SELECT id, public_calendar_timezone FROM utilisateurs ORDER BY id ASC"
    );

    for (const utilisateur of utilisateurs) {
      const offset = validerOffsetCalendrierPublic(utilisateur.public_calendar_timezone);
      if (offset) {
        continue;
      }

      // Une ancienne zone IANA n'a pas d'équivalence sûre avec un offset
      // constant (Europe/Paris vaut tantôt +1, tantôt +2). Le nouveau contrat
      // explicite choisit donc GMT = horloge centrale + 0, sans conversion
      // géographique implicite.
      await run(
        "UPDATE utilisateurs SET public_calendar_timezone = ? WHERE id = ?",
        [OFFSET_PAR_DEFAUT, utilisateur.id]
      );
    }
  },
};
