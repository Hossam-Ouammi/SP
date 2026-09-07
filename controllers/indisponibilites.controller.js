const {
  listerToutesLesIndisponibilites,
  trouverIndisponibiliteParId,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
} = require("../models/indisponibilite.model");
const {
  listerToutesLesSeances,
  trouverSeanceChevauchante,
} = require("../models/seance.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const { executerTransactionImmediate } = require("../models/db");

const HEURE_DEBUT_JOUR_COMPLET = "00:00";
const HEURE_FIN_JOUR_COMPLET = "23:59";

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function creerErreurHttp(status, message) {
  const erreur = new Error(message);
  erreur.status = status;
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
  return estHeureCreneauValide(heure) || String(heure || "") === HEURE_FIN_JOUR_COMPLET;
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
  if (!estHeureValide(heureDebut) || !estHeureValide(heureFin)) {
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

function construireLibelleIndisponibilite(indisponibilite) {
  if (estIndisponibiliteJourComplet(indisponibilite)) {
    return `Indisponibilité - ${indisponibilite.date} (jour complet)`;
  }

  return `Indisponibilité - ${indisponibilite.date} ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`;
}

function transformerIndisponibilitePourClient(indisponibilite) {
  return {
    ...indisponibilite,
    jour_complet: estIndisponibiliteJourComplet(indisponibilite) ? 1 : 0,
    raison: "",
    libelle: construireLibelleIndisponibilite(indisponibilite),
  };
}

function construireDetailsCreation(indisponibilite) {
  const plage = estIndisponibiliteJourComplet(indisponibilite)
    ? "Jour complet"
    : `${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`;

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
    .map((indisponibilite) =>
      estIndisponibiliteJourComplet(indisponibilite)
        ? "Jour complet"
        : `${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`
    )
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
  const plage = estIndisponibiliteJourComplet(indisponibilite)
    ? "Jour complet"
    : `${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`;

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
  const plageAvant = estIndisponibiliteJourComplet(indisponibiliteAvant)
    ? "Jour complet"
    : `${indisponibiliteAvant.heure_debut} - ${indisponibiliteAvant.heure_fin}`;
  const plageApres = estIndisponibiliteJourComplet(indisponibiliteApres)
    ? "Jour complet"
    : `${indisponibiliteApres.heure_debut} - ${indisponibiliteApres.heure_fin}`;
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
  const plageAvant = estIndisponibiliteJourComplet(indisponibiliteAvant)
    ? "Jour complet"
    : `${indisponibiliteAvant.heure_debut} - ${indisponibiliteAvant.heure_fin}`;
  const plagesApres = indisponibilitesApres
    .map((indisponibilite) =>
      estIndisponibiliteJourComplet(indisponibilite)
        ? "Jour complet"
        : `${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`
    )
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
  { date, heureDebut, heureFin, jourComplet },
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

    const conflitSeance = await trouverSeanceChevauchante({
      date,
      heureDebut,
      heureFin,
    });

    if (conflitSeance) {
      return "Ce créneau contient déjà une séance. Déclarez un jour complet pour bloquer uniquement les plages libres.";
    }
  }

  const conflit = await trouverIndisponibiliteChevauchante({
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

async function creerIndisponibilitesDisponiblesPourJourComplet({
  date,
  raison,
  creePar,
  acteur,
  exclureIndisponibiliteIds = [],
  journaliser = true,
}) {
  if (!date) {
    throw creerErreurHttp(400, "Date, heure de début et heure de fin obligatoires.");
  }

  if (!estDateIsoValide(date)) {
    throw creerErreurHttp(400, "La date est invalide.");
  }

  const seances = await listerToutesLesSeances();
  const exclusions = new Set(
    exclureIndisponibiliteIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
  const indisponibilitesExistantes = (await listerToutesLesIndisponibilites()).filter(
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
  const indisponibilites = await listerToutesLesIndisponibilites();

  return res.json({
    indisponibilites: indisponibilites.map(transformerIndisponibilitePourClient),
  });
}

async function ajouterIndisponibilite(req, res) {
  const { date, heureDebut, heureFin, jourComplet, raison } =
    normaliserDonneesIndisponibilite(req.body);

  const resultatCreation = await executerTransactionImmediate(async () => {
    if (jourComplet) {
      return creerIndisponibilitesDisponiblesPourJourComplet({
        date,
        raison,
        creePar: req.utilisateur.id,
        acteur: req.utilisateur,
      });
    }

    const erreurValidation = await validerDonneesIndisponibilite({
      date,
      heureDebut,
      heureFin,
      jourComplet,
      raison,
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
      details: construireDetailsCreation(indisponibiliteCreee),
    });

    return {
      indisponibilite: indisponibiliteCreee,
      indisponibilites: [indisponibiliteCreee],
      creationPartielle: false,
    };
  });

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

  const indisponibiliteExistante = await trouverIndisponibiliteParId(indisponibiliteId);

  if (!indisponibiliteExistante) {
    return res.status(404).json({
      message: "Créneau indisponible introuvable.",
    });
  }

  const { date, heureDebut, heureFin, jourComplet, raison } =
    normaliserDonneesIndisponibilite(req.body);
  const resultatModification = await executerTransactionImmediate(async () => {
    if (jourComplet) {
      const resultatJourComplet = await creerIndisponibilitesDisponiblesPourJourComplet({
        date,
        raison,
        creePar: indisponibiliteExistante.cree_par || req.utilisateur.id,
        acteur: req.utilisateur,
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
      },
      { exclureId: indisponibiliteId }
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
      details: construireDetailsModification(indisponibiliteExistante, indisponibiliteModifiee),
    });

    return {
      indisponibilite: indisponibiliteModifiee,
      indisponibilites: [indisponibiliteModifiee],
      creationPartielle: false,
    };
  });
  const indisponibilite = resultatModification.indisponibilite;

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

  const indisponibilite = await trouverIndisponibiliteParId(indisponibiliteId);

  if (!indisponibilite) {
    return res.status(404).json({
      message: "Créneau indisponible introuvable.",
    });
  }

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
  ajouterIndisponibilite,
  modifierUneIndisponibilite,
  supprimerUneIndisponibilite,
};
