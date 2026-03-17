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

function normaliserCompte(compte) {
  return typeof compte === "string" ? compte.trim().toLowerCase() : "";
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

function obtenirOptionsResponsiveCalendrier() {
  if (estCalendrierMobile()) {
    return {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "today dayGridMonth,timeGridWeek",
      },
      buttonText: {
        today: "Auj.",
        month: "Mois",
        week: "Sem.",
      },
      dayHeaderFormat: {
        weekday: "short",
        day: "numeric",
      },
      dayMaxEvents: 1,
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
  const titreEvenement = seance.libelle || `${seance.matiere} - ${seance.etudiant}`;
  const compteNormalise = normaliserCompte(seance.compte);
  const classesEvenement = [palette.className];

  if (compteNormalise === "yassine" || compteNormalise === "abdo") {
    classesEvenement.push(`compte-${compteNormalise}`);
  }

  return {
    id: String(seance.id),
    title: titreEvenement,
    start: `${seance.date}T${seance.heure_debut}`,
    end: `${seance.date}T${seance.heure_fin}`,
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    classNames: classesEvenement,
    extendedProps: {
      seance,
    },
  };
}

export function initialiserCalendrier(element, { onDateClick, onEventClick }) {
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
    selectable: true,
    fixedWeekCount: false,
    allDaySlot: false,
    dayMaxEvents: optionsResponsive.dayMaxEvents,
    headerToolbar: optionsResponsive.headerToolbar,
    buttonText: optionsResponsive.buttonText,
    dayHeaderFormat: optionsResponsive.dayHeaderFormat,
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      meridiem: false,
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
    },
    dateClick(info) {
      onDateClick(info.dateStr);
    },
    eventClick(info) {
      onEventClick(info.event.extendedProps.seance);
    },
    events: [],
  });

  calendrier.render();
  return calendrier;
}

export function mettreAJourEvenements(calendrier, seances) {
  if (!calendrier) {
    return;
  }

  calendrier.removeAllEvents();
  calendrier.addEventSource(seances.map(transformerSeanceEnEvenement).filter(Boolean));
}
