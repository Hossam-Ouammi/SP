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
  listerMatieresHandler,
  obtenirTarifHorairePourSeance,
} = require("../models/tarification-matieres.model");
const {
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
  compte: "Réalisateur",
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

  const handlerExistant = normaliserIdentifiant(seanceExistante?.handler_id);
  const handlerIdsProfesseur = Array.isArray(scope.handlerProfesseurIds)
    ? scope.handlerProfesseurIds.map(normaliserIdentifiant).filter(Boolean)
    : [];
  const handlerId = handlerExistant || handlerDemande ||
    (scope.estHandler ? utilisateurId : handlerIdsProfesseur[0]) || null;
  const agitDansSaPropreEquipe = scope.estHandler && handlerId === utilisateurId;

  if (agitDansSaPropreEquipe) {

    const intervenantId =
      intervenantDemande || normaliserIdentifiant(seanceExistante?.intervenant_id) || utilisateurId;

    if (!(await scopePeutGererIntervenant(scope, { handlerId, intervenantId }))) {
      throw creerErreurRessourceInaccessible();
    }

    return { handler_id: handlerId, intervenant_id: intervenantId };
  }

  if (scope.estHandler && handlerId && handlerId !== utilisateurId && !handlerIdsProfesseur.includes(handlerId)) {
    throw creerErreurRessourceInaccessible();
  }

  if (!scope.estProfesseur || !handlerId || !handlerIdsProfesseur.includes(handlerId)) {
    throw creerErreurHttp(403, "Aucun espace Professeur actif n'est associ\u00e9 \u00e0 ce compte.");
  }

  if (handlerExistant && handlerDemande && handlerDemande !== handlerExistant) {
    throw creerErreurRessourceInaccessible();
  }

  const intervenantId =
    intervenantDemande || normaliserIdentifiant(seanceExistante?.intervenant_id) || utilisateurId;

  if (intervenantId !== utilisateurId) {
    throw creerErreurRessourceInaccessible();
  }

  return { handler_id: handlerId, intervenant_id: intervenantId };
}

function obtenirInstantSeance(donneesSeance, { fin = false } = {}) {
  const heure = fin ? donneesSeance?.heure_fin : donneesSeance?.heure_debut;
  return convertirDateHeureZonneeEnInstant(
    donneesSeance?.date,
    heure,
    CENTRAL_CALENDAR_TIMEZONE
  );
}

function seanceEstHistorique(donneesSeance, maintenant = new Date()) {
  if (String(donneesSeance?.statut_seance || "").toLowerCase() === "faite") {
    return true;
  }

  const instantFin = obtenirInstantSeance(donneesSeance, { fin: true });
  return Boolean(instantFin && instantFin.getTime() <= maintenant.getTime());
}

async function ajouterTarifSnapshotIntervenant(donneesSeance, { seanceExistante = null } = {}) {
  const intervenantId = normaliserIdentifiant(donneesSeance?.intervenant_id);
  const handlerId = normaliserIdentifiant(donneesSeance?.handler_id);

  if (!intervenantId || !handlerId) {
    return donneesSeance;
  }

  const intervenant = await trouverUtilisateurParId(intervenantId);
  const maintenant = new Date();
  // A completed or already elapsed session is accounting history.  Use the
  // former session itself to make that decision: changing its displayed date
  // later must never rewrite the frozen hourly-rate snapshot.
  const conserverSnapshotHistorique =
    seanceExistante && seanceEstHistorique(seanceExistante, maintenant);
  const snapshotBrut = seanceExistante?.tarif_horaire_applique;
  const snapshotExistant =
    snapshotBrut === null || snapshotBrut === undefined ? null : Number(snapshotBrut);
  const snapshotExistantValide =
    Number.isFinite(snapshotExistant) && snapshotExistant >= 0;
  const instantSeance = obtenirInstantSeance(donneesSeance);
  const tarifHoraireTrouve = conserverSnapshotHistorique && snapshotExistantValide
    ? snapshotExistant
    : await obtenirTarifHorairePourSeance({
        handlerId,
        intervenantId,
        matiere: donneesSeance?.matiere,
        effectifAu: (instantSeance || maintenant).toISOString(),
      });
  // Toute nouvelle affectation dispose d'un tarif exploitable. La grille par
  // matière reste prioritaire ; le tarif du compte, puis 90 dh, servent de
  // valeur par défaut si une nouvelle combinaison n'a pas encore été sauvée.
  const tarifCompte = Number(intervenant?.tarif_horaire);
  const tarifHoraire = Number.isFinite(tarifHoraireTrouve)
    ? tarifHoraireTrouve
    : Number.isFinite(tarifCompte) && tarifCompte > 0
      ? tarifCompte
      : 90;
  // `compte` demeure une colonne historique et une clé de compatibilité pour
  // les relevés existants. Il ne doit toutefois plus être choisi par le
  // client : une séance est toujours rattachée au Réalisateur effectivement
  // autorisé par `resoudreAffectationSeance`.
  const realisateur = normaliserTexte(intervenant?.nom);

  return {
    ...donneesSeance,
    compte: realisateur,
    tarif_horaire_applique:
      Number.isFinite(tarifHoraire) && tarifHoraire >= 0 ? tarifHoraire : null,
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

function construireMessageIndisponibilite(indisponibilite, { inclureRaison = false } = {}) {
  const raison = inclureRaison ? normaliserTexte(indisponibilite?.raison) : "";
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

function creerErreurHttp(status, message, code = null) {
  const erreur = new Error(message);
  erreur.status = status;
  if (code) {
    erreur.code = code;
  }
  return erreur;
}

function creneauSeanceEquivalent(seance, donneesSeance) {
  if (!seance || !donneesSeance) {
    return false;
  }

  // Les contrôles de conflit sont omis uniquement pour une vraie mise à jour
  // de métadonnées. Depuis qu'un Handler peut réaffecter une séance à un
  // autre intervenant, conserver les mêmes heures ne suffit plus : la
  // nouvelle personne doit être contrôlée contre ses indisponibilités et ses
  // autres séances.
  return (
    seance.date === donneesSeance.date &&
    seance.heure_debut === donneesSeance.heure_debut &&
    seance.heure_fin === donneesSeance.heure_fin &&
    normaliserIdentifiant(seance.intervenant_id) ===
      normaliserIdentifiant(donneesSeance.intervenant_id)
  );
}

function seanceEstAnnulee(seance) {
  return String(seance?.statut_seance || "planifiee").toLowerCase() === "annulee";
}

function seanceDevientActive(seanceAvant, donneesSeance) {
  return seanceEstAnnulee(seanceAvant) && !seanceEstAnnulee(donneesSeance);
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

function construireMessageConflitSeance(seance, options = {}) {
  if (options.anonyme) {
    return "Ce créneau chevauche déjà une séance.";
  }
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
    const memeEquipe =
      normaliserIdentifiant(conflitSeance.handler_id) ===
      normaliserIdentifiant(donneesSeance?.handler_id);
    throw creerErreurHttp(
      400,
      construireMessageConflitSeance(conflitSeance, { anonyme: !memeEquipe })
    );
  }
}

/**
 * The central calendar remains bookable while at least one active
 * Realisateur is free. A Realisateur means the Handler plus active attached
 * Professors; individual target validation remains separate below.
 */
async function verifierDisponibiliteCollectiveHandler(donneesSeance) {
  const handlerId = normaliserIdentifiant(donneesSeance?.handler_id);

  if (!handlerId) {
    return;
  }

  const realisateurIds = Array.from(
    new Set(
      (await listerIntervenantsAutorisesHandler(handlerId))
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );

  if (realisateurIds.length === 0) {
    return;
  }

  const conflits = await Promise.all(
    realisateurIds.map((intervenantId) =>
      trouverIndisponibiliteIntervenantChevauchante({
        handlerId,
        intervenantId,
        date: donneesSeance.date,
        heureDebut: donneesSeance.heure_debut,
        heureFin: donneesSeance.heure_fin,
      })
    )
  );

  if (conflits.every(Boolean)) {
    throw creerErreurHttp(
      409,
      "Aucun Réalisateur actif de l'équipe n'est disponible sur ce créneau. Choisissez un autre horaire.",
      "COLLECTIVE_UNAVAILABILITY"
    );
  }
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

async function recupererCatalogueSeances(handlerId = null) {
  const catalogue = await listerCatalogueOptions();
  const handler = normaliserIdentifiant(handlerId);
  const matieresHandler = handler ? await listerMatieresHandler(handler) : [];

  return {
    matieres: handler
      ? matieresHandler.map((matiere) => matiere.libelle)
      : Array.isArray(catalogue.matieres)
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
  const catalogue = await recupererCatalogueSeances(donneesSeance?.handler_id);
  const seanceExistante = options.seanceExistante || null;
  const matiereExisteAuCatalogue = catalogue.matieres.includes(donneesSeance.matiere);
  const compteExisteAuCatalogue = catalogue.comptes.includes(donneesSeance.compte);
  const compteEstDeriveDuRealisateur = Boolean(
    normaliserIdentifiant(donneesSeance?.intervenant_id) && normaliserTexte(donneesSeance.compte)
  );
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

  if (!normaliserTexte(donneesSeance.compte)) {
    erreurs.push("Le réalisateur est invalide.");
  } else if (!compteEstDeriveDuRealisateur && !compteExisteAuCatalogue && !compteLegacyInchange) {
    erreurs.push("Le réalisateur est invalide.");
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

  const tarifSnapshotRenseigne =
    donneesSeance.tarif_horaire_applique !== null &&
    donneesSeance.tarif_horaire_applique !== undefined &&
    Number.isFinite(Number(donneesSeance.tarif_horaire_applique));
  if (Number(donneesSeance.est_essai) !== 1 && !tarifSnapshotRenseigne) {
    erreurs.push(
      "Définissez d'abord le tarif de ce réalisateur pour cette matière dans Équipe."
    );
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
  const utilisateurId = normaliserIdentifiant(req.scope?.utilisateurId);
  const ids = [
    ...(req.scope?.estHandler && utilisateurId ? [utilisateurId] : []),
    ...(Array.isArray(req.scope?.handlerProfesseurIds) ? req.scope.handlerProfesseurIds : []),
  ].map(normaliserIdentifiant).filter(Boolean);
  const handlerIds = [...new Set(ids)];

  const equipes = await Promise.all(handlerIds.map(async (handlerId) => {
    const handler = await trouverUtilisateurParId(handlerId);
    const agitCommeHandler = Boolean(req.scope?.estHandler && handlerId === utilisateurId);
    const intervenantIds = agitCommeHandler
      ? await listerIntervenantsAutorisesHandler(handlerId)
      : [utilisateurId];
    const matieresHandler = await listerMatieresHandler(handlerId);
    const intervenants = (await Promise.all(
      intervenantIds.map((intervenantId) => trouverUtilisateurParId(intervenantId))
    )).filter(Boolean).map((intervenant) => ({
      id: intervenant.id,
      public_id: intervenant.public_id || null,
      nom: intervenant.nom,
      couleur_calendrier: intervenant.couleur_calendrier || null,
      tarif_horaire: Number(intervenant.tarif_horaire) || 0,
    }));
    return {
      id: handlerId,
      public_id: handler?.public_id || null,
      nom: handler?.nom || "Equipe",
      mode: agitCommeHandler ? "handler" : "professeur",
      matieres: matieresHandler.map((matiere) => ({ id: Number(matiere.id), valeur: matiere.libelle })),
      intervenants,
    };
  }));
  const equipeParDefaut = equipes[0] || null;

  return res.json({
    options: {
      equipes,
      handler_id: equipeParDefaut?.id || null,
      matieres: equipeParDefaut
        ? equipeParDefaut.matieres
        : Array.isArray(catalogue.matieres)
          ? catalogue.matieres
          : [],
      comptes: Array.isArray(catalogue.comptes) ? catalogue.comptes : [],
      intervenants: equipeParDefaut?.intervenants || [],
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
  verifierDisponibiliteCollective = false,
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

  if (verifierDisponibiliteCollective) {
    await verifierDisponibiliteCollectiveHandler(donneesAffectees);
  }

  await verifierAbsenceConflitSeance(donneesAffectees, acteur, {
    exclureSeanceId,
  });

  if (verifierIndisponibilite) {
    const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesAffectees);

    if (conflitIndisponibilite) {
      throw creerErreurHttp(400, construireMessageIndisponibilite(conflitIndisponibilite, {
        inclureRaison: Number(conflitIndisponibilite.intervenant_id) === Number(acteur?.id),
      }));
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
  verifierDisponibiliteCollective = false,
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
  // Une séance annulée ne participe pas aux conflits. La remettre dans un
  // statut actif équivaut donc à réserver de nouveau son créneau, même si les
  // heures et l'intervenant n'ont pas changé.
  const controlesCreneauRequis =
    !creneauInchange || seanceDevientActive(seanceExistante, donneesAffectees);

  await verifierSeanceDansPlageCalendrier(donneesAffectees, {
    seanceExistante,
  });

  if (verifierDisponibiliteCollective && controlesCreneauRequis) {
    await verifierDisponibiliteCollectiveHandler(donneesAffectees);
  }

  const conflitSeance = await recupererConflitSeance(donneesAffectees, {
    exclureSeanceId: seanceId,
  });

  if (conflitSeance && controlesCreneauRequis) {
    throw creerErreurHttp(400, construireMessageConflitSeance(conflitSeance));
  }

  if (verifierIndisponibilite) {
    const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesAffectees);

    if (conflitIndisponibilite && controlesCreneauRequis) {
      throw creerErreurHttp(400, construireMessageIndisponibilite(conflitIndisponibilite, {
        inclureRaison: Number(conflitIndisponibilite.intervenant_id) === Number(acteur?.id),
      }));
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
    // Collective availability is a Dashboard visualization, not a booking
    // authorization rule.  A Professor target is still validated individually.
    verifierDisponibiliteCollective: false,
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
  }, { seanceExistante });
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
    verifierDisponibiliteCollective: false,
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

  if (seanceDevientActive(seanceExistante, { statut_seance: statutSeance })) {
    const donneesSeance = {
      ...seanceExistante,
      statut_seance: statutSeance,
    };
    await verifierAbsenceConflitSeance(donneesSeance, req.utilisateur, {
      exclureSeanceId: seanceExistante.id,
    });

    const conflitIndisponibilite = await recupererConflitIndisponibilite(donneesSeance);
    if (conflitIndisponibilite) {
      throw creerErreurHttp(400, construireMessageIndisponibilite(conflitIndisponibilite, {
        inclureRaison:
          Number(conflitIndisponibilite.intervenant_id) === Number(req.utilisateur?.id),
      }));
    }
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
    // Les anciennes propositions d'exception sont retirées : supprimer une
    // séance ne peut plus recréer, modifier ou supprimer l'indisponibilité
    // personnelle d'un Professeur.
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
  verifierDisponibiliteCollectiveHandler,
  creerSeanceDepuisDonneesValidees,
  modifierSeanceDepuisDonneesValidees,
  resoudreAffectationSeance,
  ajouterTarifSnapshotIntervenant,
  verifierSeanceDansPlageCalendrier,
  statutsCreationValides,
};
