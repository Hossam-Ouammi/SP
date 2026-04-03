import { envoyerRequete } from "./http.js";

let serviceWorkerRegistrationPromise = null;
let configurationPushPromise = null;

function navigateurSupportePush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function convertirBase64UrlEnUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const contenu = window.atob(base64);
  const tableau = new Uint8Array(contenu.length);

  for (let index = 0; index < contenu.length; index += 1) {
    tableau[index] = contenu.charCodeAt(index);
  }

  return tableau;
}

function detecterNavigateur() {
  const agent = String(navigator.userAgent || "");

  if (/edg/i.test(agent)) return "Edge";
  if (/chrome|crios/i.test(agent)) return "Chrome";
  if (/firefox|fxios/i.test(agent)) return "Firefox";
  if (/safari/i.test(agent) && !/chrome|crios|android/i.test(agent)) return "Safari";
  return "Navigateur";
}

function detecterAppareil() {
  const agent = String(navigator.userAgent || "");

  if (/iphone/i.test(agent)) return "iPhone";
  if (/ipad/i.test(agent)) return "iPad";
  if (/android/i.test(agent)) return "Android";
  if (/windows/i.test(agent)) return "Windows";
  if (/macintosh|mac os x/i.test(agent)) return "Mac";
  if (/linux/i.test(agent)) return "Linux";
  return "Appareil";
}

function genererLibelleAppareil() {
  return `${detecterNavigateur()} - ${detecterAppareil()}`;
}

function estNavigateurAndroid() {
  return /android/i.test(String(navigator.userAgent || ""));
}

function normaliserErreurActivationPush(erreur) {
  const message = String(erreur?.message || "").trim();

  if (/Registration failed - push service error/i.test(message)) {
    if (estNavigateurAndroid()) {
      return new Error(
        "L'abonnement push a echoue sur Android. Reessayez dans Chrome, avec Google Play Services actifs, puis autorisez a nouveau les notifications si besoin."
      );
    }

    return new Error(
      "L'abonnement push a echoue sur cet appareil. Rechargez la page puis reessayez."
    );
  }

  if (erreur instanceof Error) {
    return erreur;
  }

  return new Error("Impossible d'activer les notifications push sur cet appareil.");
}

async function recupererConfigurationPush() {
  if (!configurationPushPromise) {
    configurationPushPromise = envoyerRequete("/api/push/config").then(
      (resultat) => resultat.push
    );
  }

  return configurationPushPromise;
}

async function enregistrerServiceWorkerPush() {
  if (!navigateurSupportePush()) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker.register(
      "/service-worker.js",
      {
        scope: "/",
        updateViaCache: "none",
      }
    );
  }

  await serviceWorkerRegistrationPromise;
  return navigator.serviceWorker.ready;
}

async function recupererServiceWorkerPushExistant() {
  if (!navigateurSupportePush()) {
    return null;
  }

  const enregistrement =
    (await navigator.serviceWorker.getRegistration("/").catch(() => null)) ||
    (await navigator.serviceWorker.getRegistration().catch(() => null));

  return enregistrement || null;
}

async function reinitialiserServiceWorkerPush() {
  if (!navigateurSupportePush()) {
    return null;
  }

  const enregistrements = await navigator.serviceWorker.getRegistrations().catch(() => []);

  await Promise.all(
    enregistrements.map(async (enregistrement) => {
      const abonnement = await enregistrement.pushManager
        .getSubscription()
        .catch(() => null);

      if (abonnement) {
        await abonnement.unsubscribe().catch(() => {});
      }

      await enregistrement.unregister().catch(() => {});
    })
  );

  serviceWorkerRegistrationPromise = null;
  return enregistrerServiceWorkerPush();
}

async function recupererAbonnementPushNavigateur() {
  const registration = await recupererServiceWorkerPushExistant();

  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

async function synchroniserAbonnementPushNavigateur(abonnement) {
  if (!abonnement) {
    return;
  }

  await envoyerRequete("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: abonnement.toJSON(),
      device_label: genererLibelleAppareil(),
    }),
  });
}

export async function recupererEtatNotificationsPush() {
  if (!navigateurSupportePush()) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
    };
  }

  const abonnement = await recupererAbonnementPushNavigateur();

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(abonnement),
  };
}

export async function synchroniserNotificationsPushActuelles() {
  if (!navigateurSupportePush()) {
    return;
  }

  const abonnement = await recupererAbonnementPushNavigateur();

  if (!abonnement) {
    return;
  }

  await synchroniserAbonnementPushNavigateur(abonnement);
}

export async function activerNotificationsPush() {
  if (!navigateurSupportePush()) {
    const erreur = new Error("Les notifications push ne sont pas prises en charge sur cet appareil.");
    erreur.status = 400;
    throw erreur;
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    const erreur = new Error(
      permission === "denied"
        ? "Les notifications ont ete refusees dans ce navigateur."
        : "L'autorisation de notification est necessaire."
    );
    erreur.status = 400;
    throw erreur;
  }

  const [configurationPush, registration] = await Promise.all([
    recupererConfigurationPush(),
    enregistrerServiceWorkerPush(),
  ]);

  let abonnement = await registration.pushManager.getSubscription();

  if (!abonnement) {
    const optionsAbonnement = {
      userVisibleOnly: true,
      applicationServerKey: convertirBase64UrlEnUint8Array(configurationPush.public_key),
    };

    try {
      abonnement = await registration.pushManager.subscribe(optionsAbonnement);
    } catch (erreurInitiale) {
      const abonnementExistant = await registration.pushManager.getSubscription().catch(() => null);

      if (abonnementExistant) {
        await abonnementExistant.unsubscribe().catch(() => {});
      }

      try {
        abonnement = await registration.pushManager.subscribe(optionsAbonnement);
      } catch (erreurFinale) {
        try {
          const registrationReinitialisee = await reinitialiserServiceWorkerPush();
          abonnement = await registrationReinitialisee.pushManager.subscribe(optionsAbonnement);
        } catch (erreurApresReset) {
          throw normaliserErreurActivationPush(
            erreurApresReset || erreurFinale || erreurInitiale
          );
        }
      }
    }
  }

  await envoyerRequete("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: abonnement.toJSON(),
      device_label: genererLibelleAppareil(),
    }),
  });

  return recupererEtatNotificationsPush();
}

export async function desactiverNotificationsPush() {
  if (!navigateurSupportePush()) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
    };
  }

  const abonnement = await recupererAbonnementPushNavigateur();

  if (abonnement) {
    await envoyerRequete("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: abonnement.endpoint,
      }),
    }).catch(() => {});

    await abonnement.unsubscribe().catch(() => {});
  }

  return recupererEtatNotificationsPush();
}

export async function envoyerNotificationPushTest() {
  if (!navigateurSupportePush()) {
    const erreur = new Error("Les notifications push ne sont pas prises en charge sur cet appareil.");
    erreur.status = 400;
    throw erreur;
  }

  const abonnement = await recupererAbonnementPushNavigateur();

  if (!abonnement) {
    const erreur = new Error("Activez d'abord les notifications sur cet appareil.");
    erreur.status = 400;
    throw erreur;
  }

  return envoyerRequete("/api/push/test", {
    method: "POST",
    body: JSON.stringify({
      endpoint: abonnement.endpoint,
    }),
  });
}
