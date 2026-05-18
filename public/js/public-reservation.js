const publicTimezoneLabel = String(
  document.body?.dataset?.publicTimezoneLabel || "heure de France"
).trim();

const elements = {
  calendar: document.getElementById("reservation-public-calendar"),
  error: document.getElementById("reservation-public-error"),
  feedback: document.getElementById("reservation-public-feedback"),
  deviceNote: document.getElementById("reservation-public-device-note"),
  reservationsList: document.getElementById("reservation-public-reservations-list"),
  calendarPanel: document.getElementById("reservation-public-calendar-panel"),
  listPanel: document.getElementById("reservation-public-list-panel"),
  tabs: Array.from(document.querySelectorAll("[data-reservation-view]")),
  modal: document.getElementById("reservation-public-modal"),
  detailsModal: document.getElementById("reservation-public-details-modal"),
  openButton: document.getElementById("reservation-public-open-button"),
  date: document.getElementById("reservation-public-date"),
  start: document.getElementById("reservation-public-start"),
  duration: document.getElementById("reservation-public-duration"),
  form: document.getElementById("reservation-public-form"),
  formError: document.getElementById("reservation-public-form-error"),
  submitButton: document.getElementById("reservation-public-submit-button"),
  student: document.getElementById("reservation-public-student"),
  parent: document.getElementById("reservation-public-parent"),
  subject: document.getElementById("reservation-public-subject"),
  detailsDate: document.getElementById("reservation-public-details-date"),
  detailsTime: document.getElementById("reservation-public-details-time"),
  detailsDuration: document.getElementById("reservation-public-details-duration"),
  detailsStudent: document.getElementById("reservation-public-details-student"),
  detailsParent: document.getElementById("reservation-public-details-parent"),
  detailsSubject: document.getElementById("reservation-public-details-subject"),
};

const etat = {
  calendrier: null,
  profil: {
    connu: false,
    etudiant: "",
    parent: "",
  },
  derniereMatiere: "",
  config: {
    duree_minutes: 60,
    durees_autorisees: [60, 90, 120],
    timezone_public_label: publicTimezoneLabel,
    slot_min_time: "10:00",
    slot_max_time: "23:00",
  },
  planning: {
    date_reference: "",
    reservations: [],
    blocages: [],
    week_start: "",
  },
  selection: null,
  selectionEstDisponible: false,
  vueActive: "calendar",
  requetePlanningId: 0,
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

function afficherFeedback(message, type = "success") {
  if (!elements.feedback) {
    return;
  }

  elements.feedback.textContent = message;
  elements.feedback.className = `reservation-public-feedback reservation-public-feedback-${type}`;
  elements.feedback.classList.remove("hidden");
}

function masquerFeedback() {
  if (!elements.feedback) {
    return;
  }

  elements.feedback.textContent = "";
  elements.feedback.className = "reservation-public-feedback hidden";
}

function afficherErreurFormulaire(message) {
  elements.formError.textContent = message;
  elements.formError.classList.remove("hidden");
}

function masquerErreurFormulaire() {
  elements.formError.textContent = "";
  elements.formError.classList.add("hidden");
}

function lireMatiereMemoire() {
  try {
    return String(window.localStorage?.getItem("reservation-public-subject") || "").trim();
  } catch (error) {
    return "";
  }
}

function memoriserMatiere(valeur) {
  try {
    window.localStorage?.setItem("reservation-public-subject", String(valeur || "").trim());
  } catch (error) {
    // Ignore storage errors.
  }
}

function lireDureeMemoire() {
  try {
    const duree = Number(window.localStorage?.getItem("reservation-public-duration") || 0);
    return Number.isFinite(duree) ? duree : 0;
  } catch (error) {
    return 0;
  }
}

function memoriserDuree(valeur) {
  try {
    window.localStorage?.setItem("reservation-public-duration", String(Number(valeur) || 0));
  } catch (error) {
    // Ignore storage errors.
  }
}

function activerVueReservation(vue) {
  etat.vueActive = vue === "reservations" ? "reservations" : "calendar";

  elements.tabs.forEach((onglet) => {
    const estActif = onglet.dataset.reservationView === etat.vueActive;
    onglet.classList.toggle("is-active", estActif);
    onglet.setAttribute("aria-selected", estActif ? "true" : "false");
  });

  elements.calendarPanel?.classList.toggle("hidden", etat.vueActive !== "calendar");
  elements.listPanel?.classList.toggle("hidden", etat.vueActive !== "reservations");

  if (etat.vueActive === "calendar") {
    window.setTimeout(() => {
      etat.calendrier?.updateSize();
    }, 30);
  }
}

function estCalendrierMobile() {
  return globalThis.matchMedia?.("(max-width: 560px)")?.matches ?? false;
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

function genererContenuEnteteJour(info) {
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

function synchroniserEtatVisuelCalendrier(element, typeVue) {
  if (!element) {
    return;
  }

  element.dataset.calendarMobile = estCalendrierMobile() ? "true" : "false";
  element.dataset.calendarView = typeVue || "";
}

function construireDatePseudoUtc(dateIso, heure) {
  return new Date(`${dateIso}T${heure}:00Z`);
}

function extraireDateIsoPseudoUtc(dateObjet) {
  return dateObjet.toISOString().slice(0, 10);
}

function extraireHeurePseudoUtc(dateObjet) {
  return dateObjet.toISOString().slice(11, 16);
}

function estDateIsoValide(dateIso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ""));
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""));
}

function extrairePrenom(nomComplet) {
  return (
    String(nomComplet || "")
      .trim()
      .split(/\s+/)
      .find(Boolean) || ""
  );
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);

  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) {
    return NaN;
  }

  return heures * 60 + minutes;
}

function construireHeureFin(heureDebut, dureeMinutes) {
  const total = convertirHeureEnMinutes(heureDebut) + Number(dureeMinutes || 0);

  if (!Number.isFinite(total) || total > 24 * 60) {
    return "";
  }

  const heures = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${heures}:${minutes}`;
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

function formaterDate(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso || "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dateObjet);
}

function formaterHoraire(plage) {
  if (!plage) {
    return "-";
  }

  const suffixe = plage.date_fin && plage.date_fin !== plage.date ? " (+1j)" : "";
  return `${plage.heure_debut} - ${plage.heure_fin}${suffixe}`;
}

function trouverReservationParId(id) {
  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const identifiant = String(id || "").replace(/^reservation-/, "");

  return reservations.find((reservation) => String(reservation.id) === identifiant) || null;
}

function afficherDetailsReservation(reservation) {
  if (!reservation || !elements.detailsModal) {
    return;
  }

  elements.detailsDate.textContent = formaterDate(reservation.date);
  elements.detailsTime.textContent = formaterHoraire(reservation);
  elements.detailsDuration.textContent = formaterDuree(reservation.duree_minutes);
  elements.detailsStudent.textContent = reservation.etudiant || "-";
  elements.detailsParent.textContent = reservation.parent || "-";
  elements.detailsSubject.textContent = reservation.matiere || "-";

  elements.detailsModal.classList.remove("hidden");
  elements.detailsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function fermerDetailsReservation() {
  if (!elements.detailsModal) {
    return;
  }

  elements.detailsModal.classList.add("hidden");
  elements.detailsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function construireSelection(dateIso, heureDebut, dureeMinutes) {
  if (!estDateIsoValide(dateIso) || !estHeureValide(heureDebut)) {
    return null;
  }

  const heureFin = construireHeureFin(heureDebut, dureeMinutes);

  if (!heureFin) {
    return null;
  }

  const instantDebut = construireDatePseudoUtc(dateIso, heureDebut);
  const instantFin = new Date(instantDebut.getTime() + Number(dureeMinutes || 0) * 60 * 1000);

  return {
    date: extraireDateIsoPseudoUtc(instantDebut),
    date_fin: extraireDateIsoPseudoUtc(instantFin),
    heure_debut: extraireHeurePseudoUtc(instantDebut),
    heure_fin: extraireHeurePseudoUtc(instantFin),
    duree_minutes: Number(dureeMinutes || 0),
  };
}

function obtenirDureeSelectionnee() {
  return Number(elements.duration?.value || etat.config.duree_minutes || 60);
}

function construireHorodatages(plage) {
  const debut = construireDatePseudoUtc(plage.date, plage.heure_debut).getTime();
  const fin = construireDatePseudoUtc(
    plage.date_fin || plage.date,
    plage.heure_fin
  ).getTime();

  return {
    debut,
    fin,
  };
}

function plagesSeChevauchent(premierePlage, secondePlage) {
  if (!premierePlage || !secondePlage) {
    return false;
  }

  const premiere = construireHorodatages(premierePlage);
  const seconde = construireHorodatages(secondePlage);

  return premiere.debut < seconde.fin && premiere.fin > seconde.debut;
}

function creneauSelectionneEstLibre(selection) {
  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const blocages = Array.isArray(etat.planning?.blocages) ? etat.planning.blocages : [];

  return ![...reservations, ...blocages].some((plage) => plagesSeChevauchent(selection, plage));
}

function selectionRespecteBornes(selection) {
  if (!selection) {
    return false;
  }

  const debut = convertirHeureEnMinutes(selection.heure_debut);
  const fin = convertirHeureEnMinutes(selection.heure_fin);
  const min = convertirHeureEnMinutes(etat.config.slot_min_time || "10:00");
  const max = convertirHeureEnMinutes(etat.config.slot_max_time || "23:00");

  return (
    Number.isFinite(debut) &&
    Number.isFinite(fin) &&
    debut >= min &&
    fin <= max &&
    selection.date === (selection.date_fin || selection.date)
  );
}

function evenementReservation(reservation) {
  return {
    id: `reservation-${reservation.id}`,
    title: extrairePrenom(reservation.etudiant) || reservation.matiere || "Séance",
    start: `${reservation.date}T${reservation.heure_debut}:00Z`,
    end: `${reservation.date_fin || reservation.date}T${reservation.heure_fin}:00Z`,
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "#e3eefb",
    borderColor: "#a4bfd9",
    textColor: "#244866",
    classNames: ["status-planifiee", "reservation-public-own-event"],
    extendedProps: {
      type: "reservation",
      reservation,
    },
  };
}

function evenementBlocage(blocage) {
  return {
    id: blocage.id,
    title: "",
    start: `${blocage.date}T${blocage.heure_debut}:00Z`,
    end: `${blocage.date_fin || blocage.date}T${blocage.heure_fin}:00Z`,
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "#4b5563",
    borderColor: "#374151",
    textColor: "#f8fafc",
    classNames: ["indisponibilite-event", "reservation-public-blocked-event"],
    extendedProps: {
      type: "blocked",
      blocage,
    },
  };
}

function evenementSelection(selection) {
  if (!selection) {
    return null;
  }

  return {
    id: "reservation-selection-preview",
    title: "Nouveau",
    start: `${selection.date}T${selection.heure_debut}:00Z`,
    end: `${selection.date_fin || selection.date}T${selection.heure_fin}:00Z`,
    backgroundColor: "rgba(29, 78, 216, 0.14)",
    borderColor: "#1d4ed8",
    textColor: "#1e40af",
    classNames: ["reservation-public-selected-event"],
    editable: false,
    overlap: false,
    extendedProps: {
      type: "selection",
    },
  };
}

function adapterPresentationEvenement(info) {
  const typeEvenement = info.event.extendedProps?.type;
  const estVueSemaineMobile =
    info.view.type === "timeGridWeek" &&
    (globalThis.matchMedia?.("(max-width: 560px)")?.matches ?? false);

  info.el.classList.remove("calendar-mobile-week-seance", "calendar-mobile-week-indisponibilite");

  if (typeEvenement === "reservation" && estVueSemaineMobile) {
    info.el.classList.add("calendar-mobile-week-seance");
    return;
  }

  if (typeEvenement === "blocked" && estVueSemaineMobile) {
    info.el.classList.add("calendar-mobile-week-indisponibilite");
  }
}

function mettreAJourCalendrier() {
  if (!etat.calendrier) {
    return;
  }

  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  const blocages = Array.isArray(etat.planning?.blocages) ? etat.planning.blocages : [];
  const apercuSelection =
    etat.selection && etat.selectionEstDisponible ? evenementSelection(etat.selection) : null;

  etat.calendrier.removeAllEvents();
  etat.calendrier.addEventSource([
    ...blocages.map(evenementBlocage),
    ...reservations.map(evenementReservation),
    apercuSelection,
  ].filter(Boolean));
}

function mettreAJourProfil() {
  if (!etat.profil?.connu) {
    elements.deviceNote.textContent = "";
    elements.deviceNote.classList.add("hidden");
    return;
  }

  elements.deviceNote.textContent = `Appareil : ${etat.profil.etudiant}`;
  elements.deviceNote.classList.remove("hidden");
}

function mettreAJourFormulaireDepuisProfil() {
  if (etat.profil?.connu) {
    elements.student.value = etat.profil.etudiant || "";
    elements.parent.value = etat.profil.parent || "";
  }

  if (!elements.subject.value && etat.derniereMatiere) {
    elements.subject.value = etat.derniereMatiere;
  }
}

function peuplerOptionsDuree() {
  const durees = Array.isArray(etat.config?.durees_autorisees)
    ? etat.config.durees_autorisees
    : [60, 90, 120];
  const dureeMemoire = lireDureeMemoire();
  const dureeActive = durees.includes(dureeMemoire)
    ? dureeMemoire
    : Number(etat.config.duree_minutes || durees[0] || 60);

  elements.duration.innerHTML = "";
  durees.forEach((duree) => {
    const option = document.createElement("option");
    option.value = String(duree);
    option.textContent = formaterDuree(duree);
    option.selected = Number(duree) === Number(dureeActive);
    elements.duration.appendChild(option);
  });
}

function synchroniserSelectionDepuisFormulaire() {
  const selection = construireSelection(
    elements.date.value,
    elements.start.value,
    obtenirDureeSelectionnee()
  );

  etat.selection = selection;
  etat.selectionEstDisponible = false;
  elements.submitButton.disabled = true;
  masquerErreurFormulaire();

  if (!selection) {
    afficherErreurFormulaire("Choisissez une date, une heure et une durée valides.");
    mettreAJourCalendrier();
    return;
  }

  if (!selectionRespecteBornes(selection)) {
    afficherErreurFormulaire("Ce créneau dépasse les horaires disponibles.");
    mettreAJourCalendrier();
    return;
  }

  if (!creneauSelectionneEstLibre(selection)) {
    afficherErreurFormulaire("Ce créneau est déjà occupé.");
    mettreAJourCalendrier();
    return;
  }

  etat.selectionEstDisponible = true;
  elements.submitButton.disabled = false;
  mettreAJourCalendrier();
}

function obtenirDateInitialeFormulaire() {
  return (
    etat.planning?.date_reference ||
    etat.planning?.week_start ||
    new Date().toISOString().slice(0, 10)
  );
}

function naviguerVersDate(dateIso) {
  if (!etat.calendrier || !estDateIsoValide(dateIso)) {
    return;
  }

  etat.calendrier.gotoDate(`${dateIso}T12:00:00Z`);
}

function ouvrirModal() {
  elements.modal.classList.remove("hidden");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function fermerModal() {
  elements.modal.classList.add("hidden");
  elements.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  masquerErreurFormulaire();
  etat.selection = null;
  etat.selectionEstDisponible = false;
  mettreAJourCalendrier();
}

function ouvrirModalPourCreneau(creneau = {}) {
  elements.date.value = creneau.date || obtenirDateInitialeFormulaire();
  elements.start.value = creneau.heure_debut || etat.config.slot_min_time || "10:00";
  peuplerOptionsDuree();
  mettreAJourFormulaireDepuisProfil();
  synchroniserSelectionDepuisFormulaire();
  masquerErreur();
  masquerFeedback();
  ouvrirModal();
  window.setTimeout(() => {
    const champCible = elements.student?.value ? (elements.subject?.value ? elements.date : elements.subject) : elements.student;
    champCible?.focus();
  }, 30);
}

function reinitialiserListeReservations() {
  if (!elements.reservationsList) {
    return;
  }

  const reservations = Array.isArray(etat.planning?.reservations) ? etat.planning.reservations : [];
  elements.reservationsList.innerHTML = "";

  reservations
    .slice()
    .sort((premiere, seconde) => {
      return construireHorodatages(premiere).debut - construireHorodatages(seconde).debut;
    })
    .forEach((reservation) => {
      const carte = document.createElement("article");
      carte.className = "reservation-public-reservation-item";
      carte.tabIndex = 0;

      const titre = document.createElement("strong");
      titre.textContent = formaterDate(reservation.date);

      const meta = document.createElement("span");
      meta.className = "reservation-public-reservation-meta";
      meta.textContent = `${formaterHoraire(reservation)} - ${formaterDuree(
        reservation.duree_minutes
      )}`;

      const sujet = document.createElement("span");
      sujet.className = "reservation-public-reservation-subject";
      sujet.textContent = reservation.matiere || "Matière";

      const participant = document.createElement("span");
      participant.className = "reservation-public-reservation-student";
      participant.textContent = [reservation.etudiant, reservation.parent ? `Parent : ${reservation.parent}` : ""]
        .filter(Boolean)
        .join(" · ");

      const afficher = () => afficherDetailsReservation(reservation);
      carte.addEventListener("click", afficher);
      carte.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          afficher();
        }
      });
      carte.append(titre, meta, sujet, participant);
      elements.reservationsList.appendChild(carte);
    });

  if (reservations.length === 0) {
    elements.reservationsList.innerHTML =
      '<div class="empty-state">Aucune réservation pour le moment.</div>';
  }
}

async function envoyerRequete(url, options = {}) {
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

async function recupererPlanning(weekStart = "") {
  const suffixe = weekStart
    ? `?week_start=${encodeURIComponent(weekStart)}`
    : "";

  return envoyerRequete(`/api/reservation-public${suffixe}`);
}

async function appliquerResultatPlanning(resultat) {
  etat.profil = resultat.profil || etat.profil;
  etat.config = {
    ...etat.config,
    ...(resultat.config || {}),
  };
  etat.planning = resultat.planning || etat.planning;
  mettreAJourProfil();
  mettreAJourCalendrier();
  reinitialiserListeReservations();

  if (!elements.date.value) {
    elements.date.value = obtenirDateInitialeFormulaire();
  }
}

async function chargerPlanning(weekStart) {
  const requeteId = ++etat.requetePlanningId;
  const resultat = await recupererPlanning(weekStart);

  if (requeteId !== etat.requetePlanningId) {
    return;
  }

  await appliquerResultatPlanning(resultat);
  synchroniserSelectionDepuisFormulaire();
}

function gererClicDate(info) {
  const dateStr = String(info.dateStr || "");
  ouvrirModalPourCreneau({
    date: dateStr.slice(0, 10),
    heure_debut: dateStr.slice(11, 16) || etat.config.slot_min_time || "10:00",
  });
}

function gererClicEvenement(info) {
  const type = info.event.extendedProps?.type;

  if (type === "reservation") {
    afficherDetailsReservation(
      info.event.extendedProps?.reservation || trouverReservationParId(info.event.id)
    );
    return;
  }

  masquerFeedback();
  afficherErreur("Créneau occupé.");
}

async function soumettreReservation(event) {
  event.preventDefault();
  synchroniserSelectionDepuisFormulaire();

  if (!etat.selection || !etat.selectionEstDisponible) {
    afficherErreurFormulaire("Choisissez un créneau libre.");
    return;
  }

  masquerErreur();
  masquerFeedback();
  masquerErreurFormulaire();

  elements.submitButton.disabled = true;
  const texteInitial = elements.submitButton.textContent;
  elements.submitButton.textContent = "Réservation...";

  try {
    const matiere = elements.subject.value;
    const dureeMinutes = obtenirDureeSelectionnee();
    const resultat = await envoyerRequete("/api/reservation-public/reserver", {
      method: "POST",
      body: JSON.stringify({
        date: etat.selection.date,
        heure_debut: etat.selection.heure_debut,
        duree_minutes: dureeMinutes,
        etudiant: elements.student.value,
        parent: elements.parent.value,
        matiere,
      }),
    });

    if (resultat.profil) {
      etat.profil = resultat.profil;
    }

    etat.derniereMatiere = String(matiere || "").trim();
    memoriserMatiere(etat.derniereMatiere);
    memoriserDuree(dureeMinutes);

    fermerModal();
    await chargerPlanning(etat.planning.week_start);
    afficherFeedback("Réservation confirmée.");
  } catch (erreur) {
    afficherErreurFormulaire(erreur.message || "La réservation a échoué.");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = texteInitial;
  }
}

function lancerSynchronisationAutomatique() {
  if (etat.synchronisationTimer) {
    window.clearInterval(etat.synchronisationTimer);
  }

  etat.synchronisationTimer = window.setInterval(() => {
    if (!etat.planning?.week_start) {
      return;
    }

    chargerPlanning(etat.planning.week_start).catch(() => {});
  }, 45000);
}

function initialiserCalendrier(initialWeekStart) {
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
    timeZone: "UTC",
    initialView: "timeGridWeek",
    initialDate: `${initialWeekStart}T12:00:00Z`,
    firstDay: 1,
    allDaySlot: false,
    slotMinTime: `${etat.config.slot_min_time || "08:00"}:00`,
    slotMaxTime: `${etat.config.slot_max_time || "23:30"}:00`,
    slotDuration: "00:30:00",
    snapDuration: "00:30:00",
    height: "auto",
    nowIndicator: true,
    selectable: false,
    expandRows: true,
    eventMinHeight: 36,
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
        chargerPlanning(weekStart).catch((erreur) => {
          afficherErreur(erreur.message || "Impossible de charger le planning.");
        });
      }
    },
    windowResize() {
      synchroniserEtatVisuelCalendrier(elements.calendar, etat.calendrier?.view?.type);
    },
    eventDidMount(info) {
      adapterPresentationEvenement(info);

      if (info.event.extendedProps?.type === "reservation") {
        info.el.title = "Votre réservation";
        return;
      }

      if (info.event.extendedProps?.type === "selection") {
        info.el.title = "Nouveau créneau";
        return;
      }

      info.el.title = "Créneau occupé";
    },
    dateClick: gererClicDate,
    eventClick: gererClicEvenement,
    events: [],
  });

  etat.calendrier.render();
  synchroniserEtatVisuelCalendrier(elements.calendar, etat.calendrier.view?.type);
  mettreAJourCalendrier();
}

function initialiserFermetureModal() {
  document.querySelectorAll("[data-close-modal='reservation-public-modal']").forEach((element) => {
    element.addEventListener("click", () => {
      fermerModal();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) {
      fermerModal();
      return;
    }

    if (event.key === "Escape" && !elements.detailsModal?.classList.contains("hidden")) {
      fermerDetailsReservation();
    }
  });

  document
    .querySelectorAll("[data-close-modal='reservation-public-details-modal']")
    .forEach((element) => {
      element.addEventListener("click", () => {
        fermerDetailsReservation();
      });
    });
}

function initialiserEcouteursFormulaire() {
  elements.openButton?.addEventListener("click", () => ouvrirModalPourCreneau());
  elements.form?.addEventListener("submit", soumettreReservation);
  elements.duration?.addEventListener("change", () => {
    synchroniserSelectionDepuisFormulaire();
  });
  elements.start?.addEventListener("change", () => {
    synchroniserSelectionDepuisFormulaire();
  });
  elements.date?.addEventListener("change", () => {
    naviguerVersDate(elements.date.value);
    synchroniserSelectionDepuisFormulaire();
  });
}

function initialiserOnglets() {
  elements.tabs.forEach((onglet) => {
    onglet.addEventListener("click", () => {
      activerVueReservation(onglet.dataset.reservationView);
    });
  });

  activerVueReservation("calendar");
}

async function initialiserPage() {
  try {
    masquerErreur();
    masquerErreurFormulaire();
    etat.derniereMatiere = lireMatiereMemoire();
    const resultatInitial = await recupererPlanning();
    await appliquerResultatPlanning(resultatInitial);
    initialiserCalendrier(resultatInitial.planning.week_start);
    lancerSynchronisationAutomatique();
    initialiserFermetureModal();
    initialiserEcouteursFormulaire();
    initialiserOnglets();
  } catch (erreur) {
    afficherErreur(erreur.message || "Impossible de charger la réservation publique.");
  }
}

initialiserPage();
