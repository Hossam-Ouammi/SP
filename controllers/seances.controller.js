const fs = require("fs/promises");

const {
  listerSeancesScopees,
  trouverSeanceParIdScopee,
  trouverSeanceChevauchante,
  trouverSeanceIntervenantChevauchante,
  creerSeance,
  mettreAJourSeance,
  mettreAJourStatutSeance,
  supprimerSeance,
} = require("../models/seance.model");
const { executerTransactionImmediate } = require("../models/db");
const { listerCatalogueOptions } = require("../models/catalogue.model");
const {
  creerIndisponibilite,
  listerIndisponibilitesInclusesDansPlage,
  listerIndisponibilitesTouchantPlage,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
  trouverIndisponibiliteIntervenantChevauchante,
} = require("../models/indisponibilite.model");
const {
  construireFiltreLectureSeances,
  listerIntervenantsAutorisesHandler,
  scopePeutGererIntervenant,
} = require("../models/access-scope.model");
const { trouverUtilisateurParId } = require("../models/utilisateur.model");
const { recupererPhotosParSeance } = require("../models/photo.model");
const {
  creerEntreeHistorique,
  detacherSeancesHistorique,
} = require("../models/historique.model");
const {
  detacherSeancesPropositions,
  trouverPropositionAccepteeParSeanceId,
} = require("../models/proposition-seance.model");
const { resoudreCheminScreenshot } = require("../utils/screenshot-storage");
const {
  convertirDateHeureZonneeEnInstant,
  estDateHeureZonneeCivileExistante,
} = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");
const { trouverReglagesEspace } = require("../models/workspace-settings.model");
const {
  intervalleEstDansPlageCalendrier,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");

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

function valeurCatalogueInchangee(valeurDemandee, valeurExistante) {
  return normaliserTexte(valeurDemandee).toLowerCase() ===
    normaliserTexte(valeurExistante).toLowerCase();
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function normaliserIdentifiant(valeur) {
  return estIdentifiantValide(valeur) ? Number(valeur) : null;
}

function creerErreurRessourceInaccessible() {
  return creerErreurHttp(404, "S\u00e9ance introuvable.");
}

function construireScopeLectureSeances(req) {
  return construireFiltreLectureSeances(req.scope);
}

/**
 * Le choix de l'intervenant ne vient jamais du client seul. Un Handler ne
 * peut choisir que lui-m\u00eame ou un professeur actuellement rattach\u00e9 \u00e0 son
 * espace ; un professeur est forc\u00e9 sur lui-m\u00eame. Le super-admin conserve
 * ce m\u00eame garde-fou dans son espace Handler.
 */
async function resoudreAffectationSeance({ scope, acteur, donneesSeance, seanceExistante = null }) {
  const utilisateurId = normaliserIdentifiant(acteur?.id);

  if (!utilisateurId || !scope?.utilisateurId) {
    throw creerErreurHttp(403, "Aucun espace Handler actif n'est associ\u00e9 \u00e0 ce compte.");
  }

  const handlerDemande = normaliserIdentifiant(
    donneesSeance?.handler_id ?? donneesSeance?.handlerId
  );
  const intervenantDemande = normaliserIdentifiant(
    donneesSeance?.intervenant_id ?? donneesSeance?.professeur_id ?? donneesSeance?.intervenantId
  );

  if (scope.estHandler) {
    const handlerId = utilisateurId;

    if (handlerDemande && handlerDemande !== handlerId) {
      throw creerErreurRessourceInaccessible();
    }

    const intervenantId =
      intervenantDemande || normaliserIdentifiant(seanceExistante?.intervenant_id) || utilisateurId;

    if (!(await scopePeutGererIntervenant(scope, { handlerId, intervenantId }))) {
      throw creerErreurRessourceInaccessible();
    }

    return { handler_id: handlerId, intervenant_id: intervenantId };
  }

  const handlerIds = Array.isArray(scope.handlerProfesseurIds)
    ? scope.handlerProfesseurIds.map(normaliserIdentifiant).filter(Boolean)
    : [];
  const handlerId = normaliserIdentifiant(seanceExistante?.handler_id) || handlerIds[0] || null;

  if (!scope.estProfesseur || !handlerId || !handlerIds.includes(handlerId)) {
    throw creerErreurHttp(403, "Aucun espace Professeur actif n'est associ\u00e9 \u00e0 ce compte.");
  }

  if (handlerDemande && handlerDemande !== handlerId) {
    throw creerErreurRessourceInaccessible();
  }

  const intervenantId =
    intervenantDemande || normaliserIdentifiant(seanceExistante?.intervenant_id) || utilisateurId;

  if (intervenantId !== utilisateurId) {
    throw creerErreurRessourceInaccessible();
  }

  return { handler_id: handlerId, intervenant_id: intervenantId };
}

async function ajouterTarifSnapshotIntervenant(donneesSeance) {
  const intervenantId = normaliserIdentifiant(donneesSeance?.intervenant_id);

  if (!intervenantId) {
    return donneesSeance;
  }

  const intervenant = await trouverUtilisateurParId(intervenantId);
  const tarifHoraire = Number(intervenant?.tarif_horaire);

  return {
    ...donneesSeance,
    tarif_horaire_applique: Number.isFinite(tarifHoraire) && tarifHoraire >= 0 ? tarifHoraire : 0,
  };
}

function convertirHeureEnMinutes(heure) {
  if (heure === "24:00") {
    return 24 * 60;
  }

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

function estHeureFinLegacyValide(heure) {
  return estHeureValide(heure) || heure === "24:00";
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
  if (!estHeureValide(heureDebut) || !estHeureFinLegacyValide(heureFin)) {
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
    ? `Cette journée est marquée comme indisponible le ${indisponibilite.date}.`
    : `Ce créneau est marqué comme indisponible le ${indisponibilite.date} de ${indisponibilite.heure_debut} à ${indisponibilite.heure_fin}.`;

  if (!raison) {
    return base;
  }

  return `${base} Raison : ${raison}.`;
}

function creneauSeanceEstEquivalent(seance, donneesSeance) {
  return Boolean(
    seance &&
      String(seance.date || "") === String(donneesSeance?.date || "") &&
      String(seance.heure_debut || "") === String(donneesSeance?.heure_debut || "") &&
      String(seance.heure_fin || "") === String(donneesSeance?.heure_fin || "")
  );
}

async function verifierSeanceDansPlageCalendrier(donneesSeance, options = {}) {
  const handlerId = normaliserIdentifiant(donneesSeance?.handler_id);
  if (!handlerId || !donneesSeance?.heure_debut || !donneesSeance?.heure_fin) {
    return;
  }

  if (options.seanceExistante && creneauSeanceEstEquivalent(options.seanceExistante, donneesSeance)) {
    // Un resserrement de plage ne rend jamais une ancienne séance impossible
    // à consulter ou à corriger sur un champ non horaire.
    return;
  }

  const reglages = await trouverReglagesEspace(handlerId);

  if (
    !estDateHeureZonneeCivileExistante(
      donneesSeance.date,
      donneesSeance.heure_debut,
      CENTRAL_CALENDAR_TIMEZONE
    ) ||
    !estDateHeureZonneeCivileExistante(
      donneesSeance.date,
      donneesSeance.heure_fin,
      CENTRAL_CALENDAR_TIMEZONE
    )
  ) {
    throw creerErreurHttp(
      400,
      "L'heure choisie n'existe pas dans le fuseau horaire central à cette date."
    );
  }

  const plage = normaliserPlageDepuisReglages(reglages || {});
  if (
    !intervalleEstDansPlageCalendrier({
      heureDebut: donneesSeance.heure_debut,
      heureFin: donneesSeance.heure_fin,
      plage,
    })
  ) {
    throw creerErreurHttp(
      400,
      `La séance doit rester dans la plage du calendrier Handler (${plage.calendar_start_time}–${plage.calendar_end_time}).`
    );
  }
}

function creerErreurHttp(status, message) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
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
  if (
    normaliserIdentifiant(donneesSeance?.handler_id) &&
    normaliserIdentifiant(donneesSeance?.intervenant_id)
  ) {
    return trouverIndisponibiliteIntervenantChevauchante({
      handlerId: donneesSeance.handler_id,
      intervenantId: donneesSeance.intervenant_id,
      date: donneesSeance.date,
      heureDebut: donneesSeance.heure_debut,
      heureFin: donneesSeance.heure_fin,
    });
  }

  return trouverIndisponibiliteChevauchante({
    date: donneesSeance.date,
    heureDebut: donneesSeance.heure_debut,
    heureFin: donneesSeance.heure_fin,
  });
}

async function recupererConflitSeance(donneesSeance, options = {}) {
  if (
    normaliserIdentifiant(donneesSeance?.handler_id) &&
    normaliserIdentifiant(donneesSeance?.intervenant_id)
  ) {
    return trouverSeanceIntervenantChevauchante({
      handlerId: donneesSeance.handler_id,
      intervenantId: donneesSeance.intervenant_id,
      date: donneesSeance.date,
      heureDebut: donneesSeance.heure_debut,
      heureFin: donneesSeance.heure_fin,
      exclureSeanceId: options.exclureSeanceId || null,
    });
  }

  return trouverSeanceChevauchante({
    date: donneesSeance.date,
    heureDebut: donneesSeance.heure_debut,
    heureFin: donneesSeance.heure_fin,
    exclureSeanceId: options.exclureSeanceId || null,
  });
}

function construireMessageConflitSeance(seance) {
  const etudiant = normaliserTexte(seance?.etudiant);
  const matiere = normaliserTexte(seance?.matiere);
  const details = [etudiant, matiere].filter(Boolean).join(" - ");

  return details
    ? `Ce créneau chevauche déjà une séance (${details}).`
    : "Ce créneau chevauche déjà une séance.";
}

async function verifierAbsenceConflitSeance(donneesSeance, utilisateur, options = {}) {
  const conflitSeance = await recupererConflitSeance(donneesSeance, options);

  if (conflitSeance) {
    throw creerErreurHttp(400, construireMessageConflitSeance(conflitSeance));
  }
}

function construirePlageIndisponibiliteRestaurable(seance, fragments) {
  const debutSeance = convertirHeureEnMinutes(seance.heure_debut);
  const finSeance = convertirHeureEnMinutes(seance.heure_fin);
  let debut = debutSeance;
  let fin = finSeance;

  for (const fragment of fragments) {
    debut = Math.min(debut, convertirHeureEnMinutes(fragment.heure_debut));
    fin = Math.max(fin, convertirHeureEnMinutes(fragment.heure_fin));
  }

  return {
    heureDebut: convertirMinutesEnHeure(debut),
    heureFin: convertirMinutesEnHeure(fin),
    jourComplet: debut === 0 && fin === convertirHeureEnMinutes("23:59"),
  };
}

function extrairePlageIndisponibiliteOriginale(proposition) {
  const date = normaliserTexte(proposition?.indisponibilite_date_originale);
  const heureDebut = normaliserTexte(proposition?.indisponibilite_heure_debut_originale);
  const heureFin = normaliserTexte(proposition?.indisponibilite_heure_fin_originale);

  if (!estDateIsoValide(date) || !estHeureValide(heureDebut) || !estHeureFinLegacyValide(heureFin)) {
    return null;
  }

  if (convertirHeureEnMinutes(heureFin) <= convertirHeureEnMinutes(heureDebut)) {
    return null;
  }

  return {
    date,
    heureDebut,
    heureFin,
    jourComplet: Number(proposition?.indisponibilite_jour_complet_original) === 1,
  };
}

async function restaurerIndisponibiliteDepuisPropositionAcceptee({
  seance,
  proposition,
  acteur,
}) {
  if (!proposition || proposition.statut !== "acceptee") {
    return;
  }

  const plageOriginale = extrairePlageIndisponibiliteOriginale(proposition);

  if (plageOriginale) {
    const fragments = await listerIndisponibilitesInclusesDansPlage({
      date: plageOriginale.date,
      heureDebut: plageOriginale.heureDebut,
      heureFin: plageOriginale.heureFin,
      handlerId: seance.handler_id,
      intervenantId: seance.intervenant_id,
    });
    const createur =
      fragments.find((fragment) => Number(fragment.cree_par) > 0)?.cree_par ||
      proposition.traitee_par ||
      acteur?.id ||
      seance.cree_par ||
      null;

    for (const fragment of fragments) {
      await supprimerIndisponibilite(fragment.id);
    }

    await creerIndisponibilite({
      date: plageOriginale.date,
      heureDebut: plageOriginale.heureDebut,
      heureFin: plageOriginale.heureFin,
      jourComplet: plageOriginale.jourComplet,
      raison: "",
      creePar: createur,
      handlerId: seance.handler_id,
      intervenantId: seance.intervenant_id,
    });
    return;
  }

  const fragments = await listerIndisponibilitesTouchantPlage({
    date: seance.date,
    heureDebut: seance.heure_debut,
    heureFin: seance.heure_fin,
    handlerId: seance.handler_id,
    intervenantId: seance.intervenant_id,
  });
  const plage = construirePlageIndisponibiliteRestaurable(seance, fragments);
  const createur =
    fragments.find((fragment) => Number(fragment.cree_par) > 0)?.cree_par ||
    proposition.traitee_par ||
    acteur?.id ||
    seance.cree_par ||
    null;

  for (const fragment of fragments) {
    await supprimerIndisponibilite(fragment.id);
  }

  await creerIndisponibilite({
    date: seance.date,
    heureDebut: plage.heureDebut,
    heureFin: plage.heureFin,
    jourComplet: plage.jourComplet,
    raison: "",
    creePar: createur,
    handlerId: seance.handler_id,
    intervenantId: seance.intervenant_id,
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

function construireDetailsSuppression(etatSeance) {
  return {
    type: "suppression",
    seance: {
      ...etatSeance,
    },
    changements: construireListeSuppression(etatSeance),
  };
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
  handlerId,
  intervenantId,
  seanceLibelle,
  details,
}) {
  await creerEntreeHistorique({
    seanceId,
    handlerId,
    intervenantId,
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

function construireDateHeureCentrale(date, heure) {
  if (!estDateIsoValide(date) || !estHeureFinLegacyValide(heure)) {
    return null;
  }

  return convertirDateHeureZonneeEnInstant(date, heure, CENTRAL_CALENDAR_TIMEZONE);
}

function calculerStatutSeanceAffiche(seance) {
  if (!["planifiee", "reportee"].includes(seance.statut_seance)) {
    return seance.statut_seance;
  }

  const dateFin = construireDateHeureCentrale(seance.date, seance.heure_fin);

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

async function validerDonneesSeance(donneesSeance, utilisateur, options = {}) {
  const erreurs = [];
  const dureeMinutes = Number(donneesSeance.duree_minutes);
  const heureValide = estHeureDebutSeanceValide(donneesSeance.heure_debut);
  const dureeValide = dureesValides.includes(dureeMinutes);
  const nomÉtudiant = normaliserTexte(donneesSeance.etudiant);
  const nomParent = normaliserTexte(donneesSeance.parent);
  const description = normaliserTexte(donneesSeance.description);
  const catalogue = await recupererCatalogueSeances();
  const seanceExistante = options.seanceExistante || null;
  const matiereExisteAuCatalogue = catalogue.matieres.includes(donneesSeance.matiere);
  const compteExisteAuCatalogue = catalogue.comptes.includes(donneesSeance.compte);
  const matiereLegacyInchangee =
    seanceExistante &&
    valeurCatalogueInchangee(donneesSeance.matiere, seanceExistante.matiere);
  const compteLegacyInchange =
    seanceExistante &&
    valeurCatalogueInchangee(donneesSeance.compte, seanceExistante.compte);

  if (!nomÉtudiant) {
    erreurs.push("Le nom de l'étudiant est obligatoire.");
  } else if (nomÉtudiant.length > 120) {
    erreurs.push("Le nom de l'étudiant est trop long.");
  }

  if (nomParent.length > 120) {
    erreurs.push("Le nom du parent est trop long.");
  }

  if (!matiereExisteAuCatalogue && !matiereLegacyInchangee) {
    erreurs.push("La matière est invalide.");
  }

  if (!compteExisteAuCatalogue && !compteLegacyInchange) {
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

  if (heureValide && dureeValide && donneesSeance.heure_fin) {
    try {
      await verifierSeanceDansPlageCalendrier(donneesSeance, {
        seanceExistante,
      });
    } catch (erreur) {
      erreurs.push(erreur.message || "La séance est hors de la plage du calendrier.");
    }
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

  const dureeMinutes =
    Number(seance.duree_minutes) || calculerDureeMinutes(seance.heure_debut, seance.heure_fin);
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

function transformerSeancePourClientSelonUtilisateur(seance) {
  return transformerSeancePourClient(seance);
}

function filtrerCataloguePourUtilisateur(catalogue) {
  return catalogue;
}

async function recupererToutesLesSeances(req, res) {
  const seances = await listerSeancesScopees(construireScopeLectureSeances(req));
  return res.json({
    seances: seances.map((seance) => transformerSeancePourClient(seance)),
  });
}

async function recupererOptionsSeances(req, res) {
  const catalogue = filtrerCataloguePourUtilisateur(await listerCatalogueOptions(), req.utilisateur);
  const handlerId = req.scope?.estHandler
    ? normaliserIdentifiant(req.scope.utilisateurId)
    : normaliserIdentifiant(req.scope?.handlerProfesseurIds?.[0]);
  const intervenantIds = handlerId
    ? await listerIntervenantsAutorisesHandler(handlerId)
    : [];
  const intervenants = (
    await Promise.all(intervenantIds.map((intervenantId) => trouverUtilisateurParId(intervenantId)))
  )
    .filter(Boolean)
    .filter((intervenant) =>
      req.scope?.estHandler || Number(intervenant.id) === Number(req.utilisateur?.id)
    )
    .map((intervenant) => ({
      id: intervenant.id,
      public_id: intervenant.public_id || null,
      nom: intervenant.nom,
      couleur_calendrier: intervenant.couleur_calendrier || null,
      tarif_horaire: Number(intervenant.tarif_horaire) || 0,
    }));

  return res.json({
    options: {
      matieres: Array.isArray(catalogue.matieres) ? catalogue.matieres : [],
      comptes: Array.isArray(catalogue.comptes) ? catalogue.comptes : [],
      intervenants,
    },
  });
}

async function recupererUneSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const seance = await trouverSeanceParIdScopee(
    req.params.id,
    construireScopeLectureSeances(req)
  );

  if (!seance) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  return res.json({ seance: transformerSeancePourClient(seance) });
}

async function creerSeanceDepuisDonneesValidees({
  donneesSeance,
  acteur,
  verifierIndisponibilite = true,
  exclureSeanceId = null,
  utiliserTransaction = true,
}) {
  const operation = async () => {
  const donneesAffectees = {
    ...donneesSeance,
    handler_id: normaliserIdentifiant(donneesSeance?.handler_id) || normaliserIdentifiant(acteur?.id),
    intervenant_id:
      normaliserIdentifiant(donneesSeance?.intervenant_id) || normaliserIdentifiant(acteur?.id),
  };

  await verifierSeanceDansPlageCalendrier(donneesAffectees);

  await verifierAbsenceConflitSeance(donneesAffectees, acteur, {
    exclureSeanceId,
  });

  if (verifierIndisponibilite) {
    const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesAffectees);

    if (conflitIndisponibilite) {
      throw creerErreurHttp(400, construireMessageIndisponibilite(conflitIndisponibilite));
    }
  }

  const nouvelleSeance = await creerSeance({
    ...donneesAffectees,
    cree_par: acteur.id,
    modifie_par: acteur.id,
    utilisateur_id: acteur.id,
  });

  await journaliserActionSeance({
    actionType: "seance_creee",
    actionLabel: "Création de la séance",
    acteur,
    seanceId: nouvelleSeance.id,
    handlerId: nouvelleSeance.handler_id,
    intervenantId: nouvelleSeance.intervenant_id,
    seanceLibelle: construireLibelleSeance(nouvelleSeance),
    details: construireDetailsCreation(extraireEtatAuditSeance(nouvelleSeance)),
  });

  return nouvelleSeance;
  };

  return utiliserTransaction ? executerTransactionImmediate(operation) : operation();
}

async function modifierSeanceDepuisDonneesValidees({
  seanceExistante,
  donneesSeance,
  acteur,
  verifierIndisponibilite = true,
  utiliserTransaction = true,
}) {
  const operation = async () => {
  if (!seanceExistante || !estIdentifiantValide(seanceExistante.id)) {
    throw creerErreurHttp(404, "Seance introuvable.");
  }

  const seanceId = Number(seanceExistante.id);
  const donneesAffectees = {
    ...donneesSeance,
    handler_id:
      normaliserIdentifiant(donneesSeance?.handler_id) ||
      normaliserIdentifiant(seanceExistante.handler_id) ||
      normaliserIdentifiant(acteur?.id),
    intervenant_id:
      normaliserIdentifiant(donneesSeance?.intervenant_id) ||
      normaliserIdentifiant(seanceExistante.intervenant_id) ||
      normaliserIdentifiant(acteur?.id),
  };

  const creneauInchange = creneauSeanceEquivalent(seanceExistante, donneesAffectees);

  await verifierSeanceDansPlageCalendrier(donneesAffectees, {
    seanceExistante,
  });

  const conflitSeance = await recupererConflitSeance(donneesAffectees, {
    exclureSeanceId: seanceId,
  });

  if (conflitSeance && !creneauInchange) {
    throw creerErreurHttp(400, construireMessageConflitSeance(conflitSeance));
  }

  if (verifierIndisponibilite) {
    const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesAffectees);

    if (conflitIndisponibilite && !creneauInchange) {
      throw creerErreurHttp(400, construireMessageIndisponibilite(conflitIndisponibilite));
    }
  }

  const seanceMiseAJour = await mettreAJourSeance(seanceId, {
    ...donneesAffectees,
    modifie_par: acteur.id,
  });

  await journaliserActionSeance({
    actionType: "seance_modifiee",
    actionLabel: "Modification de la séance",
    acteur,
    seanceId: seanceMiseAJour.id,
    handlerId: seanceMiseAJour.handler_id,
    intervenantId: seanceMiseAJour.intervenant_id,
    seanceLibelle: construireLibelleSeance(seanceMiseAJour),
    details: {
      type: "modification",
      changements: construireListeChangements(
        extraireEtatAuditSeance(seanceExistante),
        extraireEtatAuditSeance(seanceMiseAJour)
      ),
    },
  });

  return seanceMiseAJour;
  };

  return utiliserTransaction ? executerTransactionImmediate(operation) : operation();
}

async function ajouterSeance(req, res) {
  let donneesSeance = preparerDonneesSeance(req.body);
  const affectation = await resoudreAffectationSeance({
    scope: req.scope,
    acteur: req.utilisateur,
    donneesSeance: req.body,
  });
  donneesSeance = await ajouterTarifSnapshotIntervenant({
    ...donneesSeance,
    ...affectation,
  });
  const erreurs = await validerDonneesSeance(donneesSeance, req.utilisateur);

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  if (!statutsCreationValides.includes(donneesSeance.statut_seance)) {
    return res.status(400).json({
      message: "À la création, le statut doit être planifiée ou faite.",
    });
  }

  const nouvelleSeance = await creerSeanceDepuisDonneesValidees({
    donneesSeance,
    acteur: req.utilisateur,
    verifierIndisponibilite: true,
  });
  res.locals.realtimeScope = {
    handlerId: nouvelleSeance.handler_id,
    intervenantId: nouvelleSeance.intervenant_id,
  };

  return res.status(201).json({
    message: "Séance créée avec succès.",
    seance: transformerSeancePourClient(nouvelleSeance),
  });
}

async function modifierSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const seanceExistante = await trouverSeanceParIdScopee(
    req.params.id,
    construireScopeLectureSeances(req)
  );

  if (!seanceExistante) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  const affectation = await resoudreAffectationSeance({
    scope: req.scope,
    acteur: req.utilisateur,
    donneesSeance: req.body,
    seanceExistante,
  });
  const donneesSeance = await ajouterTarifSnapshotIntervenant({
    ...preparerDonneesSeance(req.body),
    ...affectation,
  });
  const erreurs = await validerDonneesSeance(donneesSeance, req.utilisateur, {
    seanceExistante,
  });

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  const seanceTransactionnelle = await modifierSeanceDepuisDonneesValidees({
    seanceExistante,
    donneesSeance,
    acteur: req.utilisateur,
    verifierIndisponibilite: true,
  });
  res.locals.realtimeScope = {
    handlerId: seanceTransactionnelle.handler_id,
    intervenantId: seanceTransactionnelle.intervenant_id,
  };

  return res.json({
    message: "Séance modifiée avec succès.",
    seance: transformerSeancePourClient(seanceTransactionnelle),
  });
}

async function changerStatutSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de séance invalide." });
  }

  const { statut_seance: statutSeance } = req.body;
  const seanceExistante = await trouverSeanceParIdScopee(
    req.params.id,
    construireScopeLectureSeances(req)
  );

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
  res.locals.realtimeScope = {
    handlerId: seanceMiseAJour.handler_id,
    intervenantId: seanceMiseAJour.intervenant_id,
  };

  await journaliserActionSeance({
    actionType: "statut_modifie",
    actionLabel: "Changement de statut",
    acteur: req.utilisateur,
    seanceId: seanceMiseAJour.id,
    handlerId: seanceMiseAJour.handler_id,
    intervenantId: seanceMiseAJour.intervenant_id,
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

  const seance = await trouverSeanceParIdScopee(
    req.params.id,
    construireScopeLectureSeances(req)
  );

  if (!seance) {
    return res.status(404).json({ message: "Séance introuvable." });
  }

  res.locals.realtimeScope = {
    handlerId: seance.handler_id,
    intervenantId: seance.intervenant_id,
  };

  const photos = await recupererPhotosParSeance(req.params.id);
  const etatAvantSuppression = extraireEtatAuditSeance(seance);
  await executerTransactionImmediate(async () => {
    const propositionAcceptee = await trouverPropositionAccepteeParSeanceId(seance.id);

    await restaurerIndisponibiliteDepuisPropositionAcceptee({
      seance,
      proposition: propositionAcceptee,
      acteur: req.utilisateur,
    });
    await detacherSeancesHistorique([seance]);
    await detacherSeancesPropositions([seance]);
    await supprimerSeance(req.params.id);

  await journaliserActionSeance({
    actionType: "seance_supprimee",
    actionLabel: "Suppression de la séance",
    acteur: req.utilisateur,
    seanceId: null,
    handlerId: seance.handler_id,
    intervenantId: seance.intervenant_id,
    seanceLibelle: construireLibelleSeance(seance),
    details: construireDetailsSuppression(etatAvantSuppression),
    });
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
          console.error("Suppression d'un ancien fichier associé impossible :", error);
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
  preparerDonneesSeance,
  validerDonneesSeance,
  transformerSeancePourClient,
  transformerSeancePourClientSelonUtilisateur,
  recupererConflitSeance,
  verifierAbsenceConflitSeance,
  creerSeanceDepuisDonneesValidees,
  modifierSeanceDepuisDonneesValidees,
  resoudreAffectationSeance,
  ajouterTarifSnapshotIntervenant,
  verifierSeanceDansPlageCalendrier,
  statutsCreationValides,
};
