const publicCalendarOffsetMinutes = Number(
  document.body?.dataset?.publicCalendarOffsetMinutes || 0
);
const publicCalendarOffsetLabel = String(
  document.body?.dataset?.publicCalendarOffsetLabel || "GMT"
).trim();
const centralCalendarTimezone = String(
  document.body?.dataset?.centralCalendarTimezone || ""
).trim();
const planningApiUrl = String(document.body?.dataset?.publicCalendarApiUrl || "").trim();
const planningEventsUrl = String(
  document.body?.dataset?.publicCalendarEventsUrl || ""
).trim();

const elements = {
  calendar: document.getElementById("reservation-public-calendar"),
  error: document.getElementById("reservation-public-error"),
  updatedAt: document.getElementById("reservation-public-updated-at"),
};

const etat = {
  calendrier: null,
  config: {
    public_calendar_offset_minutes: publicCalendarOffsetMinutes,
    public_calendar_offset_label: publicCalendarOffsetLabel,
    reference_timezone: centralCalendarTimezone,
    calendar_start_time: "08:00",
    calendar_end_time: "23:30",
    slot_min_time: "08:00",
    slot_max_time: "23:30",
    slot_duration_minutes: 30,
    refresh_interval_ms: 15000,
  },
  planning: {
    week_start: "",
    creneaux: [],
  },
  requetePlanningId: 0,
  maintenantTimer: null,
  synchronisationTimer: null,
  synchronisationProgrammee: null,
  sourceTempsReel: null,
  calendrierIndisponible: false,
};

const RESERVATION_ACTUALISATION_MAINTENANT_MS = 60 * 1000;

function obtenirOffsetPublicMinutes() {
  const offset = Number(
    etat.config?.public_calendar_offset_minutes ?? publicCalendarOffsetMinutes
  );
  return Number.isFinite(offset) ? offset : 0;
}

function obtenirFuseauHorlogeCentrale() {
  return String(etat.config?.reference_timezone || centralCalendarTimezone || "").trim();
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

// Le serveur fournit deja les créneaux projetés sur l'horloge publique.
// On represente cette horloge publique sur une grille UTC artificielle afin
// que FullCalendar conserve exactement les heures murales recues, y compris
// lorsque la projection centrale franchit minuit.
function convertirInstantVersHorlogePubliqueUtc(dateObjet = new Date()) {
  let parties = null;
  const fuseauCentral = obtenirFuseauHorlogeCentrale();

  try {
    parties = fuseauCentral ? extrairePartiesDateFuseau(dateObjet, fuseauCentral) : null;
  } catch (erreur) {
    parties = null;
  }

  if (!parties) {
    parties = {
      year: dateObjet.getFullYear(),
      month: dateObjet.getMonth() + 1,
      day: dateObjet.getDate(),
      hour: dateObjet.getHours(),
      minute: dateObjet.getMinutes(),
      second: dateObjet.getSeconds(),
    };
  }

  return new Date(
    Date.UTC(
      parties.year,
      parties.month - 1,
      parties.day,
      parties.hour,
      parties.minute + obtenirOffsetPublicMinutes(),
      parties.second
    )
  );
}

function convertirHeureOptionEnMinutes(heure) {
  const correspondance = String(heure || "")
    .trim()
    .match(/^(\d{2,}):([0-5]\d)(?::[0-5]\d)?$/);

  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);

  if (
    !Number.isFinite(heures) ||
    !Number.isFinite(minutes) ||
    heures < 0 ||
    heures > 48
  ) {
    return null;
  }

  return heures * 60 + minutes;
}

function convertirMinutesEnHeureOption(totalMinutes) {
  // FullCalendar accepte une durée de grille supérieure à vingt-quatre
  // heures. Cela permet d'afficher la partie 00:00–01:30 du lendemain sous
  // la colonne de la journée publique qui a commencé à 10:00.
  const minutesNormalisees = Math.max(0, Math.min(48 * 60, Number(totalMinutes) || 0));
  const heures = String(Math.floor(minutesNormalisees / 60)).padStart(2, "0");
  const minutes = String(minutesNormalisees % 60).padStart(2, "0");
  return `${heures}:${minutes}:00`;
}

function calculerFenetreHoraireVisible({ slotMinTime, slotMaxTime }) {
  const minBase = convertirHeureOptionEnMinutes(slotMinTime);
  const maxBase = convertirHeureOptionEnMinutes(slotMaxTime);

  if (
    !Number.isFinite(minBase) ||
    !Number.isFinite(maxBase) ||
    maxBase <= minBase
  ) {
    return {
      slotMinTime,
      slotMaxTime,
    };
  }

  return {
    slotMinTime: convertirMinutesEnHeureOption(minBase),
    // FullCalendar rend mal une unique demi-heure après minuit dans la
    // colonne du jour précédent. À cette borne précise, terminer la grille à
    // minuit évite la ligne 00:00–00:30 tronquée et ambiguë.
    slotMaxTime: convertirMinutesEnHeureOption(
      maxBase > 24 * 60 && maxBase <= 24 * 60 + 30 ? 24 * 60 : maxBase
    ),
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
    slotMinTime: etat.config.slot_min_time || "08:00",
    slotMaxTime: etat.config.slot_max_time || "23:30",
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

function genererContenuEnteteJour(info) {
  const dateIso = info.date?.toISOString?.().slice(0, 10) || "";
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(dateObjet);
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(dateObjet);

  return {
    html: `<span class="calendar-monthday-header"><span>${jour}</span><span>${date}</span></span>`,
  };
}

function evenementCreneau(creneau, index) {
  const etatCreneau = creneau?.etat;
  // Une zone vide signifie disponible. Le calendrier public ne matérialise
  // que les occupations, sans exposer leur origine ni aucune donnée privée.
  if (etatCreneau !== "indisponible") {
    return null;
  }

  return {
    // Cet identifiant est local au rendu FullCalendar : il ne provient jamais
    // de la base de donnees et ne revele aucun objet metier.
    id: `public-slot-${index}`,
    title: "",
    start: `${creneau.date}T${creneau.heure_debut}:00Z`,
    end:
      creneau.heure_fin === "24:00"
        ? `${ajouterJoursIso(creneau.date, 1)}T00:00:00Z`
        : `${creneau.date}T${creneau.heure_fin}:00Z`,
    display: "block",
    classNames: ["reservation-public-blocked-event", "calendar-mobile-week-indisponibilite"],
    extendedProps: {
      etat: etatCreneau,
    },
  };
}

function construireEvenementsPublics(creneaux) {
  return (Array.isArray(creneaux) ? creneaux : [])
    .map(evenementCreneau)
    .filter(Boolean);
}

function mettreAJourCalendrier() {
  if (!etat.calendrier) {
    return;
  }

  const creneaux = Array.isArray(etat.planning?.creneaux) ? etat.planning.creneaux : [];
  etat.calendrier.batchRendering(() => {
    etat.calendrier.removeAllEvents();
    etat.calendrier.addEventSource(construireEvenementsPublics(creneaux));
  });
}

function mettreAJourHorodatageSynchronisation() {
  if (!elements.updatedAt) {
    return;
  }

  const maintenant = new Date();
  const heureLocale = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(convertirInstantVersHorlogePubliqueUtc(maintenant));

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
  if (!planningApiUrl) {
    throw new Error("Lien du calendrier public invalide.");
  }

  const url = new URL(planningApiUrl, window.location.origin);

  if (weekStart) {
    url.searchParams.set("week_start", weekStart);
  }

  return envoyerRequete(`${url.pathname}${url.search}`);
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
  if (etat.calendrierIndisponible) {
    return null;
  }

  const requeteId = ++etat.requetePlanningId;

  try {
    const resultat = await recupererPlanning(weekStart);

    if (requeteId !== etat.requetePlanningId) {
      return;
    }

    await appliquerResultatPlanning(resultat);
    masquerErreur();
  } catch (erreur) {
    if (erreur?.status === 404) {
      rendreCalendrierPublicIndisponible();
      return null;
    }

    if (!options.silencieux) {
      afficherErreur(erreur.message || "Impossible de charger le calendrier.");
    }
    throw erreur;
  }
}

function rendreCalendrierPublicIndisponible() {
  etat.calendrierIndisponible = true;
  etat.requetePlanningId += 1;

  if (etat.synchronisationProgrammee) {
    window.clearTimeout(etat.synchronisationProgrammee);
    etat.synchronisationProgrammee = null;
  }

  if (etat.synchronisationTimer) {
    window.clearInterval(etat.synchronisationTimer);
    etat.synchronisationTimer = null;
  }

  if (etat.maintenantTimer) {
    window.clearInterval(etat.maintenantTimer);
    etat.maintenantTimer = null;
  }

  if (etat.sourceTempsReel) {
    etat.sourceTempsReel.close();
    etat.sourceTempsReel = null;
  }

  etat.planning = {
    ...etat.planning,
    creneaux: [],
  };
  etat.calendrier?.removeAllEvents();
  afficherErreur("Ce calendrier public n'est plus disponible.");
}

function programmerSynchronisationRapide() {
  if (etat.calendrierIndisponible || etat.synchronisationProgrammee) {
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
    if (
      etat.calendrierIndisponible ||
      document.visibilityState === "hidden" ||
      !etat.planning.week_start
    ) {
      return;
    }

    chargerPlanning(etat.planning.week_start, { silencieux: true }).catch(() => {});
  }, Number(etat.config.refresh_interval_ms) || 15000);

  document.addEventListener("visibilitychange", () => {
    if (
      !etat.calendrierIndisponible &&
      document.visibilityState === "visible" &&
      etat.planning.week_start
    ) {
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
  if (
    etat.calendrierIndisponible ||
    typeof window.EventSource !== "function" ||
    etat.sourceTempsReel ||
    !planningEventsUrl
  ) {
    return;
  }

  const source = new window.EventSource(planningEventsUrl);
  etat.sourceTempsReel = source;

  source.addEventListener("app-updated", (event) => {
    let payload = {};

    try {
      payload = JSON.parse(event.data || "{}");
    } catch (error) {
      payload = {};
    }

    if (["seances", "indisponibilites", "disponibilites", "settings"].includes(payload.scope)) {
      programmerSynchronisationRapide();
    }
  });

  source.addEventListener("connected", () => {});
  source.addEventListener("ping", () => {});
  source.addEventListener("session-invalidated", () => {
    rendreCalendrierPublicIndisponible();
  });
  source.onerror = () => {
    if (etat.calendrierIndisponible) {
      source.close();
      if (etat.sourceTempsReel === source) {
        etat.sourceTempsReel = null;
      }
      return;
    }

    source.close();
    etat.sourceTempsReel = null;
    window.setTimeout(lancerSynchronisationTempsReel, 5000);
  };
}

function initialiserCalendrier(initialWeekStart) {
  const plugins = [globalThis.FullCalendar?.TimeGrid?.default].filter(Boolean);
  const endExclusive = ajouterJoursIso(initialWeekStart, 14);

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    afficherErreur("Impossible de charger le calendrier.");
    return;
  }

  const fenetreInitiale = calculerFenetreHoraireVisible({
    slotMinTime: etat.config.slot_min_time || "08:00",
    slotMaxTime: etat.config.slot_max_time || "23:30",
  });

  etat.calendrier = new FullCalendar.Calendar(elements.calendar, {
    plugins,
    locale: "fr",
    timeZone: "UTC",
    now: obtenirMaintenantPublicPourCalendrier(),
    initialView: "timeGridWeek",
    initialDate: `${initialWeekStart}T12:00:00Z`,
    validRange: {
      start: initialWeekStart,
      end: endExclusive,
    },
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
      left: "prev,next",
      center: "title",
      right: "",
    },
    buttonIcons: false,
    buttonText: {
      prev: "‹",
      next: "›",
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
      info.el.title =
        info.event.extendedProps?.etat === "disponible"
          ? "Disponible"
          : "Non disponible";
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
