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
        utilisateurs.public_id,
        utilisateurs.nom,
        utilisateurs.calendrier_public_actif,
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
    public_id: String(handler.public_id || "").trim() || null,
    nom: String(handler.nom || "").trim(),
    calendrier_public_actif: Number(handler.calendrier_public_actif || 0),
    public_calendar_timezone: String(handler.public_calendar_timezone || "").trim(),
    calendar_start_time: String(handler.calendar_start_time || "").trim(),
    calendar_end_time: String(handler.calendar_end_time || "").trim(),
  };
}

async function trouverMembreCalendrierPublicParPublicId(publicId) {
  const idPublic = String(publicId || "").trim().toUpperCase();
  // Public ids are generated for every active account, including a
  // SuperAdmin-only account. The URL remains a lookup key only; it does not
  // grant access to private information.
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(idPublic)) {
    return null;
  }

  return get(
    `
      SELECT id, public_id, nom, calendrier_public_actif, public_calendar_timezone,
             calendar_start_time, calendar_end_time
      FROM utilisateurs
      WHERE upper(public_id) = ?
        AND lower(COALESCE(statut_compte, 'active')) = 'active'
        AND COALESCE(acces_active, 1) = 1
      LIMIT 1
    `,
    [idPublic]
  );
}

async function listerPlagesIndisponiblesMembre({ intervenantId, dateDebut, dateFin }) {
  const id = normaliserIdentifiant(intervenantId);
  if (!id || !dateDebut || !dateFin) {
    return [];
  }

  // Aucune information metier privee ne quitte cette requete. Une seance de
  // n'importe quelle equipe et toute indisponibilite personnelle produisent
  // uniquement une plage bloquee.
  return all(
    `
      SELECT date, heure_debut, heure_fin, jour_complet, intervenant_id
      FROM (
        SELECT date, heure_debut, heure_fin, 0 AS jour_complet, intervenant_id
        FROM seances
        WHERE intervenant_id = ? AND date BETWEEN ? AND ?
          AND COALESCE(statut_seance, 'planifiee') <> 'annulee'
        UNION
        SELECT date, heure_debut, heure_fin,
               COALESCE(jour_complet, 0) AS jour_complet, intervenant_id
        FROM indisponibilites
        WHERE intervenant_id = ? AND date BETWEEN ? AND ?
      )
      ORDER BY date ASC, jour_complet DESC, heure_debut ASC, heure_fin ASC
    `,
    [id, dateDebut, dateFin, id, dateDebut, dateFin]
  );
}

async function listerCalendriersPersonnelsPourUtilisateur(utilisateurId, estHandler = false) {
  const id = normaliserIdentifiant(utilisateurId);
  if (!id) return { personnel: null, equipe: [], equipes: [] };

  const personnel = await get(
    `SELECT id, public_id, nom, calendrier_public_actif, public_calendar_timezone
     FROM utilisateurs WHERE id = ?`,
    [id]
  );
  const equipe = estHandler
    ? await all(
        `SELECT DISTINCT u.id, u.public_id, u.nom, u.calendrier_public_actif,
                         u.public_calendar_timezone
         FROM rattachements_professeurs rp
         INNER JOIN utilisateurs u ON u.id = rp.professeur_id
         WHERE rp.handler_id = ? AND rp.actif = 1
           AND u.id <> ? AND u.acces_active = 1 AND u.statut_compte = 'active'
         ORDER BY u.nom COLLATE NOCASE`,
        [id, id]
      )
    : [];
  const equipes = await all(
    `SELECT DISTINCT h.id, h.public_id, h.nom
     FROM rattachements_professeurs rp
     INNER JOIN utilisateurs h ON h.id = rp.handler_id
     WHERE rp.professeur_id = ? AND rp.actif = 1
       AND h.acces_active = 1 AND h.statut_compte = 'active'
     ORDER BY h.nom COLLATE NOCASE`,
    [id]
  );
  return { personnel, equipe, equipes };
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
  trouverMembreCalendrierPublicParPublicId,
  listerPlagesIndisponiblesMembre,
  listerCalendriersPersonnelsPourUtilisateur,
  listerIntervenantsActifsHandler,
  listerPlagesIndisponiblesCalendrierPublic,
};
