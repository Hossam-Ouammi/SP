const publicTimezone = String(
  document.body?.dataset?.publicTimezone || "Europe/Paris"
).trim();
const publicTimezoneLabel = String(
  document.body?.dataset?.publicTimezoneLabel || "GMT+2"
).trim();

const elements = {
  calendar: document.getElementById("reservation-public-calendar"),
  error: document.getElementById("reservation-public-error"),
  updatedAt: document.getElementById("reservation-public-updated-at"),
};

const etat = {
  calendrier: null,
  config: {
    timezone_public: publicTimezone,
    timezone_public_label: publicTimezoneLabel,
    slot_min_time: "09:00",
    slot_max_time: "23:00",
    refresh_interval_ms: 15000,
  },
  planning: {
    week_start: "",
    blocages: [],
  },
  requetePlanningId: 0,
  maintenantTimer: null,
  synchronisationTimer: null,
  synchronisationProgrammee: null,
  sourceTempsReel: null,
};

const RESERVATION_PAS_CRENEAU_MINUTES = 30;
const RESERVATION_ACTUALISATION_MAINTENANT_MS = 60 * 1000;

function obtenirFuseauPublic() {
  return String(etat.config?.timezone_public || publicTimezone || "Europe/Paris").trim();
}

function extrairePartiesDateFuseau(dateObjet, timeZone) {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dateObjet);
  const resultat = {};

  parties.forEach((partie) => {
    if (partie.type !== "literal") {
      resultat[partie.type] = partie.value;
    }
  });

  return {
    year: Number(resultat.year),
    month: Number(resultat.month),
    day: Number(resultat.day),
    hour: Number(resultat.hour),
    minute: Number(resultat.minute),
    second: Number(resultat.second),
  };
}

// The public calendar displays France local times on a UTC grid.
// We therefore convert the real current instant into a "fake UTC" date
// whose clock values match the public timezone, so FullCalendar's
// nowIndicator stays aligned with the displayed schedule.
function convertirInstantVersHorlogePubliqueUtc(dateObjet = new Date()) {
  const parties = extrairePartiesDateFuseau(dateObjet, obtenirFuseauPublic());

  return new Date(
    Date.UTC(
      parties.year,
      parties.month - 1,
      parties.day,
      parties.hour,
      parties.minute,
      parties.second
    )
  );
}

function convertirHeureOptionEnMinutes(heure) {
  const correspondance = String(heure || "")
    .trim()
    .match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);

  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) {
    return null;
  }

  return heures * 60 + minutes;
}

function convertirMinutesEnHeureOption(totalMinutes) {
  const minutesNormalisees = Math.max(0, Math.min(24 * 60, Number(totalMinutes) || 0));
  const heures = String(Math.floor(minutesNormalisees / 60)).padStart(2, "0");
  const minutes = String(minutesNormalisees % 60).padStart(2, "0");
  return `${heures}:${minutes}:00`;
}

function obtenirMinutesMaintenantFuseauPublic(dateObjet = new Date()) {
  const parties = extrairePartiesDateFuseau(dateObjet, obtenirFuseauPublic());
  return parties.hour * 60 + parties.minute;
}

function calculerFenetreHoraireVisible({
  slotMinTime,
  slotMaxTime,
  maintenantMinutes,
  pasMinutes = RESERVATION_PAS_CRENEAU_MINUTES,
}) {
  const minBase = convertirHeureOptionEnMinutes(slotMinTime);
  const maxBase = convertirHeureOptionEnMinutes(slotMaxTime);

  if (
    !Number.isFinite(minBase) ||
    !Number.isFinite(maxBase) ||
    !Number.isFinite(maintenantMinutes)
  ) {
    return {
      slotMinTime,
      slotMaxTime,
    };
  }

  const minVisible = minBase;
  const maxVisible =
    maintenantMinutes >= maxBase
      ? Math.min(24 * 60, Math.ceil((maintenantMinutes + 1) / pasMinutes) * pasMinutes)
      : maxBase;

  return {
    slotMinTime: convertirMinutesEnHeureOption(minVisible),
    slotMaxTime: convertirMinutesEnHeureOption(maxVisible),
  };
}

function obtenirMaintenantPublicPourCalendrier(dateObjet = new Date()) {
  return convertirInstantVersHorlogePubliqueUtc(dateObjet);
}

function appliquerOptionsMaintenantCalendrierPublic(dateObjet = new Date()) {
  if (!etat.calendrier) {
    return;
  }

  const fenetre = calculerFenetreHoraireVisible({
    slotMinTime: etat.config.slot_min_time || "09:00",
    slotMaxTime: etat.config.slot_max_time || "23:00",
    maintenantMinutes: obtenirMinutesMaintenantFuseauPublic(dateObjet),
  });

  if (etat.calendrier.getOption("slotMinTime") !== fenetre.slotMinTime) {
    etat.calendrier.setOption("slotMinTime", fenetre.slotMinTime);
  }

  if (etat.calendrier.getOption("slotMaxTime") !== fenetre.slotMaxTime) {
    etat.calendrier.setOption("slotMaxTime", fenetre.slotMaxTime);
  }

  etat.calendrier.setOption("now", obtenirMaintenantPublicPourCalendrier(dateObjet));
}

function afficherErreur(message) {
  if (!elements.error) {
    return;
  }

  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}

function masquerErreur() {
  if (!elements.error) {
    return;
  }

  elements.error.textContent = "";
  elements.error.classList.add("hidden");
}

function estCalendrierMobile() {
  return globalThis.matchMedia?.("(max-width: 720px)")?.matches ?? false;
}

function synchroniserEtatVisuelCalendrier(elementCalendrier, vue) {
  if (!elementCalendrier) {
    return;
  }

  elementCalendrier.dataset.calendarMobile = estCalendrierMobile() ? "true" : "false";
  elementCalendrier.dataset.calendarView = vue || "";
}

function ajouterJoursIso(dateIso, nombreJours) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setUTCDate(dateObjet.getUTCDate() + nombreJours);
  return dateObjet.toISOString().slice(0, 10);
}

function formaterDateCourte(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(dateObjet);
}

function genererContenuEnteteJour(info) {
  const dateIso = info.date?.toISOString?.().slice(0, 10) || "";

  return {
    html: `<span class="calendar-monthday-header">${formaterDateCourte(dateIso)}</span>`,
  };
}

function evenementBlocage(blocage) {
  return {
    id: String(blocage.id || `${blocage.type}-${blocage.date}-${blocage.heure_debut}`),
    title: "",
    start: `${blocage.date}T${blocage.heure_debut}:00Z`,
    end: `${blocage.date_fin || blocage.date}T${blocage.heure_fin}:00Z`,
    display: "block",
    classNames: ["reservation-public-blocked-event", "calendar-mobile-week-indisponibilite"],
    extendedProps: {
      type: "blocked",
    },
  };
}

function mettreAJourCalendrier() {
  if (!etat.calendrier) {
    return;
  }

  const blocages = Array.isArray(etat.planning?.blocages) ? etat.planning.blocages : [];
  etat.calendrier.batchRendering(() => {
    etat.calendrier.removeAllEvents();
    etat.calendrier.addEventSource(blocages.map(evenementBlocage));
  });
}

function mettreAJourHorodatageSynchronisation() {
  if (!elements.updatedAt) {
    return;
  }

  const maintenant = new Date();
  const heureLocale = new Intl.DateTimeFormat("fr-FR", {
    timeZone: obtenirFuseauPublic(),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(maintenant);

  elements.updatedAt.textContent = `Mis à jour à ${heureLocale}`;
}

async function envoyerRequete(url, options = {}) {
  const reponse = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const erreur = new Error(donnees.message || "Impossible de charger le calendrier.");
    erreur.status = reponse.status;
    throw erreur;
  }

  return donnees;
}

async function recupererPlanning(weekStart = "") {
  const suffixe = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : "";
  return envoyerRequete(`/api/reservation-public${suffixe}`);
}

async function appliquerResultatPlanning(resultat) {
  etat.config = {
    ...etat.config,
    ...(resultat.config || {}),
  };
  etat.planning = resultat.planning || etat.planning;

  if (etat.calendrier) {
    appliquerOptionsMaintenantCalendrierPublic();
  }

  mettreAJourCalendrier();
  mettreAJourHorodatageSynchronisation();
}

async function chargerPlanning(weekStart = etat.planning.week_start, options = {}) {
  const requeteId = ++etat.requetePlanningId;

  try {
    const resultat = await recupererPlanning(weekStart);

    if (requeteId !== etat.requetePlanningId) {
      return;
    }

    await appliquerResultatPlanning(resultat);
    masquerErreur();
  } catch (erreur) {
    if (!options.silencieux) {
      afficherErreur(erreur.message || "Impossible de charger le calendrier.");
    }
    throw erreur;
  }
}

function programmerSynchronisationRapide() {
  if (etat.synchronisationProgrammee) {
    return;
  }

  etat.synchronisationProgrammee = window.setTimeout(() => {
    etat.synchronisationProgrammee = null;
    chargerPlanning(etat.planning.week_start, { silencieux: true }).catch(() => {});
  }, 350);
}

function lancerSynchronisationAutomatique() {
  if (etat.synchronisationTimer) {
    window.clearInterval(etat.synchronisationTimer);
  }

  etat.synchronisationTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden" || !etat.planning.week_start) {
      return;
    }

    chargerPlanning(etat.planning.week_start, { silencieux: true }).catch(() => {});
  }, Number(etat.config.refresh_interval_ms) || 15000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && etat.planning.week_start) {
      chargerPlanning(etat.planning.week_start, { silencieux: true }).catch(() => {});
    }
  });
}

function lancerActualisationMaintenant() {
  if (etat.maintenantTimer) {
    return;
  }

  const rafraichir = () => {
    if (document.visibilityState === "hidden") {
      return;
    }

    appliquerOptionsMaintenantCalendrierPublic();
  };

  rafraichir();
  etat.maintenantTimer = window.setInterval(
    rafraichir,
    RESERVATION_ACTUALISATION_MAINTENANT_MS
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      rafraichir();
    }
  });
}

function lancerSynchronisationTempsReel() {
  if (typeof window.EventSource !== "function" || etat.sourceTempsReel) {
    return;
  }

  const source = new window.EventSource("/api/reservation-public/events");
  etat.sourceTempsReel = source;

  source.addEventListener("app-updated", (event) => {
    let payload = {};

    try {
      payload = JSON.parse(event.data || "{}");
    } catch (error) {
      payload = {};
    }

    if (["seances", "indisponibilites"].includes(payload.scope)) {
      programmerSynchronisationRapide();
    }
  });

  source.addEventListener("connected", () => {});
  source.addEventListener("ping", () => {});
  source.onerror = () => {
    source.close();
    etat.sourceTempsReel = null;
    window.setTimeout(lancerSynchronisationTempsReel, 5000);
  };
}

function initialiserCalendrier(initialWeekStart) {
  const plugins = [globalThis.FullCalendar?.TimeGrid?.default].filter(Boolean);

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    afficherErreur("Impossible de charger le calendrier.");
    return;
  }

  const fenetreInitiale = calculerFenetreHoraireVisible({
    slotMinTime: etat.config.slot_min_time || "09:00",
    slotMaxTime: etat.config.slot_max_time || "23:00",
    maintenantMinutes: obtenirMinutesMaintenantFuseauPublic(),
  });

  etat.calendrier = new FullCalendar.Calendar(elements.calendar, {
    plugins,
    locale: "fr",
    timeZone: "UTC",
    now: obtenirMaintenantPublicPourCalendrier(),
    initialView: "timeGridWeek",
    initialDate: `${initialWeekStart}T12:00:00Z`,
    firstDay: 1,
    allDaySlot: false,
    slotMinTime: fenetreInitiale.slotMinTime,
    slotMaxTime: fenetreInitiale.slotMaxTime,
    scrollTime: fenetreInitiale.slotMinTime,
    slotDuration: "00:30:00",
    snapDuration: "00:30:00",
    height: "auto",
    nowIndicator: true,
    selectable: false,
    editable: false,
    expandRows: true,
    eventMinHeight: 28,
    displayEventTime: false,
    slotLabelInterval: "01:00:00",
    slotLabelFormat: {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    dayHeaderContent: genererContenuEnteteJour,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "",
    },
    buttonText: {
      today: "Aujourd'hui",
    },
    datesSet(info) {
      synchroniserEtatVisuelCalendrier(elements.calendar, info.view.type);
      const weekStart = String(info.startStr || "").slice(0, 10);

      if (weekStart && weekStart !== etat.planning.week_start) {
        chargerPlanning(weekStart, { silencieux: true }).catch((erreur) => {
          afficherErreur(erreur.message || "Impossible de charger le calendrier.");
        });
      }
    },
    windowResize() {
      synchroniserEtatVisuelCalendrier(elements.calendar, etat.calendrier?.view?.type);
    },
    eventDidMount(info) {
      info.el.title = "Créneau occupé";
    },
    eventClick(info) {
      info.jsEvent?.preventDefault();
    },
    events: [],
  });

  etat.calendrier.render();
  appliquerOptionsMaintenantCalendrierPublic();
  synchroniserEtatVisuelCalendrier(elements.calendar, etat.calendrier.view?.type);
  mettreAJourCalendrier();
}

async function initialiserPage() {
  try {
    masquerErreur();
    const resultatInitial = await recupererPlanning();
    await appliquerResultatPlanning(resultatInitial);
    initialiserCalendrier(resultatInitial.planning.week_start);
    lancerActualisationMaintenant();
    lancerSynchronisationAutomatique();
    lancerSynchronisationTempsReel();
  } catch (erreur) {
    afficherErreur(erreur.message || "Impossible de charger le calendrier public.");
  }
}

initialiserPage();
