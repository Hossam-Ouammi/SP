const {
  enregistrerOuMettreAJourAbonnementPush,
  trouverAbonnementPushActifUtilisateurParEndpoint,
  desactiverAbonnementPushParEndpoint,
} = require("../models/push-subscription.model");
const {
  recupererClePubliqueVapid,
  envoyerNotificationTestAbonnement,
} = require("../utils/push-notifications");
const {
  PUSH_DAILY_SUMMARY_HOUR,
  PUSH_REMINDER_INTERVAL_HOURS,
} = require("../config/push.config");

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

async function recupererConfigurationPush(req, res) {
  return res.json({
    push: {
      supported: true,
      public_key: recupererClePubliqueVapid(),
      reminder_interval_hours: PUSH_REMINDER_INTERVAL_HOURS,
      daily_summary_hour: PUSH_DAILY_SUMMARY_HOUR,
    },
  });
}

async function enregistrerAbonnementPush(req, res) {
  const { subscription, device_label: deviceLabel } = req.body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({
      message: "Abonnement push invalide.",
    });
  }

  await enregistrerOuMettreAJourAbonnementPush({
    utilisateurId: req.utilisateur.id,
    subscription,
    deviceLabel: normaliserTexte(deviceLabel),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 400),
  });

  return res.status(201).json({
    message: "Les notifications push sont actives sur cet appareil.",
  });
}

async function supprimerAbonnementPush(req, res) {
  const endpoint = normaliserTexte(req.body?.endpoint);

  if (!endpoint) {
    return res.status(400).json({
      message: "Endpoint d'abonnement invalide.",
    });
  }

  const abonnement = await trouverAbonnementPushActifUtilisateurParEndpoint(
    req.utilisateur.id,
    endpoint
  );

  if (!abonnement) {
    return res.json({
      message: "Aucun abonnement actif à supprimer pour cet appareil.",
    });
  }

  await desactiverAbonnementPushParEndpoint(endpoint);

  return res.json({
    message: "Les notifications push sont desactivees sur cet appareil.",
  });
}

async function envoyerTestPush(req, res) {
  const endpoint = normaliserTexte(req.body?.endpoint);

  if (!endpoint) {
    return res.status(400).json({
      message: "Endpoint d'abonnement invalide.",
    });
  }

  const abonnement = await trouverAbonnementPushActifUtilisateurParEndpoint(
    req.utilisateur.id,
    endpoint
  );

  if (!abonnement) {
    return res.status(404).json({
      message: "Aucun appareil push actif trouve pour cet utilisateur.",
    });
  }

  await envoyerNotificationTestAbonnement(abonnement);

  return res.json({
    message: "Notification de test envoyee.",
  });
}

module.exports = {
  recupererConfigurationPush,
  enregistrerAbonnementPush,
  supprimerAbonnementPush,
  envoyerTestPush,
};
