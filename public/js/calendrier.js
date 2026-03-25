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

function estIndisponibiliteJourComplet(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function normaliserCompte(compte) {
  return typeof compte === "string" ? compte.trim().toLowerCase() : "";
}

function creerClasseCompte(compte) {
  const compteNormalise = normaliserCompte(compte);

  if (!compteNormalise) {
    return "";
  }

  return `compte-${compteNormalise.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function obtenirPaletteCompte(seance) {
  const compteNormalise = normaliserCompte(seance.compte);
  const statut = seance.statut_seance;

  if (compteNormalise === "yassine") {
    return {
      planifiee: {
        backgroundColor: "#deecff",
        borderColor: "#78a7e8",
        textColor: "#173f7a",
      },
      faite: {
        backgroundColor: "#def5e8",
        borderColor: "#84c6a0",
        textColor: "#1f5a3a",
      },
      annulee: {
        backgroundColor: "#fae2e5",
        borderColor: "#de95a2",
        textColor: "#92344c",
      },
      reportee: {
        backgroundColor: "#ffefd7",
        borderColor: "#e3b56a",
        textColor: "#8a4d0f",
      },
    }[statut];
  }

  if (compteNormalise === "abdo") {
    return {
      planifiee: {
        backgroundColor: "#edf2f7",
        borderColor: "#94a3b8",
        textColor: "#334155",
      },
      faite: {
        backgroundColor: "#e9f3ee",
        borderColor: "#9db8ab",
        textColor: "#325446",
      },
      annulee: {
        backgroundColor: "#f5eaec",
        borderColor: "#c9aab0",
        textColor: "#7f4854",
      },
      reportee: {
        backgroundColor: "#f7efe2",
        borderColor: "#d2b48c",
        textColor: "#7a5a2a",
      },
    }[statut];
  }

  return null;
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

function extraireDateIsoDepuisValeurCalendrier(valeur) {
  const texte = String(valeur || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return texte;
  }

  const correspondance = texte.match(/^(\d{4}-\d{2}-\d{2})/);
  return correspondance ? correspondance[1] : "";
}

function calculerDateSuivante(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setDate(dateObjet.getDate() + 1);
  return dateObjet.toISOString().slice(0, 10);
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
      initialView: "dayGridMonth",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "dayGridMonth,timeGridWeek",
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
      initialView: "dayGridMonth",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "dayGridMonth,timeGridWeek",
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
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek",
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
    !estHeureValide(seance.heure_fin)
  ) {
    console.warn("Séance ignorée dans le calendrier car date/heure invalide :", seance.id);
    return null;
  }

  const paletteCompte = obtenirPaletteCompte(seance);
  const palette = paletteCompte || palettesStatut[seance.statut_seance] || palettesStatut.planifiee;
  const titreEvenement = extrairePrenomEtudiant(seance.etudiant) || seance.libelle || "Seance";
  const compteNormalise = normaliserCompte(seance.compte);
  const classeCompte = creerClasseCompte(compteNormalise);
  const classesEvenement = [palette.className];

  if (classeCompte) {
    classesEvenement.push(classeCompte);
  }

  return {
    id: String(seance.id),
    title: titreEvenement,
    start: `${seance.date}T${seance.heure_debut}`,
    end: `${seance.date}T${seance.heure_fin}`,
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    classNames: classesEvenement,
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
    !estHeureValide(indisponibilite.heure_fin)
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
    end: `${indisponibilite.date}T${indisponibilite.heure_fin}`,
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "#4b5563",
    borderColor: "#374151",
    textColor: "#f8fafc",
    classNames: ["indisponibilite-event"],
    extendedProps: {
      indisponibilite,
      type: "indisponibilite",
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

  info.el.classList.remove(
    "calendar-mobile-month-seance",
    "calendar-mobile-month-indisponibilite",
    "calendar-mobile-week-seance",
    "calendar-mobile-week-indisponibilite"
  );
  info.el.style.removeProperty("--calendar-name-length");

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
  { onDateClick, onEventClick, onIndisponibiliteClick }
) {
  const plugins = recupererPluginsCalendrier();

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    element.innerHTML =
      '<div class="empty-state">Impossible de charger le calendrier.</div>';
    console.error("FullCalendar n'est pas disponible ou ses plugins sont absents.");
    return null;
  }

  const optionsResponsive = obtenirOptionsResponsiveCalendrier();

  const calendrier = new FullCalendar.Calendar(element, {
    plugins,
    locale: "fr",
    initialView: optionsResponsive.initialView,
    firstDay: 1,
    height: "auto",
    expandRows: true,
    selectable: true,
    slotEventOverlap: false,
    eventMinHeight: 34,
    fixedWeekCount: Boolean(optionsResponsive.fixedWeekCount),
    allDaySlot: false,
    nowIndicator: true,
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
      } else if (vueActive === "timeGridWeek" && !estCalendrierCompact()) {
        calendrier.changeView("dayGridMonth");
      }

      synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
    },
    dateClick(info) {
      onDateClick(extraireDateIsoDepuisValeurCalendrier(info.dateStr));
    },
    eventClick(info) {
      const typeEvenement = info.event.extendedProps?.type;

      if (typeEvenement === "indisponibilite") {
        onIndisponibiliteClick?.(info.event.extendedProps.indisponibilite);
        return;
      }

      onEventClick(info.event.extendedProps.seance);
    },
    events: [],
  });

  calendrier.render();
  synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
  return calendrier;
}

export function mettreAJourEvenements(calendrier, seances = [], indisponibilites = []) {
  if (!calendrier) {
    return;
  }

  calendrier.removeAllEvents();
  calendrier.addEventSource(
    [
      ...seances.map(transformerSeanceEnEvenement),
      ...indisponibilites.map(transformerIndisponibiliteEnEvenement),
    ].filter(Boolean)
  );
}
