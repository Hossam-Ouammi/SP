(() => {
  "use strict";

  const INTERVALLE_VERIFICATION_VERSION_MS = 15000;
  let versionApplicationObservee = "";
  let verificationVersionEnCours = false;
  let rechargementVersionPlanifie = false;

  async function verifierNouvelleVersionApplication() {
    if (
      verificationVersionEnCours ||
      rechargementVersionPlanifie ||
      document.visibilityState === "hidden" ||
      typeof window.fetch !== "function"
    ) {
      return;
    }

    verificationVersionEnCours = true;

    try {
      const reponse = await window.fetch("/app-version", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const resultat = reponse.ok ? await reponse.json() : null;
      const nouvelleVersion = String(resultat?.version || "").trim();

      if (!nouvelleVersion) {
        return;
      }

      if (!versionApplicationObservee) {
        versionApplicationObservee = nouvelleVersion;
        return;
      }

      if (nouvelleVersion !== versionApplicationObservee) {
        rechargementVersionPlanifie = true;
        window.location.reload();
      }
    } catch (error) {
      // Une coupure réseau ne doit jamais interrompre l'utilisation courante.
    } finally {
      verificationVersionEnCours = false;
    }
  }

  verifierNouvelleVersionApplication();
  if (typeof window.setInterval === "function") {
    window.setInterval(
      verifierNouvelleVersionApplication,
      INTERVALLE_VERIFICATION_VERSION_MS
    );
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      verifierNouvelleVersionApplication();
    }
  });

  // The application itself does not use an offline cache.  A browser can
  // nevertheless retain a service worker from an older deployment which did.
  // Refresh an already-installed worker on every normal page load so that an
  // obsolete worker cannot indefinitely keep an old HTML/JS bundle in front
  // of the current interface.  We deliberately do not register a worker for
  // a first-time visitor here: push.js remains responsible for that opt-in
  // workflow.
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const avaitControleurAuChargement = Boolean(navigator.serviceWorker.controller);
  let rechargementPlanifie = false;

  function activerTravailleurEnAttente(enregistrement) {
    if (enregistrement?.waiting) {
      enregistrement.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  function planifierRechargementApresMiseAJour() {
    // No reload is useful when the page gains its first controller.  For an
    // existing controller, however, a single reload prevents a mixed page
    // where an old module and a newly activated worker coexist.
    if (!avaitControleurAuChargement || rechargementPlanifie) {
      return;
    }

    rechargementPlanifie = true;
    window.setTimeout(() => window.location.reload(), 120);
  }

  function observerInstallation(enregistrement) {
    activerTravailleurEnAttente(enregistrement);

    const surveiller = (travailleur) => {
      if (!travailleur) {
        return;
      }

      travailleur.addEventListener("statechange", () => {
        if (travailleur.state === "installed") {
          activerTravailleurEnAttente(enregistrement);
        }
      });
    };

    surveiller(enregistrement.installing);
    enregistrement.addEventListener("updatefound", () => {
      surveiller(enregistrement.installing);
    });
  }

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    planifierRechargementApresMiseAJour
  );

  navigator.serviceWorker
    .getRegistration("/")
    .then(async (enregistrement) => {
      if (!enregistrement) {
        return;
      }

      observerInstallation(enregistrement);
      // app.js sends the worker with Cache-Control: no-store. Calling update
      // explicitly removes the browser's normal update interval as a source
      // of stale application bundles after a deployment.
      await enregistrement.update();
    })
    // A push/browser implementation must never make the main UI unusable.
    .catch(() => {});
})();
