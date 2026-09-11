const webpush = require("web-push");

const {
  PUSH_VAPID_SUBJECT,
  PUSH_REMINDER_TIMEZONE,
  PUSH_REMINDER_INTERVAL_HOURS,
  PUSH_REMINDER_START_HOUR,
  PUSH_REMINDER_END_HOUR,
  PUSH_DAILY_SUMMARY_HOUR,
  PUSH_REMINDER_GRACE_MINUTES,
  PUSH_REMINDER_POLL_INTERVAL_MS,
  PUSH_ENABLE_IN_MEMORY_REMINDERS,
} = require("../config/push.config");
const { recupererClesPushVapid } = require("../models/push-secret.model");
const {
  normaliserEndpointPush,
  creerAgentPushSecurise,
} = require("./push-endpoint-security");
const {
  listerAbonnementsPushActifs,
  construireAbonnementNavigateur,
  desactiverAbonnementPushParId,
  marquerAbonnementPushCommeUtilise,
  marquerRappelJourEnvoye,
} = require("../models/push-subscription.model");
const { listerToutesLesSeances } = require("../models/seance.model");
const { listerToutesLesIndisponibilites } = require("../models/indisponibilite.model");
const {
  construireScopeAcces,
  normaliserIdentifiant,
  normaliserListeIds,
} = require("../models/access-scope.model");
const { executerAvecVerrou } = require("./job-lock");

let webPushConfigure = false;
let rappelInterval = null;
const agentPushSecurise = creerAgentPushSecurise();
const PUSH_SEND_CONCURRENCY = Math.min(
  lireNombreEntierEnv("PUSH_SEND_CONCURRENCY", 8),
  25
);

function livraisonPushSimuleeEstActive(environnement = process.env) {
  return (
    String(environnement?.NODE_ENV || "").trim().toLowerCase() === "test" &&
    String(environnement?.PUSH_TEST_DELIVERY_MODE || "").trim().toLowerCase() === "mock"
  );
}

// L'audit navigateur utilise ce transport simulé explicitement : un endpoint
// Chromium pointe vers un fournisseur Push externe et ne doit jamais rendre
// les tests dépendants du réseau. La garde NODE_ENV=test empêche toute
// désactivation silencieuse des livraisons en production.
const PUSH_TEST_DELIVERY_MOCK = livraisonPushSimuleeEstActive();

function lireNombreEntierEnv(nom, valeurParDefaut) {
  const valeur = Number(process.env[nom]);

  if (!Number.isFinite(valeur)) {
    return valeurParDefaut;
  }

  return Math.max(Math.floor(valeur), 1);
}

async function executerAvecConcurrence(elements, worker, limite = PUSH_SEND_CONCURRENCY) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return;
  }

  let index = 0;
  const nombreTravailleurs = Math.min(Math.max(Number(limite) || 1, 1), elements.length);

  await Promise.all(
    Array.from({ length: nombreTravailleurs }, async () => {
      while (index < elements.length) {
        const element = elements[index];
        index += 1;
        await worker(element);
      }
    })
  );
}

function configurerWebPush() {
  if (webPushConfigure) {
    return recupererClesPushVapid();
  }

  const cles = recupererClesPushVapid();

  webpush.setVapidDetails(
    PUSH_VAPID_SUBJECT,
    cles.publicKey,
    cles.privateKey
  );

  webPushConfigure = true;
  return cles;
}

function recupererClePubliqueVapid() {
  return configurerWebPush().publicKey;
}

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);

  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) {
    return -1;
  }

  return heures * 60 + minutes;
}

function formaterDateLocale(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PUSH_REMINDER_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function extrairePartiesDate(date = new Date(), timeZone = PUSH_REMINDER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parties = formatter.formatToParts(date).reduce((accumulateur, partie) => {
    if (partie.type !== "literal") {
      accumulateur[partie.type] = partie.value;
    }
    return accumulateur;
  }, {});

  return {
    year: Number(parties.year),
    month: Number(parties.month),
    day: Number(parties.day),
    hour: Number(parties.hour),
    minute: Number(parties.minute),
    second: Number(parties.second),
    dateKey: `${parties.year}-${parties.month}-${parties.day}`,
    timeLabel: `${parties.hour}:${parties.minute}`,
  };
}

function construireDateMilieuJour(partiesDate) {
  return new Date(
    Date.UTC(
      Number(partiesDate.year),
      Number(partiesDate.month) - 1,
      Number(partiesDate.day),
      12,
      0,
      0
    )
  );
}

function construireMessagePushEvenement(payload = {}) {
  const acteur = normaliserTexte(payload.actorName) || "Quelqu'un";
  const messagesParAction = {
    seance_added: `${acteur} a ajouté une séance.`,
    seance_updated: `${acteur} a modifié une séance.`,
    seance_status_updated: `${acteur} a modifié le statut d'une séance.`,
    seance_deleted: `${acteur} a supprimé une séance.`,
    unavailability_added: `${acteur} a ajouté une indisponibilité.`,
    full_day_unavailability_added: `${acteur} a bloqué une journée complète.`,
    unavailability_updated: `${acteur} a modifié une indisponibilité.`,
    unavailability_deleted: `${acteur} a supprimé une indisponibilité.`,
    proposal_added: `${acteur} a envoyé une proposition de séance.`,
    proposal_updated: `${acteur} a modifié une proposition de séance.`,
    proposal_accepted: `${acteur} a accepté une proposition de séance.`,
    proposal_refused: `${acteur} a refusé une proposition de séance.`,
  };

  return (
    messagesParAction[payload.action] ||
    normaliserTexte(payload.message) ||
    "L'application a été mise à jour."
  );
}

function evenementDoitDeclencherPush(payload = {}) {
  return new Set([
    "seance_added",
    "seance_updated",
    "seance_status_updated",
    "seance_deleted",
    "unavailability_added",
    "full_day_unavailability_added",
    "unavailability_updated",
    "unavailability_deleted",
    "proposal_added",
    "proposal_updated",
    "proposal_accepted",
    "proposal_refused",
  ]).has(payload.action);
}

function utilisateurEstActifPourPush(utilisateur) {
  if (Number(utilisateur?.acces_active) !== 1) {
    return false;
  }

  if (String(utilisateur?.statut_compte || "active").trim().toLowerCase() !== "active") {
    return false;
  }

  if (Number(utilisateur?.doit_changer_mot_de_passe) === 1) {
    return false;
  }

  return true;
}

function normaliserCiblePush(payload = {}) {
  return {
    actorId: normaliserIdentifiant(payload.actorId ?? payload.actor_id),
    handlerId: normaliserIdentifiant(payload.handlerId ?? payload.handler_id),
    intervenantId: normaliserIdentifiant(
      payload.intervenantId ?? payload.intervenant_id
    ),
  };
}

/**
 * Les pushes applicatifs suivent le meme contrat de confidentialite que les
 * lectures privees : un Handler voit uniquement son propre espace, et un
 * Professeur uniquement ses propres seances rattachees. Un payload incomplet
 * est volontairement reduit a son acteur ; il ne devient jamais un broadcast.
 */
function utilisateurPeutRecevoirEvenementApplication(
  utilisateur,
  scopeUtilisateur,
  payload = {}
) {
  if (!utilisateurEstActifPourPush(utilisateur)) {
    return false;
  }

  const utilisateurId = normaliserIdentifiant(utilisateur?.utilisateur_id);
  const { actorId, handlerId, intervenantId } = normaliserCiblePush(payload);

  if (!utilisateurId) {
    return false;
  }

  // Sans une cible complete, l'acteur est le seul destinataire eventuel. Cela
  // protege aussi les anciennes mutations qui n'ont pas encore renseigne leur
  // Handler/intervenant.
  if (!handlerId || !intervenantId) {
    return Boolean(actorId && utilisateurId === actorId);
  }

  // On ne notifie pas l'auteur d'une mutation ciblee : il a deja la reponse de
  // son action. L'exception ci-dessus reste utile pour une mutation legacy
  // sans cible afin d'eviter toute diffusion non voulue.
  if (actorId && utilisateurId === actorId) {
    return false;
  }

  // Le Handler ne recoit que les evenements de son espace propre. Ne pas se
  // baser sur handlerIds ici : un utilisateur multi-role peut etre Professeur
  // dans l'espace d'un autre Handler, sans devenir destinataire de toute son
  // equipe.
  if (normaliserListeIds(scopeUtilisateur?.handlerOwnIds).includes(handlerId)) {
    return true;
  }

  // Un Professeur n'est informe que lorsque l'evenement le concerne et que le
  // rattachement au Handler cible est toujours actif.
  return Boolean(
    Number(scopeUtilisateur?.utilisateurId) === intervenantId &&
      normaliserListeIds(scopeUtilisateur?.handlerProfesseurIds).includes(handlerId)
  );
}

function creerCacheScopesPush() {
  return new Map();
}

async function chargerScopePushPourAbonnement(abonnement, cacheScopes) {
  const utilisateurId = normaliserIdentifiant(abonnement?.utilisateur_id);

  if (!utilisateurId) {
    return null;
  }

  const cache = cacheScopes instanceof Map ? cacheScopes : creerCacheScopesPush();

  if (!cache.has(utilisateurId)) {
    cache.set(utilisateurId, construireScopeAcces({ id: utilisateurId }));
  }

  return cache.get(utilisateurId);
}

async function envoyerNotificationAbonnement(abonnementLigne, notification, options = {}) {
  configurerWebPush();

  const abonnementNavigateur = construireAbonnementNavigateur(abonnementLigne);

  if (!abonnementNavigateur) {
    await desactiverAbonnementPushParId(abonnementLigne.id).catch(() => {});
    return false;
  }

  try {
    // Les anciennes lignes persistent parfois apres un changement de code. La
    // validation est donc refaite juste avant toute sortie reseau, pas
    // uniquement a l'inscription. L'agent HTTPS impose ensuite le meme
    // controle a la resolution DNS utilisee pour la connexion.
    abonnementNavigateur.endpoint = normaliserEndpointPush(abonnementNavigateur.endpoint);
  } catch {
    await desactiverAbonnementPushParId(abonnementLigne.id).catch(() => {});
    return false;
  }

  try {
    if (PUSH_TEST_DELIVERY_MOCK) {
      await marquerAbonnementPushCommeUtilise(abonnementLigne.id).catch(() => {});
      return true;
    }

    await webpush.sendNotification(
      abonnementNavigateur,
      JSON.stringify(notification),
      {
        TTL: options.TTL ?? 300,
        urgency: options.urgency || "normal",
        topic: options.topic,
        agent: agentPushSecurise,
        timeout: 10_000,
      }
    );

    await marquerAbonnementPushCommeUtilise(abonnementLigne.id).catch(() => {});
    return true;
  } catch (error) {
    if ([404, 410].includes(Number(error?.statusCode))) {
      await desactiverAbonnementPushParId(abonnementLigne.id).catch(() => {});
    }

    return false;
  }
}

async function notifierEvenementApplicationPush(payload = {}) {
  if (!evenementDoitDeclencherPush(payload)) {
    return;
  }

  const abonnements = await listerAbonnementsPushActifs();

  if (!Array.isArray(abonnements) || abonnements.length === 0) {
    return;
  }

  const message = construireMessagePushEvenement(payload);
  const notification = {
    title: "Gestion des séances",
    body: message,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: `event-${payload.action || "application"}`,
    url: "/",
    data: {
      scope: payload.scope || "application",
      action: payload.action || "application_updated",
    },
  };

  const cacheScopes = creerCacheScopesPush();

  await executerAvecConcurrence(
    abonnements,
    async (abonnement) => {
      const scopeUtilisateur = await chargerScopePushPourAbonnement(
        abonnement,
        cacheScopes
      );

      if (
        !utilisateurPeutRecevoirEvenementApplication(
          abonnement,
          scopeUtilisateur,
          payload
        )
      ) {
        return;
      }

      await envoyerNotificationAbonnement(abonnement, notification, {
        TTL: 300,
        urgency: "high",
        topic: `evt-${String(payload.action || "app").slice(0, 28)}`,
      });
    }
  );
}

function utilisateurPeutRecevoirRappelAujourdhui(utilisateur, scopeUtilisateur) {
  if (!utilisateurEstActifPourPush(utilisateur)) {
    return false;
  }

  return Boolean(scopeUtilisateur?.estHandler || scopeUtilisateur?.estProfesseur);
}

function entitePlanningEstDansScope(scopeUtilisateur, entite) {
  const handlerId = normaliserIdentifiant(entite?.handler_id ?? entite?.handlerId);
  const intervenantId = normaliserIdentifiant(
    entite?.intervenant_id ?? entite?.intervenantId
  );

  if (!handlerId) {
    return false;
  }

  if (normaliserListeIds(scopeUtilisateur?.handlerOwnIds).includes(handlerId)) {
    return true;
  }

  return Boolean(
    intervenantId &&
      Number(scopeUtilisateur?.utilisateurId) === intervenantId &&
      normaliserListeIds(scopeUtilisateur?.handlerProfesseurIds).includes(handlerId)
  );
}

function filtrerDonneesRappelParScope(
  scopeUtilisateur,
  seances = [],
  indisponibilites = []
) {
  return {
    seances: (Array.isArray(seances) ? seances : []).filter((seance) =>
      entitePlanningEstDansScope(scopeUtilisateur, seance)
    ),
    indisponibilites: (Array.isArray(indisponibilites) ? indisponibilites : []).filter(
      (indisponibilite) => entitePlanningEstDansScope(scopeUtilisateur, indisponibilite)
    ),
  };
}

function indisponibiliteChevaucheSeance(indisponibilite, seance) {
  if (!indisponibilite || !seance || indisponibilite.date !== seance.date) {
    return false;
  }

  const handlerIndisponibilite = normaliserIdentifiant(
    indisponibilite.handler_id ?? indisponibilite.handlerId
  );
  const handlerSeance = normaliserIdentifiant(seance.handler_id ?? seance.handlerId);
  const intervenantIndisponibilite = normaliserIdentifiant(
    indisponibilite.intervenant_id ?? indisponibilite.intervenantId
  );
  const intervenantSeance = normaliserIdentifiant(
    seance.intervenant_id ?? seance.intervenantId
  );

  if (handlerIndisponibilite && handlerSeance && handlerIndisponibilite !== handlerSeance) {
    return false;
  }

  // Les donnees nouvelles doivent correspondre au meme intervenant. Les deux
  // Identifiants absents gardent la compatibilité des données historiques non
  // encore réconciliées.
  if (
    intervenantIndisponibilite ||
    intervenantSeance
  ) {
    if (!intervenantIndisponibilite || !intervenantSeance) {
      return false;
    }

    if (intervenantIndisponibilite !== intervenantSeance) {
      return false;
    }
  }

  if (Number(indisponibilite.jour_complet) === 1) {
    return true;
  }

  return (
    convertirHeureEnMinutes(indisponibilite.heure_debut) <
      convertirHeureEnMinutes(seance.heure_fin) &&
    convertirHeureEnMinutes(indisponibilite.heure_fin) >
      convertirHeureEnMinutes(seance.heure_debut)
  );
}

function seanceDoitEtreMasqueeDansAujourdhui(seance, indisponibilites) {
  return indisponibilites.some((indisponibilite) =>
    indisponibiliteChevaucheSeance(indisponibilite, seance)
  );
}

function obtenirSeancesProgrammeesPourUtilisateur(
  utilisateur,
  seances,
  indisponibilites,
  dateKey,
  scopeUtilisateur
) {
  if (!utilisateurPeutRecevoirRappelAujourdhui(utilisateur, scopeUtilisateur)) {
    return [];
  }

  return seances
    .filter((seance) => seance.date === dateKey)
    .filter((seance) => String(seance.statut_seance || "").toLowerCase() !== "annulee")
    .filter(
      (seance) =>
        !seanceDoitEtreMasqueeDansAujourdhui(seance, indisponibilites)
    )
    .sort((seanceA, seanceB) => {
      return (
        convertirHeureEnMinutes(seanceA.heure_debut) -
        convertirHeureEnMinutes(seanceB.heure_debut)
      );
    });
}

function obtenirSeancesRestantesAujourdhuiPourUtilisateur(
  utilisateur,
  seances,
  indisponibilites,
  partiesDate,
  scopeUtilisateur
) {
  if (!utilisateurPeutRecevoirRappelAujourdhui(utilisateur, scopeUtilisateur)) {
    return [];
  }

  const minuteCourante = partiesDate.hour * 60 + partiesDate.minute;

  return obtenirSeancesProgrammeesPourUtilisateur(
    utilisateur,
    seances,
    indisponibilites,
    partiesDate.dateKey,
    scopeUtilisateur
  )
    .filter((seance) => convertirHeureEnMinutes(seance.heure_fin) > minuteCourante)
}

function construireNotificationRappel(seances, partiesDate) {
  const prochaineSeance = seances[0];
  const nombreSeances = seances.length;
  const libelleDate = formaterDateLocale(construireDateMilieuJour(partiesDate));
  const corps =
    nombreSeances === 1
      ? `Rappel : 1 séance restante aujourd'hui (${libelleDate}). Prochaine à ${prochaineSeance.heure_debut}.`
      : `Rappel : ${nombreSeances} séances restantes aujourd'hui (${libelleDate}). Prochaine à ${prochaineSeance.heure_debut}.`;

  return {
    title: "Gestion des séances",
    body: corps,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: `today-reminder-${partiesDate.dateKey}-${String(partiesDate.hour).padStart(2, "0")}`,
    url: "/",
    data: {
      scope: "aujourdhui",
      action: "today_reminder",
      date: partiesDate.dateKey,
    },
  };
}

function construireNotificationResumeMinuit(seances, partiesDate) {
  const nombreSeances = seances.length;
  const libelleDate = formaterDateLocale(construireDateMilieuJour(partiesDate));
  const corps =
    nombreSeances === 1
      ? `1 séance programmée aujourd'hui (${libelleDate}).`
      : `${nombreSeances} séances programmées aujourd'hui (${libelleDate}).`;

  return {
    title: "Gestion des séances",
    body: corps,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: `daily-summary-${partiesDate.dateKey}`,
    url: "/",
    data: {
      scope: "aujourdhui",
      action: "daily_summary",
      date: partiesDate.dateKey,
    },
  };
}

async function envoyerResumeMinuitSiNecessaire() {
  const partiesDate = extrairePartiesDate();

  if (partiesDate.minute > PUSH_REMINDER_GRACE_MINUTES) {
    return;
  }

  if (partiesDate.hour !== PUSH_DAILY_SUMMARY_HOUR) {
    return;
  }

  const cleRappel = `daily-summary:${partiesDate.dateKey}`;
  const [abonnements, seances, indisponibilites] = await Promise.all([
    listerAbonnementsPushActifs(),
    listerToutesLesSeances(),
    listerToutesLesIndisponibilites(),
  ]);

  if (!Array.isArray(abonnements) || abonnements.length === 0) {
    return;
  }

  const cacheScopes = creerCacheScopesPush();

  await executerAvecConcurrence(
    abonnements,
    async (abonnement) => {
      if (String(abonnement.last_today_reminder_key || "") === cleRappel) {
        return;
      }

      const scopeUtilisateur = await chargerScopePushPourAbonnement(
        abonnement,
        cacheScopes
      );
      const donneesScopees = filtrerDonneesRappelParScope(
        scopeUtilisateur,
        seances,
        indisponibilites
      );
      const seancesVisibles = obtenirSeancesProgrammeesPourUtilisateur(
        abonnement,
        donneesScopees.seances,
        donneesScopees.indisponibilites,
        partiesDate.dateKey,
        scopeUtilisateur
      );

      if (seancesVisibles.length === 0) {
        return;
      }

      const notification = construireNotificationResumeMinuit(
        seancesVisibles,
        partiesDate
      );
      const succes = await envoyerNotificationAbonnement(abonnement, notification, {
        TTL: 6 * 60 * 60,
        urgency: "normal",
        topic: `daily-summary-${partiesDate.dateKey}`,
      });

      if (succes) {
        await marquerRappelJourEnvoye(abonnement.id, cleRappel).catch(() => {});
      }
    }
  );
}

async function envoyerRappelsSeancesDuJourSiNecessaire() {
  const partiesDate = extrairePartiesDate();

  if (partiesDate.minute > PUSH_REMINDER_GRACE_MINUTES) {
    return;
  }

  if (partiesDate.hour < PUSH_REMINDER_START_HOUR || partiesDate.hour > PUSH_REMINDER_END_HOUR) {
    return;
  }

  if (partiesDate.hour % PUSH_REMINDER_INTERVAL_HOURS !== 0) {
    return;
  }

  const cleRappel = `${partiesDate.dateKey}:${String(partiesDate.hour).padStart(2, "0")}`;
  const [abonnements, seances, indisponibilites] = await Promise.all([
    listerAbonnementsPushActifs(),
    listerToutesLesSeances(),
    listerToutesLesIndisponibilites(),
  ]);

  if (!Array.isArray(abonnements) || abonnements.length === 0) {
    return;
  }

  const cacheScopes = creerCacheScopesPush();

  await executerAvecConcurrence(
    abonnements,
    async (abonnement) => {
      if (String(abonnement.last_today_reminder_key || "") === cleRappel) {
        return;
      }

      const scopeUtilisateur = await chargerScopePushPourAbonnement(
        abonnement,
        cacheScopes
      );
      const donneesScopees = filtrerDonneesRappelParScope(
        scopeUtilisateur,
        seances,
        indisponibilites
      );
      const seancesVisibles = obtenirSeancesRestantesAujourdhuiPourUtilisateur(
        abonnement,
        donneesScopees.seances,
        donneesScopees.indisponibilites,
        partiesDate,
        scopeUtilisateur
      );

      if (seancesVisibles.length === 0) {
        return;
      }

      const notification = construireNotificationRappel(seancesVisibles, partiesDate);
      const succes = await envoyerNotificationAbonnement(abonnement, notification, {
        TTL: 60 * 60,
        urgency: "normal",
        topic: `rappel-${String(partiesDate.hour).padStart(2, "0")}`,
      });

      if (succes) {
        await marquerRappelJourEnvoye(abonnement.id, cleRappel).catch(() => {});
      }
    }
  );
}

async function envoyerNotificationTestAbonnement(abonnementLigne) {
  const notification = {
    title: "Gestion des séances",
    body: "Test reussi : les notifications push sont actives sur cet appareil.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: "push-test",
    url: "/",
    data: {
      scope: "push",
      action: "push_test",
    },
  };

  const succes = await envoyerNotificationAbonnement(abonnementLigne, notification, {
    TTL: 120,
    urgency: "high",
    topic: "push-test",
  });

  if (!succes) {
    const erreur = new Error("Impossible d'envoyer la notification de test.");
    erreur.status = 502;
    throw erreur;
  }
}

async function executerRappelsPushDusSansVerrou() {
  await envoyerResumeMinuitSiNecessaire();
  await envoyerRappelsSeancesDuJourSiNecessaire();
}

async function executerRappelsPushDus(options = {}) {
  if (options.sansVerrou) {
    return executerRappelsPushDusSansVerrou();
  }

  const execution = await executerAvecVerrou(
    "push-due",
    executerRappelsPushDusSansVerrou,
    { staleMs: 20 * 60 * 1000 }
  );

  if (execution.skipped) {
    return { skipped: true };
  }

  return {
    result: execution.result ?? null,
    skipped: false,
  };
}

function demarrerPlanificateurRappelsPush() {
  if (!PUSH_ENABLE_IN_MEMORY_REMINDERS) {
    return;
  }

  configurerWebPush();

  if (rappelInterval) {
    return;
  }

  executerRappelsPushDus().catch((error) => {
    console.error("Erreur rappels push dus:", error);
  });

  rappelInterval = setInterval(() => {
    executerRappelsPushDus().catch((error) => {
      console.error("Erreur rappels push dus:", error);
    });
  }, PUSH_REMINDER_POLL_INTERVAL_MS);

  if (typeof rappelInterval.unref === "function") {
    rappelInterval.unref();
  }
}

module.exports = {
  recupererClePubliqueVapid,
  notifierEvenementApplicationPush,
  envoyerNotificationTestAbonnement,
  envoyerResumeMinuitSiNecessaire,
  envoyerRappelsSeancesDuJourSiNecessaire,
  executerRappelsPushDus,
  demarrerPlanificateurRappelsPush,
  // Exposes pour les tests unitaires de confidentialite et reutilisables par
  // les futurs jobs de notification. Ils ne font aucune ecriture ni envoi.
  utilisateurPeutRecevoirEvenementApplication,
  entitePlanningEstDansScope,
  filtrerDonneesRappelParScope,
  indisponibiliteChevaucheSeance,
  livraisonPushSimuleeEstActive,
};
