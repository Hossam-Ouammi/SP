const fs = require("fs/promises");

const {
  trouverLienReservationActifParToken,
  mettreAJourDernierAccesLienReservation,
} = require("../models/reservation-link.model");
const {
  listerSeancesParPlageDates,
  trouverSeanceCompteChevauchante,
  creerSeance,
  trouverSeanceParId,
  mettreAJourSeance,
  supprimerSeance,
} = require("../models/seance.model");
const {
  listerIndisponibilitesParPlageDates,
  trouverIndisponibiliteChevauchante,
} = require("../models/indisponibilite.model");
const { recupererPhotosParSeance } = require("../models/photo.model");
const { run } = require("../models/db");
const {
  creerEntreeHistorique,
  detacherSeancesHistorique,
} = require("../models/historique.model");
const { resoudreCheminScreenshot } = require("../utils/screenshot-storage");

const DUREES_VALIDEES = [60, 90, 120];
const COMPTE_PRIVE_HOSSAM = "hossam";
const HEURE_DEBUT_GRILLE = "08:00";
const HEURE_FIN_GRILLE = "23:30";
const LIBELLES_CHAMP_HISTORIQUE = {
  parent: "Parent",
  etudiant: "Etudiant",
  matiere: "Matiere",
  compte: "Compte",
  est_essai: "Seance d'essai",
  date: "Date",
  heure_debut: "Heure de debut",
  heure_fin: "Heure de fin",
  duree_minutes: "Duree",
  statut_seance: "Statut",
  description: "Description",
};
const LIBELLES_STATUT_HISTORIQUE = {
  planifiee: "Planifiee",
  faite: "Faite",
  annulee: "Annulee",
  reportee: "Reportee",
};

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserCleCompte(valeur) {
  return normaliserTexte(valeur).toLowerCase();
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function estDateIsoValide(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return false;
  }

  const dateObjet = new Date(`${date}T12:00:00`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(date);
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
  if (!estHeureValide(heureDebut) || !DUREES_VALIDEES.includes(Number(dureeMinutes))) {
    return "";
  }

  const minutesFin = convertirHeureEnMinutes(heureDebut) + Number(dureeMinutes);

  if (minutesFin >= 24 * 60) {
    return "";
  }

  return convertirMinutesEnHeure(minutesFin);
}

function construireDateHeureLocale(dateIso, heure) {
  if (!estDateIsoValide(dateIso) || !estHeureValide(heure)) {
    return null;
  }

  const [heures, minutes] = heure.split(":").map(Number);
  const dateObjet = new Date(`${dateIso}T00:00:00`);
  dateObjet.setHours(heures, minutes, 0, 0);
  return dateObjet;
}

function ajouterJoursIso(dateIso, nombreJours) {
  const dateObjet = new Date(`${dateIso}T12:00:00`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setDate(dateObjet.getDate() + nombreJours);
  return dateObjet.toISOString().slice(0, 10);
}

function calculerDebutSemaine(dateReferenceIso) {
  const dateObjet = new Date(`${dateReferenceIso}T12:00:00`);

  if (Number.isNaN(dateObjet.getTime())) {
    return obtenirDateLocaleIso();
  }

  const jour = dateObjet.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  dateObjet.setDate(dateObjet.getDate() + decalage);
  return dateObjet.toISOString().slice(0, 10);
}

function obtenirDateLocaleIso(dateObjet = new Date()) {
  const annee = dateObjet.getFullYear();
  const mois = String(dateObjet.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function obtenirContexteSemaine(valeurReference) {
  const dateReference = estDateIsoValide(valeurReference)
    ? valeurReference
    : obtenirDateLocaleIso();
  const debutSemaine = calculerDebutSemaine(dateReference);

  return {
    date_reference: dateReference,
    week_start: debutSemaine,
    week_end: ajouterJoursIso(debutSemaine, 6),
  };
}

function lienReservationEstActif(lienReservation) {
  return (
    lienReservation &&
    Number(lienReservation.actif) === 1 &&
    Number(lienReservation.utilisateur_acces_active) === 1 &&
    Number(lienReservation.utilisateur_mode_lecture_seule) !== 1 &&
    Number(lienReservation.utilisateur_doit_changer_mot_de_passe) !== 1
  );
}

function creerErreurMetier(message, status = 400) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

async function executerTransactionImmediate(callback) {
  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    const resultat = await callback();
    await run("COMMIT");
    return resultat;
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
}

function utilisateurLienEstHossam(lienReservation) {
  return (
    String(lienReservation?.utilisateur_email || "").trim().toLowerCase() ===
    "hossam@test.com"
  );
}

function reservationPubliqueEstModifiable(seance) {
  const dateDebut = construireDateHeureLocale(seance?.date, seance?.heure_debut);
  return Boolean(dateDebut) && dateDebut.getTime() > Date.now();
}

function formaterDureeHistorique(dureeMinutes) {
  if (dureeMinutes === 60) {
    return "1h";
  }

  if (dureeMinutes === 90) {
    return "1h30";
  }

  if (dureeMinutes === 120) {
    return "2h";
  }

  return `${dureeMinutes} min`;
}

function normaliserValeurHistorique(champ, valeur) {
  if (champ === "est_essai") {
    return Number(valeur) === 1 || valeur === true ? "Oui" : "Non";
  }

  if (champ === "duree_minutes") {
    return formaterDureeHistorique(Number(valeur) || 0);
  }

  if (champ === "statut_seance") {
    return LIBELLES_STATUT_HISTORIQUE[valeur] || String(valeur || "-");
  }

  if (champ === "description") {
    return normaliserTexte(valeur) || "Aucune description";
  }

  return normaliserTexte(String(valeur ?? "")) || "-";
}

function valeurComparableHistorique(champ, valeur) {
  if (champ === "est_essai") {
    return Number(valeur) === 1 || valeur === true ? 1 : 0;
  }

  if (champ === "duree_minutes") {
    return Number(valeur) || 0;
  }

  if (champ === "description") {
    return normaliserTexte(valeur);
  }

  return normaliserTexte(String(valeur ?? ""));
}

function construireEtatAuditReservation(seance) {
  const dureeMinutes =
    Number(seance?.duree_minutes) ||
    (estHeureValide(seance?.heure_debut) && estHeureValide(seance?.heure_fin)
      ? Math.max(
          convertirHeureEnMinutes(seance.heure_fin) - convertirHeureEnMinutes(seance.heure_debut),
          0
        )
      : 0);

  return {
    etudiant: seance?.etudiant || "",
    parent: seance?.parent || "",
    matiere: seance?.matiere || "",
    compte: seance?.compte || "",
    est_essai: Number(seance?.est_essai) === 1 ? 1 : 0,
    date: seance?.date || "",
    heure_debut: seance?.heure_debut || "",
    heure_fin: seance?.heure_fin || "",
    duree_minutes: dureeMinutes,
    statut_seance: seance?.statut_seance || "",
    description: seance?.description || "",
  };
}

function construireListeSuppression(etatSeance) {
  return Object.keys(LIBELLES_CHAMP_HISTORIQUE).map((champ) => ({
    champ,
    label: LIBELLES_CHAMP_HISTORIQUE[champ],
    avant: normaliserValeurHistorique(champ, etatSeance[champ]),
    apres: "-",
  }));
}

function construireListeChangements(avant, apres) {
  return Object.keys(LIBELLES_CHAMP_HISTORIQUE)
    .filter(
      (champ) =>
        valeurComparableHistorique(champ, avant[champ]) !==
        valeurComparableHistorique(champ, apres[champ])
    )
    .map((champ) => ({
      champ,
      label: LIBELLES_CHAMP_HISTORIQUE[champ],
      avant: normaliserValeurHistorique(champ, avant[champ]),
      apres: normaliserValeurHistorique(champ, apres[champ]),
    }));
}

function construireActeurNomLienPublic(lienReservation) {
  return `${lienReservation.etudiant} (lien public)`;
}

function construireLibelleSeancePublique(seance) {
  return `${seance?.matiere || "Seance"} - ${seance?.etudiant || "Etudiant"}`;
}

function reservationAppartientAuLien(seance, lienReservation) {
  return Number(seance?.lien_reservation_id) === Number(lienReservation?.id);
}

function reservationEstMemeCreneau(seance, date, heureDebut, heureFin) {
  return (
    seance?.date === date &&
    seance?.heure_debut === heureDebut &&
    seance?.heure_fin === heureFin
  );
}

function transformerReservationPublique(seance) {
  const dureeMinutes =
    Number(seance?.duree_minutes) ||
    (estHeureValide(seance?.heure_debut) && estHeureValide(seance?.heure_fin)
      ? Math.max(
          convertirHeureEnMinutes(seance.heure_fin) - convertirHeureEnMinutes(seance.heure_debut),
          0
        )
      : 0);

  return {
    id: seance.id,
    date: seance.date,
    heure_debut: seance.heure_debut,
    heure_fin: seance.heure_fin,
    duree_minutes: dureeMinutes,
    statut_seance: seance.statut_seance,
    matiere: seance.matiere || "",
    compte: seance.compte || "",
    modifiable: reservationPubliqueEstModifiable(seance),
  };
}

function transformerBlocagePublic({ id, date, heure_debut, heure_fin, type }) {
  return {
    id,
    date,
    heure_debut,
    heure_fin,
    type,
  };
}

async function recupererLienReservationValide(tokenPublic) {
  const lienReservation = await trouverLienReservationActifParToken(normaliserTexte(tokenPublic));

  if (!lienReservationEstActif(lienReservation)) {
    return null;
  }

  return lienReservation;
}

function seanceBloqueCeLien(seance, lienReservation) {
  if (!seance || reservationAppartientAuLien(seance, lienReservation)) {
    return false;
  }

  if (normaliserCleCompte(seance.compte) === normaliserCleCompte(lienReservation.compte)) {
    return true;
  }

  if (!utilisateurLienEstHossam(lienReservation)) {
    return normaliserCleCompte(seance.compte) === COMPTE_PRIVE_HOSSAM;
  }

  return false;
}

function construireContextePublicLien(lienReservation) {
  return {
    etudiant: lienReservation.etudiant,
    parent: lienReservation.parent || "",
    matiere: lienReservation.matiere,
    compte: lienReservation.compte,
    duree_minutes: Number(lienReservation.duree_minutes || 0),
    utilisateur_nom: lienReservation.utilisateur_nom || "",
  };
}

async function recupererReservationPubliqueDuLien(req, res, options = {}) {
  const lienReservation = await recupererLienReservationValide(req.params.token);

  if (!lienReservation) {
    res.status(404).json({
      message: "Lien de reservation introuvable.",
    });
    return null;
  }

  const reservationId = Number(req.params.reservationId);

  if (!estIdentifiantValide(reservationId)) {
    res.status(400).json({
      message: "Identifiant de reservation invalide.",
    });
    return null;
  }

  const reservation = await trouverSeanceParId(reservationId);

  if (!reservation || !reservationAppartientAuLien(reservation, lienReservation)) {
    res.status(404).json({
      message: "Reservation introuvable.",
    });
    return null;
  }

  if (options.verifierModifiable && !reservationPubliqueEstModifiable(reservation)) {
    res.status(400).json({
      message: "Cette reservation n'est plus modifiable.",
    });
    return null;
  }

  return {
    lienReservation,
    reservation,
  };
}

async function validerCreneauReservationPublique({
  lienReservation,
  date,
  heureDebut,
  exclureSeanceId = null,
}) {
  const dureeMinutes = Number(lienReservation.duree_minutes || 0);

  if (!estDateIsoValide(date)) {
    return {
      message: "La date choisie est invalide.",
    };
  }

  if (!estHeureDebutValide(heureDebut)) {
    return {
      message: "L'heure choisie doit etre sur une tranche de 30 minutes.",
    };
  }

  if (!DUREES_VALIDEES.includes(dureeMinutes)) {
    return {
      message: "La duree configuree pour ce lien est invalide.",
    };
  }

  const heureFin = calculerHeureFin(heureDebut, dureeMinutes);

  if (!heureFin) {
    return {
      message: "Ce creneau depasse la fin de la journee.",
    };
  }

  const dateDebut = construireDateHeureLocale(date, heureDebut);

  if (!dateDebut || dateDebut.getTime() < Date.now()) {
    return {
      message: "Ce creneau n'est plus reservable.",
    };
  }

  const conflitIndisponibilite = await trouverIndisponibiliteChevauchante({
    date,
    heureDebut,
    heureFin,
  });

  if (conflitIndisponibilite) {
    return {
      message: "Ce creneau est indisponible.",
    };
  }

  const conflitCompte = await trouverSeanceCompteChevauchante({
    date,
    heureDebut,
    heureFin,
    compte: lienReservation.compte,
    exclureSeanceId,
  });

  if (conflitCompte) {
    return {
      message:
        Number(conflitCompte.lien_reservation_id) === Number(lienReservation.id)
          ? "Vous avez deja reserve un creneau sur cette plage."
          : "Ce creneau est deja reserve.",
    };
  }

  if (!utilisateurLienEstHossam(lienReservation)) {
    const conflitHossam = await trouverSeanceCompteChevauchante({
      date,
      heureDebut,
      heureFin,
      compte: "Hossam",
      exclureSeanceId,
    });

    if (conflitHossam) {
      return {
        message: "Ce creneau n'est pas disponible.",
      };
    }
  }

  return {
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    duree_minutes: dureeMinutes,
  };
}

async function supprimerFichiersReservation(photos = []) {
  await Promise.all(
    photos.map(async (photo) => {
      const cheminComplet = await resoudreCheminScreenshot(photo);

      if (!cheminComplet) {
        return;
      }

      try {
        await fs.unlink(cheminComplet);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Suppression de screenshot impossible :", error);
        }
      }
    })
  );
}

async function afficherPageReservationPublique(req, res) {
  const lienReservation = await recupererLienReservationValide(req.params.token);

  if (!lienReservation) {
    return res.status(404).send("Lien de reservation introuvable.");
  }

  await mettreAJourDernierAccesLienReservation(lienReservation.id).catch(() => {});

  return res.render("reservation", {
    tokenReservation: lienReservation.token_public,
  });
}

async function recupererPlanningReservationPublique(req, res) {
  const lienReservation = await recupererLienReservationValide(req.params.token);

  if (!lienReservation) {
    return res.status(404).json({
      message: "Lien de reservation introuvable.",
    });
  }

  const contexteSemaine = obtenirContexteSemaine(
    normaliserTexte(req.query.week_start) || normaliserTexte(req.query.date)
  );
  const [seancesSemaine, indisponibilites] = await Promise.all([
    listerSeancesParPlageDates(contexteSemaine.week_start, contexteSemaine.week_end),
    listerIndisponibilitesParPlageDates(contexteSemaine.week_start, contexteSemaine.week_end),
  ]);
  const reservations = [];
  const blocages = [];

  seancesSemaine.forEach((seance) => {
    if (reservationAppartientAuLien(seance, lienReservation)) {
      reservations.push(transformerReservationPublique(seance));
      return;
    }

    if (seanceBloqueCeLien(seance, lienReservation)) {
      blocages.push(
        transformerBlocagePublic({
          id: `seance-${seance.id}`,
          date: seance.date,
          heure_debut: seance.heure_debut,
          heure_fin: seance.heure_fin,
          type: "seance",
        })
      );
    }
  });

  indisponibilites.forEach((indisponibilite) => {
    blocages.push(
      transformerBlocagePublic({
        id: `indisponibilite-${indisponibilite.id}`,
        date: indisponibilite.date,
        heure_debut: indisponibilite.heure_debut,
        heure_fin: indisponibilite.heure_fin,
        type: Number(indisponibilite.jour_complet) === 1 ? "jour_complet" : "indisponibilite",
      })
    );
  });

  return res.json({
    reservation: construireContextePublicLien(lienReservation),
    planning: {
      ...contexteSemaine,
      slot_min_time: HEURE_DEBUT_GRILLE,
      slot_max_time: HEURE_FIN_GRILLE,
      reservations,
      blocages,
    },
  });
}

async function reserverCreneauPublic(req, res) {
  const lienReservation = await recupererLienReservationValide(req.params.token);

  if (!lienReservation) {
    return res.status(404).json({
      message: "Lien de reservation introuvable.",
    });
  }

  const nouvelleSeance = await executerTransactionImmediate(async () => {
    const validation = await validerCreneauReservationPublique({
      lienReservation,
      date: normaliserTexte(req.body.date),
      heureDebut: normaliserTexte(req.body.heure_debut),
    });

    if (validation.message) {
      throw creerErreurMetier(validation.message, 400);
    }

    const seanceCreee = await creerSeance({
      titre: `${lienReservation.matiere} - ${lienReservation.etudiant}`,
      etudiant: lienReservation.etudiant,
      parent: lienReservation.parent || "",
      matiere: lienReservation.matiere,
      compte: lienReservation.compte,
      est_essai: 0,
      date: validation.date,
      heure_debut: validation.heure_debut,
      heure_fin: validation.heure_fin,
      duree_minutes: validation.duree_minutes,
      statut_seance: "planifiee",
      prix: 0,
      statut_paiement: "non_payee",
      description: "Reservation creee via lien etudiant.",
      cree_par: null,
      modifie_par: null,
      utilisateur_id: lienReservation.utilisateur_id,
      lien_reservation_id: lienReservation.id,
    });

    await creerEntreeHistorique({
      seanceId: seanceCreee.id,
      seanceLibelle: construireLibelleSeancePublique(seanceCreee),
      actionType: "reservation_etudiant_creee",
      actionLabel: "Reservation via lien etudiant",
      acteurId: null,
      acteurNom: construireActeurNomLienPublic(lienReservation),
      details: {
        type: "creation",
        source: "lien_reservation_public",
        seance: construireEtatAuditReservation(seanceCreee),
      },
    });

    return seanceCreee;
  });

  return res.status(201).json({
    message: "Votre creneau a bien ete reserve.",
    reservation: transformerReservationPublique(nouvelleSeance),
  });
}

async function reprogrammerReservationPublique(req, res) {
  const contexteReservation = await recupererReservationPubliqueDuLien(req, res, {
    verifierModifiable: true,
  });

  if (!contexteReservation) {
    return undefined;
  }

  const { lienReservation, reservation } = contexteReservation;
  const etatAvant = construireEtatAuditReservation(reservation);
  const seanceMiseAJour = await executerTransactionImmediate(async () => {
    const validation = await validerCreneauReservationPublique({
      lienReservation,
      date: normaliserTexte(req.body.date),
      heureDebut: normaliserTexte(req.body.heure_debut),
      exclureSeanceId: reservation.id,
    });

    if (validation.message) {
      throw creerErreurMetier(validation.message, 400);
    }

    if (
      reservationEstMemeCreneau(
        reservation,
        validation.date,
        validation.heure_debut,
        validation.heure_fin
      )
    ) {
      throw creerErreurMetier(
        "Choisissez un autre creneau pour reprogrammer cette reservation.",
        400
      );
    }

    const seanceActualisee = await mettreAJourSeance(
      reservation.id,
      {
        titre: `${lienReservation.matiere} - ${lienReservation.etudiant}`,
        etudiant: lienReservation.etudiant,
        parent: lienReservation.parent || "",
        matiere: lienReservation.matiere,
        compte: lienReservation.compte,
        est_essai: Number(reservation.est_essai) === 1 ? 1 : 0,
        date: validation.date,
        heure_debut: validation.heure_debut,
        heure_fin: validation.heure_fin,
        duree_minutes: validation.duree_minutes,
        statut_seance: reservation.statut_seance || "planifiee",
        prix: Number(reservation.prix) || 0,
        statut_paiement: reservation.statut_paiement || "non_payee",
        description: reservation.description || "Reservation creee via lien etudiant.",
        modifie_par: null,
      },
      lienReservation.utilisateur_id
    );
    const etatApres = construireEtatAuditReservation(seanceActualisee);

    await creerEntreeHistorique({
      seanceId: seanceActualisee.id,
      seanceLibelle: construireLibelleSeancePublique(seanceActualisee),
      actionType: "reservation_etudiant_reprogrammee",
      actionLabel: "Reprogrammation via lien etudiant",
      acteurId: null,
      acteurNom: construireActeurNomLienPublic(lienReservation),
      details: {
        type: "modification",
        source: "lien_reservation_public",
        seance: etatApres,
        changements: construireListeChangements(etatAvant, etatApres),
      },
    });

    return seanceActualisee;
  });

  return res.json({
    message: "Votre reservation a bien ete reprogrammee.",
    reservation: transformerReservationPublique(seanceMiseAJour),
  });
}

async function annulerReservationPublique(req, res) {
  const contexteReservation = await recupererReservationPubliqueDuLien(req, res, {
    verifierModifiable: true,
  });

  if (!contexteReservation) {
    return undefined;
  }

  const { lienReservation, reservation } = contexteReservation;
  const photos = await recupererPhotosParSeance(reservation.id);
  const etatAvantSuppression = construireEtatAuditReservation(reservation);

  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    await detacherSeancesHistorique([reservation]);
    await supprimerSeance(reservation.id, lienReservation.utilisateur_id);
    await creerEntreeHistorique({
      seanceId: null,
      seanceLibelle: construireLibelleSeancePublique(reservation),
      actionType: "reservation_etudiant_annulee",
      actionLabel: "Annulation via lien etudiant",
      acteurId: null,
      acteurNom: construireActeurNomLienPublic(lienReservation),
      details: {
        type: "suppression",
        source: "lien_reservation_public",
        seance: etatAvantSuppression,
        changements: construireListeSuppression(etatAvantSuppression),
      },
    });
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }

  await supprimerFichiersReservation(photos);

  return res.json({
    message: "Votre reservation a bien ete annulee.",
  });
}

module.exports = {
  afficherPageReservationPublique,
  recupererPlanningReservationPublique,
  reserverCreneauPublic,
  reprogrammerReservationPublique,
  annulerReservationPublique,
};
