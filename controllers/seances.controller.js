const fs = require("fs/promises");

const {
  listerToutesLesSeances,
  trouverSeanceParId,
  creerSeance,
  mettreAJourSeance,
  mettreAJourStatutSeance,
  supprimerSeance,
} = require("../models/seance.model");
const { listerCatalogueOptions } = require("../models/catalogue.model");
const { trouverIndisponibiliteChevauchante } = require("../models/indisponibilite.model");
const { recupererPhotosParSeance } = require("../models/photo.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const { resoudreCheminScreenshot } = require("../utils/screenshot-storage");

const statutsSeanceValides = ["planifiee", "faite", "annulee", "reportee"];
const statutsCreationValides = ["planifiee", "faite"];
const dureesValides = [60, 90, 120];
const valeursEssaiValides = [0, 1];
const libellesChampHistorique = {
  parent: "Parent",
  etudiant: "Étudiant",
  matiere: "Matière",
  compte: "Compte",
  est_essai: "Séance d'essai",
  date: "Date",
  heure_debut: "Heure de début",
  heure_fin: "Heure de fin",
  duree_minutes: "Durée",
  statut_seance: "Statut",
  description: "Description",
};
const libellesStatutHistorique = {
  planifiee: "Planifiée",
  faite: "Faite",
  annulee: "Annulée",
  reportee: "Reportée",
};

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = heure.split(":").map(Number);
  return heures * 60 + minutes;
}

function convertirMinutesEnHeure(minutesTotales) {
  const heures = String(Math.floor(minutesTotales / 60)).padStart(2, "0");
  const minutes = String(minutesTotales % 60).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function estDateIsoValide(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const dateObjet = new Date(`${date}T12:00:00`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(date);
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);
}

function estHeureDebutSeanceValide(heure) {
  return estHeureValide(heure) && /:(00|30)$/.test(heure);
}

function calculerHeureFin(heureDebut, dureeMinutes) {
  if (!estHeureValide(heureDebut) || !dureesValides.includes(Number(dureeMinutes))) {
    return "";
  }

  const minutesFin = convertirHeureEnMinutes(heureDebut) + Number(dureeMinutes);

  if (minutesFin > 24 * 60) {
    return "";
  }

  return convertirMinutesEnHeure(minutesFin);
}

function calculerDureeMinutes(heureDebut, heureFin) {
  if (!estHeureValide(heureDebut) || !estHeureValide(heureFin)) {
    return 0;
  }

  const duree = convertirHeureEnMinutes(heureFin) - convertirHeureEnMinutes(heureDebut);
  return duree > 0 ? duree : 0;
}

function formaterDuree(dureeMinutes) {
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

function estIndisponibiliteJourComplet(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function construireMessageIndisponibilite(indisponibilite) {
  const raison = normaliserTexte(indisponibilite?.raison);
  const base = estIndisponibiliteJourComplet(indisponibilite)
    ? `Cette journee est marquee comme indisponible par Hossam le ${indisponibilite.date}.`
    : `Ce creneau est marque comme indisponible par Hossam le ${indisponibilite.date} de ${indisponibilite.heure_debut} a ${indisponibilite.heure_fin}.`;

  if (!raison) {
    return base;
  }

  return `${base} Raison : ${raison}.`;
}

function creneauSeanceEquivalent(seance, donneesSeance) {
  if (!seance || !donneesSeance) {
    return false;
  }

  return (
    seance.date === donneesSeance.date &&
    seance.heure_debut === donneesSeance.heure_debut &&
    seance.heure_fin === donneesSeance.heure_fin
  );
}

async function recupererConflitIndisponibilite(donneesSeance) {
  return trouverIndisponibiliteChevauchante({
    date: donneesSeance.date,
    heureDebut: donneesSeance.heure_debut,
    heureFin: donneesSeance.heure_fin,
  });
}

function normaliserValeurHistorique(champ, valeur) {
  if (champ === "est_essai") {
    return Number(valeur) === 1 || valeur === true ? "Oui" : "Non";
  }

  if (champ === "duree_minutes") {
    return formaterDuree(Number(valeur) || 0);
  }

  if (champ === "statut_seance") {
    return libellesStatutHistorique[valeur] || String(valeur || "-");
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

function extraireEtatAuditSeance(seance) {
  if (!seance) {
    return {};
  }

  const dureeMinutes =
    Number(seance.duree_minutes) || calculerDureeMinutes(seance.heure_debut, seance.heure_fin);

  return {
    etudiant: seance.etudiant,
    parent: seance.parent || "",
    matiere: seance.matiere,
    compte: seance.compte,
    est_essai: Number(seance.est_essai) === 1 ? 1 : 0,
    date: seance.date,
    heure_debut: seance.heure_debut,
    heure_fin: seance.heure_fin,
    duree_minutes: dureeMinutes,
    statut_seance: seance.statut_seance,
    description: seance.description || "",
  };
}

function construireDetailsCreation(etatSeance) {
  return {
    type: "creation",
    seance: {
      ...etatSeance,
    },
  };
}

function construireListeSuppression(etatSeance) {
  return Object.keys(libellesChampHistorique).map((champ) => ({
    champ,
    label: libellesChampHistorique[champ],
    avant: normaliserValeurHistorique(champ, etatSeance[champ]),
    apres: "-",
  }));
}

function construireListeChangements(avant, apres) {
  return Object.keys(libellesChampHistorique)
    .filter(
      (champ) =>
        valeurComparableHistorique(champ, avant[champ]) !==
        valeurComparableHistorique(champ, apres[champ])
    )
    .map((champ) => ({
      champ,
      label: libellesChampHistorique[champ],
      avant: normaliserValeurHistorique(champ, avant[champ]),
      apres: normaliserValeurHistorique(champ, apres[champ]),
    }));
}

async function journaliserActionSeance({
  actionType,
  actionLabel,
  acteur,
  seanceId,
  seanceLibelle,
  details,
}) {
  await creerEntreeHistorique({
    seanceId,
    seanceLibelle,
    actionType,
    actionLabel,
    acteurId: acteur?.id,
    acteurNom: acteur?.nom,
    details,
  });
}

function construireLibelleSeance(donneesSeance) {
  const matiere = normaliserTexte(donneesSeance.matiere) || "Séance";
  const etudiant = normaliserTexte(donneesSeance.etudiant) || "Sans étudiant";
  return `${matiere} - ${etudiant}`;
}

function construireDateHeureLocale(date, heure) {
  if (!estDateIsoValide(date) || !estHeureValide(heure)) {
    return null;
  }

  const [heures, minutes] = heure.split(":").map(Number);
  const dateLocale = new Date(`${date}T00:00:00`);
  dateLocale.setHours(heures, minutes, 0, 0);
  return dateLocale;
}

function calculerStatutSeanceAffiche(seance) {
  if (!["planifiee", "reportee"].includes(seance.statut_seance)) {
    return seance.statut_seance;
  }

  const dateFin = construireDateHeureLocale(seance.date, seance.heure_fin);

  if (!dateFin) {
    return seance.statut_seance;
  }

  return dateFin.getTime() <= Date.now() ? "faite" : seance.statut_seance;
}

function normaliserValeurEssai(valeur) {
  if (
    valeur === true ||
    valeur === "true" ||
    valeur === "1" ||
    valeur === 1 ||
    valeur === "oui"
  ) {
    return 1;
  }

  return 0;
}

async function recupererCatalogueSeances() {
  const catalogue = await listerCatalogueOptions();

  return {
    matieres: Array.isArray(catalogue.matieres)
      ? catalogue.matieres.map((matiere) => matiere.valeur)
      : [],
    comptes: Array.isArray(catalogue.comptes)
      ? catalogue.comptes.map((compte) => compte.valeur)
      : [],
  };
}

async function validerDonneesSeance(donneesSeance) {
  const erreurs = [];
  const dureeMinutes = Number(donneesSeance.duree_minutes);
  const heureValide = estHeureDebutSeanceValide(donneesSeance.heure_debut);
  const dureeValide = dureesValides.includes(dureeMinutes);
  const nomEtudiant = normaliserTexte(donneesSeance.etudiant);
  const nomParent = normaliserTexte(donneesSeance.parent);
  const description = normaliserTexte(donneesSeance.description);
  const catalogue = await recupererCatalogueSeances();

  if (!nomEtudiant) {
    erreurs.push("Le nom de l'étudiant est obligatoire.");
  } else if (nomEtudiant.length > 120) {
    erreurs.push("Le nom de l'étudiant est trop long.");
  }

  if (nomParent.length > 120) {
    erreurs.push("Le nom du parent est trop long.");
  }

  if (!catalogue.matieres.includes(donneesSeance.matiere)) {
    erreurs.push("La matière est invalide.");
  }

  if (!catalogue.comptes.includes(donneesSeance.compte)) {
    erreurs.push("Le compte est invalide.");
  }

  if (!valeursEssaiValides.includes(Number(donneesSeance.est_essai))) {
    erreurs.push("La valeur de séance d'essai est invalide.");
  }

  if (!normaliserTexte(donneesSeance.date)) {
    erreurs.push("La date est obligatoire.");
  } else if (!estDateIsoValide(donneesSeance.date)) {
    erreurs.push("La date est invalide.");
  }

  if (!normaliserTexte(donneesSeance.heure_debut)) {
    erreurs.push("L'heure de début est obligatoire.");
  } else if (!heureValide) {
    erreurs.push("L'heure de début doit être choisie par tranches de 30 minutes.");
  }

  if (!dureeValide) {
    erreurs.push("La durée doit être 60, 90 ou 120 minutes.");
  }

  if (heureValide && dureeValide && !calculerHeureFin(donneesSeance.heure_debut, dureeMinutes)) {
    erreurs.push("La séance ne peut pas dépasser minuit.");
  }

  if (!statutsSeanceValides.includes(donneesSeance.statut_seance)) {
    erreurs.push("Le statut de la séance est invalide.");
  }

  if (description.length > 2000) {
    erreurs.push("La description ne peut pas dépasser 2000 caractères.");
  }

  return erreurs;
}

function preparerDonneesSeance(donneesSeance) {
  const etudiant = normaliserTexte(donneesSeance.etudiant);
  const parent = normaliserTexte(donneesSeance.parent);
  const matiere = normaliserTexte(donneesSeance.matiere);
  const compte = normaliserTexte(donneesSeance.compte);
  const estEssai = normaliserValeurEssai(donneesSeance.est_essai);
  const date = normaliserTexte(donneesSeance.date);
  const heureDebut = normaliserTexte(donneesSeance.heure_debut);
  const dureeMinutes = Number(donneesSeance.duree_minutes);

  const donneesPreparees = {
    etudiant,
    parent,
    matiere,
    compte,
    est_essai: estEssai,
    date,
    heure_debut: heureDebut,
    duree_minutes: dureeMinutes,
    heure_fin: heureDebut && dureeMinutes ? calculerHeureFin(heureDebut, dureeMinutes) : "",
    statut_seance: normaliserTexte(donneesSeance.statut_seance),
    description: normaliserTexte(donneesSeance.description),
  };

  return {
    titre: construireLibelleSeance(donneesPreparees),
    etudiant: donneesPreparees.etudiant,
    parent: donneesPreparees.parent,
    matiere: donneesPreparees.matiere,
    compte: donneesPreparees.compte,
    est_essai: donneesPreparees.est_essai,
    date: donneesPreparees.date,
    heure_debut: donneesPreparees.heure_debut,
    heure_fin: donneesPreparees.heure_fin,
    duree_minutes: donneesPreparees.duree_minutes,
    statut_seance: donneesPreparees.statut_seance,
    prix: 0,
    statut_paiement: "non_payee",
    description: donneesPreparees.description,
  };
}

function transformerSeancePourClient(seance) {
  if (!seance) {
    return seance;
  }

  const dureeMinutes = calculerDureeMinutes(seance.heure_debut, seance.heure_fin);
  const statutAffiche = calculerStatutSeanceAffiche(seance);
  const { titre, prix, statut_paiement, ...seanceTransformee } = seance;

  return {
    ...seanceTransformee,
    est_essai: Number(seance.est_essai) === 1,
    essai_label: Number(seance.est_essai) === 1 ? "Oui" : "Non",
    statut_seance: statutAffiche,
    statut_manuel: seance.statut_seance,
    statut_auto: statutAffiche !== seance.statut_seance,
    libelle: construireLibelleSeance(seance),
    duree_minutes: dureeMinutes,
    duree_label: dureeMinutes ? formaterDuree(dureeMinutes) : "-",
  };
}

async function recupererToutesLesSeances(req, res) {
  const seances = await listerToutesLesSeances();
  return res.json({
    seances: seances.map(transformerSeancePourClient),
  });
}

async function recupererOptionsSeances(req, res) {
  const catalogue = await listerCatalogueOptions();

  return res.json({
    options: {
      matieres: Array.isArray(catalogue.matieres) ? catalogue.matieres : [],
      comptes: Array.isArray(catalogue.comptes) ? catalogue.comptes : [],
    },
  });
}

async function recupererUneSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const seance = await trouverSeanceParId(req.params.id);

  if (!seance) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  return res.json({ seance: transformerSeancePourClient(seance) });
}

async function ajouterSeance(req, res) {
  const donneesSeance = preparerDonneesSeance(req.body);
  const erreurs = await validerDonneesSeance(donneesSeance);

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  if (!statutsCreationValides.includes(donneesSeance.statut_seance)) {
    return res.status(400).json({
      message: "À la création, le statut doit être planifiée ou faite.",
    });
  }

  const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesSeance);

  if (conflitIndisponibilite) {
    return res.status(400).json({
      message: construireMessageIndisponibilite(conflitIndisponibilite),
    });
  }

  const nouvelleSeance = await creerSeance({
    ...donneesSeance,
    cree_par: req.utilisateur.id,
    modifie_par: req.utilisateur.id,
    utilisateur_id: req.utilisateur.id,
  });

  await journaliserActionSeance({
    actionType: "seance_creee",
    actionLabel: "Création de la séance",
    acteur: req.utilisateur,
    seanceId: nouvelleSeance.id,
    seanceLibelle: construireLibelleSeance(nouvelleSeance),
    details: construireDetailsCreation(extraireEtatAuditSeance(nouvelleSeance)),
  });

  return res.status(201).json({
    message: "Séance créée avec succès.",
    seance: transformerSeancePourClient(nouvelleSeance),
  });
}

async function modifierSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const seanceExistante = await trouverSeanceParId(req.params.id);

  if (!seanceExistante) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  const donneesSeance = preparerDonneesSeance(req.body);
  const erreurs = await validerDonneesSeance(donneesSeance);

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesSeance);

  if (conflitIndisponibilite && !creneauSeanceEquivalent(seanceExistante, donneesSeance)) {
    return res.status(400).json({
      message: construireMessageIndisponibilite(conflitIndisponibilite),
    });
  }

  const seanceMiseAJour = await mettreAJourSeance(req.params.id, {
    ...donneesSeance,
    modifie_par: req.utilisateur.id,
  });

  await journaliserActionSeance({
    actionType: "seance_modifiee",
    actionLabel: "Modification de la séance",
    acteur: req.utilisateur,
    seanceId: seanceMiseAJour.id,
    seanceLibelle: construireLibelleSeance(seanceMiseAJour),
    details: {
      type: "modification",
      changements: construireListeChangements(
        extraireEtatAuditSeance(seanceExistante),
        extraireEtatAuditSeance(seanceMiseAJour)
      ),
    },
  });

  return res.json({
    message: "Séance modifiée avec succès.",
    seance: transformerSeancePourClient(seanceMiseAJour),
  });
}

async function changerStatutSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const { statut_seance: statutSeance } = req.body;
  const seanceExistante = await trouverSeanceParId(req.params.id);

  if (!seanceExistante) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  if (!statutsSeanceValides.includes(statutSeance)) {
    return res.status(400).json({ message: "Statut de séance invalide." });
  }

  const seanceMiseAJour = await mettreAJourStatutSeance(
    req.params.id,
    statutSeance,
    req.utilisateur.id
  );

  await journaliserActionSeance({
    actionType: "statut_modifie",
    actionLabel: "Changement de statut",
    acteur: req.utilisateur,
    seanceId: seanceMiseAJour.id,
    seanceLibelle: construireLibelleSeance(seanceMiseAJour),
    details: {
      type: "statut",
      changements: construireListeChangements(
        extraireEtatAuditSeance(seanceExistante),
        extraireEtatAuditSeance(seanceMiseAJour)
      ),
    },
  });

  return res.json({
    message: "Statut de la séance mis à jour.",
    seance: transformerSeancePourClient(seanceMiseAJour),
  });
}

async function supprimerUneSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const seance = await trouverSeanceParId(req.params.id);

  if (!seance) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  const photos = await recupererPhotosParSeance(req.params.id);
  const etatAvantSuppression = extraireEtatAuditSeance(seance);
  await supprimerSeance(req.params.id);

  await journaliserActionSeance({
    actionType: "seance_supprimee",
    actionLabel: "Suppression de la séance",
    acteur: req.utilisateur,
    seanceId: seance.id,
    seanceLibelle: construireLibelleSeance(seance),
    details: {
      type: "suppression",
      changements: construireListeSuppression(etatAvantSuppression),
    },
  });

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

  return res.json({ message: "Séance supprimée avec succès." });
}

module.exports = {
  recupererToutesLesSeances,
  recupererOptionsSeances,
  recupererUneSeance,
  ajouterSeance,
  modifierSeance,
  changerStatutSeance,
  supprimerUneSeance,
};
