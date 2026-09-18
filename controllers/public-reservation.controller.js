const {
  CENTRAL_CALENDAR_TIMEZONE,
} = require("../config/public-reservation.config");
const {
  PUBLIC_CALENDAR_REFRESH_INTERVAL_MS,
  PUBLIC_CALENDAR_SLOT_DURATION_MINUTES,
} = require("../config/public-calendar.config");
const {
  estDateHeureZonneeCivileExistante,
} = require("../utils/timezone");
const {
  convertirHeureCalendrierEnMinutes,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");
const {
  convertirIntervalleCentralVersPublic,
  obtenirDateHeurePubliqueDepuisInstant,
  obtenirDefinitionFuseauCalendrierPublic,
} = require("../utils/public-calendar-timezone");
const {
  trouverMembreCalendrierPublicParPublicId,
  listerPlagesIndisponiblesMembre,
  trouverHandlerCalendrierPublicParToken,
  listerIntervenantsActifsHandler,
  listerPlagesIndisponiblesCalendrierPublic,
} = require("../models/public-calendar.model");
const {
  autoriserNouveauClientTempsReel,
  ajouterClientTempsReel,
  retirerClientTempsReel,
  configurerHeartbeatClient,
} = require("../utils/realtime");
const { normaliserIpClient } = require("../middleware/security.middleware");

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function estDateIsoValide(date) {
  const valeur = String(date || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return false;
  }

  const dateObjet = new Date(`${valeur}T12:00:00Z`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(valeur);
}

function estHeureValide(heure, { accepterMinuitFin = false } = {}) {
  const valeur = String(heure || "");
  return (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(valeur) ||
    (accepterMinuitFin && valeur === "24:00")
  );
}

function ajouterJoursIso(dateIso, nombreJours) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setUTCDate(dateObjet.getUTCDate() + nombreJours);
  return dateObjet.toISOString().slice(0, 10);
}

function calculerDebutSemaine(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  const jour = dateObjet.getUTCDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  dateObjet.setUTCDate(dateObjet.getUTCDate() + decalage);
  return dateObjet.toISOString().slice(0, 10);
}

function obtenirDatePubliqueCouranteIso(fuseauPublic) {
  return obtenirDateHeurePubliqueDepuisInstant(new Date(), fuseauPublic, {
    fuseauCentral: CENTRAL_CALENDAR_TIMEZONE,
  })?.date;
}

function obtenirContexteSemaine(valeurReference, fuseauHoraire) {
  const dateReference = estDateIsoValide(valeurReference)
    ? valeurReference
    : obtenirDatePubliqueCouranteIso(fuseauHoraire);
  const weekStart = calculerDebutSemaine(dateReference);

  return {
    date_reference: dateReference,
    week_start: weekStart,
    week_end: ajouterJoursIso(weekStart, 6),
  };
}

function convertirMinutesEnHeure(minutes) {
  const total = Math.max(0, Math.min(24 * 60, Number(minutes) || 0));
  const heures = String(Math.floor(total / 60)).padStart(2, "0");
  const minutesRestantes = String(total % 60).padStart(2, "0");
  return `${heures}:${minutesRestantes}`;
}

// Cette lecture conserve également 00:00 comme le début d'une journée. Elle
// sert uniquement à découper une plage déjà projetée dans le fuseau public.
function convertirHeureHorlogeEnMinutes(heure) {
  if (String(heure || "") === "24:00") {
    return 24 * 60;
  }

  return convertirHeureCalendrierEnMinutes(heure);
}

function convertirMinutesEnDureeCalendrier(minutes) {
  // slotMaxTime de FullCalendar est une durée. Une borne de fin peut donc
  // dépasser 24:00 lorsque le décalage public traverse minuit.
  const total = Math.max(0, Math.min(48 * 60, Math.floor(Number(minutes) || 0)));
  const heures = String(Math.floor(total / 60)).padStart(2, "0");
  const minutesRestantes = String(total % 60).padStart(2, "0");
  return `${heures}:${minutesRestantes}`;
}

function convertirDureeCalendrierEnMinutes(duree) {
  const correspondance = String(duree || "")
    .trim()
    .match(/^(\d{2,}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);
  const total = heures * 60 + minutes;

  return Number.isFinite(total) && total >= 0 && total <= 48 * 60 ? total : null;
}

function obtenirFenetreHorairePublique(
  reglages = {},
  fuseauPublic,
  dateReference = "2000-01-03"
) {
  const plage = normaliserPlageDepuisReglages(reglages);
  const dateBase = estDateIsoValide(dateReference) ? dateReference : "2000-01-03";
  const projection = convertirIntervalleCentralVersPublic(
    {
      date: dateBase,
      heureDebut: plage.calendar_start_time,
      heureFin: plage.calendar_end_time,
    },
    fuseauPublic
  );

  if (!projection) {
    return {
      debut: plage.startMinutes,
      fin: plage.endMinutes,
      calendar_start_time: plage.calendar_start_time,
      calendar_end_time: plage.calendar_end_time,
      slot_min_time: plage.slot_min_time,
      slot_max_time: plage.slot_max_time,
      slot_min_minutes: plage.startMinutes,
      slot_max_minutes: plage.endMinutes,
    };
  }

  // Le décalage public est fixe : une seule projection civile suffit. Il
  // n'existe plus d'union saisonnière de fenêtres IANA à calculer.
  const debutProjete = convertirHeureHorlogeEnMinutes(projection.heure_debut);
  const finProjete = convertirHeureHorlogeEnMinutes(projection.heure_fin);
  const franchitMinuit =
    projection.date_fin === ajouterJoursIso(projection.date, 1) &&
    projection.heure_fin !== "24:00";
  const slotMin = debutProjete;
  // La grille doit représenter une période continue. Ainsi 08:00–23:30 en
  // GMT+2 devient 10:00–25:30, plutôt qu'une union 00:00–24:00 qui masque
  // la borne de début et dissocie les créneaux du lendemain.
  const slotMax = finProjete + (franchitMinuit ? 24 * 60 : 0);

  if (!Number.isFinite(slotMin) || !Number.isFinite(slotMax) || slotMax <= slotMin) {
    return {
      debut: plage.startMinutes,
      fin: plage.endMinutes,
      calendar_start_time: plage.calendar_start_time,
      calendar_end_time: plage.calendar_end_time,
      slot_min_time: plage.slot_min_time,
      slot_max_time: plage.slot_max_time,
      slot_min_minutes: plage.startMinutes,
      slot_max_minutes: plage.endMinutes,
    };
  }

  return {
    debut: plage.startMinutes,
    fin: plage.endMinutes,
    calendar_start_time: projection.heure_debut,
    calendar_end_time:
      projection.heure_fin === "24:00" ? "00:00" : projection.heure_fin,
    slot_min_time: `${convertirMinutesEnDureeCalendrier(slotMin)}:00`,
    slot_max_time: `${convertirMinutesEnDureeCalendrier(slotMax)}:00`,
    slot_min_minutes: slotMin,
    slot_max_minutes: slotMax,
  };
}

function dateHeureLocaleVersValeur(dateIso, minutes) {
  const [annee, mois, jour] = String(dateIso || "").split("-").map(Number);

  if (![annee, mois, jour].every(Number.isFinite)) {
    return null;
  }

  return Date.UTC(
    annee,
    mois - 1,
    jour,
    Math.floor(minutes / 60),
    minutes % 60,
    0
  );
}

function convertirBorneCentraleVersValeur({ date, heure, estFin = false }) {
  if (!estDateIsoValide(date) || !estHeureValide(heure, { accepterMinuitFin: estFin })) {
    return null;
  }

  // Les blocages sont évalués sur l'horloge métier centrale avant toute
  // projection publique. Cette valeur UTC artificielle ne sort jamais de
  // l'API ; elle sert uniquement aux chevauchements d'intervalles.
  const minutes = convertirHeureCalendrierEnMinutes(heure, {
    fin: estFin,
    accepterMinuit24: true,
  });
  if (!Number.isFinite(minutes)) {
    return null;
  }

  const dateCible = minutes === 24 * 60 ? ajouterJoursIso(date, 1) : date;
  return dateHeureLocaleVersValeur(dateCible, minutes === 24 * 60 ? 0 : minutes);
}

function transformerPlageIndisponible(plage) {
  const intervenantId = normaliserIdentifiant(plage?.intervenant_id);
  const date = String(plage?.date || "");

  // Une seance legacy sans intervenant ne peut pas etre attribuee a toute
  // l'equipe par defaut. Le calendrier public suit le calendrier central :
  // seul le realisateur explicitement porte par la plage peut etre bloque.
  // Les identifiants absents ou invalides sont donc ignores jusqu'a leur
  // reconciliation, plutot que de masquer des creneaux encore disponibles.
  if (!intervenantId || !estDateIsoValide(date)) {
    return null;
  }

  if (Number(plage?.jour_complet) === 1) {
    return {
      debut: dateHeureLocaleVersValeur(date, 0),
      fin: dateHeureLocaleVersValeur(ajouterJoursIso(date, 1), 0),
      intervenantId,
    };
  }

  const debut = convertirBorneCentraleVersValeur({
    date,
    heure: normaliserTexte(plage?.heure_debut),
  });
  const fin = convertirBorneCentraleVersValeur({
    date,
    heure: normaliserTexte(plage?.heure_fin),
    estFin: true,
  });

  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) {
    return null;
  }

  return { debut, fin, intervenantId };
}

function plageBloqueIntervenant(plage, intervenantId, debutCreneau, finCreneau) {
  return (
    plage.intervenantId === intervenantId &&
    plage.debut < finCreneau &&
    plage.fin > debutCreneau
  );
}

function fusionnerCreneauxPublics(creneaux) {
  const tries = [...creneaux].sort((creneauA, creneauB) => {
    const dateA = `${creneauA.date}T${creneauA.heure_debut}`;
    const dateB = `${creneauB.date}T${creneauB.heure_debut}`;
    return dateA.localeCompare(dateB) || String(creneauA.etat).localeCompare(String(creneauB.etat));
  });

  return tries.reduce((resultat, creneau) => {
    const precedent = resultat.at(-1);

    if (
      precedent &&
      precedent.date === creneau.date &&
      precedent.etat === creneau.etat &&
      precedent.heure_fin === creneau.heure_debut
    ) {
      precedent.heure_fin = creneau.heure_fin;
      return resultat;
    }

    resultat.push({ ...creneau });
    return resultat;
  }, []);
}

function decouperCreneauProjete(projection, etat) {
  if (!projection?.date || !projection?.heure_debut || !projection?.heure_fin) {
    return [];
  }

  const commun = { etat };
  if (projection.date_fin === projection.date || projection.heure_fin === "24:00") {
    return [
      {
        ...commun,
        date: projection.date,
        heure_debut: projection.heure_debut,
        heure_fin: projection.heure_fin,
      },
    ];
  }

  // Les offsets GMT courants, à l'heure entière, tombent exactement sur 24:00.
  // Le découpage rend explicitement un franchissement de minuit, sans jamais
  // introduire de conversion géographique dans la grille publique.
  return [
    {
      ...commun,
      date: projection.date,
      heure_debut: projection.heure_debut,
      heure_fin: "24:00",
    },
    {
      ...commun,
      date: projection.date_fin,
      heure_debut: "00:00",
      heure_fin: projection.heure_fin,
    },
  ];
}

function creneauIntersecteFenetrePubliqueVisible(creneau, contexteSemaine, fenetre) {
  const debutCreneau = convertirHeureHorlogeEnMinutes(creneau?.heure_debut);
  const finCreneau = convertirHeureHorlogeEnMinutes(creneau?.heure_fin);
  const debutFenetre = Number.isFinite(fenetre?.slot_min_minutes)
    ? Number(fenetre.slot_min_minutes)
    : convertirDureeCalendrierEnMinutes(fenetre?.slot_min_time);
  const finFenetre = Number.isFinite(fenetre?.slot_max_minutes)
    ? Number(fenetre.slot_max_minutes)
    : convertirDureeCalendrierEnMinutes(fenetre?.slot_max_time);

  if (
    !estDateIsoValide(creneau?.date) ||
    !Number.isFinite(debutCreneau) ||
    !Number.isFinite(finCreneau) ||
    finCreneau <= debutCreneau ||
    !Number.isFinite(debutFenetre) ||
    !Number.isFinite(finFenetre)
  ) {
    return false;
  }

  const debut = dateHeureLocaleVersValeur(creneau.date, debutCreneau);
  const fin = dateHeureLocaleVersValeur(creneau.date, finCreneau);
  const borneDebut = dateHeureLocaleVersValeur(
    contexteSemaine.week_start,
    debutFenetre
  );
  const borneFin = dateHeureLocaleVersValeur(contexteSemaine.week_end, finFenetre);

  // FullCalendar crée une plage par colonne de `date + slotMinTime` à
  // `date + slotMaxTime`. Avec une fin à 25:30, le début du lundi appartient
  // donc encore à la colonne dimanche et doit rester dans la réponse API.
  return (
    Number.isFinite(debut) &&
    Number.isFinite(fin) &&
    Number.isFinite(borneDebut) &&
    Number.isFinite(borneFin) &&
    debut < borneFin &&
    fin > borneDebut
  );
}

function construireCreneauxPublics({
  contexteSemaine,
  intervenantIds,
  plagesIndisponibles,
  fenetreHoraire,
  publicCalendarTimezone,
  timezoneCentral = CENTRAL_CALENDAR_TIMEZONE,
}) {
  const intervenantsActifs = Array.from(
    new Set((intervenantIds || []).map(normaliserIdentifiant).filter(Boolean))
  );
  const plages = (plagesIndisponibles || [])
    .map((plage) => transformerPlageIndisponible(plage))
    .filter(Boolean);
  const fenetre = fenetreHoraire || obtenirFenetreHorairePublique();
  const creneaux = [];

  // Un créneau central peut passer au jour civil public suivant. Deux jours
  // de marge protègent ce passage sans modifier la date métier centrale.
  for (let indexJour = -2; indexJour <= 8; indexJour += 1) {
    const date = ajouterJoursIso(contexteSemaine.week_start, indexJour);

    for (
      let minutes = fenetre.debut;
      minutes + PUBLIC_CALENDAR_SLOT_DURATION_MINUTES <= fenetre.fin;
      minutes += PUBLIC_CALENDAR_SLOT_DURATION_MINUTES
    ) {
      const debut = dateHeureLocaleVersValeur(date, minutes);
      const fin = debut + PUBLIC_CALENDAR_SLOT_DURATION_MINUTES * 60 * 1000;
      const heureDebut = convertirMinutesEnHeure(minutes);
      const heureFin = convertirMinutesEnHeure(
        minutes + PUBLIC_CALENDAR_SLOT_DURATION_MINUTES
      );
      const creneauCivilExistant =
        estDateHeureZonneeCivileExistante(date, heureDebut, timezoneCentral) &&
        estDateHeureZonneeCivileExistante(date, heureFin, timezoneCentral);

      // Le passage a l'heure d'ete saute des heures murales. Elles ne sont
      // ni reservables ni affichables dans une grille exprimée dans la
      // référence centrale.
      if (!creneauCivilExistant) {
        continue;
      }

      // Un Realisateur rattache actif est disponible par defaut. Le calendrier
      // public suit le calendrier central : un creneau est indisponible quand
      // tous les professeurs actifs sont bloques par une seance ou une
      // indisponibilite. Le Handler ne participe pas a ce calcul.
      const disponible = intervenantsActifs.some(
        (intervenantId) =>
          !plages.some((plage) => plageBloqueIntervenant(plage, intervenantId, debut, fin))
      );

      const projection = convertirIntervalleCentralVersPublic(
        {
          date,
          heureDebut,
          heureFin,
        },
        publicCalendarTimezone,
        {}
      );
      const creneauxProjetes = decouperCreneauProjete(
        projection,
        disponible ? "disponible" : "indisponible"
      );

      creneaux.push(
        ...creneauxProjetes.filter(
          (creneau) => creneauIntersecteFenetrePubliqueVisible(creneau, contexteSemaine, fenetre)
        )
      );
    }
  }

  return fusionnerCreneauxPublics(creneaux);
}

function appliquerNoCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function repondreCalendrierPublicApiIntrouvable(req, res) {
  appliquerNoCache(res);
  return res.status(404).json({ message: "Calendrier public introuvable." });
}

function repondreCalendrierPublicPageIntrouvable(req, res) {
  appliquerNoCache(res);
  return res.status(404).type("text/plain").send("Calendrier public introuvable.");
}

async function resoudreHandlerCalendrierPublic(req) {
  const membre = await trouverMembreCalendrierPublicParPublicId(req.params?.token);
  const handler = membre || await trouverHandlerCalendrierPublicParToken(req.params?.token);

  if (!handler?.id) {
    return null;
  }

  return {
    ...handler,
    modePersonnel: Boolean(membre),
    fuseauPublic: obtenirDefinitionFuseauCalendrierPublic(
      handler.public_calendar_timezone
    ),
    calendrier: normaliserPlageDepuisReglages(handler),
  };
}

async function afficherPageReservationPublique(req, res) {
  appliquerNoCache(res);
  const handler = await resoudreHandlerCalendrierPublic(req);

  if (!handler) {
    return repondreCalendrierPublicPageIntrouvable(req, res);
  }

  if (handler.calendrier_public_actif !== 1) {
    return res.status(200).render("reservation-disabled", {
      nom: String(handler.nom || "").trim(),
    });
  }

  const tokenEncode = encodeURIComponent(String(handler.public_id || req.params.token));

  return res.render("reservation", {
    // Le client affiche une horloge publique civile : centrale + offset fixe.
    // Aucune zone IANA publique n'est transmise ni utilisée.
    publicCalendarOffsetMinutes: handler.fuseauPublic.offsetMinutes,
    publicCalendarOffsetLabel: handler.fuseauPublic.libelle,
    centralCalendarTimezone: CENTRAL_CALENDAR_TIMEZONE,
    planningApiPath: `/api/reservation-public/${tokenEncode}`,
    planningEventsPath: `/api/reservation-public/${tokenEncode}/events`,
  });
}

async function recupererPlanningReservationPublique(req, res) {
  appliquerNoCache(res);
  const handler = await resoudreHandlerCalendrierPublic(req);

  if (!handler || handler.calendrier_public_actif !== 1) {
    return repondreCalendrierPublicApiIntrouvable(req, res);
  }

  const contexteSemaine = obtenirContexteSemaine(
    normaliserTexte(req.query.week_start) || normaliserTexte(req.query.date),
    handler.fuseauPublic.identifiant
  );
  const intervenantIds = handler.modePersonnel
    ? [handler.id]
    : await listerIntervenantsActifsHandler(handler.id);
  const plagesIndisponibles = handler.modePersonnel
    ? await listerPlagesIndisponiblesMembre({
        intervenantId: handler.id,
        dateDebut: ajouterJoursIso(contexteSemaine.week_start, -2),
        dateFin: ajouterJoursIso(contexteSemaine.week_end, 2),
      })
    : await listerPlagesIndisponiblesCalendrierPublic({
        handlerId: handler.id,
        dateDebut: ajouterJoursIso(contexteSemaine.week_start, -2),
        dateFin: ajouterJoursIso(contexteSemaine.week_end, 2),
      });
  const fenetre = obtenirFenetreHorairePublique(
    handler.calendrier,
    handler.fuseauPublic.identifiant,
    contexteSemaine.week_start
  );
  const creneaux = construireCreneauxPublics({
    contexteSemaine,
    intervenantIds,
    plagesIndisponibles,
    fenetreHoraire: fenetre,
    publicCalendarTimezone: handler.fuseauPublic.identifiant,
    timezoneCentral: CENTRAL_CALENDAR_TIMEZONE,
  });

  return res.json({
    config: {
      public_calendar_timezone: handler.fuseauPublic.identifiant,
      public_calendar_offset_minutes: handler.fuseauPublic.offsetMinutes,
      public_calendar_offset_label: handler.fuseauPublic.libelle,
      reference_timezone: CENTRAL_CALENDAR_TIMEZONE,
      calendar_start_time: fenetre.calendar_start_time,
      calendar_end_time: fenetre.calendar_end_time,
      slot_min_time: fenetre.slot_min_time.slice(0, 5),
      slot_max_time: fenetre.slot_max_time.slice(0, 5),
      slot_duration_minutes: PUBLIC_CALENDAR_SLOT_DURATION_MINUTES,
      refresh_interval_ms: PUBLIC_CALENDAR_REFRESH_INTERVAL_MS,
    },
    planning: {
      ...contexteSemaine,
      creneaux,
    },
  });
}

async function ouvrirFluxPlanningPublic(req, res) {
  appliquerNoCache(res);
  const handler = await resoudreHandlerCalendrierPublic(req);

  if (!handler || handler.calendrier_public_actif !== 1) {
    return repondreCalendrierPublicApiIntrouvable(req, res);
  }

  const clientKey = `public:${normaliserIpClient(req)}`;
  const autorisation = autoriserNouveauClientTempsReel({
    public: true,
    clientKey,
  });

  if (!autorisation.ok) {
    return res.status(autorisation.status).json({ message: autorisation.message });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, private");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write("retry: 5000\n\n");

  const client = ajouterClientTempsReel({
    res,
    utilisateurId: null,
    public: true,
    scopes: ["seances", "indisponibilites", "disponibilites", "settings"],
    handlerIds: handler.modePersonnel ? [] : [handler.id],
    intervenantIds: handler.modePersonnel ? [handler.id] : [],
    clientKey,
  });

  configurerHeartbeatClient(client);
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  req.on("close", () => {
    retirerClientTempsReel(client);
  });
}

module.exports = {
  afficherPageReservationPublique,
  recupererPlanningReservationPublique,
  ouvrirFluxPlanningPublic,
  repondreCalendrierPublicApiIntrouvable,
  repondreCalendrierPublicPageIntrouvable,
  construireCreneauxPublics,
};
