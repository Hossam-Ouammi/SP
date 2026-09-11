const crypto = require("crypto");

const { all, get, run, executerTransactionImmediate } = require("./db");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const DELIVERY_TYPES = new Set(["handler", "admin"]);
const DELIVERY_STATUSES = new Set(["sending", "sent", "failed"]);

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserEmailBackup(valeur) {
  const email = String(valeur || "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_REGEX.test(email) ? email : "";
}

function normaliserTypeBackup(valeur) {
  const type = String(valeur || "").trim().toLowerCase();
  return DELIVERY_TYPES.has(type) ? type : "";
}

function normaliserCle(valeur, longueurMax = 200) {
  return String(valeur || "").trim().slice(0, longueurMax);
}

function creerJetonTentative() {
  return crypto.randomBytes(18).toString("base64url");
}

const projectionSeancesBackup = `
  seances.date,
  seances.heure_debut,
  seances.heure_fin,
  seances.duree_minutes,
  seances.statut_seance,
  seances.etudiant,
  seances.parent,
  seances.matiere,
  seances.titre,
  seances.est_essai,
  seances.prix,
  seances.statut_paiement,
  seances.tarif_horaire_applique,
  intervenant.nom AS intervenant_nom,
  intervenant.public_id AS intervenant_public_id,
  handler.nom AS handler_nom,
  handler.public_id AS handler_public_id
`;

async function listerHandlersActifsPourBackup() {
  const lignes = await all(`
    SELECT DISTINCT utilisateurs.id, utilisateurs.public_id, utilisateurs.nom, utilisateurs.email
    FROM utilisateurs
    INNER JOIN utilisateur_roles
      ON utilisateur_roles.utilisateur_id = utilisateurs.id
      AND utilisateur_roles.role = 'handler'
    WHERE utilisateurs.acces_active = 1
      AND lower(COALESCE(utilisateurs.statut_compte, 'active')) = 'active'
    ORDER BY lower(utilisateurs.public_id) ASC, utilisateurs.id ASC
  `);

  return lignes
    .map((ligne) => ({ ...ligne, email: normaliserEmailBackup(ligne.email) }))
    .filter((ligne) => Boolean(ligne.email));
}

async function listerSuperAdminsActifsPourBackup() {
  const lignes = await all(`
    SELECT DISTINCT utilisateurs.id, utilisateurs.public_id, utilisateurs.nom, utilisateurs.email
    FROM utilisateurs
    INNER JOIN utilisateur_roles
      ON utilisateur_roles.utilisateur_id = utilisateurs.id
      AND utilisateur_roles.role = 'super_admin'
    WHERE utilisateurs.acces_active = 1
      AND lower(COALESCE(utilisateurs.statut_compte, 'active')) = 'active'
    ORDER BY lower(utilisateurs.public_id) ASC, utilisateurs.id ASC
  `);

  return lignes
    .map((ligne) => ({ ...ligne, email: normaliserEmailBackup(ligne.email) }))
    .filter((ligne) => Boolean(ligne.email));
}

async function listerSeancesBackupHandler(handlerId) {
  const id = normaliserIdentifiant(handlerId);

  if (!id) {
    return [];
  }

  return all(
    `
      SELECT ${projectionSeancesBackup}
      FROM seances
      LEFT JOIN utilisateurs AS intervenant ON intervenant.id = seances.intervenant_id
      LEFT JOIN utilisateurs AS handler ON handler.id = seances.handler_id
      WHERE seances.handler_id = ?
      ORDER BY seances.date ASC, seances.heure_debut ASC, seances.id ASC
    `,
    [id]
  );
}

async function listerSeancesBackupGlobal() {
  return all(`
    SELECT ${projectionSeancesBackup}
    FROM seances
    LEFT JOIN utilisateurs AS intervenant ON intervenant.id = seances.intervenant_id
    LEFT JOIN utilisateurs AS handler ON handler.id = seances.handler_id
    ORDER BY seances.date ASC, seances.heure_debut ASC, seances.id ASC
  `);
}

function livraisonEstEnvoyee(livraison) {
  return String(livraison?.status || "").toLowerCase() === "sent";
}

function livraisonEnCoursEtRecente(livraison, staleMs) {
  if (String(livraison?.status || "").toLowerCase() !== "sending") {
    return false;
  }

  const valeur = String(livraison?.started_at || "").trim();
  const startedAt = Date.parse(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(valeur)
      ? `${valeur.replace(" ", "T")}Z`
      : valeur
  );
  return Number.isFinite(startedAt) && Date.now() - startedAt < staleMs;
}

/**
 * Atomically reserves one recipient/occurrence. A stale process can be
 * recovered, while a confirmed delivery remains immutable for its slot.
 */
async function reserverLivraisonBackup({
  backupType,
  scopeKey,
  handlerId = null,
  recipientEmail,
  occurrenceKey,
  sessionCount = 0,
  staleMs = 60 * 60 * 1000,
}) {
  const type = normaliserTypeBackup(backupType);
  const scope = normaliserCle(scopeKey);
  const destinataire = normaliserEmailBackup(recipientEmail);
  const occurrence = normaliserCle(occurrenceKey);
  const handler = handlerId === null ? null : normaliserIdentifiant(handlerId);
  const nombreSeances = Math.max(Math.floor(Number(sessionCount) || 0), 0);

  if (!type || !scope || !destinataire || !occurrence) {
    throw new Error("Contexte de livraison de sauvegarde invalide.");
  }

  return executerTransactionImmediate(async () => {
    const existante = await get(
      `
        SELECT id, status, started_at, attempt_count
        FROM backup_email_deliveries
        WHERE backup_type = ?
          AND scope_key = ?
          AND recipient_email = ?
          AND occurrence_key = ?
        LIMIT 1
      `,
      [type, scope, destinataire, occurrence]
    );

    if (livraisonEstEnvoyee(existante)) {
      return { reservee: false, raison: "already-sent", livraisonId: existante.id };
    }

    if (livraisonEnCoursEtRecente(existante, staleMs)) {
      return { reservee: false, raison: "already-sending", livraisonId: existante.id };
    }

    const attemptToken = creerJetonTentative();

    if (existante) {
      await run(
        `
          UPDATE backup_email_deliveries
          SET
            handler_id = ?,
            status = 'sending',
            session_count = ?,
            attempt_count = attempt_count + 1,
            attempt_token = ?,
            message_id = NULL,
            last_error_code = NULL,
            started_at = CURRENT_TIMESTAMP,
            delivered_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [handler, nombreSeances, attemptToken, existante.id]
      );

      return {
        reservee: true,
        livraisonId: existante.id,
        attemptToken,
        reprise: true,
      };
    }

    const insertion = await run(
      `
        INSERT INTO backup_email_deliveries (
          backup_type,
          scope_key,
          handler_id,
          recipient_email,
          occurrence_key,
          status,
          session_count,
          attempt_count,
          attempt_token
        )
        VALUES (?, ?, ?, ?, ?, 'sending', ?, 1, ?)
      `,
      [type, scope, handler, destinataire, occurrence, nombreSeances, attemptToken]
    );

    return {
      reservee: true,
      livraisonId: insertion.id,
      attemptToken,
      reprise: false,
    };
  });
}

async function terminerLivraisonBackup({ livraisonId, attemptToken, messageId = null }) {
  const id = normaliserIdentifiant(livraisonId);
  const token = normaliserCle(attemptToken, 120);

  if (!id || !token) {
    return { changes: 0 };
  }

  return run(
    `
      UPDATE backup_email_deliveries
      SET
        status = 'sent',
        message_id = ?,
        last_error_code = NULL,
        delivered_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND attempt_token = ?
        AND status = 'sending'
    `,
    [normaliserCle(messageId, 300) || null, id, token]
  );
}

async function echouerLivraisonBackup({ livraisonId, attemptToken, errorCode }) {
  const id = normaliserIdentifiant(livraisonId);
  const token = normaliserCle(attemptToken, 120);
  const code = normaliserCle(errorCode, 100) || "send-failed";

  if (!id || !token) {
    return { changes: 0 };
  }

  return run(
    `
      UPDATE backup_email_deliveries
      SET
        status = 'failed',
        last_error_code = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND attempt_token = ?
        AND status = 'sending'
    `,
    [code, id, token]
  );
}

async function nettoyerLivraisonsBackup({ retentionDays = 180, now = new Date() } = {}) {
  const jours = Math.max(Math.floor(Number(retentionDays) || 0), 0);

  if (jours <= 0 || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { changes: 0 };
  }

  const seuil = new Date(now.getTime() - jours * 24 * 60 * 60 * 1000).toISOString();
  return run(
    `
      DELETE FROM backup_email_deliveries
      WHERE julianday(updated_at) < julianday(?)
        AND status IN ('sent', 'failed')
    `,
    [seuil]
  );
}

module.exports = {
  normaliserEmailBackup,
  listerHandlersActifsPourBackup,
  listerSuperAdminsActifsPourBackup,
  listerSeancesBackupHandler,
  listerSeancesBackupGlobal,
  reserverLivraisonBackup,
  terminerLivraisonBackup,
  echouerLivraisonBackup,
  nettoyerLivraisonsBackup,
};
