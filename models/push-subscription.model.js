const { all, get, run } = require("./db");

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserEndpoint(endpoint) {
  return normaliserTexte(endpoint);
}

function normaliserSubscriptionPush(subscription) {
  const endpoint = normaliserEndpoint(subscription?.endpoint);
  const p256dh = normaliserTexte(subscription?.keys?.p256dh);
  const auth = normaliserTexte(subscription?.keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    p256dh,
    auth,
    expiration_time:
      subscription?.expirationTime === null || subscription?.expirationTime === undefined
        ? null
        : String(subscription.expirationTime),
  };
}

function construireAbonnementNavigateur(row) {
  if (!row?.endpoint || !row?.p256dh || !row?.auth) {
    return null;
  }

  return {
    endpoint: row.endpoint,
    expirationTime: row.expiration_time ? Number(row.expiration_time) : null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function enregistrerOuMettreAJourAbonnementPush({
  utilisateurId,
  subscription,
  deviceLabel,
  userAgent,
}) {
  const abonnement = normaliserSubscriptionPush(subscription);

  if (!Number.isInteger(Number(utilisateurId)) || Number(utilisateurId) <= 0 || !abonnement) {
    throw new Error("Abonnement push invalide.");
  }

  await run(
    `
      INSERT INTO push_subscriptions (
        utilisateur_id,
        endpoint,
        p256dh,
        auth,
        expiration_time,
        device_label,
        user_agent,
        actif,
        updated_at,
        last_used_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint) DO UPDATE SET
        utilisateur_id = excluded.utilisateur_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        device_label = excluded.device_label,
        user_agent = excluded.user_agent,
        actif = 1,
        updated_at = CURRENT_TIMESTAMP,
        last_used_at = CURRENT_TIMESTAMP
    `,
    [
      Number(utilisateurId),
      abonnement.endpoint,
      abonnement.p256dh,
      abonnement.auth,
      abonnement.expiration_time,
      normaliserTexte(deviceLabel),
      normaliserTexte(userAgent).slice(0, 400),
    ]
  );

  return trouverAbonnementPushParEndpoint(abonnement.endpoint);
}

async function trouverAbonnementPushParEndpoint(endpoint) {
  return get(
    `
      SELECT *
      FROM push_subscriptions
      WHERE endpoint = ?
    `,
    [normaliserEndpoint(endpoint)]
  );
}

async function trouverAbonnementPushActifUtilisateurParEndpoint(utilisateurId, endpoint) {
  return get(
    `
      SELECT *
      FROM push_subscriptions
      WHERE utilisateur_id = ? AND endpoint = ? AND actif = 1
    `,
    [Number(utilisateurId), normaliserEndpoint(endpoint)]
  );
}

async function desactiverAbonnementPushParEndpoint(endpoint) {
  return run(
    `
      UPDATE push_subscriptions
      SET actif = 0, updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = ?
    `,
    [normaliserEndpoint(endpoint)]
  );
}

async function desactiverAbonnementPushParId(id) {
  return run(
    `
      UPDATE push_subscriptions
      SET actif = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [Number(id)]
  );
}

async function listerAbonnementsPushActifs() {
  return all(
    `
      SELECT
        push_subscriptions.*,
        utilisateurs.nom AS utilisateur_nom,
        utilisateurs.email AS utilisateur_email,
        utilisateurs.est_admin,
        utilisateurs.acces_active,
        utilisateurs.mode_lecture_seule,
        utilisateurs.peut_voir_aujourdhui,
        utilisateurs.peut_voir_monetisation,
        utilisateurs.peut_voir_indisponibilites,
        utilisateurs.doit_changer_mot_de_passe
      FROM push_subscriptions
      INNER JOIN utilisateurs ON utilisateurs.id = push_subscriptions.utilisateur_id
      WHERE push_subscriptions.actif = 1
      ORDER BY push_subscriptions.id ASC
    `
  );
}

async function marquerAbonnementPushCommeUtilise(id) {
  return run(
    `
      UPDATE push_subscriptions
      SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [Number(id)]
  );
}

async function marquerRappelJourEnvoye(id, cleRappel) {
  return run(
    `
      UPDATE push_subscriptions
      SET
        last_today_reminder_key = ?,
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [String(cleRappel || ""), Number(id)]
  );
}

module.exports = {
  normaliserSubscriptionPush,
  construireAbonnementNavigateur,
  enregistrerOuMettreAJourAbonnementPush,
  trouverAbonnementPushParEndpoint,
  trouverAbonnementPushActifUtilisateurParEndpoint,
  desactiverAbonnementPushParEndpoint,
  desactiverAbonnementPushParId,
  listerAbonnementsPushActifs,
  marquerAbonnementPushCommeUtilise,
  marquerRappelJourEnvoye,
};
