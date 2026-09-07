const palettesStatut = {
  planifiee: {
    backgroundColor: "#e3eefb",
    borderColor: "#a4bfd9",
    textColor: "#244866",
    className: "status-planifiee",
  },
  faite: {
    backgroundColor: "#e2f4eb",
    borderColor: "#9ec9b3",
    textColor: "#245a3f",
    className: "status-faite",
  },
  annulee: {
    backgroundColor: "#f7e4e5",
    borderColor: "#ddb6b8",
    textColor: "#844244",
    className: "status-annulee",
  },
  reportee: {
    backgroundColor: "#fff2de",
    borderColor: "#e5c790",
    textColor: "#80551f",
    className: "status-reportee",
  },
};

function estDateIsoValide(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const dateObjet = new Date(`${date}T12:00:00`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(date);
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);
}

function estHeureFinValide(heure) {
  return estHeureValide(heure) || heure === "24:00";
}

function estIndisponibiliteJourComplet(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function couleurIntervenantValide(couleur) {
  return /^#[0-9a-f]{6}$/i.test(String(couleur || ""));
}

function obtenirPaletteIntervenant(seance) {
  const couleur = String(seance?.intervenant_couleur_calendrier || "").trim();
  if (!couleurIntervenantValide(couleur)) {
    return null;
  }

  return {
    backgroundColor: couleur,
    borderColor: couleur,
    textColor: "#ffffff",
  };
}

function creerClasseIntervenant(seance) {
  const intervenantId = Number(seance?.intervenant_id);
  return Number.isInteger(intervenantId) && intervenantId > 0
    ? `intervenant-${intervenantId}`
    : "";
}

function recupererPluginsCalendrier() {
  return [
    globalThis.FullCalendar?.DayGrid?.default,
    globalThis.FullCalendar?.TimeGrid?.default,
    globalThis.FullCalendar?.Interaction?.default,
  ].filter(Boolean);
}

function estCalendrierMobile() {
  return globalThis.matchMedia?.("(max-width: 560px)")?.matches ?? false;
}

function estCalendrierCompact() {
  return globalThis.matchMedia?.("(max-width: 720px)")?.matches ?? false;
}

const CALENDRIER_PAS_CRENEAU_MINUTES = 30;
const MINUTES_PAR_JOUR = 24 * 60;
const PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT = Object.freeze({
  calendar_start_time: "08:00",
  calendar_end_time: "23:30",
});

function extrairePartiesHorlogeCalendrier(dateObjet, fuseauHoraire = "") {
  const date = dateObjet instanceof Date ? dateObjet : new Date();
  const fuseau = String(fuseauHoraire || "").trim();

  if (fuseau) {
    try {
      const parties = new Intl.DateTimeFormat("en-CA", {
        timeZone: fuseau,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date);
      const valeurs = parties.reduce((resultat, partie) => {
        if (partie.type !== "literal") {
          resultat[partie.type] = Number(partie.value);
        }
        return resultat;
      }, {});

      if (
        Number.isFinite(valeurs.year) &&
        Number.isFinite(valeurs.month) &&
        Number.isFinite(valeurs.day) &&
        Number.isFinite(valeurs.hour) &&
        Number.isFinite(valeurs.minute) &&
        Number.isFinite(valeurs.second)
      ) {
        return {
          year: valeurs.year,
          month: valeurs.month,
          day: valeurs.day,
          hour: valeurs.hour === 24 ? 0 : valeurs.hour,
          minute: valeurs.minute,
          second: valeurs.second,
        };
      }
    } catch (_erreur) {
      // Le serveur valide les fuseaux IANA. Le repli local conserve le
      // calendrier utilisable si le navigateur ne connaît pas ce fuseau.
    }
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

// FullCalendar chargé côté privé n'embarque pas de plugin de fuseaux nommés.
// On lui fournit donc une date locale dont l'horloge correspond à la référence
// centrale : les événements sans offset restent des heures civiles inchangées,
// tandis que le bouton « Aujourd'hui » et l'indicateur de l'instant suivent ce
// fuseau. Le fuseau du calendrier public ne doit jamais être passé ici.
function construireMaintenantCalendrier(fuseauHoraire = "", dateObjet = new Date()) {
  const parties = extrairePartiesHorlogeCalendrier(dateObjet, fuseauHoraire);
  return new Date(
    parties.year,
    parties.month - 1,
    parties.day,
    parties.hour,
    parties.minute,
    parties.second
  );
}

function convertirHeureOptionEnMinutes(heure, { finDeJour = false } = {}) {
  const correspondance = String(heure || "")
    .trim()
    .match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);
  const secondes = Number(correspondance[3] || 0);

  if (
    !Number.isFinite(heures) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(secondes) ||
    minutes < 0 ||
    minutes > 59 ||
    secondes !== 0
  ) {
    return null;
  }

  if (
    finDeJour &&
    ((heures === 0 && minutes === 0) || (heures === 24 && minutes === 0))
  ) {
    return MINUTES_PAR_JOUR;
  }

  if (heures < 0 || heures > 23) {
    return null;
  }

  return heures * 60 + minutes;
}

function convertirMinutesEnHeureOption(totalMinutes) {
  const minutesNormalisees = Math.max(0, Math.min(MINUTES_PAR_JOUR, Number(totalMinutes) || 0));
  const heures = String(Math.floor(minutesNormalisees / 60)).padStart(2, "0");
  const minutes = String(minutesNormalisees % 60).padStart(2, "0");
  return `${heures}:${minutes}:00`;
}

function creerPlageHoraireCalendrier(calendarStartTime, calendarEndTime) {
  const startMinutes = convertirHeureOptionEnMinutes(calendarStartTime);
  const endMinutes = convertirHeureOptionEnMinutes(calendarEndTime, {
    finDeJour: true,
  });

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    startMinutes % CALENDRIER_PAS_CRENEAU_MINUTES !== 0 ||
    endMinutes % CALENDRIER_PAS_CRENEAU_MINUTES !== 0 ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return {
    calendar_start_time: convertirMinutesEnHeureOption(startMinutes).slice(0, 5),
    calendar_end_time:
      endMinutes === MINUTES_PAR_JOUR
        ? "00:00"
        : convertirMinutesEnHeureOption(endMinutes).slice(0, 5),
    startMinutes,
    endMinutes,
    slotMinTime: convertirMinutesEnHeureOption(startMinutes),
    slotMaxTime: convertirMinutesEnHeureOption(endMinutes),
  };
}

function normaliserPlageHoraireCalendrier(plageHoraire = {}) {
  const source = plageHoraire && typeof plageHoraire === "object" ? plageHoraire : {};
  const plage = creerPlageHoraireCalendrier(
    source.calendar_start_time ?? PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_start_time,
    source.calendar_end_time ?? PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_end_time
  );

  return (
    plage ||
    creerPlageHoraireCalendrier(
      PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_start_time,
      PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_end_time
    )
  );
}

function creerElementCalendrier(tagName, className, texte) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (typeof texte === "string") {
    element.textContent = texte;
  }

  return element;
}

function formaterLibelleJourCalendrier(date, options) {
  return new Intl.DateTimeFormat("fr-FR", options).format(date);
}

function obtenirAbreviationJourMobile(date) {
  return formaterLibelleJourCalendrier(date, { weekday: "narrow" })
    .replace(".", "")
    .trim()
    .slice(0, 1);
}

function extrairePrenomEtudiant(nomComplet) {
  if (typeof nomComplet !== "string") {
    return "";
  }

  return nomComplet
    .trim()
    .split(/\s+/)
    .find(Boolean) || "";
}

function seanceEstMasqueePourConfidentialite(seance) {
  return Boolean(seance?.est_masquee_pour_confidentialite);
}

function extraireDateIsoDepuisValeurCalendrier(valeur) {
  const texte = String(valeur || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return texte;
  }

  const correspondance = texte.match(/^(\d{4}-\d{2}-\d{2})/);
  return correspondance ? correspondance[1] : "";
}

function formaterDateIsoLocale(dateObjet) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return "";
  }

  const annee = dateObjet.getFullYear();
  const mois = String(dateObjet.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function extraireDateIsoDepuisClicCalendrier(info) {
  return (
    formaterDateIsoLocale(info?.date) ||
    extraireDateIsoDepuisValeurCalendrier(info?.dateStr)
  );
}

function formaterHeureLocale(dateObjet) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return "";
  }

  const heures = String(dateObjet.getHours()).padStart(2, "0");
  const minutes = String(dateObjet.getMinutes()).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function extraireHeureDepuisValeurCalendrier(valeur) {
  const correspondance = String(valeur || "").match(/T(\d{2}):(\d{2})/);
  return correspondance ? `${correspondance[1]}:${correspondance[2]}` : "";
}

function extraireCreneauDepuisClicCalendrier(info) {
  const date = extraireDateIsoDepuisClicCalendrier(info);
  const heureDebut = info?.allDay
    ? ""
    : formaterHeureLocale(info?.date) || extraireHeureDepuisValeurCalendrier(info?.dateStr);

  return {
    date,
    date_fin: date,
    heure_debut: heureDebut,
    heure_fin: "",
    toute_la_journee: Boolean(info?.allDay),
  };
}

function extraireSelectionCalendrier(info) {
  const dateDebut =
    formaterDateIsoLocale(info?.start) || extraireDateIsoDepuisValeurCalendrier(info?.startStr);
  const dateFin =
    formaterDateIsoLocale(info?.end) || extraireDateIsoDepuisValeurCalendrier(info?.endStr);
  const heureDebut = info?.allDay
    ? ""
    : formaterHeureLocale(info?.start) || extraireHeureDepuisValeurCalendrier(info?.startStr);
  const heureFin = info?.allDay
    ? ""
    : formaterHeureLocale(info?.end) || extraireHeureDepuisValeurCalendrier(info?.endStr);

  return {
    date: dateDebut,
    date_fin: dateFin,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    toute_la_journee: Boolean(info?.allDay),
  };
}

function calculerDateSuivante(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setDate(dateObjet.getDate() + 1);
  return dateObjet.toISOString().slice(0, 10);
}

function construireDateHeureFinCalendrier(dateIso, heureFin) {
  if (heureFin === "24:00") {
    return `${calculerDateSuivante(dateIso)}T00:00`;
  }

  return `${dateIso}T${heureFin}`;
}

function genererContenuEnteteJour(info) {
  if (info.view.type === "dayGridMonth" && estCalendrierMobile()) {
    return {
      domNodes: [
        creerElementCalendrier("span", "calendar-monthday-header", obtenirAbreviationJourMobile(info.date)),
      ],
    };
  }

  if (info.view.type !== "timeGridWeek") {
    return info.text;
  }

  const conteneur = creerElementCalendrier("span", "calendar-weekday-header");
  const formatJour = estCalendrierMobile() ? { weekday: "narrow" } : { weekday: "short" };

  conteneur.append(
    creerElementCalendrier(
      "span",
      "calendar-weekday-label",
      formaterLibelleJourCalendrier(info.date, formatJour)
    ),
    creerElementCalendrier(
      "span",
      "calendar-weekday-date",
      formaterLibelleJourCalendrier(info.date, { day: "numeric" })
    )
  );

  if (!estCalendrierMobile()) {
    conteneur.append(
      creerElementCalendrier(
        "span",
        "calendar-weekday-month",
        formaterLibelleJourCalendrier(info.date, { month: "short" }).replace(".", "")
      )
    );
  }

  return {
    domNodes: [conteneur],
  };
}

function obtenirOptionsResponsiveCalendrier() {
  if (estCalendrierMobile()) {
    return {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "timeGridWeek,dayGridMonth",
      },
      buttonText: {
        month: "Mois",
        week: "Sem.",
      },
      dayHeaderFormat: {
        weekday: "short",
      },
      dayMaxEvents: 4,
      fixedWeekCount: true,
    };
  }

  if (estCalendrierCompact()) {
    return {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "timeGridWeek,dayGridMonth",
      },
      buttonText: {
        month: "Mois",
        week: "Semaine",
      },
      dayHeaderFormat: {
        weekday: "short",
      },
      dayMaxEvents: 1,
    };
  }

  return {
    initialView: "timeGridWeek",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,dayGridMonth",
    },
    buttonText: {
      today: "Aujourd'hui",
      month: "Mois",
      week: "Semaine",
    },
    dayHeaderFormat: {
      weekday: "short",
    },
    dayMaxEvents: 2,
  };
}

function appliquerOptionsResponsive(calendrier) {
  if (!calendrier) {
    return;
  }

  const options = obtenirOptionsResponsiveCalendrier();
  calendrier.setOption("headerToolbar", options.headerToolbar);
  calendrier.setOption("buttonText", options.buttonText);
  calendrier.setOption("dayHeaderFormat", options.dayHeaderFormat);
  calendrier.setOption("dayMaxEvents", options.dayMaxEvents);
  calendrier.setOption("fixedWeekCount", Boolean(options.fixedWeekCount));
}

function transformerSeanceEnEvenement(seance) {
  if (
    !estDateIsoValide(seance.date) ||
    !estHeureValide(seance.heure_debut) ||
    !estHeureFinValide(seance.heure_fin)
  ) {
    console.warn("Séance ignorée dans le calendrier car date/heure invalide :", seance.id);
    return null;
  }

  if (seanceEstMasqueePourConfidentialite(seance)) {
    return {
      id: String(seance.id),
      title: "",
      start: `${seance.date}T${seance.heure_debut}`,
      end: construireDateHeureFinCalendrier(seance.date, seance.heure_fin),
      display: estCalendrierMobile() ? "block" : "auto",
      backgroundColor: "#64748b",
      borderColor: "#475569",
      textColor: "#f8fafc",
      classNames: ["indisponibilite-event", "seance-confidentielle-event"],
      typeOrder: 10,
      extendedProps: {
        seance,
        type: "indisponibilite",
        indisponibilite: {
          id: `seance-privee-${seance.id}`,
          date: seance.date,
          heure_debut: seance.heure_debut,
          heure_fin: seance.heure_fin,
          jour_complet: 0,
          raison: "",
          est_seance_confidentielle: true,
        },
      },
    };
  }

  const paletteIntervenant = obtenirPaletteIntervenant(seance);
  const palette =
    paletteIntervenant || palettesStatut[seance.statut_seance] || palettesStatut.planifiee;
  const titreEvenement = extrairePrenomEtudiant(seance.etudiant) || seance.libelle || "Séance";
  const classeIntervenant = creerClasseIntervenant(seance);
  const classesEvenement = [palette.className].filter(Boolean);

  if (classeIntervenant) {
    classesEvenement.push(classeIntervenant);
  }

  return {
    id: String(seance.id),
    title: titreEvenement,
    start: `${seance.date}T${seance.heure_debut}`,
    end: construireDateHeureFinCalendrier(seance.date, seance.heure_fin),
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    classNames: classesEvenement,
    typeOrder: 20,
    extendedProps: {
      seance,
      type: "seance",
    },
  };
}

function transformerIndisponibiliteEnEvenement(indisponibilite) {
  if (
    !estDateIsoValide(indisponibilite.date) ||
    !estHeureValide(indisponibilite.heure_debut) ||
    !estHeureFinValide(indisponibilite.heure_fin)
  ) {
    console.warn(
      "Indisponibilite ignoree dans le calendrier car date/heure invalide :",
      indisponibilite.id
    );
    return null;
  }

  if (estIndisponibiliteJourComplet(indisponibilite)) {
    return {
      id: `indisponibilite-${indisponibilite.id}`,
      title: "",
      start: indisponibilite.date,
      end: calculerDateSuivante(indisponibilite.date),
      allDay: true,
      display: "background",
      backgroundColor: "rgba(148, 163, 184, 0.22)",
      classNames: ["indisponibilite-event", "indisponibilite-full-day-event"],
      typeOrder: 0,
      extendedProps: {
        indisponibilite,
        type: "indisponibilite",
      },
    };
  }

  return {
    id: `indisponibilite-${indisponibilite.id}`,
    title: "",
    start: `${indisponibilite.date}T${indisponibilite.heure_debut}`,
    end: construireDateHeureFinCalendrier(
      indisponibilite.date,
      indisponibilite.heure_fin
    ),
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "rgba(148, 163, 184, 0.16)",
    borderColor: "rgba(148, 163, 184, 0.44)",
    textColor: "transparent",
    classNames: ["indisponibilite-event"],
    typeOrder: 10,
    extendedProps: {
      indisponibilite,
      type: "indisponibilite",
    },
  };
}

function transformerPropositionEnEvenement(proposition) {
  if (
    !estDateIsoValide(proposition.date) ||
    !estHeureValide(proposition.heure_debut) ||
    !estHeureFinValide(proposition.heure_fin)
  ) {
    console.warn(
      "Proposition ignoree dans le calendrier car date/heure invalide :",
      proposition.id
    );
    return null;
  }

  const titreEvenement =
    extrairePrenomEtudiant(proposition.etudiant) ||
    proposition.matiere ||
    "Proposition";

  return {
    id: `proposition-${proposition.id}`,
    title: `Prop. ${titreEvenement}`,
    start: `${proposition.date}T${proposition.heure_debut}`,
    end: construireDateHeureFinCalendrier(proposition.date, proposition.heure_fin),
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "rgba(22, 163, 74, 0.42)",
    borderColor: "rgba(21, 128, 61, 0.72)",
    textColor: "#14532d",
    classNames: ["proposition-event"],
    typeOrder: 30,
    extendedProps: {
      proposition,
      type: "proposition",
    },
  };
}

function genererContenuLienPlusEvenements(arg) {
  if (!estCalendrierMobile()) {
    return arg.text;
  }

  return {
    domNodes: [creerElementCalendrier("span", "calendar-mobile-more-link", "...")],
  };
}

function synchroniserEtatVisuelCalendrier(element, typeVue) {
  if (!element) {
    return;
  }

  element.dataset.calendarMobile = estCalendrierMobile() ? "true" : "false";
  element.dataset.calendarView = typeVue || "";
}

function adapterPresentationEvenement(info) {
  const typeEvenement = info.event.extendedProps?.type;
  const estVueMoisMobile = info.view.type === "dayGridMonth" && estCalendrierMobile();
  const estVueSemaineMobile = info.view.type === "timeGridWeek" && estCalendrierMobile();
  const conteneurEvenement = info.el.closest(
    ".fc-timegrid-event-harness, .fc-daygrid-event-harness, .fc-daygrid-event-harness-abs"
  );

  info.el.classList.remove(
    "calendar-mobile-month-seance",
    "calendar-mobile-month-indisponibilite",
    "calendar-mobile-month-proposition",
    "calendar-mobile-week-seance",
    "calendar-mobile-week-indisponibilite",
    "calendar-mobile-week-proposition"
  );
  info.el.style.removeProperty("--calendar-name-length");
  conteneurEvenement?.style.removeProperty("z-index");

  if (typeEvenement === "seance") {
    const prenom = String(info.event.title || "").trim();
    info.el.style.setProperty("--calendar-name-length", String(Math.max(prenom.length, 1)));

    if (estVueMoisMobile) {
      info.el.classList.add("calendar-mobile-month-seance");
      return;
    }

    if (estVueSemaineMobile) {
      info.el.classList.add("calendar-mobile-week-seance");
    }

    return;
  }

  if (typeEvenement === "proposition") {
    conteneurEvenement?.style.setProperty("z-index", "8");
    conteneurEvenement?.style.setProperty("left", "3px", "important");
    conteneurEvenement?.style.setProperty("right", "3px", "important");
    conteneurEvenement?.style.setProperty("width", "auto", "important");
    conteneurEvenement?.style.setProperty("max-width", "calc(100% - 6px)", "important");

    if (estVueMoisMobile) {
      info.el.classList.add("calendar-mobile-month-proposition");
      return;
    }

    if (estVueSemaineMobile) {
      info.el.classList.add("calendar-mobile-week-proposition");
    }

    return;
  }

  if (typeEvenement === "indisponibilite" && estIndisponibiliteJourComplet(info.event.extendedProps?.indisponibilite)) {
    return;
  }

  if (typeEvenement === "indisponibilite" && estVueMoisMobile) {
    info.el.classList.add("calendar-mobile-month-indisponibilite");
    return;
  }

  if (typeEvenement === "indisponibilite" && estVueSemaineMobile) {
    info.el.classList.add("calendar-mobile-week-indisponibilite");
  }
}

export function initialiserCalendrier(
  element,
  {
    onDateClick,
    onSlotClick,
    onSelect,
    onEventClick,
    onIndisponibiliteClick,
    onPropositionClick,
    selectionMobileRapide = false,
    plageHoraire = {},
    timezoneCentrale = "",
  } = {}
) {
  const plugins = recupererPluginsCalendrier();

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    element.innerHTML =
      '<div class="empty-state">Impossible de charger le calendrier.</div>';
    console.error("FullCalendar n'est pas disponible ou ses plugins sont absents.");
    return null;
  }

  const optionsResponsive = obtenirOptionsResponsiveCalendrier();
  const plageHoraireInitiale = normaliserPlageHoraireCalendrier(plageHoraire);

  const calendrier = new FullCalendar.Calendar(element, {
    plugins,
    locale: "fr",
    initialView: optionsResponsive.initialView,
    firstDay: 1,
    height: "auto",
    expandRows: true,
    selectable: true,
    selectMirror: true,
    unselectAuto: true,
    selectLongPressDelay: selectionMobileRapide ? 120 : 1000,
    eventLongPressDelay: selectionMobileRapide ? 360 : 1000,
    longPressDelay: selectionMobileRapide ? 120 : 1000,
    selectMinDistance: selectionMobileRapide ? 0 : 5,
    slotDuration: "00:30:00",
    snapDuration: "00:30:00",
    slotEventOverlap: true,
    eventMinHeight: 34,
    eventOrder: "typeOrder,start,-duration,title",
    fixedWeekCount: Boolean(optionsResponsive.fixedWeekCount),
    allDaySlot: false,
    now: construireMaintenantCalendrier(timezoneCentrale),
    nowIndicator: true,
    slotMinTime: plageHoraireInitiale.slotMinTime,
    slotMaxTime: plageHoraireInitiale.slotMaxTime,
    scrollTime: plageHoraireInitiale.slotMinTime,
    dayMaxEvents: optionsResponsive.dayMaxEvents,
    headerToolbar: optionsResponsive.headerToolbar,
    buttonText: optionsResponsive.buttonText,
    dayHeaderFormat: optionsResponsive.dayHeaderFormat,
    dayHeaderContent: genererContenuEnteteJour,
    moreLinkContent: genererContenuLienPlusEvenements,
    displayEventTime: false,
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      meridiem: false,
    },
    eventDidMount: adapterPresentationEvenement,
    datesSet(info) {
      synchroniserEtatVisuelCalendrier(element, info.view.type);
    },
    windowResize() {
      const vueActive = calendrier.view?.type;
      appliquerOptionsResponsive(calendrier);

      if (estCalendrierMobile()) {
        if (vueActive !== "timeGridWeek" && vueActive !== "dayGridMonth") {
          calendrier.changeView("timeGridWeek");
        }
      }

      synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
    },
    dateClick(info) {
      if (typeof onSlotClick === "function") {
        onSlotClick(extraireCreneauDepuisClicCalendrier(info));
        return;
      }

      onDateClick?.(extraireDateIsoDepuisClicCalendrier(info));
    },
    select(info) {
      onSelect?.(extraireSelectionCalendrier(info));
      info.view?.calendar?.unselect?.();
    },
    eventClick(info) {
      const typeEvenement = info.event.extendedProps?.type;

      if (typeEvenement === "indisponibilite") {
        onIndisponibiliteClick?.(info.event.extendedProps.indisponibilite);
        return;
      }

      if (typeEvenement === "proposition") {
        onPropositionClick?.(info.event.extendedProps.proposition);
        return;
      }

      onEventClick(info.event.extendedProps.seance);
    },
    events: [],
  });

  calendrier.render();
  calendrier.__plageHoraire = plageHoraireInitiale;
  synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
  return calendrier;
}

/**
 * Applies the Handler's configured calendar window to an already rendered
 * FullCalendar instance. `00:00` as an end time represents the end of the
 * civil day and is therefore sent to FullCalendar as `24:00:00`.
 */
export function mettreAJourPlageHoraireCalendrier(calendrier, plageHoraire = {}) {
  const plageNormalisee = normaliserPlageHoraireCalendrier(plageHoraire);

  if (!calendrier || typeof calendrier.setOption !== "function") {
    return plageNormalisee;
  }

  const appliquerOptions = () => {
    calendrier.setOption("slotMinTime", plageNormalisee.slotMinTime);
    calendrier.setOption("slotMaxTime", plageNormalisee.slotMaxTime);
    calendrier.setOption("scrollTime", plageNormalisee.slotMinTime);
  };

  if (typeof calendrier.batchRendering === "function") {
    calendrier.batchRendering(appliquerOptions);
  } else {
    appliquerOptions();
  }

  calendrier.__plageHoraire = plageNormalisee;
  calendrier.scrollToTime?.(plageNormalisee.slotMinTime);
  return plageNormalisee;
}

export function mettreAJourHorlogeCalendrier(calendrier, timezoneCentrale = "") {
  if (!calendrier || typeof calendrier.setOption !== "function") {
    return null;
  }

  const maintenant = construireMaintenantCalendrier(timezoneCentrale);
  calendrier.setOption("now", maintenant);
  calendrier.__timezoneCalendrier = String(timezoneCentrale || "").trim();
  return maintenant;
}

export function mettreAJourEvenements(
  calendrier,
  seances = [],
  indisponibilites = [],
  propositions = []
) {
  if (!calendrier) {
    return;
  }

  calendrier.removeAllEvents();
  calendrier.addEventSource(
    [
      ...seances.map(transformerSeanceEnEvenement),
      ...indisponibilites.map(transformerIndisponibiliteEnEvenement),
      ...propositions.map(transformerPropositionEnEvenement),
    ].filter(Boolean)
  );
}
