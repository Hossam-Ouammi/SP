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

function construireClassesCompte(compte) {
  const compteNormalise = normaliserCompte(compte);

  if (compteNormalise === "yassine") {
    return {
      className: "calendar-account-yassine",
      shortLabel: "Y",
      label: "Yassine",
    };
  }

  if (compteNormalise === "abdo") {
    return {
      className: "calendar-account-abdo",
      shortLabel: "A",
      label: "Abdo",
    };
  }

  return {
    className: "",
    shortLabel: "",
    label: typeof compte === "string" ? compte.trim() : "",
  };
}

function recupererPluginsCalendrier() {
  return [
    globalThis.FullCalendar?.DayGrid?.default,
    globalThis.FullCalendar?.TimeGrid?.default,
    globalThis.FullCalendar?.Interaction?.default,
  ].filter(Boolean);
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

  const palette = palettesStatut[seance.statut_seance] || palettesStatut.planifiee;
  const titreEvenement = seance.libelle || `${seance.matiere} - ${seance.etudiant}`;
  const compteCalendrier = construireClassesCompte(seance.compte);

  return {
    id: String(seance.id),
    title: titreEvenement,
    start: `${seance.date}T${seance.heure_debut}`,
    end: `${seance.date}T${seance.heure_fin}`,
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    classNames: [palette.className, compteCalendrier.className].filter(Boolean),
    extendedProps: {
      seance,
      compteCalendrier,
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

  const calendrier = new FullCalendar.Calendar(element, {
    plugins,
    locale: "fr",
    initialView: "dayGridMonth",
    firstDay: 1,
    height: "auto",
    selectable: true,
    fixedWeekCount: false,
    dayMaxEvents: 2,
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
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      meridiem: false,
    },
    dateClick(info) {
      onDateClick(info.dateStr);
    },
    eventClick(info) {
      onEventClick(info.event.extendedProps.seance);
    },
    eventDidMount(info) {
      const compteCalendrier = info.event.extendedProps.compteCalendrier;

      if (!compteCalendrier) {
        return;
      }

      if (compteCalendrier.shortLabel) {
        info.el.dataset.accountShort = compteCalendrier.shortLabel;
      }

      if (compteCalendrier.label) {
        info.el.dataset.accountLabel = compteCalendrier.label;
        info.el.title = `${compteCalendrier.label} - ${info.event.title}`;
      }
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
