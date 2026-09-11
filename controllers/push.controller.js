const {
  enregistrerOuMettreAJourAbonnementPush,
  trouverAbonnementPushActifUtilisateurParEndpoint,
  desactiverAbonnementPushUtilisateurParEndpoint,
} = require("../models/push-subscription.model");
const {
  recupererClePubliqueVapid,
  envoyerNotificationTestAbonnement,
} = require("../utils/push-notifications");
const {
  PUSH_DAILY_SUMMARY_HOUR,
  PUSH_REMINDER_INTERVAL_HOURS,
} = require("../config/push.config");
const { normaliserEndpointPush } = require("../utils/push-endpoint-security");

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

  let abonnementSecurise;

  try {
    abonnementSecurise = {
      ...subscription,
      endpoint: normaliserEndpointPush(subscription.endpoint),
    };
  } catch (error) {
    if (error?.code === "PUSH_ENDPOINT_UNSAFE") {
      return res.status(400).json({
        code: error.code,
        message: "Endpoint push non securise.",
      });
    }

    throw error;
  }

  try {
    await enregistrerOuMettreAJourAbonnementPush({
      utilisateurId: req.utilisateur.id,
      subscription: abonnementSecurise,
      deviceLabel: normaliserTexte(deviceLabel),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 400),
    });
  } catch (error) {
    if (error?.code === "PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER") {
      return res.status(409).json({
        code: error.code,
        message: "Cet appareil est déjà rattaché à un autre compte.",
      });
    }

    throw error;
  }

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

  await desactiverAbonnementPushUtilisateurParEndpoint(req.utilisateur.id, endpoint);

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
