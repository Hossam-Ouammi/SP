const {
  listerToutesLesIndisponibilites,
  trouverIndisponibiliteParId,
  creerIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
} = require("../models/indisponibilite.model");
const { creerEntreeHistorique } = require("../models/historique.model");

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
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

function estHeureCreneauValide(heure) {
  return estHeureValide(heure) && /:(00|30)$/.test(String(heure || ""));
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function construireLibelleIndisponibilite(indisponibilite) {
  return `Indisponibilite - ${indisponibilite.date} ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`;
}

function transformerIndisponibilitePourClient(indisponibilite) {
  return {
    ...indisponibilite,
    raison: indisponibilite.raison || "",
    libelle: construireLibelleIndisponibilite(indisponibilite),
  };
}

function construireDetailsCreation(indisponibilite) {
  return {
    changements: [
      { champ: "date", label: "Date", avant: "-", apres: indisponibilite.date },
      {
        champ: "heure_debut",
        label: "Heure de debut",
        avant: "-",
        apres: indisponibilite.heure_debut,
      },
      {
        champ: "heure_fin",
        label: "Heure de fin",
        avant: "-",
        apres: indisponibilite.heure_fin,
      },
      {
        champ: "raison",
        label: "Raison",
        avant: "-",
        apres: indisponibilite.raison || "Aucune raison",
      },
    ],
  };
}

function construireDetailsSuppression(indisponibilite) {
  return {
    changements: [
      { champ: "date", label: "Date", avant: indisponibilite.date, apres: "-" },
      {
        champ: "heure_debut",
        label: "Heure de debut",
        avant: indisponibilite.heure_debut,
        apres: "-",
      },
      {
        champ: "heure_fin",
        label: "Heure de fin",
        avant: indisponibilite.heure_fin,
        apres: "-",
      },
      {
        champ: "raison",
        label: "Raison",
        avant: indisponibilite.raison || "Aucune raison",
        apres: "-",
      },
    ],
  };
}

async function recupererIndisponibilites(req, res) {
  const indisponibilites = await listerToutesLesIndisponibilites();

  return res.json({
    indisponibilites: indisponibilites.map(transformerIndisponibilitePourClient),
  });
}

async function ajouterIndisponibilite(req, res) {
  const date = normaliserTexte(req.body.date);
  const heureDebut = normaliserTexte(req.body.heure_debut);
  const heureFin = normaliserTexte(req.body.heure_fin);
  const raison = normaliserTexte(req.body.raison);

  if (!date || !heureDebut || !heureFin) {
    return res.status(400).json({
      message: "Date, heure de debut et heure de fin obligatoires.",
    });
  }

  if (!estDateIsoValide(date)) {
    return res.status(400).json({
      message: "La date est invalide.",
    });
  }

  if (!estHeureCreneauValide(heureDebut) || !estHeureCreneauValide(heureFin)) {
    return res.status(400).json({
      message: "Les heures doivent etre choisies par tranches de 30 minutes.",
    });
  }

  if (convertirHeureEnMinutes(heureFin) <= convertirHeureEnMinutes(heureDebut)) {
    return res.status(400).json({
      message: "L'heure de fin doit etre posterieure a l'heure de debut.",
    });
  }

  if (raison.length > 200) {
    return res.status(400).json({
      message: "La raison ne peut pas depasser 200 caracteres.",
    });
  }

  const conflit = await trouverIndisponibiliteChevauchante({
    date,
    heureDebut,
    heureFin,
  });

  if (conflit) {
    return res.status(400).json({
      message:
        "Ce creneau chevauche deja une indisponibilite existante. Supprimez-la ou creez un creneau plus large.",
    });
  }

  const indisponibilite = await creerIndisponibilite({
    date,
    heureDebut,
    heureFin,
    raison,
    creePar: req.utilisateur.id,
  });

  await creerEntreeHistorique({
    seanceId: null,
    seanceLibelle: construireLibelleIndisponibilite(indisponibilite),
    actionType: "indisponibilite_creee",
    actionLabel: "Creation d'un creneau indisponible",
    acteurId: req.utilisateur?.id,
    acteurNom: req.utilisateur?.nom,
    details: construireDetailsCreation(indisponibilite),
  });

  return res.status(201).json({
    message: "Le creneau indisponible a ete ajoute.",
    indisponibilite: transformerIndisponibilitePourClient(indisponibilite),
  });
}

async function supprimerUneIndisponibilite(req, res) {
  const indisponibiliteId = Number(req.params.id);

  if (!estIdentifiantValide(indisponibiliteId)) {
    return res.status(400).json({
      message: "Identifiant d'indisponibilite invalide.",
    });
  }

  const indisponibilite = await trouverIndisponibiliteParId(indisponibiliteId);

  if (!indisponibilite) {
    return res.status(404).json({
      message: "Creneau indisponible introuvable.",
    });
  }

  await supprimerIndisponibilite(indisponibiliteId);

  await creerEntreeHistorique({
    seanceId: null,
    seanceLibelle: construireLibelleIndisponibilite(indisponibilite),
    actionType: "indisponibilite_supprimee",
    actionLabel: "Suppression d'un creneau indisponible",
    acteurId: req.utilisateur?.id,
    acteurNom: req.utilisateur?.nom,
    details: construireDetailsSuppression(indisponibilite),
  });

  return res.json({
    message: "Le creneau indisponible a ete supprime.",
  });
}

module.exports = {
  recupererIndisponibilites,
  ajouterIndisponibilite,
  supprimerUneIndisponibilite,
};
