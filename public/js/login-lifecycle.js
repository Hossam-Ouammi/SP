(() => {
  "use strict";

  // This script deliberately owns the public account lifecycle. It is loaded
  // before the large application module so the login screen stays usable even
  // if a later application feature fails to initialise.
  const HASH_CREATION_COMPTE = "#creer-compte";
  const HASH_RECUPERATION_MOT_DE_PASSE = "#recuperer-mot-de-passe";
  const RETOUR_CONNEXION_DELAI_MS = 3_000;
  const hashInitial = String(window.location.hash || "");

  let retourConnexionTimer = null;
  let cycleCompte = null;
  let jetonCsrf = null;

  function obtenirElements() {
    return {
      loginView: document.getElementById("login-view"),
      appView: document.getElementById("app-view"),
      loginForm: document.getElementById("login-form"),
      lifecycleActions: document.querySelector(".login-lifecycle-actions"),
      showAccountRequestButton: document.getElementById("show-account-request-button"),
      showPasswordResetButton: document.getElementById("show-password-reset-button"),
      loginPassword: document.getElementById("login-password"),
      loginShowPassword: document.getElementById("login-show-password"),
      accountRequestForm: document.getElementById("account-request-form"),
      accountRequestName: document.getElementById("account-request-name"),
      accountRequestEmail: document.getElementById("account-request-email"),
      accountRequestRole: document.getElementById("account-request-role"),
      accountRequestHandlerField: document.getElementById("account-request-handler-field"),
      accountRequestHandler: document.getElementById("account-request-handler"),
      accountRequestError: document.getElementById("account-request-error"),
      accountRequestNotification: document.getElementById("account-request-notification"),
      passwordResetRequestForm: document.getElementById("password-reset-request-form"),
      passwordResetIdentifier: document.getElementById("password-reset-identifier"),
      passwordResetRequestError: document.getElementById("password-reset-request-error"),
      passwordResetNotification: document.getElementById("password-reset-notification"),
      passwordResetSubmitButton: document.getElementById("password-reset-submit-button"),
      accountTokenForm: document.getElementById("account-token-form"),
      accountTokenTitle: document.getElementById("account-token-title"),
      accountTokenPassword: document.getElementById("account-token-password"),
      accountTokenPasswordConfirmation: document.getElementById(
        "account-token-password-confirmation"
      ),
      accountTokenShowPassword: document.getElementById("account-token-show-password"),
      accountTokenError: document.getElementById("account-token-error"),
      accountTokenNotification: document.getElementById("account-token-notification"),
      toastContainer: document.getElementById("toast-container"),
    };
  }

  function changerVisibilite(element, visible) {
    if (element) {
      element.classList.toggle("hidden", !visible);
    }
  }

  function effacerErreur(element) {
    if (!element) return;
    element.textContent = "";
    element.classList.add("hidden");
  }

  function afficherErreur(element, message) {
    if (!element) return;
    element.textContent = message || "Une erreur est survenue.";
    element.classList.remove("hidden");
  }

  function effacerNotification(element) {
    if (!element) return;
    element.textContent = "";
    element.classList.add("hidden");
  }

  function afficherNotification(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove("hidden");
  }

  function afficherToast(elements, message, type = "success") {
    if (!elements.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    window.setTimeout(() => toast.remove(), 5_000);
  }

  function memoriserJetonCsrf(response) {
    const jeton = response?.headers?.get("x-csrf-token");
    if (jeton) {
      jetonCsrf = jeton;
    }
  }

  async function assurerJetonCsrfPourSessionConnectee() {
    if (jetonCsrf || window.__gestionSeancesSessionConnecteeInitiale !== true) return;

    // Public flows normally have no session. If somebody opens an email link
    // in a browser that is already signed in, however, the global CSRF guard
    // requires the token emitted by this harmless current-user lookup.
    try {
      const response = await window.fetch("/api/auth/me", {
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      memoriserJetonCsrf(response);
    } catch (erreur) {
      // Without a signed-in session no CSRF token is necessary for the public
      // endpoints, so this lookup intentionally remains best-effort.
    }
  }

  async function envoyerRequete(url, options = {}) {
    const methode = String(options.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(methode)) {
      await assurerJetonCsrfPourSessionConnectee();
    }

    const response = await window.fetch(url, {
      credentials: "same-origin",
      method: methode,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(jetonCsrf ? { "X-CSRF-Token": jetonCsrf } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    memoriserJetonCsrf(response);

    const donnees = await response.json().catch(() => ({}));
    if (!response.ok) {
      const erreur = new Error(donnees.message || "Une erreur est survenue.");
      erreur.status = response.status;
      throw erreur;
    }

    return donnees;
  }

  function hashPourVue(vue) {
    if (vue === "creation") return HASH_CREATION_COMPTE;
    if (vue === "reset") return HASH_RECUPERATION_MOT_DE_PASSE;
    return "";
  }

  function mettreAJourUrl(vue, { remplacer = false } = {}) {
    const url = new URL(window.location.href);
    url.hash = hashPourVue(vue);
    const methode = remplacer ? "replaceState" : "pushState";
    window.history[methode]({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function analyserHash(hash) {
    const valeur = String(hash || "").trim();
    const correspondanceJeton = /^#(activation|reset-password)\?token=([A-Za-z0-9_-]{43})$/.exec(
      valeur
    );

    if (correspondanceJeton) {
      return {
        vue: "token",
        type: correspondanceJeton[1],
        token: correspondanceJeton[2],
      };
    }

    if (valeur === HASH_CREATION_COMPTE) return { vue: "creation" };
    if (valeur === HASH_RECUPERATION_MOT_DE_PASSE) return { vue: "reset" };
    return { vue: "connexion" };
  }

  function focusElement(element) {
    if (!element) return;
    window.setTimeout(() => element.focus(), 0);
  }

  function afficherVue(elements, vue, options = {}) {
    const estConnexion = vue === "connexion";
    const estCreation = vue === "creation";
    const estReset = vue === "reset";
    const estJeton = vue === "token";

    // An activation/reset link must remain usable when it is opened in a
    // browser that already has an authenticated application session.  The
    // server can initially render the application in that case, so the
    // lifecycle explicitly owns the root views for every public sub-route.
    const afficherRacinePublique =
      estCreation ||
      estReset ||
      estJeton ||
      window.__gestionSeancesLifecycleRoutePublique === true;
    if (afficherRacinePublique) {
      changerVisibilite(elements.loginView, true);
      changerVisibilite(elements.appView, false);
    }
    window.__gestionSeancesLifecycleRoutePublique = afficherRacinePublique;

    changerVisibilite(elements.loginForm, estConnexion);
    changerVisibilite(elements.lifecycleActions, estConnexion);
    changerVisibilite(elements.accountRequestForm, estCreation);
    changerVisibilite(elements.passwordResetRequestForm, estReset);
    changerVisibilite(elements.accountTokenForm, estJeton);

    if (elements.loginView) {
      elements.loginView.dataset.loginLifecycleView = vue;
    }

    if (options.mettreAJourUrl !== false) {
      mettreAJourUrl(vue, { remplacer: options.remplacerUrl === true });
    }

    if (estCreation) {
      actualiserChampHandler(elements);
      chargerHandlers(elements);
      focusElement(elements.accountRequestName);
    } else if (estReset) {
      focusElement(elements.passwordResetIdentifier);
    } else if (estJeton) {
      focusElement(elements.accountTokenPassword);
    } else if (estConnexion) {
      focusElement(document.getElementById("login-username"));
    }
  }

  function actualiserChampHandler(elements) {
    const estProfesseur = elements.accountRequestRole?.value === "professeur";
    changerVisibilite(elements.accountRequestHandlerField, estProfesseur);

    if (elements.accountRequestHandler) {
      elements.accountRequestHandler.required = estProfesseur;
      if (!estProfesseur) {
        elements.accountRequestHandler.value = "";
      }
    }
  }

  async function chargerHandlers(elements) {
    const select = elements.accountRequestHandler;
    if (!select || select.dataset.handlersLoaded === "true") return;

    select.disabled = true;
    select.innerHTML = '<option value="">Chargement…</option>';

    try {
      const resultat = await envoyerRequete("/api/account-lifecycle/handlers");
      const identifiants = Array.isArray(resultat.handler_ids) ? resultat.handler_ids : [];
      select.innerHTML = '<option value="">Choisir un Handler</option>';

      identifiants.forEach((identifiant) => {
        const option = document.createElement("option");
        option.value = String(identifiant);
        option.textContent = String(identifiant);
        select.appendChild(option);
      });

      if (identifiants.length === 0) {
        select.innerHTML = '<option value="">Aucun Handler disponible</option>';
      }
      select.dataset.handlersLoaded = "true";
    } catch (erreur) {
      select.innerHTML = '<option value="">Indisponible pour le moment</option>';
      afficherErreur(elements.accountRequestError, erreur.message);
    } finally {
      select.disabled = false;
    }
  }

  function modifierEtatBouton(bouton, enCours, libelleEnCours) {
    if (!bouton) return () => {};
    const libelleInitial = bouton.textContent;
    bouton.disabled = enCours;
    if (enCours) bouton.textContent = libelleEnCours;

    return () => {
      bouton.disabled = false;
      bouton.textContent = libelleInitial;
    };
  }

  function programmerRetourConnexion(elements) {
    if (retourConnexionTimer) {
      window.clearTimeout(retourConnexionTimer);
    }

    retourConnexionTimer = window.setTimeout(() => {
      retourConnexionTimer = null;
      // A complete reload deliberately discards the reset form and the token
      // from the browser's address bar/history after a successful request.
      window.location.assign("/");
    }, RETOUR_CONNEXION_DELAI_MS);
  }

  function verrouillerPageApresSucces(elements, message) {
    const formulaire = elements.accountTokenForm;
    if (!formulaire) return;
    formulaire.querySelectorAll("input, button").forEach((controle) => { controle.disabled = true; });
    formulaire.classList.add("account-token-locked");
    const boite = document.createElement("div");
    boite.className = "account-token-success-dialog";
    boite.setAttribute("role", "alertdialog");
    boite.textContent = message;
    formulaire.parentElement?.appendChild(boite);
  }

  function afficherLienInutilisable(elements) {
    cycleCompte = null;
    elements.accountTokenForm?.querySelectorAll("label, button[type='submit']")
      .forEach((element) => element.classList.add("hidden"));
    afficherErreur(elements.accountTokenError, "Ce lien n'est plus utilisable.");
  }

  async function soumettreDemandeCompte(event, elements) {
    event.preventDefault();
    event.stopImmediatePropagation();
    effacerErreur(elements.accountRequestError);
    effacerNotification(elements.accountRequestNotification);

    if (!elements.accountRequestForm?.reportValidity()) return;

    const role = elements.accountRequestRole?.value || "";
    const donnees = {
      nom: elements.accountRequestName?.value.trim() || "",
      email: elements.accountRequestEmail?.value.trim() || "",
      role,
    };

    if (role === "professeur") {
      donnees.handler_public_id = elements.accountRequestHandler?.value || "";
    }

    const bouton = elements.accountRequestForm.querySelector('button[type="submit"]');
    const restaurerBouton = modifierEtatBouton(bouton, true, "Envoi…");

    try {
      const resultat = await envoyerRequete("/api/account-lifecycle/requests", {
        method: "POST",
        body: donnees,
      });
      elements.accountRequestForm.reset();
      actualiserChampHandler(elements);
      afficherNotification(
        elements.accountRequestNotification,
        resultat.message || "Votre demande de création de compte a été envoyée."
      );
      afficherToast(elements, "Demande de création de compte envoyée.");
    } catch (erreur) {
      afficherErreur(elements.accountRequestError, erreur.message);
    } finally {
      restaurerBouton();
    }
  }

  async function soumettreDemandeReset(event, elements) {
    event.preventDefault();
    event.stopImmediatePropagation();
    effacerErreur(elements.passwordResetRequestError);
    effacerNotification(elements.passwordResetNotification);

    if (!elements.passwordResetRequestForm?.reportValidity()) return;

    const restaurerBouton = modifierEtatBouton(
      elements.passwordResetSubmitButton,
      true,
      "Envoi…"
    );

    try {
      const resultat = await envoyerRequete("/api/account-lifecycle/password-resets", {
        method: "POST",
        body: { email: elements.passwordResetIdentifier?.value.trim() || "" },
      });

      elements.passwordResetRequestForm.reset();
      afficherNotification(
        elements.passwordResetNotification,
        resultat.message ||
          "Si cette adresse correspond à un compte actif, un email de récupération a été envoyé. Le lien est utilisable une seule fois et expire après 15 minutes. Retour à la connexion dans quelques secondes."
      );
      afficherToast(elements, "Email de récupération envoyé.");
      programmerRetourConnexion(elements);
    } catch (erreur) {
      afficherErreur(elements.passwordResetRequestError, erreur.message);
    } finally {
      restaurerBouton();
    }
  }

  function mettreAJourVisibiliteMotsDePasse(elements) {
    const afficher = elements.accountTokenShowPassword?.checked === true;
    [elements.accountTokenPassword, elements.accountTokenPasswordConfirmation].forEach((champ) => {
      if (champ) champ.type = afficher ? "text" : "password";
    });
  }

  async function soumettreJetonCompte(event, elements) {
    event.preventDefault();
    event.stopImmediatePropagation();
    effacerErreur(elements.accountTokenError);
    effacerNotification(elements.accountTokenNotification);

    if (!cycleCompte?.token) {
      afficherErreur(elements.accountTokenError, "Le lien est invalide ou a déjà été utilisé.");
      return;
    }
    if (!elements.accountTokenForm?.reportValidity()) return;

    const motDePasse = elements.accountTokenPassword?.value || "";
    const confirmation = elements.accountTokenPasswordConfirmation?.value || "";
    if (motDePasse !== confirmation) {
      afficherErreur(elements.accountTokenError, "Les deux mots de passe ne correspondent pas.");
      return;
    }

    const bouton = elements.accountTokenForm.querySelector('button[type="submit"]');
    const restaurerBouton = modifierEtatBouton(bouton, true, "Enregistrement…");
    const estActivation = cycleCompte.type === "activation";
    let succes = false;

    try {
      const resultat = await envoyerRequete(
        estActivation
          ? "/api/account-lifecycle/activation"
          : "/api/account-lifecycle/password-resets/confirm",
        {
          method: "POST",
          body: { token: cycleCompte.token, nouveau_mot_de_passe: motDePasse },
        }
      );

      cycleCompte = null;
      succes = true;
      // The server has consumed the one-time token. Remove it from browser
      // history only now, never merely because the password form was opened.
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      elements.accountTokenForm.reset();
      mettreAJourVisibiliteMotsDePasse(elements);
      const message = estActivation
        ? "Mot de passe créé avec succès. Redirection vers la connexion."
        : "Mot de passe modifié avec succès. Redirection vers la connexion.";
      verrouillerPageApresSucces(elements, message);
      afficherToast(elements, message);
      programmerRetourConnexion(elements);
    } catch (erreur) {
      afficherErreur(elements.accountTokenError, erreur.message);
    } finally {
      if (!succes) restaurerBouton();
    }
  }

  function intercepter(element, type, gestionnaire) {
    if (!element) return;
    element.addEventListener(
      type,
      (event) => {
        event.stopImmediatePropagation();
        gestionnaire(event);
      },
      true
    );
  }

  function retournerConnexion(event, elements) {
    event.preventDefault();
    if (retourConnexionTimer) {
      window.clearTimeout(retourConnexionTimer);
      retourConnexionTimer = null;
    }
    cycleCompte = null;
    effacerErreur(elements.accountRequestError);
    effacerErreur(elements.passwordResetRequestError);
    effacerErreur(elements.accountTokenError);
    afficherVue(elements, "connexion");
  }

  async function appliquerRoute(elements, hash) {
    const route = analyserHash(hash);
    cycleCompte = route.vue === "token" ? { type: route.type, token: route.token } : null;

    if (route.vue === "token") {
      elements.accountTokenTitle.textContent =
        route.type === "activation" ? "Activez votre compte" : "Réinitialisez votre mot de passe";
      // Keep the fragment until the password has actually been saved: a page
      // refresh must not make an otherwise valid one-time link unusable.
      afficherVue(elements, "token", { mettreAJourUrl: false });
      try {
        const verification = await envoyerRequete("/api/account-lifecycle/tokens/validate", {
          method: "POST",
          body: { type: route.type, token: route.token },
        });
        if (!verification.valide) afficherLienInutilisable(elements);
      } catch (_) {
        afficherLienInutilisable(elements);
      }
      return;
    }

    afficherVue(elements, route.vue, { mettreAJourUrl: false });
  }

  function initialiser() {
    const elements = obtenirElements();
    if (!elements.loginView) return;

    // The server renders #app-view only for an already authenticated session.
    // Remember that state before a public lifecycle route deliberately hides
    // it, so anonymous reset/account forms never issue a noisy failing
    // /api/auth/me lookup just to discover that no CSRF token is required.
    window.__gestionSeancesSessionConnecteeInitiale = Boolean(
      elements.appView && !elements.appView.classList.contains("hidden")
    );

    intercepter(elements.loginShowPassword, "change", () => {
      if (elements.loginPassword) {
        elements.loginPassword.type = elements.loginShowPassword.checked ? "text" : "password";
      }
    });
    intercepter(elements.accountTokenShowPassword, "change", () => {
      mettreAJourVisibiliteMotsDePasse(elements);
    });

    intercepter(elements.showAccountRequestButton, "click", (event) => {
      event.preventDefault();
      afficherVue(elements, "creation");
    });
    intercepter(elements.showPasswordResetButton, "click", (event) => {
      event.preventDefault();
      afficherVue(elements, "reset");
    });
    intercepter(elements.accountRequestRole, "change", () => actualiserChampHandler(elements));
    intercepter(elements.accountRequestForm, "submit", (event) => soumettreDemandeCompte(event, elements));
    intercepter(elements.passwordResetRequestForm, "submit", (event) =>
      soumettreDemandeReset(event, elements)
    );
    intercepter(elements.accountTokenForm, "submit", (event) => soumettreJetonCompte(event, elements));
    document.querySelectorAll("[data-login-lifecycle-back]").forEach((bouton) => {
      intercepter(bouton, "click", (event) => retournerConnexion(event, elements));
    });

    // Navigation inside this screen uses history.pushState and already updates
    // the matching panel synchronously. Listening to `hashchange` here would
    // replay the empty hash emitted after a reset token is scrubbed from a
    // freshly opened email link, hiding the password form again.
    window.addEventListener("popstate", () => appliquerRoute(elements, window.location.hash));
    appliquerRoute(elements, hashInitial || window.location.hash);

    // Let ui.js know that all public lifecycle listeners are now attached.
    // Setting this only at the end preserves its built-in fallback if this
    // small isolated script cannot initialise for any reason.
    window.__gestionSeancesLoginLifecycle = true;
  }

  // The script is placed after every login element in index.ejs. Initialise
  // synchronously so ui.js sees the ready flag before it registers any of its
  // fallback lifecycle listeners or consumes a token fragment.
  initialiser();
})();
