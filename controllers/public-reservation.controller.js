const {
  PUBLIC_RESERVATION_TIMEZONE,
  PUBLIC_RESERVATION_TIMEZONE_LABEL,
  CENTRAL_CALENDAR_TIMEZONE,
  CENTRAL_CALENDAR_TIMEZONE_LABEL,
  PUBLIC_RESERVATION_SLOT_MIN_TIME,
  PUBLIC_RESERVATION_SLOT_MAX_TIME,
} = require("../config/public-reservation.config");
const { all } = require("../models/db");
const {
  convertirDateHeureEntreFuseaux,
  convertirInstantEnDateHeureZonnee,
} = require("../utils/timezone");
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

function estDateIsoValide(date) {
  const valeur = String(date || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return false;
  }

  const dateObjet = new Date(`${valeur}T12:00:00Z`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(valeur);
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

function obtenirDatePubliqueCouranteIso() {
  return convertirInstantEnDateHeureZonnee(new Date(), PUBLIC_RESERVATION_TIMEZONE)?.date;
}

function obtenirContexteSemaine(valeurReference) {
  const dateReference = estDateIsoValide(valeurReference)
    ? valeurReference
    : obtenirDatePubliqueCouranteIso();
  const weekStart = calculerDebutSemaine(dateReference);

  return {
    date_reference: dateReference,
    week_start: weekStart,
    week_end: ajouterJoursIso(weekStart, 6),
  };
}

function plageChevaucheSemaine(plage, contexteSemaine) {
  return (
    String(plage?.date || "") <= contexteSemaine.week_end &&
    String(plage?.date_fin || plage?.date || "") >= contexteSemaine.week_start
  );
}

function convertirPlageCentraleVersPublique(date, heureDebut, heureFin) {
  const debut = convertirDateHeureEntreFuseaux(
    date,
    heureDebut,
    CENTRAL_CALENDAR_TIMEZONE,
    PUBLIC_RESERVATION_TIMEZONE
  );
  const fin = convertirDateHeureEntreFuseaux(
    date,
    heureFin,
    CENTRAL_CALENDAR_TIMEZONE,
    PUBLIC_RESERVATION_TIMEZONE
  );

  if (!debut || !fin) {
    return null;
  }

  return {
    date: debut.date,
    date_fin: fin.date,
    heure_debut: debut.heure,
    heure_fin: fin.heure,
  };
}

async function listerSeancesParPlageDates(dateDebut, dateFin) {
  return all(
    `
      SELECT
        id,
        date,
        heure_debut,
        heure_fin,
        statut_seance
      FROM seances
      WHERE date BETWEEN ? AND ?
        AND COALESCE(statut_seance, 'planifiee') <> 'annulee'
      ORDER BY date ASC, heure_debut ASC, id ASC
    `,
    [dateDebut, dateFin]
  );
}

async function listerIndisponibilitesParPlageDates(dateDebut, dateFin) {
  return all(
    `
      SELECT
        id,
        date,
        heure_debut,
        heure_fin,
        jour_complet
      FROM indisponibilites
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, heure_debut ASC, id ASC
    `,
    [dateDebut, dateFin]
  );
}

function transformerPlagePourClient({ id, date, heure_debut, heure_fin, type }) {
  const plagePublique = convertirPlageCentraleVersPublique(date, heure_debut, heure_fin);

  if (!plagePublique) {
    return null;
  }

  return {
    id,
    date: plagePublique.date,
    date_fin: plagePublique.date_fin,
    heure_debut: plagePublique.heure_debut,
    heure_fin: plagePublique.heure_fin,
    type,
  };
}

function appliquerNoCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

async function afficherPageReservationPublique(req, res) {
  appliquerNoCache(res);

  return res.render("reservation", {
    timezonePublique: PUBLIC_RESERVATION_TIMEZONE,
    timezonePubliqueLabel: PUBLIC_RESERVATION_TIMEZONE_LABEL,
    timezoneCentraleLabel: CENTRAL_CALENDAR_TIMEZONE_LABEL,
  });
}

async function recupererPlanningReservationPublique(req, res) {
  appliquerNoCache(res);

  const contexteSemaine = obtenirContexteSemaine(
    normaliserTexte(req.query.week_start) || normaliserTexte(req.query.date)
  );
  const lectureDebut = ajouterJoursIso(contexteSemaine.week_start, -1);
  const lectureFin = ajouterJoursIso(contexteSemaine.week_end, 1);
  const [seances, indisponibilites] = await Promise.all([
    listerSeancesParPlageDates(lectureDebut, lectureFin),
    listerIndisponibilitesParPlageDates(lectureDebut, lectureFin),
  ]);
  const blocages = [];

  seances.forEach((seance) => {
    const blocage = transformerPlagePourClient({
      id: `seance-${seance.id}`,
      date: seance.date,
      heure_debut: seance.heure_debut,
      heure_fin: seance.heure_fin,
      type: "seance",
    });

    if (blocage && plageChevaucheSemaine(blocage, contexteSemaine)) {
      blocages.push(blocage);
    }
  });

  indisponibilites.forEach((indisponibilite) => {
    const blocage = transformerPlagePourClient({
      id: `indisponibilite-${indisponibilite.id}`,
      date: indisponibilite.date,
      heure_debut: indisponibilite.heure_debut,
      heure_fin: indisponibilite.heure_fin,
      type: Number(indisponibilite.jour_complet) === 1 ? "jour_complet" : "indisponibilite",
    });

    if (blocage && plageChevaucheSemaine(blocage, contexteSemaine)) {
      blocages.push(blocage);
    }
  });

  return res.json({
    config: {
      timezone_public: PUBLIC_RESERVATION_TIMEZONE,
      timezone_public_label: PUBLIC_RESERVATION_TIMEZONE_LABEL,
      timezone_centrale: CENTRAL_CALENDAR_TIMEZONE,
      timezone_centrale_label: CENTRAL_CALENDAR_TIMEZONE_LABEL,
      slot_min_time: PUBLIC_RESERVATION_SLOT_MIN_TIME,
      slot_max_time: PUBLIC_RESERVATION_SLOT_MAX_TIME,
      refresh_interval_ms: 15000,
    },
    planning: {
      ...contexteSemaine,
      blocages,
      reservations: [],
      updated_at: new Date().toISOString(),
    },
  });
}

function reserverCreneauPublic(req, res) {
  appliquerNoCache(res);

  return res.status(410).json({
    message: "La réservation en ligne est désactivée. Cette page affiche seulement le calendrier.",
  });
}

function ouvrirFluxPlanningPublic(req, res) {
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
    scopes: ["seances", "indisponibilites"],
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
  reserverCreneauPublic,
  ouvrirFluxPlanningPublic,
};
