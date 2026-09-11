const crypto = require("crypto");

const { all, get } = require("./db");
const { PUBLIC_CALENDAR_TOKEN_BYTES } = require("../config/public-calendar.config");
const { recupererSecretSession } = require("./session-secret");

const FORMAT_JETON_CALENDRIER_PUBLIC = /^[A-Za-z0-9_-]{32,160}$/;

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function normaliserJetonCalendrierPublic(valeur) {
  const jeton = String(valeur || "").trim();
  return FORMAT_JETON_CALENDRIER_PUBLIC.test(jeton) ? jeton : null;
}

function genererJetonCalendrierPublic() {
  return crypto.randomBytes(PUBLIC_CALENDAR_TOKEN_BYTES).toString("base64url");
}

function hacherJetonCalendrierPublic(jeton) {
  const jetonNormalise = normaliserJetonCalendrierPublic(jeton);

  if (!jetonNormalise) {
    return null;
  }

  return crypto.createHash("sha256").update(jetonNormalise).digest("hex");
}

function hachagesEgaux(hachageA, hachageB) {
  const valeurA = Buffer.from(String(hachageA || ""), "utf8");
  const valeurB = Buffer.from(String(hachageB || ""), "utf8");

  return (
    valeurA.length === valeurB.length &&
    valeurA.length > 0 &&
    crypto.timingSafeEqual(valeurA, valeurB)
  );
}

function creerJetonCalendrierPublic() {
  const token = genererJetonCalendrierPublic();

  return {
    token,
    tokenHash: hacherJetonCalendrierPublic(token),
  };
}

/**
 * The public URL must remain copyable after a page reload without keeping its
 * raw bearer token in SQLite. A domain-separated HMAC gives each Handler one
 * opaque, stable token; the database still stores only its SHA-256 hash.
 */
function creerJetonCalendrierPublicStable(handlerId) {
  const id = normaliserIdentifiant(handlerId);

  if (!id) {
    return null;
  }

  return crypto
    .createHmac("sha256", recupererSecretSession())
    .update(`gestion-seances:public-calendar:v1:${id}`)
    .digest("base64url");
}

function jetonCalendrierPublicStableCorrespond(handlerId, tokenHash) {
  const token = creerJetonCalendrierPublicStable(handlerId);
  const hashAttendu = hacherJetonCalendrierPublic(token);

  return Boolean(hashAttendu && hachagesEgaux(tokenHash, hashAttendu));
}

async function trouverHandlerCalendrierPublicParToken(token) {
  const tokenHash = hacherJetonCalendrierPublic(token);

  if (!tokenHash) {
    return null;
  }

  const handler = await get(
    `
      SELECT
        utilisateurs.id,
        utilisateurs.public_calendar_timezone,
        utilisateurs.calendar_start_time,
        utilisateurs.calendar_end_time,
        utilisateurs.token_calendrier_public_hash
      FROM utilisateurs
      WHERE utilisateurs.token_calendrier_public_hash = ?
        AND COALESCE(utilisateurs.calendrier_public_actif, 0) = 1
        AND lower(COALESCE(utilisateurs.statut_compte, 'active')) = 'active'
        AND COALESCE(utilisateurs.acces_active, 1) = 1
        AND EXISTS (
          SELECT 1
          FROM utilisateur_roles
          WHERE utilisateur_roles.utilisateur_id = utilisateurs.id
            AND utilisateur_roles.role = 'handler'
        )
      LIMIT 1
    `,
    [tokenHash]
  );

  if (!handler || !hachagesEgaux(handler.token_calendrier_public_hash, tokenHash)) {
    return null;
  }

  return {
    id: normaliserIdentifiant(handler.id),
    public_calendar_timezone: String(handler.public_calendar_timezone || "").trim(),
    calendar_start_time: String(handler.calendar_start_time || "").trim(),
    calendar_end_time: String(handler.calendar_end_time || "").trim(),
  };
}

async function listerIntervenantsActifsHandler(handlerId) {
  const id = normaliserIdentifiant(handlerId);

  if (!id) {
    return [];
  }

  // Le nom est historique : le Handler n'est jamais retourne ici, meme s'il
  // possede egalement le role professeur dans des donnees anciennes.
  const intervenants = await all(
    `
      SELECT DISTINCT utilisateurs.id
      FROM rattachements_professeurs
      INNER JOIN utilisateurs
        ON utilisateurs.id = rattachements_professeurs.professeur_id
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'professeur'
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.professeur_id <> ?
        AND rattachements_professeurs.actif = 1
        AND COALESCE(utilisateurs.acces_active, 1) = 1
        AND lower(COALESCE(utilisateurs.statut_compte, 'active')) = 'active'
      ORDER BY utilisateurs.id ASC
    `,
    [id, id]
  );

  return intervenants.map((intervenant) => normaliserIdentifiant(intervenant.id)).filter(Boolean);
}

async function listerPlagesIndisponiblesCalendrierPublic({
  handlerId,
  dateDebut,
  dateFin,
}) {
  const id = normaliserIdentifiant(handlerId);

  if (!id || !dateDebut || !dateFin) {
    return [];
  }

  // La provenance d'un blocage (seance ou indisponibilite) est volontairement
  // effacee ici. Le calendrier public ne lit que les plages des professeurs
  // actifs rattaches : les anciennes donnees du Handler ne doivent jamais
  // changer la disponibilite annoncee aux clients.
  return all(
    `
      WITH professeurs_actifs AS (
        SELECT DISTINCT rattachements_professeurs.professeur_id AS intervenant_id
        FROM rattachements_professeurs
        INNER JOIN utilisateurs
          ON utilisateurs.id = rattachements_professeurs.professeur_id
        INNER JOIN utilisateur_roles
          ON utilisateur_roles.utilisateur_id = utilisateurs.id
          AND utilisateur_roles.role = 'professeur'
        WHERE rattachements_professeurs.handler_id = ?
          AND rattachements_professeurs.professeur_id <> ?
          AND rattachements_professeurs.actif = 1
          AND COALESCE(utilisateurs.acces_active, 1) = 1
          AND lower(COALESCE(utilisateurs.statut_compte, 'active')) = 'active'
      )
      SELECT
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        intervenant_id
      FROM (
        SELECT
          seances.date AS date,
          seances.heure_debut AS heure_debut,
          seances.heure_fin AS heure_fin,
          0 AS jour_complet,
          seances.intervenant_id AS intervenant_id
        FROM seances
        INNER JOIN professeurs_actifs
          ON professeurs_actifs.intervenant_id = seances.intervenant_id
        WHERE seances.handler_id = ?
          AND seances.date BETWEEN ? AND ?
          AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'

        UNION

        SELECT
          indisponibilites.date AS date,
          indisponibilites.heure_debut AS heure_debut,
          indisponibilites.heure_fin AS heure_fin,
          COALESCE(indisponibilites.jour_complet, 0) AS jour_complet,
          indisponibilites.intervenant_id AS intervenant_id
        FROM indisponibilites
        INNER JOIN professeurs_actifs
          ON professeurs_actifs.intervenant_id = indisponibilites.intervenant_id
        WHERE indisponibilites.handler_id = ?
          AND indisponibilites.date BETWEEN ? AND ?
      )
      ORDER BY date ASC, jour_complet DESC, heure_debut ASC, heure_fin ASC
    `,
    [id, id, id, dateDebut, dateFin, id, dateDebut, dateFin]
  );
}

module.exports = {
  normaliserJetonCalendrierPublic,
  genererJetonCalendrierPublic,
  hacherJetonCalendrierPublic,
  hachagesEgaux,
  creerJetonCalendrierPublic,
  creerJetonCalendrierPublicStable,
  jetonCalendrierPublicStableCorrespond,
  trouverHandlerCalendrierPublicParToken,
  listerIntervenantsActifsHandler,
  listerPlagesIndisponiblesCalendrierPublic,
};
