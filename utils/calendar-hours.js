const CALENDAR_SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

// These defaults preserve the pre-existing private FullCalendar window. They
// are deliberately kept here, rather than spread through controllers/UI.
const DEFAULT_CALENDAR_START_TIME = "08:00";
const DEFAULT_CALENDAR_END_TIME = "23:30";

function creerErreurPlage(code, message) {
  const erreur = new Error(message);
  erreur.code = code;
  return erreur;
}

function estHeureSurCreneau(valeur) {
  return /^([01]\d|2[0-3]):(00|30)$/.test(String(valeur || ""));
}

function normaliserHeureCalendrier(valeur, { fin = false, libelle = "Heure" } = {}) {
  const heure = String(valeur || "").trim();

  if (fin && heure === "00:00") {
    return heure;
  }

  if (!estHeureSurCreneau(heure)) {
    throw creerErreurPlage(
      "INVALID_CALENDAR_TIME",
      `${libelle} doit être une heure au format HH:MM sur un créneau de 30 minutes.`
    );
  }

  return heure;
}

function convertirHeureCalendrierEnMinutes(heure, { fin = false, accepterMinuit24 = false } = {}) {
  const valeur = String(heure || "").trim();

  if ((fin && valeur === "00:00") || (accepterMinuit24 && valeur === "24:00")) {
    return MINUTES_PER_DAY;
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(valeur)) {
    return null;
  }

  const [heures, minutes] = valeur.split(":").map(Number);
  return heures * 60 + minutes;
}

function convertirMinutesEnHeureCalendrier(minutes, { fin = false } = {}) {
  const total = Number(minutes);

  if (fin && total === MINUTES_PER_DAY) {
    return "00:00";
  }

  if (!Number.isInteger(total) || total < 0 || total >= MINUTES_PER_DAY) {
    return null;
  }

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(
    2,
    "0"
  )}`;
}

function convertirFinCalendrierPourFullCalendar(heureFin) {
  const minutes = convertirHeureCalendrierEnMinutes(heureFin, { fin: true });
  if (!Number.isFinite(minutes)) {
    return null;
  }

  if (minutes === MINUTES_PER_DAY) {
    return "24:00:00";
  }

  return `${convertirMinutesEnHeureCalendrier(minutes)}:00`;
}

function convertirDebutCalendrierPourFullCalendar(heureDebut) {
  const minutes = convertirHeureCalendrierEnMinutes(heureDebut);
  return Number.isFinite(minutes) ? `${convertirMinutesEnHeureCalendrier(minutes)}:00` : null;
}

function normaliserPlageCalendrier(
  donnees = {},
  {
    debutParDefaut = DEFAULT_CALENDAR_START_TIME,
    finParDefaut = DEFAULT_CALENDAR_END_TIME,
    exigerValeurs = true,
  } = {}
) {
  const debutBrut = donnees.calendar_start_time ?? donnees.debut_journee ?? debutParDefaut;
  const finBrut = donnees.calendar_end_time ?? donnees.fin_journee ?? finParDefaut;

  if (!exigerValeurs && (debutBrut === undefined || finBrut === undefined)) {
    return null;
  }

  const debut = normaliserHeureCalendrier(debutBrut, {
    libelle: "Le début de journée",
  });
  const fin = normaliserHeureCalendrier(finBrut, {
    fin: true,
    libelle: "La fin de journée",
  });
  const debutMinutes = convertirHeureCalendrierEnMinutes(debut);
  const finMinutes = convertirHeureCalendrierEnMinutes(fin, { fin: true });

  if (!Number.isFinite(debutMinutes) || !Number.isFinite(finMinutes) || finMinutes <= debutMinutes) {
    throw creerErreurPlage(
      "INVALID_CALENDAR_RANGE",
      "La fin de journée doit être postérieure au début. 00:00 signifie la fin de la journée civile."
    );
  }

  return {
    calendar_start_time: debut,
    calendar_end_time: fin,
    startMinutes: debutMinutes,
    endMinutes: finMinutes,
    slot_min_time: convertirDebutCalendrierPourFullCalendar(debut),
    slot_max_time: convertirFinCalendrierPourFullCalendar(fin),
    slot_duration_minutes: CALENDAR_SLOT_MINUTES,
  };
}

function normaliserPlageDepuisReglages(reglages = {}) {
  try {
    return normaliserPlageCalendrier(reglages);
  } catch (erreur) {
    return normaliserPlageCalendrier({
      calendar_start_time: DEFAULT_CALENDAR_START_TIME,
      calendar_end_time: DEFAULT_CALENDAR_END_TIME,
    });
  }
}

function intervalleEstDansPlageCalendrier({ heureDebut, heureFin, plage }) {
  const plageNormalisee =
    plage?.startMinutes !== undefined && plage?.endMinutes !== undefined
      ? plage
      : normaliserPlageDepuisReglages(plage);
  const debut = convertirHeureCalendrierEnMinutes(heureDebut);
  const fin = convertirHeureCalendrierEnMinutes(heureFin, {
    fin: true,
    accepterMinuit24: true,
  });

  return Boolean(
    Number.isFinite(debut) &&
      Number.isFinite(fin) &&
      fin > debut &&
      debut >= plageNormalisee.startMinutes &&
      fin <= plageNormalisee.endMinutes
  );
}

function formaterPlageCalendrier(plage = {}) {
  const normalisee =
    plage?.calendar_start_time && plage?.calendar_end_time
      ? plage
      : normaliserPlageDepuisReglages(plage);
  return `${normalisee.calendar_start_time}–${normalisee.calendar_end_time}`;
}

module.exports = {
  CALENDAR_SLOT_MINUTES,
  MINUTES_PER_DAY,
  DEFAULT_CALENDAR_START_TIME,
  DEFAULT_CALENDAR_END_TIME,
  creerErreurPlage,
  estHeureSurCreneau,
  normaliserHeureCalendrier,
  convertirHeureCalendrierEnMinutes,
  convertirMinutesEnHeureCalendrier,
  convertirDebutCalendrierPourFullCalendar,
  convertirFinCalendrierPourFullCalendar,
  normaliserPlageCalendrier,
  normaliserPlageDepuisReglages,
  intervalleEstDansPlageCalendrier,
  formaterPlageCalendrier,
};
