const {
  listerToutesLesIndisponibilites,
  listerIndisponibilitesScopees,
  trouverIndisponibiliteParId,
  trouverIndisponibiliteParIdScopee,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
  trouverIndisponibiliteIntervenantChevauchante,
} = require("../models/indisponibilite.model");
const {
  listerToutesLesSeances,
  listerSeancesScopees,
  trouverSeanceChevauchante,
  trouverSeanceIntervenantChevauchante,
} = require("../models/seance.model");
const {
  construireFiltreLectureSeances,
} = require("../models/access-scope.model");
const { trouverReglagesEspace } = require("../models/workspace-settings.model");
const {
  intervalleEstDansPlageCalendrier,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");
const { estDateHeureZonneeCivileExistante } = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");
const { creerEntreeHistorique } = require("../models/historique.model");
const { executerTransactionImmediate } = require("../models/db");

const HEURE_DEBUT_JOUR_COMPLET = "00:00";
const HEURE_FIN_JOUR_COMPLET = "23:59";
const HEURE_FIN_MINUIT = "24:00";

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function normaliserIdentifiant(valeur) {
  return estIdentifiantValide(valeur) ? Number(valeur) : null;
}

function construireScopeLectureIndisponibilites(req) {
  if (req.scope?.estHandler) {
    return {
      // Cette fonction alimente exclusivement l'API de gestion
      // `/api/indisponibilites`, explicitement fermée aux Handlers. Le flux
      // Dashboard est traité par `recupererIndisponibilitesCalendrierCentral`
      // ci-dessous, afin qu'une future route ne réintroduise pas par erreur
      // les indisponibilités personnelles du Handler.
      handlerIds: [],
      intervenantIds: [],
    };
  }

  return construireFiltreLectureSeances(req.scope);
}

function creerErreurRessourceInaccessible() {
  return creerErreurHttp(404, "Cr\u00e9neau indisponible introuvable.");
}

async function resoudreAffectationIndisponibilite({
  scope,
  acteur,
  donnees,
  indisponibiliteExistante = null,
}) {
  const utilisateurId = normaliserIdentifiant(acteur?.id);
  const handlerDemande = normaliserIdentifiant(donnees?.handler_id ?? donnees?.handlerId);
  const intervenantDemande = normaliserIdentifiant(
    donnees?.intervenant_id ?? donnees?.professeur_id ?? donnees?.intervenantId
  );

  if (!utilisateurId || !scope?.utilisateurId) {
    throw creerErreurHttp(403, "Aucun espace Handler ou Professeur actif n'est associ\u00e9 \u00e0 ce compte.");
  }

  if (scope.estHandler) {
    throw creerErreurHttp(
      403,
      "Le Handler ne peut pas déclarer, modifier ou supprimer une indisponibilité.",
      "HANDLER_UNAVAILABILITY_FORBIDDEN"
    );
  }

  const handlerIds = Array.isArray(scope.handlerProfesseurIds)
    ? scope.handlerProfesseurIds.map(normaliserIdentifiant).filter(Boolean)
    : [];
  const handlerId = normaliserIdentifiant(indisponibiliteExistante?.handler_id) || handlerIds[0];

  if (!scope.estProfesseur || !handlerId || !handlerIds.includes(handlerId)) {
    throw creerErreurHttp(403, "Aucun espace Professeur actif n'est associ\u00e9 \u00e0 ce compte.");
  }

  if (handlerDemande && handlerDemande !== handlerId) {
    throw creerErreurRessourceInaccessible();
  }

  const intervenantId =
    intervenantDemande ||
    normaliserIdentifiant(indisponibiliteExistante?.intervenant_id) ||
    utilisateurId;

  if (intervenantId !== utilisateurId) {
    throw creerErreurRessourceInaccessible();
  }

  return { handlerId, intervenantId };
}

function creerErreurHttp(status, message, code = null) {
  const erreur = new Error(message);
  erreur.status = status;
  if (code) {
    erreur.code = code;
  }
  return erreur;
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

function estHeureCreneauValide(heure) {
  return estHeureValide(heure) && /:(00|30)$/.test(String(heure || ""));
}

function estHeureFinIndisponibiliteValide(heure) {
  return (
    estHeureCreneauValide(heure) ||
    String(heure || "") === HEURE_FIN_JOUR_COMPLET ||
    String(heure || "") === HEURE_FIN_MINUIT
  );
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function convertirMinutesEnHeure(minutes) {
  const borneFin = convertirHeureEnMinutes(HEURE_FIN_JOUR_COMPLET);
  const totalMinutes = Math.max(0, Math.min(borneFin, Number(minutes) || 0));

  if (totalMinutes >= borneFin) {
    return HEURE_FIN_JOUR_COMPLET;
  }

  const heures = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutesRestantes = String(totalMinutes % 60).padStart(2, "0");
  return `${heures}:${minutesRestantes}`;
}

function normaliserIntervalleOccupe(heureDebut, heureFin) {
  if (!estHeureValide(heureDebut) || !estHeureFinIndisponibiliteValide(heureFin)) {
    return null;
  }

  const borneDebut = convertirHeureEnMinutes(HEURE_DEBUT_JOUR_COMPLET);
  const borneFin = convertirHeureEnMinutes(HEURE_FIN_JOUR_COMPLET);
  const debut = Math.max(borneDebut, convertirHeureEnMinutes(heureDebut));
  const fin = Math.min(borneFin, convertirHeureEnMinutes(heureFin));

  if (fin <= debut) {
    return null;
  }

  return { debut, fin };
}

function fusionnerIntervalles(intervalles) {
  return intervalles
    .filter(Boolean)
    .sort((premier, second) => premier.debut - second.debut || premier.fin - second.fin)
    .reduce((fusionnes, intervalle) => {
      const precedent = fusionnes[fusionnes.length - 1];

      if (!precedent || intervalle.debut > precedent.fin) {
        fusionnes.push({ ...intervalle });
        return fusionnes;
      }

      precedent.fin = Math.max(precedent.fin, intervalle.fin);
      return fusionnes;
    }, []);
}

function extraireIntervallesOccupesJournee({ date, seances = [], indisponibilites = [] }) {
  const intervallesSeances = seances
    .filter(
      (seance) =>
        seance.date === date &&
        String(seance.statut_seance || "").toLowerCase() !== "annulee"
    )
    .map((seance) => normaliserIntervalleOccupe(seance.heure_debut, seance.heure_fin));
  const intervallesIndisponibilites = indisponibilites
    .filter((indisponibilite) => indisponibilite.date === date)
    .map((indisponibilite) =>
      normaliserIntervalleOccupe(indisponibilite.heure_debut, indisponibilite.heure_fin)
    );

  return fusionnerIntervalles([...intervallesSeances, ...intervallesIndisponibilites]);
}

function calculerCreneauxLibresJournee({ date, seances = [], indisponibilites = [] }) {
  const borneDebut = convertirHeureEnMinutes(HEURE_DEBUT_JOUR_COMPLET);
  const borneFin = convertirHeureEnMinutes(HEURE_FIN_JOUR_COMPLET);
  const intervallesOccupes = extraireIntervallesOccupesJournee({
    date,
    seances,
    indisponibilites,
  });
  const creneauxLibres = [];
  let curseur = borneDebut;

  intervallesOccupes.forEach((intervalle) => {
    if (intervalle.debut > curseur) {
      creneauxLibres.push({ debut: curseur, fin: intervalle.debut });
    }

    curseur = Math.max(curseur, intervalle.fin);
  });

  if (curseur < borneFin) {
    creneauxLibres.push({ debut: curseur, fin: borneFin });
  }

  return creneauxLibres.map((intervalle) => ({
    heureDebut: convertirMinutesEnHeure(intervalle.debut),
    heureFin: convertirMinutesEnHeure(intervalle.fin),
    jourComplet:
      intervalle.debut === borneDebut &&
      intervalle.fin === borneFin &&
      intervallesOccupes.length === 0,
  }));
}

function estIndisponibiliteJourComplet(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function formaterPlageIndisponibilite(indisponibilite) {
  if (estIndisponibiliteJourComplet(indisponibilite)) {
    return "Jour complet";
  }

  const heureFin = indisponibilite?.heure_fin === HEURE_FIN_MINUIT
    ? HEURE_DEBUT_JOUR_COMPLET
    : indisponibilite?.heure_fin;
  return `${indisponibilite?.heure_debut || ""} - ${heureFin || ""}`.trim();
}

function construireLibelleIndisponibilite(indisponibilite) {
  const plage = formaterPlageIndisponibilite(indisponibilite);
  return estIndisponibiliteJourComplet(indisponibilite)
    ? `Indisponibilité - ${indisponibilite.date} (${plage.toLowerCase()})`
    : `Indisponibilité - ${indisponibilite.date} ${plage.replace(" - ", "-")}`;
}

function transformerIndisponibilitePourClient(indisponibilite) {
  return {
    ...indisponibilite,
    heure_fin:
      indisponibilite?.heure_fin === HEURE_FIN_MINUIT
        ? HEURE_DEBUT_JOUR_COMPLET
        : indisponibilite?.heure_fin,
    jour_complet: estIndisponibiliteJourComplet(indisponibilite) ? 1 : 0,
    raison: "",
    libelle: construireLibelleIndisponibilite(indisponibilite),
  };
}

function construireDetailsCreation(indisponibilite) {
  const plage = formaterPlageIndisponibilite(indisponibilite);

  return {
    changements: [
      { champ: "date", label: "Date", avant: "-", apres: indisponibilite.date },
      {
        champ: "plage",
        label: "Plage",
        avant: "-",
        apres: plage,
      },
    ],
  };
}

function construireDetailsCreationJourneeFragmentee(date, indisponibilites) {
  const plages = indisponibilites
    .map(formaterPlageIndisponibilite)
    .join(", ");

  return {
    changements: [
      { champ: "date", label: "Date", avant: "-", apres: date },
      {
        champ: "plages",
        label: "Plages",
        avant: "-",
        apres: plages || "-",
      },
    ],
  };
}

function construireDetailsSuppression(indisponibilite) {
  const plage = formaterPlageIndisponibilite(indisponibilite);

  return {
    changements: [
      { champ: "date", label: "Date", avant: indisponibilite.date, apres: "-" },
      {
        champ: "plage",
        label: "Plage",
        avant: plage,
        apres: "-",
      },
    ],
  };
}

function construireDetailsModification(indisponibiliteAvant, indisponibiliteApres) {
  const plageAvant = formaterPlageIndisponibilite(indisponibiliteAvant);
  const plageApres = formaterPlageIndisponibilite(indisponibiliteApres);
  const changements = [];

  if (indisponibiliteAvant.date !== indisponibiliteApres.date) {
    changements.push({
      champ: "date",
      label: "Date",
      avant: indisponibiliteAvant.date,
      apres: indisponibiliteApres.date,
    });
  }

  if (plageAvant !== plageApres) {
    changements.push({
      champ: "plage",
      label: "Plage",
      avant: plageAvant,
      apres: plageApres,
    });
  }

  if (changements.length === 0) {
    changements.push({
      champ: "indisponibilite",
      label: "Indisponibilite",
      avant: "Aucun changement",
      apres: "Aucun changement",
    });
  }

  return { changements };
}

function construireDetailsModificationJourneeFragmentee(
  indisponibiliteAvant,
  date,
  indisponibilitesApres
) {
  const plageAvant = formaterPlageIndisponibilite(indisponibiliteAvant);
  const plagesApres = indisponibilitesApres
    .map(formaterPlageIndisponibilite)
    .join(", ");

  return {
    changements: [
      {
        champ: "date",
        label: "Date",
        avant: indisponibiliteAvant.date,
        apres: date,
      },
      {
        champ: "plages",
        label: "Plages",
        avant: plageAvant,
        apres: plagesApres || "-",
      },
    ],
  };
}

function normaliserDonneesIndisponibilite(donnees = {}) {
  const date = normaliserTexte(donnees.date);
  const jourComplet =
    donnees.jour_complet === true ||
    donnees.jour_complet === "true" ||
    donnees.jour_complet === "on" ||
    donnees.jour_complet === 1 ||
    donnees.jour_complet === "1" ||
    (
      normaliserTexte(donnees.heure_debut) === HEURE_DEBUT_JOUR_COMPLET &&
      normaliserTexte(donnees.heure_fin) === HEURE_FIN_JOUR_COMPLET
    );
  let heureDebut = normaliserTexte(donnees.heure_debut);
  let heureFin = normaliserTexte(donnees.heure_fin);
  const raison = "";

  if (jourComplet) {
    heureDebut = HEURE_DEBUT_JOUR_COMPLET;
    heureFin = HEURE_FIN_JOUR_COMPLET;
  } else if (heureFin === HEURE_DEBUT_JOUR_COMPLET) {
    // Une fin saisie à 00:00 désigne la fin de la journée civile, jamais le
    // début de cette même journée. Le stockage explicite 24:00 conserve la
    // convention commune avec les séances et disponibilités.
    heureFin = HEURE_FIN_MINUIT;
  }

  return {
    date,
    heureDebut,
    heureFin,
    jourComplet,
    raison,
  };
}

async function validerDonneesIndisponibilite(
  { date, heureDebut, heureFin, jourComplet, handlerId = null, intervenantId = null },
  options = {}
) {
  if (!date || (!jourComplet && (!heureDebut || !heureFin))) {
    return "Date, heure de début et heure de fin obligatoires.";
  }

  if (!estDateIsoValide(date)) {
    return "La date est invalide.";
  }

  if (!jourComplet) {
    if (!estHeureCreneauValide(heureDebut) || !estHeureFinIndisponibiliteValide(heureFin)) {
      return "Les heures doivent être choisies par tranches de 30 minutes.";
    }

    if (convertirHeureEnMinutes(heureFin) <= convertirHeureEnMinutes(heureDebut)) {
      return "L'heure de fin doit être posterieure a l'heure de debut.";
    }

    const erreurPlageCalendrier = await verifierPlageCalendrierIndisponibilite({
      handlerId,
      date,
      heureDebut,
      heureFin,
      indisponibiliteExistante: options.indisponibiliteExistante,
    });
    if (erreurPlageCalendrier) {
      return erreurPlageCalendrier;
    }

    const conflitSeance =
      normaliserIdentifiant(handlerId) && normaliserIdentifiant(intervenantId)
        ? await trouverSeanceIntervenantChevauchante({
            handlerId,
            intervenantId,
            date,
            heureDebut,
            heureFin,
          })
        : await trouverSeanceChevauchante({
            date,
            heureDebut,
            heureFin,
          });

    if (conflitSeance) {
      return "Ce créneau contient déjà une séance. Déclarez un jour complet pour bloquer uniquement les plages libres.";
    }
  }

  const conflit =
    normaliserIdentifiant(handlerId) && normaliserIdentifiant(intervenantId)
      ? await trouverIndisponibiliteIntervenantChevauchante({
          handlerId,
          intervenantId,
          date,
          heureDebut,
          heureFin,
          exclureId: options.exclureId || null,
        })
      : await trouverIndisponibiliteChevauchante({
          date,
          heureDebut,
          heureFin,
          exclureId: options.exclureId || null,
        });

  if (conflit) {
    return "Ce créneau chevauche déjà une indisponibilité existante. Supprimez-la ou créez un créneau plus large.";
  }

  return "";
}

async function verifierPlageCalendrierIndisponibilite({
  handlerId,
  date,
  heureDebut,
  heureFin,
  indisponibiliteExistante = null,
}) {
  const idHandler = normaliserIdentifiant(handlerId);
  if (!idHandler) {
    return "";
  }

  if (
    indisponibiliteExistante &&
    String(indisponibiliteExistante.date || "") === String(date || "") &&
    String(indisponibiliteExistante.heure_debut || "") === String(heureDebut || "") &&
    String(indisponibiliteExistante.heure_fin || "") === String(heureFin || "")
  ) {
    // Un créneau historique devenu hors plage après un resserrement reste
    // conservé et peut encore être modifié sans déplacement forcé.
    return "";
  }

  const reglages = await trouverReglagesEspace(idHandler);
  if (
    !estDateHeureZonneeCivileExistante(date, heureDebut, CENTRAL_CALENDAR_TIMEZONE) ||
    !estDateHeureZonneeCivileExistante(date, heureFin, CENTRAL_CALENDAR_TIMEZONE)
  ) {
    return "L'heure choisie n'existe pas dans le fuseau horaire central à cette date.";
  }

  const plage = normaliserPlageDepuisReglages(reglages || {});
  if (
    !intervalleEstDansPlageCalendrier({
      heureDebut,
      heureFin,
      plage,
    })
  ) {
    return `Le créneau doit rester dans la plage du calendrier (${plage.calendar_start_time}–${plage.calendar_end_time}).`;
  }

  return "";
}

async function creerIndisponibilitesDisponiblesPourJourComplet({
  date,
  raison,
  creePar,
  acteur,
  handlerId = null,
  intervenantId = null,
  exclureIndisponibiliteIds = [],
  journaliser = true,
}) {
  if (!date) {
    throw creerErreurHttp(400, "Date, heure de début et heure de fin obligatoires.");
  }

  if (!estDateIsoValide(date)) {
    throw creerErreurHttp(400, "La date est invalide.");
  }

  const scopeIntervenant = {
    handlerIds: normaliserIdentifiant(handlerId) ? [normaliserIdentifiant(handlerId)] : [],
    intervenantId: normaliserIdentifiant(intervenantId),
  };
  const seances =
    scopeIntervenant.handlerIds.length > 0 && scopeIntervenant.intervenantId
      ? await listerSeancesScopees(scopeIntervenant)
      : await listerToutesLesSeances();
  const exclusions = new Set(
    exclureIndisponibiliteIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
  const indisponibilitesSource =
    scopeIntervenant.handlerIds.length > 0 && scopeIntervenant.intervenantId
      ? await listerIndisponibilitesScopees(scopeIntervenant)
      : await listerToutesLesIndisponibilites();
  const indisponibilitesExistantes = indisponibilitesSource.filter(
    (indisponibilite) => !exclusions.has(Number(indisponibilite.id))
  );
  const creneauxDisponibles = calculerCreneauxLibresJournee({
    date,
    seances,
    indisponibilites: indisponibilitesExistantes,
  });

  if (creneauxDisponibles.length === 0) {
    throw creerErreurHttp(
      400,
      "Aucun créneau disponible sur cette journée. Les séances et indisponibilités existantes sont conservées."
    );
  }

  const indisponibilitesCreees = [];

  for (const creneau of creneauxDisponibles) {
    const indisponibiliteCreee = await creerIndisponibilite({
      date,
      heureDebut: creneau.heureDebut,
      heureFin: creneau.heureFin,
      jourComplet: creneau.jourComplet,
      raison,
      creePar,
      handlerId,
      intervenantId,
    });

    indisponibilitesCreees.push(indisponibiliteCreee);
  }

  if (journaliser) {
    await creerEntreeHistorique({
      seanceId: null,
      seanceLibelle: construireLibelleIndisponibilite(indisponibilitesCreees[0]),
      actionType: "indisponibilite_creee",
      actionLabel: indisponibilitesCreees.some(estIndisponibiliteJourComplet)
        ? "Création d'une journée indisponible"
        : "Création des créneaux disponibles d'une journée",
      acteurId: acteur?.id,
      acteurNom: acteur?.nom,
      handlerId,
      intervenantId,
      details:
        indisponibilitesCreees.length === 1
          ? construireDetailsCreation(indisponibilitesCreees[0])
          : construireDetailsCreationJourneeFragmentee(date, indisponibilitesCreees),
    });
  }

  return {
    indisponibilite: indisponibilitesCreees[0],
    indisponibilites: indisponibilitesCreees,
    creationPartielle: !indisponibilitesCreees.some(estIndisponibiliteJourComplet),
  };
}

async function recupererIndisponibilites(req, res) {
  const indisponibilites = await listerIndisponibilitesScopees(
    construireScopeLectureIndisponibilites(req)
  );

  return res.json({
    indisponibilites: indisponibilites.map(transformerIndisponibilitePourClient),
  });
}

/**
 * Flux minimal, lecture seule, destiné au calendrier central du Handler.
 * Il ne passe volontairement pas par `/api/indisponibilites` : ce dernier
 * reste le module personnel des Professeurs. Les blocs historiques du Handler
 * sont exclus, tout comme ceux de Professeurs détachés ou désactivés.
 */
async function recupererIndisponibilitesCalendrierCentral(req, res) {
  const handlerId = normaliserIdentifiant(req.scope?.utilisateurId);
  if (!req.scope?.estHandler || !handlerId) {
    throw creerErreurHttp(
      403,
      "Cette ressource est réservée au Handler de l'équipe.",
      "HANDLER_REQUIRED"
    );
  }

  const professeurIds = Array.from(
    new Set(
      (Array.isArray(req.scope?.professeurIdsHandlerOwn)
        ? req.scope.professeurIdsHandlerOwn
        : [])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );
  const indisponibilites = await listerIndisponibilitesScopees({
    handlerIds: [handlerId],
    intervenantIds: professeurIds,
  });

  return res.json({
    indisponibilites: indisponibilites.map((indisponibilite) => ({
      id: Number(indisponibilite.id),
      date: indisponibilite.date,
      heure_debut: indisponibilite.heure_debut,
      heure_fin:
        indisponibilite.heure_fin === HEURE_FIN_MINUIT
          ? HEURE_DEBUT_JOUR_COMPLET
          : indisponibilite.heure_fin,
      jour_complet: estIndisponibiliteJourComplet(indisponibilite) ? 1 : 0,
      handler_id: Number(indisponibilite.handler_id),
      intervenant_id: Number(indisponibilite.intervenant_id),
    })),
  });
}

async function ajouterIndisponibilite(req, res) {
  const { date, heureDebut, heureFin, jourComplet, raison } =
    normaliserDonneesIndisponibilite(req.body);
  const affectation = await resoudreAffectationIndisponibilite({
    scope: req.scope,
    acteur: req.utilisateur,
    donnees: req.body,
  });

  const resultatCreation = await executerTransactionImmediate(async () => {
    if (jourComplet) {
      return creerIndisponibilitesDisponiblesPourJourComplet({
        date,
        raison,
        creePar: req.utilisateur.id,
        acteur: req.utilisateur,
        handlerId: affectation.handlerId,
        intervenantId: affectation.intervenantId,
      });
    }

    const erreurValidation = await validerDonneesIndisponibilite({
      date,
      heureDebut,
      heureFin,
      jourComplet,
      raison,
      handlerId: affectation.handlerId,
      intervenantId: affectation.intervenantId,
    });

    if (erreurValidation) {
      throw creerErreurHttp(400, erreurValidation);
    }

    const indisponibiliteCreee = await creerIndisponibilite({
      date,
      heureDebut,
      heureFin,
      jourComplet,
      raison,
      creePar: req.utilisateur.id,
      handlerId: affectation.handlerId,
      intervenantId: affectation.intervenantId,
    });

    await creerEntreeHistorique({
      seanceId: null,
      seanceLibelle: construireLibelleIndisponibilite(indisponibiliteCreee),
      actionType: "indisponibilite_creee",
      actionLabel: jourComplet
        ? "Création d'une journée indisponible"
        : "Création d'un créneau indisponible",
      acteurId: req.utilisateur?.id,
      acteurNom: req.utilisateur?.nom,
      handlerId: affectation.handlerId,
      intervenantId: affectation.intervenantId,
      details: construireDetailsCreation(indisponibiliteCreee),
    });

    return {
      indisponibilite: indisponibiliteCreee,
      indisponibilites: [indisponibiliteCreee],
      creationPartielle: false,
    };
  });

  res.locals.realtimeScope = {
    handlerId: affectation.handlerId,
    intervenantId: affectation.intervenantId,
  };

  return res.status(201).json({
    message: jourComplet
      ? resultatCreation.creationPartielle
        ? "Les créneaux disponibles de la journée ont été bloqués."
        : "La journée indisponible a été ajoutée."
      : "Le créneau indisponible a été ajouté.",
    indisponibilite: transformerIndisponibilitePourClient(resultatCreation.indisponibilite),
    indisponibilites: resultatCreation.indisponibilites.map(transformerIndisponibilitePourClient),
    creation_partielle: resultatCreation.creationPartielle ? 1 : 0,
  });
}

async function modifierUneIndisponibilite(req, res) {
  const indisponibiliteId = Number(req.params.id);

  if (!estIdentifiantValide(indisponibiliteId)) {
    return res.status(400).json({
      message: "Identifiant d'indisponibilité invalide.",
    });
  }

  const indisponibiliteExistante = await trouverIndisponibiliteParIdScopee(
    indisponibiliteId,
    construireScopeLectureIndisponibilites(req)
  );

  if (!indisponibiliteExistante) {
    return res.status(404).json({
      message: "Créneau indisponible introuvable.",
    });
  }

  const { date, heureDebut, heureFin, jourComplet, raison } =
    normaliserDonneesIndisponibilite(req.body);
  const affectation = await resoudreAffectationIndisponibilite({
    scope: req.scope,
    acteur: req.utilisateur,
    donnees: req.body,
    indisponibiliteExistante,
  });
  const resultatModification = await executerTransactionImmediate(async () => {
    if (jourComplet) {
      const resultatJourComplet = await creerIndisponibilitesDisponiblesPourJourComplet({
        date,
        raison,
        creePar: indisponibiliteExistante.cree_par || req.utilisateur.id,
        acteur: req.utilisateur,
        handlerId: affectation.handlerId,
        intervenantId: affectation.intervenantId,
        exclureIndisponibiliteIds: [indisponibiliteId],
        journaliser: false,
      });

      await supprimerIndisponibilite(indisponibiliteId);

      await creerEntreeHistorique({
        seanceId: null,
        seanceLibelle: construireLibelleIndisponibilite(resultatJourComplet.indisponibilite),
        actionType: "indisponibilite_modifiee",
        actionLabel: resultatJourComplet.creationPartielle
          ? "Modification en créneaux disponibles d'une journée"
          : "Modification en journée indisponible",
        acteurId: req.utilisateur?.id,
        acteurNom: req.utilisateur?.nom,
        handlerId: affectation.handlerId,
        intervenantId: affectation.intervenantId,
        details: construireDetailsModificationJourneeFragmentee(
          indisponibiliteExistante,
          date,
          resultatJourComplet.indisponibilites
        ),
      });

      return resultatJourComplet;
    }

    const erreurValidation = await validerDonneesIndisponibilite(
      {
        date,
        heureDebut,
        heureFin,
        jourComplet,
        raison,
        handlerId: affectation.handlerId,
        intervenantId: affectation.intervenantId,
      },
      {
        exclureId: indisponibiliteId,
        indisponibiliteExistante,
      }
    );

    if (erreurValidation) {
      throw creerErreurHttp(400, erreurValidation);
    }

    const indisponibiliteModifiee = await modifierIndisponibilite(indisponibiliteId, {
      date,
      heureDebut,
      heureFin,
      jourComplet,
      raison,
      handlerId: affectation.handlerId,
      intervenantId: affectation.intervenantId,
    });

    await creerEntreeHistorique({
      seanceId: null,
      seanceLibelle: construireLibelleIndisponibilite(indisponibiliteModifiee),
      actionType: "indisponibilite_modifiee",
      actionLabel: estIndisponibiliteJourComplet(indisponibiliteModifiee)
        ? "Modification d'une journée indisponible"
        : "Modification d'un créneau indisponible",
      acteurId: req.utilisateur?.id,
      acteurNom: req.utilisateur?.nom,
      handlerId: affectation.handlerId,
      intervenantId: affectation.intervenantId,
      details: construireDetailsModification(indisponibiliteExistante, indisponibiliteModifiee),
    });

    return {
      indisponibilite: indisponibiliteModifiee,
      indisponibilites: [indisponibiliteModifiee],
      creationPartielle: false,
    };
  });
  const indisponibilite = resultatModification.indisponibilite;
  res.locals.realtimeScope = {
    handlerId: indisponibilite.handler_id,
    intervenantId: indisponibilite.intervenant_id,
  };

  return res.json({
    message: jourComplet
      ? resultatModification.creationPartielle
        ? "Les créneaux disponibles de la journée ont été bloqués."
        : "La journée indisponible a été modifiée."
      : "Le créneau indisponible a été modifié.",
    indisponibilite: transformerIndisponibilitePourClient(indisponibilite),
    indisponibilites: resultatModification.indisponibilites.map(
      transformerIndisponibilitePourClient
    ),
    creation_partielle: resultatModification.creationPartielle ? 1 : 0,
  });
}

async function supprimerUneIndisponibilite(req, res) {
  const indisponibiliteId = Number(req.params.id);

  if (!estIdentifiantValide(indisponibiliteId)) {
    return res.status(400).json({
      message: "Identifiant d'indisponibilité invalide.",
    });
  }

  const indisponibilite = await trouverIndisponibiliteParIdScopee(
    indisponibiliteId,
    construireScopeLectureIndisponibilites(req)
  );

  if (!indisponibilite) {
    return res.status(404).json({
      message: "Créneau indisponible introuvable.",
    });
  }

  // Defence in depth: route middleware already rejects a Handler, and this
  // second scope resolution keeps a future direct controller reuse from
  // deleting a Professor's personal block.
  await resoudreAffectationIndisponibilite({
    scope: req.scope,
    acteur: req.utilisateur,
    donnees: req.body,
    indisponibiliteExistante: indisponibilite,
  });

  res.locals.realtimeScope = {
    handlerId: indisponibilite.handler_id,
    intervenantId: indisponibilite.intervenant_id,
  };

  await executerTransactionImmediate(async () => {
    await supprimerIndisponibilite(indisponibiliteId);

    await creerEntreeHistorique({
      seanceId: null,
      seanceLibelle: construireLibelleIndisponibilite(indisponibilite),
      actionType: "indisponibilite_supprimee",
      actionLabel: estIndisponibiliteJourComplet(indisponibilite)
        ? "Suppression d'une journée indisponible"
        : "Suppression d'un créneau indisponible",
      acteurId: req.utilisateur?.id,
      acteurNom: req.utilisateur?.nom,
      handlerId: indisponibilite.handler_id,
      intervenantId: indisponibilite.intervenant_id,
      details: construireDetailsSuppression(indisponibilite),
    });
  });

  return res.json({
    message: estIndisponibiliteJourComplet(indisponibilite)
      ? "La journée indisponible a été supprimée."
      : "Le créneau indisponible a été supprimé.",
  });
}

module.exports = {
  recupererIndisponibilites,
  recupererIndisponibilitesCalendrierCentral,
  ajouterIndisponibilite,
  modifierUneIndisponibilite,
  supprimerUneIndisponibilite,
};
