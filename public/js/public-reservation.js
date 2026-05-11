const tokenReservation = String(document.body?.dataset?.reservationToken || "").trim();

const elements = {
  title: document.getElementById("reservation-public-title"),
  subtitle: document.getElementById("reservation-public-subtitle"),
  error: document.getElementById("reservation-public-error"),
  calendar: document.getElementById("reservation-public-calendar"),
  selectionNote: document.getElementById("reservation-public-selection-note"),
  editingState: document.getElementById("reservation-public-editing-state"),
  editingMeta: document.getElementById("reservation-public-editing-meta"),
  editingCancelButton: document.getElementById("reservation-public-editing-cancel-button"),
  selectionEmpty: document.getElementById("reservation-public-selection-empty"),
  selectionContent: document.getElementById("reservation-public-selection-content"),
  selectionDate: document.getElementById("reservation-public-selection-date"),
  selectionTime: document.getElementById("reservation-public-selection-time"),
  selectionDuration: document.getElementById("reservation-public-selection-duration"),
  submitButton: document.getElementById("reservation-public-submit-button"),
  reservationsList: document.getElementById("reservation-public-reservations-list"),
};

const etat = {
  calendrier: null,
  reservation: null,
  planning: null,
  weekStart: "",
  selection: null,
  reservationEnEdition: null,
  synchronisationTimer: null,
};

function afficherErreur(message) {
  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}

function masquerErreur() {
  elements.error.textContent = "";
  elements.error.classList.add("hidden");
}

function toLocalIsoDate(dateObjet) {
  const annee = dateObjet.getFullYear();
  const mois = String(dateObjet.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function formaterDate(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso || "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateObjet);
}

function formaterHoraire(heureDebut, heureFin) {
  return `${heureDebut || "--:--"} - ${heureFin || "--:--"}`;
}

function formaterDuree(dureeMinutes) {
  if (Number(dureeMinutes) === 60) {
    return "1h";
  }

  if (Number(dureeMinutes) === 90) {
    return "1h30";
  }

  if (Number(dureeMinutes) === 120) {
    return "2h";
  }

  return `${Number(dureeMinutes || 0)} min`;
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function construireHeureFin(heureDebut, dureeMinutes) {
  const minutesDebut = convertirHeureEnMinutes(heureDebut);
  const total = minutesDebut + Number(dureeMinutes || 0);

  if (total >= 24 * 60) {
    return "";
  }

  const heures = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function plagesSeChevauchent(premierePlage, secondePlage) {
  if (!premierePlage || !secondePlage || premierePlage.date !== secondePlage.date) {
    return false;
  }

  return (
    convertirHeureEnMinutes(premierePlage.heure_debut) <
      convertirHeureEnMinutes(secondePlage.heure_fin) &&
    convertirHeureEnMinutes(premierePlage.heure_fin) >
      convertirHeureEnMinutes(secondePlage.heure_debut)
  );
}

function reservationEstMemeCreneau(selection, reservation) {
  return (
    selection?.date === reservation?.date &&
    selection?.heure_debut === reservation?.heure_debut &&
    selection?.heure_fin === reservation?.heure_fin
  );
}

function obtenirReservationEnEditionId() {
  return Number(etat.reservationEnEdition?.id || 0);
}

function creneauSelectionneEstLibre(selection, options = {}) {
  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const blocages = Array.isArray(etat.planning?.blocages) ? etat.planning.blocages : [];
  const reservationIgnoreeId = Number(options.ignorerReservationId || 0);
  const reservationsBloquantes = reservations.filter(
    (reservation) => Number(reservation.id) !== reservationIgnoreeId
  );

  return ![...reservationsBloquantes, ...blocages].some((plage) =>
    plagesSeChevauchent(selection, plage)
  );
}

function evenementReservation(reservation) {
  return {
    id: `reservation-${reservation.id}`,
    title: "Votre reservation",
    start: `${reservation.date}T${reservation.heure_debut}`,
    end: `${reservation.date}T${reservation.heure_fin}`,
    backgroundColor: "#1d4ed8",
    borderColor: "#1e40af",
    textColor: "#ffffff",
    classNames: ["reservation-public-own-event"],
    extendedProps: {
      type: "reservation",
      reservation,
    },
  };
}

function evenementBlocage(blocage) {
  const estJourComplet = blocage.type === "jour_complet";

  return {
    id: blocage.id,
    title: "",
    start: estJourComplet ? `${blocage.date}T00:00:00` : `${blocage.date}T${blocage.heure_debut}`,
    end: estJourComplet
      ? `${blocage.date}T23:59:00`
      : `${blocage.date}T${blocage.heure_fin}`,
    allDay: false,
    backgroundColor: "#cbd5e1",
    borderColor: "#94a3b8",
    textColor: "#475569",
    classNames: ["reservation-public-blocked-event"],
    extendedProps: {
      type: "blocked",
      blocage,
    },
  };
}

function mettreAJourCalendrier() {
  if (!etat.calendrier) {
    return;
  }

  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const blocages = Array.isArray(etat.planning?.blocages) ? etat.planning.blocages : [];

  etat.calendrier.removeAllEvents();
  etat.calendrier.addEventSource(
    [
      ...blocages.map(evenementBlocage),
      ...reservations.map(evenementReservation),
    ].filter(Boolean)
  );
}

function mettreAJourEntete() {
  if (!etat.reservation) {
    return;
  }

  elements.title.textContent = `Choisissez votre creneau, ${etat.reservation.etudiant}`;
  elements.subtitle.textContent = `${etat.reservation.matiere} • ${etat.reservation.compte} • Duree fixe ${formaterDuree(
    etat.reservation.duree_minutes
  )}`;
}

function mettreAJourModeEdition() {
  if (!etat.reservationEnEdition) {
    elements.selectionNote.textContent = "Cliquez sur un creneau libre dans la semaine.";
    elements.selectionEmpty.textContent = "Aucun creneau selectionne pour le moment.";
    elements.editingState.classList.add("hidden");
    return;
  }

  elements.selectionNote.textContent =
    "Choisissez un nouveau creneau libre pour reprogrammer cette reservation.";
  elements.selectionEmpty.textContent = "Aucun nouveau creneau selectionne pour le moment.";
  elements.editingMeta.textContent = `${formaterDate(
    etat.reservationEnEdition.date
  )} • ${formaterHoraire(
    etat.reservationEnEdition.heure_debut,
    etat.reservationEnEdition.heure_fin
  )}`;
  elements.editingState.classList.remove("hidden");
}

function mettreAJourSelectionVisuelle() {
  mettreAJourModeEdition();

  if (!etat.selection) {
    elements.selectionEmpty.classList.remove("hidden");
    elements.selectionContent.classList.add("hidden");
    return;
  }

  elements.selectionEmpty.classList.add("hidden");
  elements.selectionContent.classList.remove("hidden");
  elements.selectionDate.textContent = formaterDate(etat.selection.date);
  elements.selectionTime.textContent = formaterHoraire(
    etat.selection.heure_debut,
    etat.selection.heure_fin
  );
  elements.selectionDuration.textContent = formaterDuree(etat.selection.duree_minutes);
  elements.submitButton.textContent = etat.reservationEnEdition
    ? "Confirmer la reprogrammation"
    : "Reserver ce creneau";
}

function reinitialiserSelection() {
  etat.selection = null;
  mettreAJourSelectionVisuelle();
}

function sortirDuModeEdition() {
  etat.reservationEnEdition = null;
  reinitialiserSelection();
}

function activerModeEdition(reservation) {
  etat.reservationEnEdition = reservation || null;
  reinitialiserSelection();
}

function synchroniserReservationEnEdition() {
  const reservationEditionId = obtenirReservationEnEditionId();

  if (!reservationEditionId) {
    mettreAJourModeEdition();
    return;
  }

  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const reservationActualisee = reservations.find(
    (reservation) => Number(reservation.id) === reservationEditionId
  );

  if (!reservationActualisee || reservationActualisee.modifiable !== true) {
    etat.reservationEnEdition = null;
  } else {
    etat.reservationEnEdition = reservationActualisee;
  }

  mettreAJourModeEdition();
}

async function envoyerRequeteReservation(url, options = {}) {
  const reponse = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Requested-With": "XMLHttpRequest",
      ...(options.headers || {}),
    },
  });
  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const erreur = new Error(donnees.message || "Une erreur est survenue.");
    erreur.status = reponse.status;
    throw erreur;
  }

  return donnees;
}

function creerBoutonActionReservation(libelle, classe) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = classe;
  bouton.textContent = libelle;
  return bouton;
}

async function annulerReservationPublique(reservation, bouton) {
  if (reservation?.modifiable !== true) {
    afficherErreur("Cette reservation n'est plus modifiable.");
    return;
  }

  const confirmation = window.confirm(
    `Annuler la reservation du ${formaterDate(reservation.date)} de ${reservation.heure_debut} a ${reservation.heure_fin} ?`
  );

  if (!confirmation) {
    return;
  }

  masquerErreur();
  const texteInitial = bouton?.textContent || "Annuler";

  if (bouton) {
    bouton.disabled = true;
    bouton.textContent = "Annulation...";
  }

  try {
    await envoyerRequeteReservation(
      `/api/reservation-public/${encodeURIComponent(
        tokenReservation
      )}/reservations/${Number(reservation.id)}`,
      {
        method: "DELETE",
      }
    );

    if (Number(reservation.id) === obtenirReservationEnEditionId()) {
      etat.reservationEnEdition = null;
    }

    reinitialiserSelection();
    await chargerPlanning(etat.weekStart);
  } catch (erreur) {
    afficherErreur(erreur.message || "L'annulation a echoue.");
  } finally {
    if (bouton) {
      bouton.disabled = false;
      bouton.textContent = texteInitial;
    }
  }
}

function rendreListeReservations() {
  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];

  elements.reservationsList.innerHTML = "";

  if (reservations.length === 0) {
    elements.reservationsList.innerHTML =
      '<div class="empty-state">Aucune reservation pour le moment.</div>';
    return;
  }

  reservations
    .slice()
    .sort((premiere, seconde) => {
      const clePremiere = `${premiere.date}T${premiere.heure_debut}`;
      const cleSeconde = `${seconde.date}T${seconde.heure_debut}`;
      return clePremiere.localeCompare(cleSeconde);
    })
    .forEach((reservation) => {
      const carte = document.createElement("article");
      carte.className = "reservation-public-reservation-item";

      if (Number(reservation.id) === obtenirReservationEnEditionId()) {
        carte.classList.add("is-editing");
      }

      const titre = document.createElement("strong");
      titre.textContent = formaterDate(reservation.date);

      const meta = document.createElement("div");
      meta.className = "reservation-public-reservation-meta";
      meta.textContent = `${formaterHoraire(
        reservation.heure_debut,
        reservation.heure_fin
      )} • ${formaterDuree(reservation.duree_minutes)}`;

      carte.append(titre, meta);

      if (reservation.modifiable === true) {
        const actions = document.createElement("div");
        actions.className = "reservation-public-reservation-actions";

        const boutonReprogrammer = creerBoutonActionReservation(
          Number(reservation.id) === obtenirReservationEnEditionId()
            ? "Reprogrammation active"
            : "Reprogrammer",
          "button secondary"
        );
        boutonReprogrammer.disabled = Number(reservation.id) === obtenirReservationEnEditionId();
        boutonReprogrammer.addEventListener("click", () => {
          masquerErreur();
          activerModeEdition(reservation);
          rendreListeReservations();
        });

        const boutonAnnuler = creerBoutonActionReservation("Annuler", "button danger");
        boutonAnnuler.addEventListener("click", () =>
          annulerReservationPublique(reservation, boutonAnnuler)
        );

        actions.append(boutonReprogrammer, boutonAnnuler);
        carte.append(actions);
      }

      elements.reservationsList.appendChild(carte);
    });
}

async function recupererPlanning(weekStart) {
  return envoyerRequeteReservation(
    `/api/reservation-public/${encodeURIComponent(tokenReservation)}?week_start=${encodeURIComponent(
      weekStart
    )}`
  );
}

async function chargerPlanning(weekStart) {
  const resultat = await recupererPlanning(weekStart);
  etat.reservation = resultat.reservation;
  etat.planning = resultat.planning;
  etat.weekStart = resultat.planning.week_start;
  synchroniserReservationEnEdition();
  mettreAJourEntete();
  mettreAJourCalendrier();
  rendreListeReservations();

  if (
    !etat.selection ||
    !creneauSelectionneEstLibre(etat.selection, {
      ignorerReservationId: obtenirReservationEnEditionId(),
    })
  ) {
    reinitialiserSelection();
  } else {
    mettreAJourSelectionVisuelle();
  }
}

async function reserverOuReprogrammerSelection() {
  if (!etat.selection) {
    return;
  }

  masquerErreur();
  const reservationEditionId = obtenirReservationEnEditionId();

  if (
    !creneauSelectionneEstLibre(etat.selection, {
      ignorerReservationId: reservationEditionId,
    })
  ) {
    afficherErreur("Ce creneau est deja reserve ou indisponible.");
    return;
  }

  if (
    etat.reservationEnEdition &&
    reservationEstMemeCreneau(etat.selection, etat.reservationEnEdition)
  ) {
    afficherErreur("Choisissez un autre creneau pour reprogrammer cette reservation.");
    return;
  }

  elements.submitButton.disabled = true;
  const texteInitial = elements.submitButton.textContent;
  elements.submitButton.textContent = etat.reservationEnEdition
    ? "Reprogrammation..."
    : "Reservation...";

  try {
    if (etat.reservationEnEdition) {
      await envoyerRequeteReservation(
        `/api/reservation-public/${encodeURIComponent(
          tokenReservation
        )}/reservations/${Number(etat.reservationEnEdition.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            date: etat.selection.date,
            heure_debut: etat.selection.heure_debut,
          }),
        }
      );
      etat.reservationEnEdition = null;
    } else {
      await envoyerRequeteReservation(
        `/api/reservation-public/${encodeURIComponent(tokenReservation)}/reserver`,
        {
          method: "POST",
          body: JSON.stringify({
            date: etat.selection.date,
            heure_debut: etat.selection.heure_debut,
          }),
        }
      );
    }

    reinitialiserSelection();
    await chargerPlanning(etat.weekStart);
  } catch (erreur) {
    afficherErreur(erreur.message || "La reservation a echoue.");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = texteInitial;
  }
}

function gererClicDate(info) {
  masquerErreur();

  const date = toLocalIsoDate(info.date);
  const heureDebut = String(info.dateStr || "").split("T")[1]?.slice(0, 5) || "";
  const dureeMinutes = Number(etat.reservation?.duree_minutes || 0);

  if (!heureDebut || !dureeMinutes) {
    return;
  }

  const maintenant = new Date();

  if (info.date.getTime() < maintenant.getTime()) {
    afficherErreur("Ce creneau n'est plus reservable.");
    return;
  }

  const selection = {
    date,
    heure_debut: heureDebut,
    heure_fin: construireHeureFin(heureDebut, dureeMinutes),
    duree_minutes: dureeMinutes,
  };

  if (!selection.heure_fin) {
    afficherErreur("Ce creneau depasse la fin de la journee.");
    return;
  }

  if (
    etat.reservationEnEdition &&
    reservationEstMemeCreneau(selection, etat.reservationEnEdition)
  ) {
    afficherErreur("Ce creneau correspond deja a votre reservation actuelle.");
    return;
  }

  if (
    !creneauSelectionneEstLibre(selection, {
      ignorerReservationId: obtenirReservationEnEditionId(),
    })
  ) {
    afficherErreur("Ce creneau est deja reserve ou indisponible.");
    return;
  }

  etat.selection = selection;
  mettreAJourSelectionVisuelle();
}

function gererClicEvenement(info) {
  const type = info.event.extendedProps?.type;

  if (type === "reservation") {
    const reservation = info.event.extendedProps.reservation;

    if (reservation?.modifiable !== true) {
      afficherErreur("Cette reservation n'est plus modifiable.");
      return;
    }

    masquerErreur();
    activerModeEdition(reservation);
    rendreListeReservations();
    return;
  }

  afficherErreur("Ce creneau n'est pas disponible.");
}

function initialiserCalendrier() {
  const plugins = [
    globalThis.FullCalendar?.TimeGrid?.default,
    globalThis.FullCalendar?.Interaction?.default,
  ].filter(Boolean);

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    afficherErreur("Impossible de charger le calendrier.");
    return;
  }

  etat.calendrier = new FullCalendar.Calendar(elements.calendar, {
    plugins,
    locale: "fr",
    initialView: "timeGridWeek",
    firstDay: 1,
    allDaySlot: false,
    slotMinTime: "08:00:00",
    slotMaxTime: "23:30:00",
    slotDuration: "00:30:00",
    snapDuration: "00:30:00",
    height: "auto",
    nowIndicator: true,
    selectable: false,
    expandRows: true,
    eventMinHeight: 36,
    displayEventTime: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "",
    },
    buttonText: {
      today: "Aujourd'hui",
    },
    datesSet(info) {
      const weekStart = toLocalIsoDate(info.start);

      if (weekStart && weekStart !== etat.weekStart) {
        chargerPlanning(weekStart).catch((erreur) => {
          afficherErreur(erreur.message || "Impossible de charger le planning.");
        });
      }
    },
    dateClick: gererClicDate,
    eventClick: gererClicEvenement,
    events: [],
  });

  etat.calendrier.render();
}

function lancerSynchronisationAutomatique() {
  if (etat.synchronisationTimer) {
    window.clearInterval(etat.synchronisationTimer);
  }

  etat.synchronisationTimer = window.setInterval(() => {
    if (!etat.weekStart) {
      return;
    }

    chargerPlanning(etat.weekStart).catch(() => {});
  }, 30000);
}

async function initialiserPage() {
  if (!tokenReservation) {
    afficherErreur("Lien de reservation invalide.");
    return;
  }

  reinitialiserSelection();
  initialiserCalendrier();
  lancerSynchronisationAutomatique();
  elements.submitButton?.addEventListener("click", reserverOuReprogrammerSelection);
  elements.editingCancelButton?.addEventListener("click", () => {
    masquerErreur();
    sortirDuModeEdition();
    rendreListeReservations();
  });
}

initialiserPage();
