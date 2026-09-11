const crypto = require("crypto");
const { recupererSecretSession } = require("../session-secret");

function creerJetonCalendrierPublicStable(handlerId) {
  const id = Number(handlerId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return crypto
    .createHmac("sha256", recupererSecretSession())
    .update(`gestion-seances:public-calendar:v1:${id}`)
    .digest("base64url");
}

function hacherJetonCalendrierPublic(token) {
  if (!token) {
    return null;
  }

  return crypto.createHash("sha256").update(token).digest("hex");
}

async function colonnesTable(all, table) {
  try {
    return await all(`PRAGMA table_info(${table})`);
  } catch (erreur) {
    return [];
  }
}

module.exports = {
  version: "2026090801_public_calendar_stable_link",
  description:
    "Lien public stable par Handler, offsets GMT+1 a GMT+4 et fin de calendrier a 23:30 maximum",

  async up({ run, all }) {
    const colonnesUtilisateurs = await colonnesTable(all, "utilisateurs");
    const noms = new Set(colonnesUtilisateurs.map((colonne) => colonne.name));

    if (noms.size === 0) {
      return;
    }

    // New central-calendar contract: midnight is never a saved end marker.
    if (noms.has("calendar_end_time")) {
      await run(
        `
          UPDATE utilisateurs
          SET calendar_end_time = '23:30'
          WHERE trim(COALESCE(calendar_end_time, '')) IN ('00:00', '24:00')
        `
      );
    }

    // The UI now offers only GMT+1 through GMT+4. Existing GMT records get
    // the first explicit client-facing offset once, without changing central
    // dates or session times.
    if (noms.has("public_calendar_timezone")) {
      await run(
        `
          UPDATE utilisateurs
          SET public_calendar_timezone = 'GMT+1'
          WHERE trim(COALESCE(public_calendar_timezone, '')) = 'GMT'
        `
      );
    }

    if (!noms.has("token_calendrier_public_hash")) {
      return;
    }

    const colonnesRoles = await colonnesTable(all, "utilisateur_roles");
    if (!colonnesRoles.some((colonne) => colonne.name === "utilisateur_id")) {
      return;
    }

    // Only migrate links that already existed. A Handler who has never
    // published remains unpublished until clicking Enregistrer.
    const handlers = await all(
      `
        SELECT DISTINCT utilisateurs.id
        FROM utilisateurs
        INNER JOIN utilisateur_roles
          ON utilisateur_roles.utilisateur_id = utilisateurs.id
          AND utilisateur_roles.role = 'handler'
        WHERE trim(COALESCE(utilisateurs.token_calendrier_public_hash, '')) <> ''
        ORDER BY utilisateurs.id ASC
      `
    );

    for (const handler of handlers) {
      const token = creerJetonCalendrierPublicStable(handler.id);
      const tokenHash = hacherJetonCalendrierPublic(token);
      if (tokenHash) {
        await run(
          "UPDATE utilisateurs SET token_calendrier_public_hash = ? WHERE id = ?",
          [tokenHash, handler.id]
        );
      }
    }
  },
};
