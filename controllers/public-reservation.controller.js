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
  trouverHandlerCalendrierPublicParToken,
  listerIntervenantsActifsHandler,
  listerPlagesIndisponiblesCalendrierPublic,
} = require("../models/public-calendar.model");
const {
  listerReglesDisponibiliteActivesIntervenant,
  listerExceptionsDisponibiliteIntervenant,
} = require("../models/disponibilite.model");
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

function convertirHeureEnMinutes(heure) {
  return convertirHeureCalendrierEnMinutes(heure, {
    accepterMinuit24: true,
  });
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

function extraireSegmentsPlagePublique(projection) {
  if (!projection || !estDateIsoValide(projection.date) || !estDateIsoValide(projection.date_fin)) {
    return [];
  }

  const debut = convertirHeureHorlogeEnMinutes(projection.heure_debut);
  const fin = convertirHeureHorlogeEnMinutes(projection.heure_fin);

  if (!Number.isFinite(debut) || !Number.isFinite(fin)) {
    return [];
  }

  if (projection.date_fin === projection.date && fin > debut) {
    return [{ debut, fin }];
  }

  const lendemain = ajouterJoursIso(projection.date, 1);
  if (projection.date_fin !== lendemain) {
    return [];
  }

  if (projection.heure_fin === "24:00") {
    return debut < 24 * 60 ? [{ debut, fin: 24 * 60 }] : [];
  }

  const segments = [];
  if (debut < 24 * 60) {
    segments.push({ debut, fin: 24 * 60 });
  }
  if (fin > 0) {
    segments.push({ debut: 0, fin });
  }
  return segments;
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
    };
  }

  // Le décalage public est fixe : une seule projection civile suffit. Il
  // n'existe plus d'union saisonnière de fenêtres IANA à calculer.
  const segments = extraireSegmentsPlagePublique(projection);

  const slotMin = segments.length
    ? Math.min(...segments.map((segment) => segment.debut))
    : plage.startMinutes;
  const slotMax = segments.length
    ? Math.max(...segments.map((segment) => segment.fin))
    : plage.endMinutes;

  return {
    debut: plage.startMinutes,
    fin: plage.endMinutes,
    calendar_start_time: projection.heure_debut,
    calendar_end_time:
      projection.heure_fin === "24:00" ? "00:00" : projection.heure_fin,
    slot_min_time: `${convertirMinutesEnHeure(slotMin)}:00`,
    slot_max_time: `${convertirMinutesEnHeure(slotMax)}:00`,
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

  if (!estDateIsoValide(date)) {
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
    (!plage.intervenantId || plage.intervenantId === intervenantId) &&
    plage.debut < finCreneau &&
    plage.fin > debutCreneau
  );
}

function obtenirJourSemaineLundiZero(dateIso) {
  const date = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return (date.getUTCDay() + 6) % 7;
}

function extraireIntervalleHoraire(plage) {
  const debut = convertirHeureEnMinutes(plage?.heure_debut);
  const fin = convertirHeureCalendrierEnMinutes(plage?.heure_fin, {
    fin: true,
    accepterMinuit24: true,
  });

  if (!Number.isFinite(debut) || !Number.isFinite(fin)) {
    return !normaliserTexte(plage?.heure_debut) && !normaliserTexte(plage?.heure_fin)
      ? { debut: 0, fin: 24 * 60 }
      : null;
  }

  return fin > debut ? { debut, fin } : null;
}

function intervallesCouvrentCreneau(intervalles, debutCreneau, finCreneau) {
  let borneCouverte = debutCreneau;
  const tri = [...intervalles]
    .filter(Boolean)
    .sort((intervalleA, intervalleB) => intervalleA.debut - intervalleB.debut);

  for (const intervalle of tri) {
    if (intervalle.fin <= borneCouverte || intervalle.debut > borneCouverte) {
      continue;
    }

    borneCouverte = Math.max(borneCouverte, intervalle.fin);

    if (borneCouverte >= finCreneau) {
      return true;
    }
  }

  return false;
}

function plageHoraireChevaucheCreneau(plage, debutCreneau, finCreneau) {
  const intervalle = extraireIntervalleHoraire(plage);
  return Boolean(intervalle && intervalle.debut < finCreneau && intervalle.fin > debutCreneau);
}

function regleDisponibiliteSApplique(regle, date) {
  const type = normaliserTexte(regle?.type).toLowerCase();
  return (
    (type === "recurrente" &&
      Number(regle?.jour_semaine) === obtenirJourSemaineLundiZero(date)) ||
    (type === "ponctuelle" && String(regle?.date || "") === date)
  );
}

function exceptionCouvreDate(exception, date) {
  return String(exception?.date || "") === date;
}

function intervenantEstDisponiblePourCreneau({
  disponibiliteIntervenant,
  date,
  debutCreneau,
  finCreneau,
}) {
  const regles = disponibiliteIntervenant?.regles || [];
  const exceptions = disponibiliteIntervenant?.exceptions || [];
  const intervallesPositifs = [
    ...regles
      .filter((regle) => regleDisponibiliteSApplique(regle, date))
      .map(extraireIntervalleHoraire),
    ...exceptions
      .filter(
        (exception) =>
          exceptionCouvreDate(exception, date) &&
          normaliserTexte(exception?.type).toLowerCase() === "disponible"
      )
      .map(extraireIntervalleHoraire),
  ];
  const couvertParDisponibilitePositive = intervallesCouvrentCreneau(
    intervallesPositifs,
    debutCreneau,
    finCreneau
  );

  if (!couvertParDisponibilitePositive) {
    // Politique publique explicite : sans regle positive (ou exception
    // positive), le creneau ne peut pas etre annonce comme disponible.
    return false;
  }

  return !exceptions.some(
    (exception) =>
      exceptionCouvreDate(exception, date) &&
      normaliserTexte(exception?.type).toLowerCase() === "indisponible" &&
      plageHoraireChevaucheCreneau(exception, debutCreneau, finCreneau)
  );
}

async function listerDisponibilitesIntervenantsPublics({
  handlerId,
  intervenantIds,
  dateDebut,
  dateFin,
}) {
  const entrees = await Promise.all(
    (intervenantIds || []).map(async (intervenantId) => {
      const [regles, exceptions] = await Promise.all([
        listerReglesDisponibiliteActivesIntervenant(handlerId, intervenantId, {
          dateDebut,
          dateFin,
        }),
        listerExceptionsDisponibiliteIntervenant(handlerId, intervenantId, {
          dateDebut,
          dateFin,
        }),
      ]);

      return [intervenantId, { regles, exceptions }];
    })
  );

  return new Map(entrees);
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

function construireCreneauxPublics({
  contexteSemaine,
  intervenantIds,
  disponibilitesParIntervenant,
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

      const disponible = intervenantsActifs.some(
        (intervenantId) =>
          intervenantEstDisponiblePourCreneau({
            disponibiliteIntervenant: disponibilitesParIntervenant?.get(intervenantId),
            date,
            debutCreneau: minutes,
            finCreneau: minutes + PUBLIC_CALENDAR_SLOT_DURATION_MINUTES,
          }) &&
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
          (creneau) =>
            creneau.date >= contexteSemaine.week_start &&
            creneau.date <= contexteSemaine.week_end
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
  const handler = await trouverHandlerCalendrierPublicParToken(req.params?.token);

  if (!handler?.id) {
    return null;
  }

  return {
    ...handler,
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

  const tokenEncode = encodeURIComponent(String(req.params.token));

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

  if (!handler) {
    return repondreCalendrierPublicApiIntrouvable(req, res);
  }

  const contexteSemaine = obtenirContexteSemaine(
    normaliserTexte(req.query.week_start) || normaliserTexte(req.query.date),
    handler.fuseauPublic.identifiant
  );
  const [intervenantIds, plagesIndisponibles] = await Promise.all([
    listerIntervenantsActifsHandler(handler.id),
    listerPlagesIndisponiblesCalendrierPublic({
      handlerId: handler.id,
      dateDebut: ajouterJoursIso(contexteSemaine.week_start, -2),
      dateFin: ajouterJoursIso(contexteSemaine.week_end, 2),
    }),
  ]);
  const disponibilitesParIntervenant = await listerDisponibilitesIntervenantsPublics({
    handlerId: handler.id,
    intervenantIds,
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
    disponibilitesParIntervenant,
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

  if (!handler) {
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
    handlerIds: [handler.id],
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
