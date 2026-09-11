const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

// Ce test conserve les scénarios DST sur la référence centrale. Le fuseau
// stocké sur le Handler ne doit plus influencer ce calcul.
process.env.CENTRAL_CALENDAR_TIMEZONE = "Europe/Paris";

const repertoireTemporaire = fs.mkdtempSync(
  path.join(os.tmpdir(), "gestion-seances-public-calendar-")
);
process.env.DATABASE_PATH = path.join(repertoireTemporaire, "calendrier-public.db");

const { run, fermerBaseDeDonnees } = require("../models/db");
const {
  creerJetonCalendrierPublic,
  listerIntervenantsActifsHandler,
  listerPlagesIndisponiblesCalendrierPublic,
} = require("../models/public-calendar.model");
const {
  apiRouter,
  pageRouter,
} = require("../routes/public-reservation.routes");

function verifierFenetreVisibleCoteClient() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "public-reservation.js"),
    "utf8"
  );
  const debut = source.indexOf("function convertirHeureOptionEnMinutes");
  const fin = source.indexOf("function obtenirMaintenantPublicPourCalendrier", debut);

  assert.notEqual(debut, -1, "Le calcul de fenêtre publique client est introuvable.");
  assert.notEqual(fin, -1, "La fin du calcul de fenêtre publique client est introuvable.");

  const { calculerFenetreHoraireVisible } = new Function(
    `${source.slice(debut, fin)}\nreturn { calculerFenetreHoraireVisible };`
  )();

  assert.deepEqual(
    calculerFenetreHoraireVisible({
      slotMinTime: "10:00",
      slotMaxTime: "25:30",
    }),
    {
      slotMinTime: "10:00:00",
      slotMaxTime: "25:30:00",
    },
    "Le client ne doit pas borner une fenêtre publique qui traverse minuit à 24:00."
  );
}

function verifierRenduIndisponibilitesCoteClient() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "public-reservation.js"),
    "utf8"
  );
  const debut = source.indexOf("function ajouterJoursIso");
  const fin = source.indexOf("function mettreAJourCalendrier", debut);

  assert.notEqual(debut, -1, "Le rendu des créneaux publics est introuvable.");
  assert.notEqual(fin, -1, "La fin du rendu des créneaux publics est introuvable.");

  const { construireEvenementsIndisponibles } = new Function(
    `${source.slice(debut, fin)}\nreturn { construireEvenementsIndisponibles };`
  )();
  const evenements = construireEvenementsIndisponibles([
    {
      date: "2026-09-07",
      heure_debut: "08:00",
      heure_fin: "08:30",
      etat: "disponible",
    },
    {
      date: "2026-09-07",
      heure_debut: "08:30",
      heure_fin: "09:00",
      etat: "indisponible",
    },
  ]);

  assert.equal(
    evenements.length,
    1,
    "Les créneaux disponibles doivent rester vides dans le calendrier public."
  );
  assert.equal(evenements[0].title, "Indisponible");
  assert.equal(evenements[0].extendedProps.etat, "indisponible");
}

async function ecouterServeur(application) {
  const serveur = await new Promise((resolve) => {
    const instance = application.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const adresse = serveur.address();

  return {
    serveur,
    origine: `http://127.0.0.1:${adresse.port}`,
  };
}

async function fermerServeur(serveur) {
  await new Promise((resolve, reject) => {
    serveur.close((erreur) => (erreur ? reject(erreur) : resolve()));
  });
}

async function preparerSchema() {
  await run(`
    CREATE TABLE utilisateurs (
      id INTEGER PRIMARY KEY,
      nom TEXT,
      timezone TEXT,
      public_calendar_timezone TEXT NOT NULL DEFAULT 'GMT',
      calendar_start_time TEXT NOT NULL DEFAULT '08:00',
      calendar_end_time TEXT NOT NULL DEFAULT '23:30',
      token_calendrier_public_hash TEXT,
      calendrier_public_actif INTEGER,
      statut_compte TEXT,
      acces_active INTEGER
    )
  `);
  await run(`
    CREATE TABLE utilisateur_roles (
      utilisateur_id INTEGER,
      role TEXT
    )
  `);
  await run(`
    CREATE TABLE rattachements_professeurs (
      handler_id INTEGER,
      professeur_id INTEGER,
      actif INTEGER
    )
  `);
  await run(`
    CREATE TABLE seances (
      handler_id INTEGER,
      intervenant_id INTEGER,
      date TEXT,
      heure_debut TEXT,
      heure_fin TEXT,
      statut_seance TEXT
    )
  `);
  await run(`
    CREATE TABLE indisponibilites (
      handler_id INTEGER,
      intervenant_id INTEGER,
      date TEXT,
      heure_debut TEXT,
      heure_fin TEXT,
      jour_complet INTEGER
    )
  `);
  await run(`
    CREATE TABLE disponibilites (
      id INTEGER PRIMARY KEY,
      handler_id INTEGER,
      intervenant_id INTEGER,
      type TEXT,
      jour_semaine INTEGER,
      date TEXT,
      heure_debut TEXT,
      heure_fin TEXT,
      actif INTEGER,
      cree_par INTEGER
    )
  `);
  await run(`
    CREATE TABLE exceptions_disponibilites (
      id INTEGER PRIMARY KEY,
      disponibilite_id INTEGER,
      handler_id INTEGER,
      intervenant_id INTEGER,
      date TEXT,
      type TEXT,
      heure_debut TEXT,
      heure_fin TEXT,
      raison TEXT,
      cree_par INTEGER
    )
  `);
}

async function insererUtilisateur({
  id,
  timezone = "Africa/Casablanca",
  publicCalendarTimezone = "GMT",
  calendarStartTime = "08:00",
  calendarEndTime = "23:30",
  tokenHash = null,
  calendrierActif = 0,
}) {
  await run(
    `
      INSERT INTO utilisateurs (
        id,
        timezone,
        public_calendar_timezone,
        calendar_start_time,
        calendar_end_time,
        token_calendrier_public_hash,
        calendrier_public_actif,
        statut_compte,
        acces_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1)
    `,
    [
      id,
      timezone,
      publicCalendarTimezone,
      calendarStartTime,
      calendarEndTime,
      tokenHash,
      calendrierActif,
    ]
  );
}

async function insererProfesseurActifRattache({ handlerId, professeurId }) {
  await insererUtilisateur({ id: professeurId });
  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (?, 'professeur')",
    [professeurId]
  );
  await run(
    "INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif) VALUES (?, ?, 1)",
    [handlerId, professeurId]
  );
}

function convertirHeureEnMinutes(heure) {
  const correspondance = /^(\d{2}):(\d{2})$/.exec(String(heure || ""));
  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);
  if (heures < 0 || heures > 24 || minutes < 0 || minutes > 59) {
    return null;
  }

  return heures * 60 + minutes;
}

function creneauCouvre(planning, { date, heure, etat }) {
  const minute = convertirHeureEnMinutes(heure);
  return (planning?.creneaux || []).some((creneau) => {
    const debut = convertirHeureEnMinutes(creneau.heure_debut);
    const fin = convertirHeureEnMinutes(creneau.heure_fin);
    return (
      creneau.date === date &&
      creneau.etat === etat &&
      Number.isFinite(debut) &&
      Number.isFinite(fin) &&
      debut <= minute &&
      fin > minute
    );
  });
}

function planningExposeHeure(planning, { date, heure }) {
  const minute = convertirHeureEnMinutes(heure);
  return (planning?.creneaux || []).some((creneau) => {
    const debut = convertirHeureEnMinutes(creneau.heure_debut);
    const fin = convertirHeureEnMinutes(creneau.heure_fin);
    return (
      creneau.date === date &&
      Number.isFinite(debut) &&
      Number.isFinite(fin) &&
      debut <= minute &&
      fin > minute
    );
  });
}

async function principal() {
  let serveur = null;

  try {
    verifierFenetreVisibleCoteClient();
    verifierRenduIndisponibilitesCoteClient();
    await preparerSchema();
    const calendrierHandler = creerJetonCalendrierPublic();
    const calendrierInactif = creerJetonCalendrierPublic();
    const calendrierNonHandler = creerJetonCalendrierPublic();
    const calendrierMinuit = creerJetonCalendrierPublic();
    const calendrierDst = creerJetonCalendrierPublic();
    const calendrierPassageAnnee = creerJetonCalendrierPublic();
    const calendrierFenetreDst = creerJetonCalendrierPublic();
    const calendrierDebutMinuit = creerJetonCalendrierPublic();
    const calendrierOffsetReference = creerJetonCalendrierPublic();
    const calendrierFenetreTraverseMinuit = creerJetonCalendrierPublic();

    assert.match(calendrierHandler.token, /^[A-Za-z0-9_-]{32,160}$/);
    assert.match(calendrierHandler.tokenHash, /^[a-f0-9]{64}$/);

    await insererUtilisateur({
      id: 1,
      // Cette ancienne préférence ne doit plus piloter le calendrier public.
      timezone: "Africa/Casablanca",
      publicCalendarTimezone: "GMT",
      tokenHash: calendrierHandler.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "08:30",
      calendarEndTime: "21:30",
    });
    await insererUtilisateur({ id: 2 });
    await insererUtilisateur({
      id: 3,
      publicCalendarTimezone: "GMT",
      tokenHash: calendrierMinuit.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "08:00",
      calendarEndTime: "00:00",
    });
    await insererUtilisateur({
      id: 4,
      tokenHash: calendrierInactif.tokenHash,
      calendrierActif: 0,
    });
    await insererUtilisateur({
      id: 5,
      tokenHash: calendrierNonHandler.tokenHash,
      calendrierActif: 1,
    });
    await insererUtilisateur({
      id: 6,
      timezone: "Europe/Paris",
      publicCalendarTimezone: "GMT",
      tokenHash: calendrierDst.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "01:00",
      calendarEndTime: "04:00",
    });
    await insererUtilisateur({
      id: 7,
      timezone: "Africa/Casablanca",
      publicCalendarTimezone: "GMT+2",
      tokenHash: calendrierPassageAnnee.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "22:30",
      calendarEndTime: "00:00",
    });
    await insererUtilisateur({
      id: 8,
      timezone: "Africa/Casablanca",
      publicCalendarTimezone: "GMT",
      tokenHash: calendrierFenetreDst.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "08:00",
      calendarEndTime: "22:00",
    });
    await insererUtilisateur({
      id: 9,
      timezone: "Europe/Paris",
      publicCalendarTimezone: "GMT",
      tokenHash: calendrierDebutMinuit.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "00:00",
      calendarEndTime: "03:00",
    });
    await insererUtilisateur({
      id: 10,
      publicCalendarTimezone: "GMT+2",
      tokenHash: calendrierOffsetReference.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "08:00",
      calendarEndTime: "09:00",
    });
    await insererUtilisateur({
      id: 11,
      publicCalendarTimezone: "GMT+2",
      tokenHash: calendrierFenetreTraverseMinuit.tokenHash,
      calendrierActif: 1,
      calendarStartTime: "08:00",
      calendarEndTime: "23:30",
    });
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (1, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (2, 'professeur')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (3, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (6, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (7, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (8, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (9, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (10, 'handler')");
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (11, 'handler')");
    await run(
      "INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif) VALUES (1, 2, 1)"
    );
    // Un ancien auto-rattachement ne doit pas remettre le Handler dans la
    // population publique, meme s'il porte aussi le role professeur.
    await run("INSERT INTO utilisateur_roles (utilisateur_id, role) VALUES (1, 'professeur')");
    await run(
      "INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif) VALUES (1, 1, 1)"
    );
    // Chaque calendrier de test qui attend des creneaux disponibles dispose
    // d'au moins un professeur actif rattache. Le Handler ne constitue plus
    // une disponibilite publique a lui seul.
    await insererProfesseurActifRattache({ handlerId: 3, professeurId: 12 });
    await insererProfesseurActifRattache({ handlerId: 6, professeurId: 13 });
    await insererProfesseurActifRattache({ handlerId: 7, professeurId: 14 });
    await insererProfesseurActifRattache({ handlerId: 8, professeurId: 15 });
    await insererProfesseurActifRattache({ handlerId: 9, professeurId: 16 });
    await insererProfesseurActifRattache({ handlerId: 10, professeurId: 17 });
    await insererProfesseurActifRattache({ handlerId: 11, professeurId: 18 });
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (1, 1, 1, 'recurrente', 0, NULL, '09:00', '10:00', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (2, 1, 2, 'recurrente', 0, NULL, '09:00', '11:00', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (3, 1, 2, 'ponctuelle', NULL, '2026-09-08', '13:00', '13:30', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (4, 1, 2, 'ponctuelle', NULL, '2026-09-08', '13:30', '14:00', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (5, 6, 6, 'recurrente', 6, NULL, '01:00', '04:00', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (6, 7, 7, 'ponctuelle', NULL, '2026-12-31', '22:30', '24:00', 1)
      `
    );
    await run(
      `
        INSERT INTO disponibilites (
          id,
          handler_id,
          intervenant_id,
          type,
          jour_semaine,
          date,
          heure_debut,
          heure_fin,
          actif
        )
        VALUES (7, 9, 9, 'ponctuelle', NULL, '2026-09-07', '00:00', '02:00', 1)
      `
    );
    await run(
      "INSERT INTO disponibilites (id, handler_id, intervenant_id, type, jour_semaine, date, heure_debut, heure_fin, actif) VALUES (8, 10, 10, 'ponctuelle', NULL, '2026-09-07', '08:00', '09:00', 1)"
    );
    await run(
      `
        INSERT INTO exceptions_disponibilites (
          id,
          disponibilite_id,
          handler_id,
          intervenant_id,
          date,
          type,
          heure_debut,
          heure_fin
        )
        VALUES (1, 2, 1, 2, '2026-09-07', 'indisponible', '10:00', '10:30')
      `
    );
    await run(
      `
        INSERT INTO exceptions_disponibilites (
          id,
          disponibilite_id,
          handler_id,
          intervenant_id,
          date,
          type,
          heure_debut,
          heure_fin
        )
        VALUES (2, NULL, 1, 2, '2026-09-07', 'disponible', '12:00', '12:30')
      `
    );
    await run(
      `
        INSERT INTO seances (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          statut_seance
        )
        VALUES (1, 1, '2026-09-07', '09:00', '10:00', 'planifiee')
      `
    );
    // Les donnees legacy peuvent contenir une seance qui n'a jamais ete
    // attribuee a un realisateur. Elle doit rester a reconcilier sans rendre
    // toute l'equipe indisponible dans le calendrier public.
    await run(
      `
        INSERT INTO seances (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          statut_seance
        )
        VALUES (1, NULL, '2026-09-07', '11:00', '11:30', 'planifiee')
      `
    );
    await run(
      `
        INSERT INTO seances (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          statut_seance
        )
        VALUES (1, 0, '2026-09-07', '11:30', '12:00', 'planifiee')
      `
    );
    await run(
      `
        INSERT INTO indisponibilites (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          jour_complet
        )
        VALUES (1, 2, '2026-09-07', '09:00', '09:30', 0)
      `
    );
    // Les anciennes indisponibilites du Handler ne participent plus a la
    // disponibilite publique : seuls les professeurs rattaches comptent.
    await run(
      `
        INSERT INTO indisponibilites (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          jour_complet
        )
        VALUES (1, 1, '2026-09-07', '16:00', '16:30', 0)
      `
    );
    await run(
      `
        INSERT INTO indisponibilites (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          jour_complet
        )
        VALUES (1, 2, '2026-09-07', '15:00', '15:30', 0)
      `
    );
    await run(
      `
        INSERT INTO seances (
          handler_id,
          intervenant_id,
          date,
          heure_debut,
          heure_fin,
          statut_seance
        )
        VALUES (3, 3, '2026-09-07', '10:00', '11:00', 'planifiee')
      `
    );

    const intervenantsPublics = await listerIntervenantsActifsHandler(1);
    assert.deepEqual(
      intervenantsPublics,
      [2],
      "Le Handler ne doit jamais etre un intervenant du calendrier public."
    );
    const plagesPubliques = await listerPlagesIndisponiblesCalendrierPublic({
      handlerId: 1,
      dateDebut: "2026-09-07",
      dateFin: "2026-09-07",
    });
    assert.ok(
      plagesPubliques.length > 0 &&
        plagesPubliques.every((plage) => Number(plage.intervenant_id) === 2),
      "Les seances et indisponibilites historiques du Handler ne doivent pas etre lues par le calendrier public."
    );

    const application = express();
    application.use("/api/reservation-public", apiRouter);
    application.use("/reservation", pageRouter);
    const ecoute = await ecouterServeur(application);
    serveur = ecoute.serveur;

    const reponseValide = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierHandler.token}?week_start=2026-09-07`
    );
    assert.equal(reponseValide.status, 200);
    const donnees = await reponseValide.json();

    assert.deepEqual(Object.keys(donnees).sort(), ["config", "planning"]);
    assert.equal(donnees.config?.public_calendar_timezone, "GMT");
    assert.equal(
      donnees.config?.public_calendar_offset_minutes,
      0,
      "Le calendrier public doit exposer le décalage fixe configuré."
    );
    assert.equal(
      donnees.config?.slot_min_time,
      "08:30",
      "Le calendrier public doit reprendre le debut configure par le Handler."
    );
    assert.equal(
      donnees.config?.slot_max_time,
      "21:30",
      "Le calendrier public doit reprendre la fin configuree par le Handler."
    );
    assert.deepEqual(Object.keys(donnees.planning).sort(), [
      "creneaux",
      "date_reference",
      "week_end",
      "week_start",
    ]);
    assert.ok(
      donnees.planning.creneaux.every(
        (creneau) =>
          Object.keys(creneau).every((cle) =>
            ["date", "heure_debut", "heure_fin", "etat"].includes(cle)
          ) && ["disponible", "indisponible"].includes(creneau.etat)
      )
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "09:00",
        etat: "indisponible",
      })
    );
    const creneauxLundi = donnees.planning.creneaux.filter(
      (creneau) => creneau.date === "2026-09-07"
    );
    assert.ok(creneauxLundi.length > 0, "La journee publique doit produire des creneaux.");
    assert.equal(
      creneauxLundi[0].heure_debut,
      "08:30",
      "Aucun creneau public ne doit preceder la borne de debut."
    );
    assert.equal(
      creneauxLundi.at(-1).heure_fin,
      "21:30",
      "Aucun creneau public ne doit depasser la borne de fin."
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "09:30",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "10:00",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "11:00",
        etat: "disponible",
      }),
      "Une seance legacy sans realisateur ne doit pas bloquer toute l'equipe."
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "11:30",
        etat: "disponible",
      }),
      "Un intervenant legacy invalide ne doit pas bloquer toute l'equipe."
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "12:00",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "15:00",
        etat: "indisponible",
      }),
      "Un creneau est public indisponible quand le seul professeur actif est bloque, meme si le Handler est libre."
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-07",
        heure: "16:00",
        etat: "disponible",
      }),
      "Une indisponibilite historique du Handler ne doit pas masquer un professeur disponible."
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-08",
        heure: "09:00",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donnees.planning, {
        date: "2026-09-08",
        heure: "13:00",
        etat: "disponible",
      })
    );
    assert.doesNotMatch(
      JSON.stringify(donnees),
      /handler|intervenant|seance|compte|etudiant|email|token|"id"/i
    );

    const reponseOffsetReference = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierOffsetReference.token}?week_start=2026-09-07`
    );
    assert.equal(reponseOffsetReference.status, 200);
    const donneesOffsetReference = await reponseOffsetReference.json();
    assert.equal(donneesOffsetReference.config?.public_calendar_timezone, "GMT+2");
    assert.equal(donneesOffsetReference.config?.public_calendar_offset_minutes, 120);
    assert.equal(donneesOffsetReference.config?.calendar_start_time, "10:00");
    assert.equal(donneesOffsetReference.config?.calendar_end_time, "11:00");
    assert.ok(
      creneauCouvre(donneesOffsetReference.planning, {
        date: "2026-09-07",
        heure: "10:00",
        etat: "disponible",
      }),
      "Une disponibilité centrale 08:00–09:00 doit devenir 10:00–11:00 en GMT+2."
    );

    const reponseFenetreTraverseMinuit = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierFenetreTraverseMinuit.token}?week_start=2026-09-07`
    );
    assert.equal(reponseFenetreTraverseMinuit.status, 200);
    const donneesFenetreTraverseMinuit = await reponseFenetreTraverseMinuit.json();
    assert.equal(donneesFenetreTraverseMinuit.config?.calendar_start_time, "10:00");
    assert.equal(donneesFenetreTraverseMinuit.config?.calendar_end_time, "01:30");
    assert.equal(
      donneesFenetreTraverseMinuit.config?.slot_min_time,
      "10:00",
      "La grille publique doit commencer a la borne projetee, pas a minuit."
    );
    assert.equal(
      donneesFenetreTraverseMinuit.config?.slot_max_time,
      "25:30",
      "La fin projetee apres minuit doit rester attachee a la meme journee FullCalendar."
    );
    assert.ok(
      creneauCouvre(donneesFenetreTraverseMinuit.planning, {
        date: "2026-09-07",
        heure: "10:00",
        etat: "disponible",
      }),
      "La borne de debut projetee doit etre disponible le lundi a 10:00."
    );
    assert.ok(
      creneauCouvre(donneesFenetreTraverseMinuit.planning, {
        date: "2026-09-13",
        heure: "23:30",
        etat: "disponible",
      }),
      "La derniere colonne doit conserver la fin de journee du dimanche."
    );
    assert.ok(
      creneauCouvre(donneesFenetreTraverseMinuit.planning, {
        date: "2026-09-14",
        heure: "00:00",
        etat: "disponible",
      }),
      "Le debut du lundi doit rester disponible afin d'etre rendu dans la colonne dimanche."
    );
    assert.equal(
      planningExposeHeure(donneesFenetreTraverseMinuit.planning, {
        date: "2026-09-14",
        heure: "10:00",
      }),
      false,
      "La reponse ne doit pas inclure les creneaux de journee de la semaine suivante."
    );

    const reponseMinuit = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierMinuit.token}?week_start=2026-09-07`
    );
    assert.equal(reponseMinuit.status, 200, "Le calendrier public doit normaliser une fin minuit héritée.");
    const donneesMinuit = await reponseMinuit.json();
    assert.equal(donneesMinuit.config?.slot_min_time, "08:00");
    assert.equal(
      donneesMinuit.config?.calendar_end_time,
      "23:30",
      "Une fin de journée héritée à minuit est ramenée à 23:30."
    );
    assert.equal(
      donneesMinuit.config?.slot_max_time,
      "23:30",
      "La grille publique ne dépasse jamais 23:30."
    );
    const creneauxMinuitLundi = donneesMinuit.planning.creneaux.filter(
      (creneau) => creneau.date === "2026-09-07"
    );
    assert.ok(creneauxMinuitLundi.length > 0);
    assert.equal(creneauxMinuitLundi[0].heure_debut, "08:00");
    assert.equal(
      creneauxMinuitLundi.at(-1).heure_fin,
      "23:30",
      "Le dernier créneau respecte la nouvelle borne de 23:30."
    );

    const reponseDebutMinuit = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierDebutMinuit.token}?week_start=2026-09-07`
    );
    assert.equal(
      reponseDebutMinuit.status,
      200,
      "Le calendrier public doit accepter une disponibilité qui commence à minuit."
    );
    const donneesDebutMinuit = await reponseDebutMinuit.json();
    assert.ok(
      creneauCouvre(donneesDebutMinuit.planning, {
        date: "2026-09-07",
        heure: "00:00",
        etat: "disponible",
      }),
      "00:00 est un début de journée pour une disponibilité, pas une fin de journée."
    );
    assert.ok(
      creneauCouvre(donneesDebutMinuit.planning, {
        date: "2026-09-07",
        heure: "01:30",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donneesDebutMinuit.planning, {
        date: "2026-09-07",
        heure: "02:00",
        etat: "disponible",
      })
    );

    const reponseDst = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierDst.token}?week_start=2026-03-23`
    );
    assert.equal(reponseDst.status, 200, "Le calendrier DST doit etre lisible.");
    const donneesDst = await reponseDst.json();
    assert.ok(
      creneauCouvre(donneesDst.planning, {
        date: "2026-03-29",
        heure: "01:00",
        etat: "disponible",
      })
    );
    assert.equal(
      planningExposeHeure(donneesDst.planning, { date: "2026-03-29", heure: "02:00" }),
      false,
      "Une heure inexistante au spring-forward ne doit pas etre exposee publiquement."
    );
    assert.equal(
      planningExposeHeure(donneesDst.planning, { date: "2026-03-29", heure: "02:30" }),
      false,
      "La seconde demi-heure inexistante ne doit pas etre exposee publiquement."
    );
    assert.ok(
      creneauCouvre(donneesDst.planning, {
        date: "2026-03-29",
        heure: "03:00",
        etat: "disponible",
      })
    );

    const reponseFenetreDst = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierFenetreDst.token}?week_start=2026-03-23`
    );
    assert.equal(reponseFenetreDst.status, 200);
    const donneesFenetreDst = await reponseFenetreDst.json();
    assert.equal(
      donneesFenetreDst.config?.slot_min_time,
      "08:00",
      "Un offset public fixe ne doit pas déplacer la borne centrale GMT."
    );
    assert.equal(
      donneesFenetreDst.config?.slot_max_time,
      "22:00",
      "La fenêtre publique fixe doit rester stable pendant le DST central."
    );

    const reponsePassageAnnee = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierPassageAnnee.token}?week_start=2026-12-28`
    );
    assert.equal(reponsePassageAnnee.status, 200);
    assert.match(
      String(reponsePassageAnnee.headers.get("cache-control") || ""),
      /no-store/i,
      "La réponse publique ne doit pas être mise en cache."
    );
    const donneesPassageAnnee = await reponsePassageAnnee.json();
    assert.equal(donneesPassageAnnee.config?.public_calendar_timezone, "GMT+2");
    assert.equal(donneesPassageAnnee.config?.public_calendar_offset_minutes, 120);
    assert.equal(donneesPassageAnnee.config?.calendar_start_time, "00:30");
    assert.equal(donneesPassageAnnee.config?.calendar_end_time, "01:30");
    assert.equal(
      donneesPassageAnnee.config?.slot_min_time,
      "00:30",
      "Une fenêtre publique fixe doit commencer après le décalage de deux heures."
    );
    assert.equal(donneesPassageAnnee.config?.slot_max_time, "01:30");
    assert.ok(
      creneauCouvre(donneesPassageAnnee.planning, {
        date: "2027-01-01",
        heure: "00:30",
        etat: "disponible",
      })
    );
    assert.ok(
      creneauCouvre(donneesPassageAnnee.planning, {
        date: "2027-01-01",
        heure: "01:00",
        etat: "disponible",
      })
    );
    assert.ok(
      donneesPassageAnnee.planning.creneaux.every((creneau) => {
        const debut = convertirHeureEnMinutes(creneau.heure_debut);
        const fin = convertirHeureEnMinutes(creneau.heure_fin);
        return (
          Object.keys(creneau).every((cle) =>
            ["date", "heure_debut", "heure_fin", "etat"].includes(cle)
          ) &&
          Number.isFinite(debut) &&
          Number.isFinite(fin) &&
          fin > debut
        );
      }),
      "Chaque segment public doit rester sur une seule date et ne jamais exposer date_fin."
    );

    const reponseInvalide = await fetch(
      `${ecoute.origine}/api/reservation-public/jeton-invalide`
    );
    assert.equal(reponseInvalide.status, 404);
    const reponseInactif = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierInactif.token}`
    );
    assert.equal(reponseInactif.status, 404);
    const reponseNonHandler = await fetch(
      `${ecoute.origine}/api/reservation-public/${calendrierNonHandler.token}`
    );
    assert.equal(reponseNonHandler.status, 404);
    const reponseAncienneApi = await fetch(`${ecoute.origine}/api/reservation-public`);
    assert.equal(reponseAncienneApi.status, 404);
    const reponseAnciennePage = await fetch(`${ecoute.origine}/reservation`);
    assert.equal(reponseAnciennePage.status, 404);

    console.log("public-calendar-token.test.js: OK");
  } finally {
    if (serveur) {
      await fermerServeur(serveur);
    }

    await fermerBaseDeDonnees().catch(() => {});
    fs.rmSync(repertoireTemporaire, { recursive: true, force: true });
  }
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exitCode = 1;
});
