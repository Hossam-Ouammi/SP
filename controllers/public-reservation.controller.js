const {
  PUBLIC_RESERVATION_COOKIE_NAME,
  PUBLIC_RESERVATION_COOKIE_MAX_AGE_MS,
  PUBLIC_RESERVATION_ALLOWED_DURATIONS,
  PUBLIC_RESERVATION_SLOT_DURATION_MINUTES,
  PUBLIC_RESERVATION_TIMEZONE,
  PUBLIC_RESERVATION_TIMEZONE_LABEL,
  CENTRAL_CALENDAR_TIMEZONE,
  CENTRAL_CALENDAR_TIMEZONE_LABEL,
  PUBLIC_RESERVATION_DEFAULT_COMPTE,
  PUBLIC_RESERVATION_OWNER_EMAIL,
  PUBLIC_RESERVATION_SLOT_MIN_TIME,
  PUBLIC_RESERVATION_SLOT_MAX_TIME,
} = require("../config/public-reservation.config");
const { recupererCookieRequete } = require("../middleware/auth.middleware");
const { requeteEstSecurisee } = require("../middleware/security.middleware");
const { listerCatalogueOptions } = require("../models/catalogue.model");
const { all, get, run } = require("../models/db");
const { creerEntreeHistorique } = require("../models/historique.model");
const {
  trouverAppareilReservationPubliqueParToken,
  creerAppareilReservationPublique,
  mettreAJourProfilAppareilReservationPublique,
  mettreAJourDerniereUtilisationAppareilReservationPublique,
} = require("../models/public-reservation-device.model");
const { trouverUtilisateurParEmail } = require("../models/utilisateur.model");
const {
  convertirDateHeureEntreFuseaux,
  convertirDateHeureZonneeEnInstant,
  convertirInstantEnDateHeureZonnee,
} = require("../utils/timezone");

let schemaReservationPubliquePret = false;
let fileTransactionsReservationPublique = Promise.resolve();

async function assurerSchemaReservationPublique() {
  if (schemaReservationPubliquePret) {
    return;
  }

  await run(`
    CREATE TABLE IF NOT EXISTS public_reservation_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_public TEXT NOT NULL UNIQUE,
      etudiant_nom TEXT NOT NULL DEFAULT '',
      parent_nom TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    )
  `);
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_public_reservation_devices_token ON public_reservation_devices(token_public)"
  );

  const colonnesSeances = await all("PRAGMA table_info(seances)");
  if (!colonnesSeances.some((colonne) => colonne.name === "public_reservation_device_id")) {
    await run("ALTER TABLE seances ADD COLUMN public_reservation_device_id INTEGER");
  }

  schemaReservationPubliquePret = true;
}

async function listerIndisponibilitesParPlageDates(dateDebut, dateFin) {
  return all(
    `
      SELECT
        id,
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        raison,
        cree_par
      FROM indisponibilites
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, heure_debut ASC, id ASC
    `,
    [dateDebut, dateFin]
  );
}

async function trouverIndisponibiliteChevauchante({ date, heureDebut, heureFin }) {
  return get(
    `
      SELECT
        id,
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        raison,
        cree_par
      FROM indisponibilites
      WHERE date = ?
        AND heure_debut < ?
        AND heure_fin > ?
      ORDER BY date ASC, heure_debut ASC, id ASC
      LIMIT 1
    `,
    [date, heureFin, heureDebut]
  );
}

async function listerSeancesParPlageDates(dateDebut, dateFin) {
  await assurerSchemaReservationPublique();

  return all(
    `
      SELECT
        *
      FROM seances
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, heure_debut ASC, id ASC
    `,
    [dateDebut, dateFin]
  );
}

async function trouverSeanceChevauchanteGlobal({ date, heureDebut, heureFin }) {
  await assurerSchemaReservationPublique();

  return get(
    `
      SELECT
        *
      FROM seances
      WHERE date = ?
        AND heure_debut < ?
        AND heure_fin > ?
      ORDER BY heure_debut ASC, id ASC
      LIMIT 1
    `,
    [date, heureFin, heureDebut]
  );
}

async function creerSeance(donneesSeance) {
  await assurerSchemaReservationPublique();

  const resultat = await run(
    `
      INSERT INTO seances (
        titre,
        etudiant,
        parent,
        matiere,
        compte,
        est_essai,
        date,
        heure_debut,
        heure_fin,
        duree_minutes,
        statut_seance,
        prix,
        statut_paiement,
        description,
        cree_par,
        modifie_par,
        utilisateur_id,
        public_reservation_device_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      donneesSeance.titre,
      donneesSeance.etudiant,
      donneesSeance.parent,
      donneesSeance.matiere,
      donneesSeance.compte,
      donneesSeance.est_essai,
      donneesSeance.date,
      donneesSeance.heure_debut,
      donneesSeance.heure_fin,
      donneesSeance.duree_minutes,
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.cree_par,
      donneesSeance.modifie_par,
      donneesSeance.utilisateur_id,
      donneesSeance.public_reservation_device_id || null,
    ]
  );

  return get("SELECT * FROM seances WHERE id = ?", [resultat.id]);
}

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserCle(valeur) {
  return normaliserTexte(valeur).toLowerCase();
}

function estDateIsoValide(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""));
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""));
}

function estHeureDebutValide(heure) {
  return estHeureValide(heure) && /:(00|30)$/.test(String(heure || ""));
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function convertirMinutesEnHeure(minutesTotales) {
  const heures = String(Math.floor(minutesTotales / 60)).padStart(2, "0");
  const minutes = String(minutesTotales % 60).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function calculerHeureFin(heureDebut, dureeMinutes) {
  if (!estHeureValide(heureDebut)) {
    return "";
  }

  const minutesFin = convertirHeureEnMinutes(heureDebut) + Number(dureeMinutes || 0);

  if (minutesFin > 24 * 60) {
    return "";
  }

  return convertirMinutesEnHeure(minutesFin);
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

function creerOptionsCookieReservationPublique(req) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: requeteEstSecurisee(req),
    maxAge: PUBLIC_RESERVATION_COOKIE_MAX_AGE_MS,
  };
}

function effacerCookieReservationPublique(req, res) {
  const options = creerOptionsCookieReservationPublique(req);
  delete options.maxAge;
  res.clearCookie(PUBLIC_RESERVATION_COOKIE_NAME, options);
}

async function recupererAppareilDepuisCookie(req, res) {
  const tokenPublic = recupererCookieRequete(req, PUBLIC_RESERVATION_COOKIE_NAME);

  if (!tokenPublic) {
    return null;
  }

  const appareil = await trouverAppareilReservationPubliqueParToken(tokenPublic);

  if (!appareil) {
    effacerCookieReservationPublique(req, res);
    return null;
  }

  return appareil;
}

async function resoudreProprietaireReservationPublique() {
  const utilisateurConfigure = PUBLIC_RESERVATION_OWNER_EMAIL
    ? await trouverUtilisateurParEmail(PUBLIC_RESERVATION_OWNER_EMAIL)
    : null;

  if (utilisateurConfigure && Number(utilisateurConfigure.acces_active) === 1) {
    return utilisateurConfigure;
  }

  return get(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        session_version,
        doit_changer_mot_de_passe,
        mot_de_passe_change_at,
        dernier_login_at,
        dernier_login_ip,
        tarif_horaire,
        created_at
      FROM utilisateurs
      WHERE COALESCE(acces_active, 1) = 1
      ORDER BY
        CASE
          WHEN lower(email) = 'hossam@test.com' THEN 0
          WHEN COALESCE(est_admin, 0) = 1 THEN 1
          ELSE 2
        END,
        id ASC
      LIMIT 1
    `
  );
}

async function resoudreCompteReservationPublique() {
  const catalogue = await listerCatalogueOptions();
  const comptes = Array.isArray(catalogue?.comptes)
    ? catalogue.comptes.map((compte) => normaliserTexte(compte?.valeur || compte)).filter(Boolean)
    : [];

  if (
    PUBLIC_RESERVATION_DEFAULT_COMPTE &&
    comptes.some((compte) => normaliserCle(compte) === normaliserCle(PUBLIC_RESERVATION_DEFAULT_COMPTE))
  ) {
    return PUBLIC_RESERVATION_DEFAULT_COMPTE;
  }

  return (
    comptes.find((compte) => normaliserCle(compte) !== "hossam") ||
    comptes[0] ||
    "Abdo"
  );
}

function construireErreurMetier(message, status = 400) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

function requeteReservationPubliqueValide(req) {
  return String(req.get("x-requested-with") || "").toLowerCase() === "xmlhttprequest";
}

async function executerTransactionImmediate(callback) {
  const executer = async () => {
    await run("BEGIN IMMEDIATE TRANSACTION");

    try {
      const resultat = await callback();
      await run("COMMIT");
      return resultat;
    } catch (error) {
      await run("ROLLBACK").catch(() => {});
      throw error;
    }
  };

  const transaction = fileTransactionsReservationPublique.then(executer, executer);
  fileTransactionsReservationPublique = transaction.catch(() => {});

  return transaction;
}

function validerFormulaireReservationPublique(body) {
  const etudiant = normaliserTexte(body?.etudiant);
  const parent = normaliserTexte(body?.parent);
  const matiere = normaliserTexte(body?.matiere);
  const dureeMinutes = Number(body?.duree_minutes || PUBLIC_RESERVATION_SLOT_DURATION_MINUTES);
  const erreurs = [];

  if (!etudiant) {
    erreurs.push("Le prénom de l'étudiant est obligatoire.");
  } else if (etudiant.length > 120) {
    erreurs.push("Le prénom de l'étudiant est trop long.");
  }

  if (parent.length > 120) {
    erreurs.push("Le prénom du parent est trop long.");
  }

  if (!matiere) {
    erreurs.push("La matière est obligatoire.");
  } else if (matiere.length > 80) {
    erreurs.push("La matière est trop longue.");
  }

  if (!PUBLIC_RESERVATION_ALLOWED_DURATIONS.includes(dureeMinutes)) {
    erreurs.push("La durée choisie est invalide.");
  }

  return {
    erreurs,
    donnees: {
      etudiant,
      parent,
      matiere,
      duree_minutes: dureeMinutes,
    },
  };
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

function convertirPlagePubliqueVersCentrale(dateDebut, heureDebut, dateFin, heureFin) {
  const debut = convertirDateHeureEntreFuseaux(
    dateDebut,
    heureDebut,
    PUBLIC_RESERVATION_TIMEZONE,
    CENTRAL_CALENDAR_TIMEZONE
  );
  const fin = convertirDateHeureEntreFuseaux(
    dateFin,
    heureFin,
    PUBLIC_RESERVATION_TIMEZONE,
    CENTRAL_CALENDAR_TIMEZONE
  );

  if (!debut || !fin || debut.date !== fin.date) {
    return null;
  }

  return {
    date: debut.date,
    heure_debut: debut.heure,
    heure_fin: fin.heure,
  };
}

function plageChevaucheSemaine(plage, contexteSemaine) {
  return (
    String(plage?.date || "") <= contexteSemaine.week_end &&
    String(plage?.date_fin || plage?.date || "") >= contexteSemaine.week_start
  );
}

function transformerReservationPourClient(seance) {
  const plagePublique = convertirPlageCentraleVersPublique(
    seance.date,
    seance.heure_debut,
    seance.heure_fin
  );

  if (!plagePublique) {
    return null;
  }

  return {
    id: seance.id,
    date: plagePublique.date,
    date_fin: plagePublique.date_fin,
    heure_debut: plagePublique.heure_debut,
    heure_fin: plagePublique.heure_fin,
    duree_minutes:
      Number(seance.duree_minutes) ||
      Math.max(
        convertirHeureEnMinutes(seance.heure_fin) - convertirHeureEnMinutes(seance.heure_debut),
        0
      ),
    etudiant: seance.etudiant || "",
    parent: seance.parent || "",
    matiere: seance.matiere || "",
    statut_seance: seance.statut_seance || "planifiee",
  };
}

function transformerBlocagePourClient({ id, date, heure_debut, heure_fin, type }) {
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

function construireLibelleSeanceReservationPublique(seance) {
  return `${seance?.matiere || "Séance"} - ${seance?.etudiant || "Étudiant"}`;
}

function construireSnapshotSeance(seance) {
  return {
    etudiant: seance?.etudiant || "",
    parent: seance?.parent || "",
    matiere: seance?.matiere || "",
    compte: seance?.compte || "",
    est_essai: Number(seance?.est_essai) === 1 ? 1 : 0,
    date: seance?.date || "",
    heure_debut: seance?.heure_debut || "",
    heure_fin: seance?.heure_fin || "",
    duree_minutes: Number(seance?.duree_minutes) || PUBLIC_RESERVATION_SLOT_DURATION_MINUTES,
    statut_seance: seance?.statut_seance || "planifiee",
    description: seance?.description || "",
  };
}

async function recupererParametrageReservationPublique() {
  const [proprietaire, compte] = await Promise.all([
    resoudreProprietaireReservationPublique(),
    resoudreCompteReservationPublique(),
  ]);

  if (!proprietaire) {
    throw construireErreurMetier(
      "La réservation publique n'est pas encore configurée sur ce projet.",
      503
    );
  }

  return {
    proprietaire,
    compte,
    duree_minutes: PUBLIC_RESERVATION_SLOT_DURATION_MINUTES,
    durees_autorisees: PUBLIC_RESERVATION_ALLOWED_DURATIONS,
  };
}

async function validerCreneauReservationPublique({ date, heureDebut, dureeMinutes }) {
  if (!estDateIsoValide(date)) {
    return {
      message: "La date choisie est invalide.",
    };
  }

  if (!estHeureDebutValide(heureDebut)) {
    return {
      message: "L'heure choisie doit être sur une tranche de 30 minutes.",
    };
  }

  if (!PUBLIC_RESERVATION_ALLOWED_DURATIONS.includes(Number(dureeMinutes))) {
    return {
      message: "La durée choisie est invalide.",
    };
  }

  const heureFinDemandee = calculerHeureFin(heureDebut, Number(dureeMinutes));
  const debutMinutes = convertirHeureEnMinutes(heureDebut);
  const finMinutes = convertirHeureEnMinutes(heureFinDemandee);
  const minMinutes = convertirHeureEnMinutes(PUBLIC_RESERVATION_SLOT_MIN_TIME);
  const maxMinutes = convertirHeureEnMinutes(PUBLIC_RESERVATION_SLOT_MAX_TIME);

  if (
    !heureFinDemandee ||
    !Number.isFinite(debutMinutes) ||
    !Number.isFinite(finMinutes) ||
    debutMinutes < minMinutes ||
    finMinutes > maxMinutes
  ) {
    return {
      message: "Ce créneau dépasse les horaires disponibles.",
    };
  }

  const instantDebut = convertirDateHeureZonneeEnInstant(
    date,
    heureDebut,
    PUBLIC_RESERVATION_TIMEZONE
  );

  if (!instantDebut || instantDebut.getTime() <= Date.now()) {
    return {
      message: "Ce créneau n'est plus réservable.",
    };
  }

  const instantFin = new Date(instantDebut.getTime() + Number(dureeMinutes || 0) * 60 * 1000);
  const finPublique = convertirInstantEnDateHeureZonnee(
    instantFin,
    PUBLIC_RESERVATION_TIMEZONE
  );

  if (!finPublique) {
    return {
      message: "Ce créneau dépasse la fin de la journée.",
    };
  }

  const plageCentrale = convertirPlagePubliqueVersCentrale(
    date,
    heureDebut,
    finPublique.date,
    finPublique.heure
  );

  if (!plageCentrale) {
    return {
      message: "Ce créneau ne peut pas être converti vers le calendrier central.",
    };
  }

  const conflitIndisponibilite = await trouverIndisponibiliteChevauchante({
    date: plageCentrale.date,
    heureDebut: plageCentrale.heure_debut,
    heureFin: plageCentrale.heure_fin,
  });

  if (conflitIndisponibilite) {
    return {
      message: "Ce créneau est indisponible.",
    };
  }

  const conflitSeance = await trouverSeanceChevauchanteGlobal({
    date: plageCentrale.date,
    heureDebut: plageCentrale.heure_debut,
    heureFin: plageCentrale.heure_fin,
  });

  if (conflitSeance) {
    return {
      message: "Ce créneau est déjà réservé.",
    };
  }

    return {
      date_publique: date,
      heure_debut_publique: heureDebut,
      date_fin_publique: finPublique.date,
      heure_fin_publique: finPublique.heure,
      date: plageCentrale.date,
      heure_debut: plageCentrale.heure_debut,
      heure_fin: plageCentrale.heure_fin,
    duree_minutes: dureeMinutes,
  };
}

async function afficherPageReservationPublique(req, res) {
  await assurerSchemaReservationPublique();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  return res.render("reservation", {
    timezonePubliqueLabel: PUBLIC_RESERVATION_TIMEZONE_LABEL,
    timezoneCentraleLabel: CENTRAL_CALENDAR_TIMEZONE_LABEL,
  });
}

async function recupererPlanningReservationPublique(req, res) {
  await assurerSchemaReservationPublique();

  const appareil = await recupererAppareilDepuisCookie(req, res);
  const contexteSemaine = obtenirContexteSemaine(
    normaliserTexte(req.query.week_start) || normaliserTexte(req.query.date)
  );
  const lectureDebut = ajouterJoursIso(contexteSemaine.week_start, -1);
  const lectureFin = ajouterJoursIso(contexteSemaine.week_end, 1);
  const [seances, indisponibilites] = await Promise.all([
    listerSeancesParPlageDates(lectureDebut, lectureFin),
    listerIndisponibilitesParPlageDates(lectureDebut, lectureFin),
  ]);
  const reservations = [];
  const blocages = [];

  seances.forEach((seance) => {
    const plagePublique = transformerReservationPourClient(seance);

    if (!plagePublique || !plageChevaucheSemaine(plagePublique, contexteSemaine)) {
      return;
    }

    if (
      appareil &&
      Number(seance.public_reservation_device_id || 0) === Number(appareil.id)
    ) {
      reservations.push(plagePublique);
      return;
    }

    blocages.push({
      id: `seance-${seance.id}`,
      date: plagePublique.date,
      date_fin: plagePublique.date_fin,
      heure_debut: plagePublique.heure_debut,
      heure_fin: plagePublique.heure_fin,
      type: "seance",
    });
  });

  indisponibilites.forEach((indisponibilite) => {
    const blocage = transformerBlocagePourClient({
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
    profil: appareil
      ? {
          connu: true,
          etudiant: appareil.etudiant_nom || "",
          parent: appareil.parent_nom || "",
        }
      : {
      connu: false,
      etudiant: "",
      parent: "",
    },
    config: {
      duree_minutes: PUBLIC_RESERVATION_SLOT_DURATION_MINUTES,
      durees_autorisees: PUBLIC_RESERVATION_ALLOWED_DURATIONS,
      timezone_public_label: PUBLIC_RESERVATION_TIMEZONE_LABEL,
      timezone_centrale_label: CENTRAL_CALENDAR_TIMEZONE_LABEL,
      slot_min_time: PUBLIC_RESERVATION_SLOT_MIN_TIME,
      slot_max_time: PUBLIC_RESERVATION_SLOT_MAX_TIME,
    },
    planning: {
      ...contexteSemaine,
      reservations,
      blocages,
    },
  });
}

async function reserverCreneauPublic(req, res) {
  await assurerSchemaReservationPublique();

  if (!requeteReservationPubliqueValide(req)) {
    return res.status(400).json({
      message: "Requête de réservation invalide.",
    });
  }

  const { erreurs, donnees } = validerFormulaireReservationPublique(req.body);

  if (erreurs.length > 0) {
    return res.status(400).json({
      message: erreurs.join(" "),
    });
  }

  const parametrage = await recupererParametrageReservationPublique();
  const demandeCreneau = {
    date: normaliserTexte(req.body.date),
    heureDebut: normaliserTexte(req.body.heure_debut),
    dureeMinutes: donnees.duree_minutes,
  };
  const validationCreneau = await validerCreneauReservationPublique(demandeCreneau);

  if (validationCreneau.message) {
    return res.status(400).json({
      message: validationCreneau.message,
    });
  }

  const appareilExistant = await recupererAppareilDepuisCookie(req, res);
  const reservation = await executerTransactionImmediate(async () => {
    // Revalider sous verrou SQLite pour eviter deux reservations simultanees du meme creneau.
    const validationCreneauVerrouillee = await validerCreneauReservationPublique(demandeCreneau);

    if (validationCreneauVerrouillee.message) {
      throw construireErreurMetier(validationCreneauVerrouillee.message, 400);
    }

    const appareil = appareilExistant
      ? await mettreAJourProfilAppareilReservationPublique(appareilExistant.id, {
          etudiantNom: donnees.etudiant,
          parentNom: donnees.parent,
        })
      : await creerAppareilReservationPublique({
          etudiantNom: donnees.etudiant,
          parentNom: donnees.parent,
        });

    const seance = await creerSeance({
      titre: `${donnees.matiere} - ${donnees.etudiant}`,
      etudiant: donnees.etudiant,
      parent: donnees.parent,
      matiere: donnees.matiere,
      compte: parametrage.compte,
      est_essai: 0,
      date: validationCreneauVerrouillee.date,
      heure_debut: validationCreneauVerrouillee.heure_debut,
      heure_fin: validationCreneauVerrouillee.heure_fin,
      duree_minutes: validationCreneauVerrouillee.duree_minutes,
      statut_seance: "planifiee",
      prix: 0,
      statut_paiement: "non_payee",
      description: "Réservation créée via la page publique /reservation.",
      cree_par: parametrage.proprietaire.id,
      modifie_par: parametrage.proprietaire.id,
      utilisateur_id: parametrage.proprietaire.id,
      public_reservation_device_id: appareil.id,
    });

    await mettreAJourDerniereUtilisationAppareilReservationPublique(appareil.id);
    await creerEntreeHistorique({
      seanceId: seance.id,
      seanceLibelle: construireLibelleSeanceReservationPublique(seance),
      actionType: "reservation_publique_creee",
      actionLabel: "Creation via la page publique",
      acteurId: null,
      acteurNom: `${donnees.etudiant} (reservation publique)`,
      details: {
        type: "creation",
        source: "page_reservation_publique",
        fuseau_horaire_public: PUBLIC_RESERVATION_TIMEZONE_LABEL,
        fuseau_horaire_central: CENTRAL_CALENDAR_TIMEZONE_LABEL,
        seance: construireSnapshotSeance(seance),
      },
    });

    return {
      seance,
      appareil,
    };
  });

  res.cookie(
    PUBLIC_RESERVATION_COOKIE_NAME,
    reservation.appareil.token_public,
    creerOptionsCookieReservationPublique(req)
  );

  return res.status(201).json({
    message: "Votre créneau a bien été réservé.",
    reservation: transformerReservationPourClient(reservation.seance),
    profil: {
      connu: true,
      etudiant: reservation.appareil.etudiant_nom || "",
      parent: reservation.appareil.parent_nom || "",
    },
  });
}

module.exports = {
  afficherPageReservationPublique,
  recupererPlanningReservationPublique,
  reserverCreneauPublic,
};
