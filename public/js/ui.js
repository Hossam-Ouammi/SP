import {
  connecterUtilisateur,
  changerMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurCourant,
} from "./auth.js";
import {
  recupererSeances,
  ajouterSeance,
  modifierSeance,
  supprimerSeance,
  changerStatutSeance,
  televerserPhotosDeSeance,
  recupererPhotosDeSeance,
  recupererHistoriqueActions,
  recupererDetailHistorique,
  recupererMonetisation,
} from "./seances.js";
import { initialiserCalendrier, mettreAJourEvenements } from "./calendrier.js";

const libellesStatutSeance = {
  planifiee: "Planifiée",
  faite: "Faite",
  annulee: "Annulée",
  reportee: "Reportée",
};

const ordreChampsCreationHistorique = [
  "etudiant",
  "matiere",
  "compte",
  "est_essai",
  "date",
  "heure_debut",
  "heure_fin",
  "duree_minutes",
  "statut_seance",
  "description",
];

const libellesCreationHistorique = {
  etudiant: "Étudiant",
  matiere: "Matière",
  compte: "Compte",
  est_essai: "Type de séance",
  date: "Date",
  heure_debut: "Heure de début",
  heure_fin: "Heure de fin",
  duree_minutes: "Durée",
  statut_seance: "Statut",
  description: "Description",
};

const heuresDebutDisponibles = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);
const minutesDebutDisponibles = ["00", "30"];
const etat = {
  utilisateur: null,
  seances: [],
  historique: [],
  monetisation: null,
  historiqueSelection: null,
  seanceSelectionnee: null,
  calendrier: null,
  sectionActive: "dashboard",
};

const elements = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  loginButton: document.getElementById("login-button"),
  logoutButton: document.getElementById("logout-button"),
  addSeanceButton: document.getElementById("add-seance-button"),
  navTabs: Array.from(document.querySelectorAll(".nav-tab")),
  dashboardSection: document.getElementById("dashboard-section"),
  statistiquesSection: document.getElementById("statistiques-section"),
  utilisateurSection: document.getElementById("utilisateur-section"),
  monetisationSection: document.getElementById("monetisation-section"),
  historiqueSection: document.getElementById("historique-section"),
  currentUserName: document.getElementById("current-user-name"),
  userUsername: document.getElementById("user-username"),
  userPasswordForm: document.getElementById("user-password-form"),
  userPasswordError: document.getElementById("user-password-error"),
  currentPassword: document.getElementById("current-password"),
  newPassword: document.getElementById("new-password"),
  confirmPassword: document.getElementById("confirm-password"),
  savePasswordButton: document.getElementById("save-password-button"),
  calendar: document.getElementById("calendar"),
  totalCount: document.getElementById("total-count"),
  statsYassineTotal: document.getElementById("stats-yassine-total"),
  statsYassinePlanned: document.getElementById("stats-yassine-planned"),
  statsYassineCompleted: document.getElementById("stats-yassine-completed"),
  statsYassineCompletedTrial: document.getElementById("stats-yassine-completed-trial"),
  statsYassineCompletedRegular: document.getElementById("stats-yassine-completed-regular"),
  statsYassinePostponed: document.getElementById("stats-yassine-postponed"),
  statsYassineCancelled: document.getElementById("stats-yassine-cancelled"),
  statsAbdoTotal: document.getElementById("stats-abdo-total"),
  statsAbdoPlanned: document.getElementById("stats-abdo-planned"),
  statsAbdoCompleted: document.getElementById("stats-abdo-completed"),
  statsAbdoCompletedTrial: document.getElementById("stats-abdo-completed-trial"),
  statsAbdoCompletedRegular: document.getElementById("stats-abdo-completed-regular"),
  statsAbdoPostponed: document.getElementById("stats-abdo-postponed"),
  statsAbdoCancelled: document.getElementById("stats-abdo-cancelled"),
  monetisationAbdoDue: document.getElementById("monetisation-abdo-due"),
  monetisationTotalDue: document.getElementById("monetisation-total-due"),
  monetisationTotalBillable: document.getElementById("monetisation-total-billable"),
  monetisationYassineRate: document.getElementById("monetisation-yassine-rate"),
  monetisationAbdoRate: document.getElementById("monetisation-abdo-rate"),
  monetisationYassineBillableCount: document.getElementById(
    "monetisation-yassine-billable-count"
  ),
  monetisationAbdoBillableCount: document.getElementById(
    "monetisation-abdo-billable-count"
  ),
  monetisationYassineTrialCount: document.getElementById("monetisation-yassine-trial-count"),
  monetisationAbdoTrialCount: document.getElementById("monetisation-abdo-trial-count"),
  monetisationYassineDue: document.getElementById("monetisation-yassine-due"),
  monetisationAbdoDueTable: document.getElementById("monetisation-abdo-due-table"),
  historyCount: document.getElementById("history-count"),
  historyList: document.getElementById("history-list"),
  historyIntegrity: document.getElementById("history-integrity"),
  historyIntegrityHelp: document.getElementById("history-integrity-help"),
  historyDetailEmpty: document.getElementById("history-detail-empty"),
  historyDetail: document.getElementById("history-detail"),
  historyDetailAction: document.getElementById("history-detail-action"),
  historyDetailSeance: document.getElementById("history-detail-seance"),
  historyDetailActor: document.getElementById("history-detail-actor"),
  historyDetailDate: document.getElementById("history-detail-date"),
  historyChangesTitle: document.getElementById("history-changes-title"),
  historyChangesList: document.getElementById("history-changes-list"),
  seanceModal: document.getElementById("seance-modal"),
  seanceModalTitle: document.getElementById("seance-modal-title"),
  seanceModalSubtitle: document.getElementById("seance-modal-subtitle"),
  seanceForm: document.getElementById("seance-form"),
  seanceFormError: document.getElementById("seance-form-error"),
  saveSeanceButton: document.getElementById("save-seance-button"),
  seanceId: document.getElementById("seance-id"),
  etudiant: document.getElementById("etudiant"),
  matiereCheckboxes: Array.from(document.querySelectorAll(".matiere-checkbox")),
  compteCheckboxes: Array.from(document.querySelectorAll(".compte-checkbox")),
  statusOptions: Array.from(document.querySelectorAll(".status-option")),
  date: document.getElementById("date"),
  heureDebut: document.getElementById("heure_debut"),
  heureDebutHourSelect: document.getElementById("heure-debut-hour-select"),
  heureDebutMinuteSelect: document.getElementById("heure-debut-minute-select"),
  heureFinCalculee: document.getElementById("heure_fin_calculee"),
  dureeCheckboxes: Array.from(document.querySelectorAll(".duration-checkbox")),
  statutCheckboxes: Array.from(document.querySelectorAll(".statut-checkbox")),
  essaiCheckboxes: Array.from(document.querySelectorAll(".essai-checkbox")),
  description: document.getElementById("description"),
  screenshotsInput: document.getElementById("seance-screenshots"),
  selectedFiles: document.getElementById("selected-files"),
  detailModal: document.getElementById("detail-modal"),
  detailTitle: document.getElementById("detail-title"),
  detailStatusBadge: document.getElementById("detail-status-badge"),
  detailStudent: document.getElementById("detail-student"),
  detailSubject: document.getElementById("detail-subject"),
  detailAccount: document.getElementById("detail-account"),
  detailDate: document.getElementById("detail-date"),
  detailTime: document.getElementById("detail-time"),
  detailDuration: document.getElementById("detail-duration"),
  detailTrial: document.getElementById("detail-trial"),
  detailCreatedBy: document.getElementById("detail-created-by"),
  detailUpdatedBy: document.getElementById("detail-updated-by"),
  detailCreatedAt: document.getElementById("detail-created-at"),
  detailUpdatedAt: document.getElementById("detail-updated-at"),
  detailDescription: document.getElementById("detail-description"),
  detailPhotos: document.getElementById("detail-photos"),
  detailPhotoCount: document.getElementById("detail-photo-count"),
  editSeanceButton: document.getElementById("edit-seance-button"),
  deleteSeanceButton: document.getElementById("delete-seance-button"),
  quickStatusButtons: Array.from(document.querySelectorAll(".quick-status-button")),
  screenshotPreviewModal: document.getElementById("screenshot-preview-modal"),
  previewTitle: document.getElementById("preview-title"),
  previewImage: document.getElementById("preview-image"),
  previewFilename: document.getElementById("preview-filename"),
  previewDownload: document.getElementById("preview-download"),
  toastContainer: document.getElementById("toast-container"),
};

document.addEventListener("DOMContentLoaded", initialiserApplication);

async function initialiserApplication() {
  initialiserChoixHeureDebut();
  attacherEcouteurs();

  try {
    const utilisateur = await recupererUtilisateurCourant();

    if (utilisateur) {
      etat.utilisateur = utilisateur;
      afficherApplication();
      await Promise.all([
        chargerSeances(),
        chargerHistorique(),
        chargerMonetisationSiAutorise(),
      ]);
    } else {
      afficherConnexion();
    }
  } catch (erreur) {
    afficherConnexion();
    afficherToast(erreur.message, "error");
  }
}

function initialiserChoixHeureDebut() {
  elements.heureDebutHourSelect.innerHTML = heuresDebutDisponibles
    .map((heure) => `<option value="${heure}">${heure}</option>`)
    .join("");

  elements.heureDebutMinuteSelect.innerHTML = minutesDebutDisponibles
    .map((minute) => `<option value="${minute}">${minute}</option>`)
    .join("");
}

function attacherEcouteurs() {
  elements.loginForm.addEventListener("submit", gererConnexion);
  elements.userPasswordForm.addEventListener("submit", gererModificationMotDePasse);
  elements.logoutButton.addEventListener("click", gererDeconnexion);
  elements.navTabs.forEach((bouton) => {
    bouton.addEventListener("click", () => {
      afficherSectionApplication(bouton.dataset.sectionTarget);
    });
  });
  elements.addSeanceButton.addEventListener("click", () => {
    ouvrirFormulaireCreation();
  });
  elements.seanceForm.addEventListener("submit", gererSoumissionSeance);
  elements.screenshotsInput.addEventListener("change", afficherFichiersSelectionnes);
  elements.heureDebutHourSelect.addEventListener("change", mettreAJourHeureDebutSelectionnee);
  elements.heureDebutMinuteSelect.addEventListener(
    "change",
    mettreAJourHeureDebutSelectionnee
  );
  elements.editSeanceButton.addEventListener("click", ouvrirFormulaireModification);
  elements.deleteSeanceButton.addEventListener("click", gererSuppressionSeance);

  attacherSelectionUnique(elements.matiereCheckboxes);
  attacherSelectionUnique(elements.compteCheckboxes);
  attacherSelectionUnique(elements.statutCheckboxes);
  attacherSelectionUnique(elements.dureeCheckboxes, mettreAJourHeureFinCalculee);
  attacherSelectionUnique(elements.essaiCheckboxes);

  elements.quickStatusButtons.forEach((bouton) => {
    if (bouton.dataset.status === "reportee") {
      bouton.addEventListener("click", ouvrirFormulaireReport);
      return;
    }

    bouton.addEventListener("click", async () => {
      await gererChangementStatut(bouton.dataset.status);
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", () => {
      fermerModal(document.getElementById(element.dataset.closeModal));
    });
  });
}

function afficherConnexion() {
  elements.loginView.classList.remove("hidden");
  elements.appView.classList.add("hidden");
  elements.loginError.classList.add("hidden");
  elements.loginForm.reset();
  reinitialiserFormulaireUtilisateur();
  mettreAJourNavigationProtegee();
}

function afficherApplication() {
  elements.loginView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  elements.currentUserName.textContent = etat.utilisateur.nom;
  elements.userUsername.textContent = etat.utilisateur.nom;
  mettreAJourNavigationProtegee();
  afficherSectionApplication(etat.sectionActive);

  if (!etat.calendrier) {
    etat.calendrier = initialiserCalendrier(elements.calendar, {
      onDateClick: ouvrirFormulaireCreation,
      onEventClick: ouvrirDetailSeance,
    });
  }
}

function afficherSectionApplication(section) {
  const sectionDemandee =
    section === "monetisation" && !utilisateurPeutVoirMonetisation()
      ? "dashboard"
      : section;

  etat.sectionActive = sectionDemandee;

  const cartes = {
    dashboard: elements.dashboardSection,
    statistiques: elements.statistiquesSection,
    utilisateur: elements.utilisateurSection,
    monetisation: elements.monetisationSection,
    historique: elements.historiqueSection,
  };

  Object.entries(cartes).forEach(([cle, element]) => {
    element.classList.toggle("hidden", cle !== sectionDemandee);
  });

  elements.navTabs.forEach((bouton) => {
    bouton.classList.toggle("is-active", bouton.dataset.sectionTarget === sectionDemandee);
  });
}

function utilisateurPeutVoirMonetisation() {
  return String(etat.utilisateur?.email || "").trim().toLowerCase() === "hossam@test.com";
}

function mettreAJourNavigationProtegee() {
  elements.navTabs.forEach((bouton) => {
    if (bouton.dataset.sectionTarget !== "monetisation") {
      return;
    }

    bouton.classList.toggle("hidden", !utilisateurPeutVoirMonetisation());
  });
}

function reinitialiserFormulaireUtilisateur() {
  elements.userPasswordForm.reset();
  masquerErreur(elements.userPasswordError);
}

async function gererConnexion(event) {
  event.preventDefault();
  masquerErreur(elements.loginError);
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = "Connexion...";

  try {
    const utilisateur = await connecterUtilisateur(
      elements.loginUsername.value.trim(),
      elements.loginPassword.value
    );

    etat.utilisateur = utilisateur;
    afficherApplication();
    await Promise.all([
      chargerSeances(),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
    ]);
    afficherToast("Connexion réussie.");
  } catch (erreur) {
    afficherErreur(elements.loginError, erreur.message);
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "Se connecter";
  }
}

async function gererDeconnexion() {
  try {
    await deconnecterUtilisateur();
    etat.utilisateur = null;
    etat.seances = [];
    etat.historique = [];
    etat.monetisation = null;
    etat.historiqueSelection = null;
    etat.seanceSelectionnee = null;
    etat.sectionActive = "dashboard";
    viderDetailHistorique();
    afficherConnexion();
    if (etat.calendrier) {
      mettreAJourEvenements(etat.calendrier, []);
    }
    afficherToast("Déconnexion réussie.");
  } catch (erreur) {
    afficherToast(erreur.message, "error");
  }
}

async function gererModificationMotDePasse(event) {
  event.preventDefault();
  masquerErreur(elements.userPasswordError);

  const motDePasseActuel = elements.currentPassword.value;
  const nouveauMotDePasse = elements.newPassword.value;
  const confirmationMotDePasse = elements.confirmPassword.value;

  if (nouveauMotDePasse !== confirmationMotDePasse) {
    afficherErreur(
      elements.userPasswordError,
      "La confirmation du nouveau mot de passe est incorrecte."
    );
    return;
  }

  elements.savePasswordButton.disabled = true;
  elements.savePasswordButton.textContent = "Mise à jour...";

  try {
    await changerMotDePasse(motDePasseActuel, nouveauMotDePasse);
    reinitialiserFormulaireUtilisateur();
    afficherToast("Mot de passe modifié.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherErreur(elements.userPasswordError, erreur.message);
  } finally {
    elements.savePasswordButton.disabled = false;
    elements.savePasswordButton.textContent = "Modifier le mot de passe";
  }
}

async function chargerSeances(options = {}) {
  const seances = await recupererSeances();
  etat.seances = seances;
  mettreAJourEvenements(etat.calendrier, seances);
  mettreAJourResume();

  if (options.ouvrirSeanceId) {
    const seance = etat.seances.find(
      (item) => Number(item.id) === Number(options.ouvrirSeanceId)
    );

    if (seance) {
      await ouvrirDetailSeance(seance);
    }
  }
}

async function chargerHistorique(options = {}) {
  const historique = await recupererHistoriqueActions();
  etat.historique = historique;
  afficherListeHistorique();

  const idRecherche =
    options.ouvrirEntreeId || etat.historiqueSelection?.id || null;

  if (idRecherche) {
    const entree = historique.find((item) => Number(item.id) === Number(idRecherche));

    if (entree) {
      await ouvrirDetailHistorique(entree.id);
      return;
    }
  }

  viderDetailHistorique();
}

async function chargerMonetisationSiAutorise() {
  if (!utilisateurPeutVoirMonetisation()) {
    etat.monetisation = null;
    viderMonetisation();
    return;
  }

  try {
    etat.monetisation = await recupererMonetisation();
    mettreAJourMonetisation();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      etat.monetisation = null;
      viderMonetisation();
      afficherSectionApplication("dashboard");
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function mettreAJourResume() {
  elements.totalCount.textContent = String(etat.seances.length);

  const statistiquesYassine = calculerStatistiquesCompte("Yassine");
  const statistiquesAbdo = calculerStatistiquesCompte("Abdo");

  mettreAJourCarteCompte({
    total: elements.statsYassineTotal,
    planned: elements.statsYassinePlanned,
    completed: elements.statsYassineCompleted,
    completedTrial: elements.statsYassineCompletedTrial,
    completedRegular: elements.statsYassineCompletedRegular,
    postponed: elements.statsYassinePostponed,
    cancelled: elements.statsYassineCancelled,
  }, statistiquesYassine);

  mettreAJourCarteCompte({
    total: elements.statsAbdoTotal,
    planned: elements.statsAbdoPlanned,
    completed: elements.statsAbdoCompleted,
    completedTrial: elements.statsAbdoCompletedTrial,
    completedRegular: elements.statsAbdoCompletedRegular,
    postponed: elements.statsAbdoPostponed,
    cancelled: elements.statsAbdoCancelled,
  }, statistiquesAbdo);

  viderMonetisation();
}

function normaliserNomCompte(compte) {
  const valeur = String(compte || "").trim().toLowerCase();

  if (valeur === "yassine") {
    return "Yassine";
  }

  return "Abdo";
}

function calculerStatistiquesCompte(compteRecherche) {
  const seancesDuCompte = etat.seances.filter(
    (seance) => normaliserNomCompte(seance.compte) === compteRecherche
  );
  const seancesFaites = seancesDuCompte.filter(
    (seance) => seance.statut_seance === "faite"
  );

  return {
    total: seancesDuCompte.length,
    planifiees: seancesDuCompte.filter((seance) => seance.statut_seance === "planifiee").length,
    faites: seancesFaites.length,
    faitesEssai: seancesFaites.filter((seance) => Boolean(seance.est_essai)).length,
    faitesRegulieres: seancesFaites.filter((seance) => !Boolean(seance.est_essai)).length,
    reportees: seancesDuCompte.filter((seance) => seance.statut_seance === "reportee").length,
    annulees: seancesDuCompte.filter((seance) => seance.statut_seance === "annulee").length,
  };
}

function mettreAJourCarteCompte(cibles, statistiques) {
  cibles.total.textContent = String(statistiques.total);
  cibles.planned.textContent = String(statistiques.planifiees);
  cibles.completed.textContent = String(statistiques.faites);
  cibles.completedTrial.textContent = String(statistiques.faitesEssai);
  cibles.completedRegular.textContent = String(statistiques.faitesRegulieres);
  cibles.postponed.textContent = String(statistiques.reportees);
  cibles.cancelled.textContent = String(statistiques.annulees);
}

function mettreAJourMonetisation() {
  if (!etat.monetisation) {
    viderMonetisation();
    return;
  }

  const donneesYassine = etat.monetisation.comptes?.Yassine;
  const donneesAbdo = etat.monetisation.comptes?.Abdo;

  elements.monetisationAbdoDue.textContent = formaterMontantDh(
    etat.monetisation.montant_abdo_a_payer
  );
  elements.monetisationTotalDue.textContent = formaterMontantDh(
    etat.monetisation.montant_total
  );
  elements.monetisationTotalBillable.textContent = String(
    etat.monetisation.nombre_total_facturable || 0
  );
  elements.monetisationYassineRate.textContent = formaterMontantDh(
    donneesYassine?.tarif_unitaire
  );
  elements.monetisationAbdoRate.textContent = formaterMontantDh(
    donneesAbdo?.tarif_unitaire
  );
  elements.monetisationYassineBillableCount.textContent = String(
    donneesYassine?.seances_facturables || 0
  );
  elements.monetisationAbdoBillableCount.textContent = String(
    donneesAbdo?.seances_facturables || 0
  );
  elements.monetisationYassineTrialCount.textContent = String(
    donneesYassine?.seances_essai_faites || 0
  );
  elements.monetisationAbdoTrialCount.textContent = String(
    donneesAbdo?.seances_essai_faites || 0
  );
  elements.monetisationYassineDue.textContent = formaterMontantDh(
    donneesYassine?.montant_du
  );
  elements.monetisationAbdoDueTable.textContent = formaterMontantDh(
    donneesAbdo?.montant_du
  );
}

function viderMonetisation() {
  elements.monetisationAbdoDue.textContent = "0 dh";
  elements.monetisationTotalDue.textContent = "0 dh";
  elements.monetisationTotalBillable.textContent = "0";
  elements.monetisationYassineRate.textContent = "130 dh";
  elements.monetisationAbdoRate.textContent = "90 dh";
  elements.monetisationYassineBillableCount.textContent = "0";
  elements.monetisationAbdoBillableCount.textContent = "0";
  elements.monetisationYassineTrialCount.textContent = "0";
  elements.monetisationAbdoTrialCount.textContent = "0";
  elements.monetisationYassineDue.textContent = "0 dh";
  elements.monetisationAbdoDueTable.textContent = "0 dh";
}

function formaterMontantDh(montant) {
  return `${Number(montant) || 0} dh`;
}

function afficherListeHistorique() {
  elements.historyCount.textContent = String(etat.historique.length);
  elements.historyList.innerHTML = "";

  if (etat.historique.length === 0) {
    elements.historyList.innerHTML =
      '<div class="empty-state">Aucune action enregistrée pour le moment.</div>';
    return;
  }

  etat.historique.forEach((entree) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "history-item";
    bouton.classList.toggle(
      "is-active",
      Number(etat.historiqueSelection?.id) === Number(entree.id)
    );
    const entete = document.createElement("div");
    entete.className = "history-item-head";

    const titre = document.createElement("span");
    titre.className = "history-item-title";
    titre.textContent = obtenirLibelleActionHistorique(entree);

    const heure = document.createElement("span");
    heure.className = "history-item-time";
    heure.textContent = formatDateHeureSecondes(entree.created_at);

    entete.append(titre, heure);

    const seance = document.createElement("div");
    seance.className = "history-item-meta";
    seance.textContent = entree.seance_libelle;

    const acteur = document.createElement("div");
    acteur.className = "history-item-meta";
    acteur.textContent = `Par ${obtenirNomActeurAffiche(entree.acteur_nom)}`;

    bouton.append(entete, seance, acteur);
    bouton.addEventListener("click", async () => {
      await ouvrirDetailHistorique(entree.id);
    });
    elements.historyList.appendChild(bouton);
  });
}

async function ouvrirDetailHistorique(entreeId) {
  try {
    const entree = await recupererDetailHistorique(entreeId);
    etat.historiqueSelection = entree;
    afficherListeHistorique();
    afficherDetailHistorique(entree);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function afficherDetailHistorique(entree) {
  elements.historyDetailEmpty.classList.add("hidden");
  elements.historyDetail.classList.remove("hidden");
  elements.historyDetailAction.textContent = obtenirLibelleActionHistorique(entree);
  elements.historyDetailSeance.textContent = entree.seance_libelle || "-";
  elements.historyDetailActor.textContent = obtenirNomActeurAffiche(entree.acteur_nom);
  elements.historyDetailDate.textContent = formatDateHeureSecondes(entree.created_at);
  elements.historyIntegrity.textContent = entree.integrite_valide ? "Vérifié" : "Alerte";
  elements.historyIntegrity.className = "history-integrity";
  elements.historyIntegrity.classList.add(entree.integrite_valide ? "valid" : "invalid");
  elements.historyIntegrityHelp.textContent = entree.integrite_valide
    ? "Vérifié signifie que cette entrée correspond exactement à ce qui a été enregistré à l'origine."
    : "Alerte signifie que le système a détecté une différence entre l'entrée enregistrée et sa signature de contrôle.";

  const detailsHistorique = normaliserDetailsHistorique(entree);
  elements.historyChangesTitle.textContent = detailsHistorique.titre;
  elements.historyChangesList.innerHTML = "";

  if (detailsHistorique.lignes.length === 0) {
    elements.historyChangesList.innerHTML =
      '<div class="empty-state">Aucun détail supplémentaire pour cette action.</div>';
    return;
  }

  detailsHistorique.lignes.forEach((ligne) => {
    if (detailsHistorique.mode === "changement") {
      elements.historyChangesList.appendChild(creerCarteChangementHistorique(ligne));
      return;
    }

    elements.historyChangesList.appendChild(creerCarteInformationHistorique(ligne));
  });
}

function viderDetailHistorique() {
  etat.historiqueSelection = null;
  elements.historyDetail.classList.add("hidden");
  elements.historyDetailEmpty.classList.remove("hidden");
  elements.historyDetailAction.textContent = "-";
  elements.historyDetailSeance.textContent = "-";
  elements.historyDetailActor.textContent = "-";
  elements.historyDetailDate.textContent = "-";
  elements.historyChangesTitle.textContent = "Détails";
  elements.historyChangesList.innerHTML = "";
  elements.historyIntegrity.textContent = "-";
  elements.historyIntegrityHelp.textContent = "-";
  elements.historyIntegrity.className = "history-integrity";
}

function obtenirLibelleActionHistorique(entree) {
  if (entree?.action_type === "initialisation" || entree?.action_type === "seance_creee") {
    return "Création de la séance";
  }

  if (entree?.action_type === "seance_supprimee") {
    return "Suppression de la séance";
  }

  if (
    ["seance_modifiee", "statut_modifie", "screenshots_ajoutes"].includes(entree?.action_type)
  ) {
    const nature = obtenirNatureModificationHistorique(entree);
    return nature ? `Modification de la séance - ${nature}` : "Modification de la séance";
  }

  return entree?.action_label || "Action";
}

function obtenirNomActeurAffiche(nomActeur) {
  if (String(nomActeur || "").trim() === "Ami") {
    return "Abdo";
  }

  return nomActeur || "-";
}

function obtenirNatureModificationHistorique(entree) {
  if (entree?.action_type === "statut_modifie") {
    return "Statut";
  }

  if (entree?.action_type === "screenshots_ajoutes") {
    return "Screenshots";
  }

  const changements = Array.isArray(entree?.details?.changements)
    ? entree.details.changements
    : [];

  if (changements.length === 0) {
    return "";
  }

  const champs = new Set(
    changements
      .map((changement) => String(changement?.champ || "").trim())
      .filter(Boolean)
  );
  const groupes = [];

  if (
    ["date", "heure_debut", "heure_fin", "duree_minutes"].some((champ) => champs.has(champ))
  ) {
    groupes.push("Horaire");
  }

  if (["etudiant", "matiere", "compte"].some((champ) => champs.has(champ))) {
    groupes.push("Informations");
  }

  if (champs.has("est_essai")) {
    groupes.push("Type de séance");
  }

  if (champs.has("description")) {
    groupes.push("Notes");
  }

  if (champs.has("statut_seance")) {
    groupes.push("Statut");
  }

  if (groupes.length === 0) {
    return "Mise à jour";
  }

  if (groupes.length === 1) {
    return groupes[0];
  }

  if (groupes.length === 2) {
    return `${groupes[0]} et ${groupes[1]}`;
  }

  return "Plusieurs éléments";
}

function normaliserDetailsHistorique(entree) {
  const details = entree?.details || {};

  if (details.type === "creation" || ["initialisation", "seance_creee"].includes(entree?.action_type)) {
    return {
      mode: "information",
      titre: "Séance enregistrée",
      lignes: construireDetailsCreationHistorique(details),
    };
  }

  if (Array.isArray(details?.captures_ajoutees) && details.captures_ajoutees.length > 0) {
    return {
      mode: "information",
      titre: "Screenshots ajoutés",
      lignes: details.captures_ajoutees.map((capture) => ({
        label: "Screenshot",
        valeur: capture.nom_fichier || "-",
      })),
    };
  }

  if (Array.isArray(details?.changements) && details.changements.length > 0) {
    return {
      mode: "changement",
      titre: "Changements",
      lignes: details.changements.map((changement) => ({
        label: changement.label || changement.champ || "Champ",
        avant: changement.avant || "-",
        apres: changement.apres || "-",
      })),
    };
  }

  return {
    mode: "information",
    titre: "Détails",
    lignes: [],
  };
}

function construireDetailsCreationHistorique(details) {
  const seanceCreation = normaliserSeanceCreationHistorique(details);

  if (!seanceCreation) {
    return [];
  }

  return ordreChampsCreationHistorique.map((champ) => ({
    label: libellesCreationHistorique[champ] || champ,
    valeur: formaterValeurCreationHistorique(champ, seanceCreation[champ], seanceCreation),
  }));
}

function normaliserSeanceCreationHistorique(details) {
  if (details?.seance && typeof details.seance === "object") {
    return details.seance;
  }

  if (!Array.isArray(details?.changements)) {
    return null;
  }

  return details.changements.reduce((resume, changement) => {
    if (!changement?.champ) {
      return resume;
    }

    resume[changement.champ] = changement.apres;
    return resume;
  }, {});
}

function formaterValeurCreationHistorique(champ, valeur, seanceCreation) {
  if (champ === "date") {
    return formatDate(valeur);
  }

  if (champ === "est_essai") {
    return normaliserValeurEssaiHistorique(valeur);
  }

  if (champ === "statut_seance") {
    return libellesStatutSeance[valeur] || valeur || "-";
  }

  if (champ === "duree_minutes") {
    const dureeMinutes =
      Number(valeur) || calculerDureeMinutesDepuisHeures(seanceCreation.heure_debut, seanceCreation.heure_fin);
    return formaterDureeHistorique(dureeMinutes);
  }

  if (champ === "description") {
    return String(valeur || "").trim() || "Aucune description";
  }

  if (champ === "compte") {
    return normaliserNomCompte(valeur);
  }

  return String(valeur || "-").trim() || "-";
}

function normaliserValeurEssaiHistorique(valeur) {
  if (valeur === true || valeur === 1 || valeur === "1" || valeur === "Oui") {
    return "Séance d'essai";
  }

  return "Séance régulière";
}

function creerCarteChangementHistorique(changement) {
  const carte = document.createElement("article");
  carte.className = "history-change-card";

  const titre = document.createElement("strong");
  titre.textContent = changement.label;

  const valeurs = document.createElement("div");
  valeurs.className = "history-change-values";

  const avant = document.createElement("span");
  avant.textContent = `Avant : ${changement.avant}`;

  const apres = document.createElement("span");
  apres.textContent = `Après : ${changement.apres}`;

  valeurs.append(avant, apres);
  carte.append(titre, valeurs);
  return carte;
}

function creerCarteInformationHistorique(ligne) {
  const carte = document.createElement("article");
  carte.className = "history-change-card";

  const titre = document.createElement("strong");
  titre.textContent = ligne.label;

  const valeur = document.createElement("p");
  valeur.textContent = ligne.valeur;

  carte.append(titre, valeur);
  return carte;
}

function ouvrirFormulaireCreation(dateSelectionnee = "") {
  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  configurerOptionsStatut("creation");
  definirSousTitreModalSeance("");
  elements.seanceModalTitle.textContent = "Nouvelle séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  elements.seanceId.value = "";
  definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  definirValeurSelectionnee(elements.compteCheckboxes, "Abdo");
  definirValeurSelectionnee(elements.matiereCheckboxes, "Maths");
  definirValeurSelectionnee(elements.essaiCheckboxes, "0");
  definirDureeSelectionnee(60);
  definirHeureDebutSelectionnee(recupererHeureDebutParDefaut());
  viderFichiersSelectionnes();

  if (dateSelectionnee) {
    elements.date.value = dateSelectionnee;
  }

  mettreAJourHeureFinCalculee();
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
}

function ouvrirFormulaireModification() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  configurerOptionsStatut("modification");
  definirSousTitreModalSeance("");
  remplirFormulaire(etat.seanceSelectionnee);
  elements.seanceModalTitle.textContent = "Modifier la séance";
  elements.saveSeanceButton.textContent = "Sauvegarder";
  ouvrirModal(elements.seanceModal);
}

function ouvrirFormulaireReport() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  configurerOptionsStatut("modification");
  remplirFormulaire(etat.seanceSelectionnee);
  definirValeurSelectionnee(elements.statutCheckboxes, "reportee");
  definirSousTitreModalSeance(
    `Ancien créneau : ${formatDate(etat.seanceSelectionnee.date)}, ${construirePlageHoraire(
      etat.seanceSelectionnee
    )}. Choisissez une nouvelle date et une nouvelle heure.`
  );
  elements.date.value = "";
  definirHeureDebutSelectionnee("");
  elements.seanceModalTitle.textContent = "Reporter la séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
}

function remplirFormulaire(seance) {
  elements.seanceId.value = seance.id;
  elements.etudiant.value = seance.etudiant;
  definirValeurSelectionnee(elements.matiereCheckboxes, seance.matiere);
  definirValeurSelectionnee(elements.compteCheckboxes, seance.compte);
  elements.date.value = seance.date;
  elements.heureDebut.value = seance.heure_debut;
  definirDureeSelectionnee(seance.duree_minutes);
  definirValeurSelectionnee(
    elements.statutCheckboxes,
    seance.statut_manuel || seance.statut_seance
  );
  definirHeureDebutSelectionnee(seance.heure_debut);
  definirValeurSelectionnee(elements.essaiCheckboxes, seance.est_essai ? "1" : "0");
  elements.description.value = seance.description || "";
  masquerErreur(elements.seanceFormError);
  viderFichiersSelectionnes();
  mettreAJourHeureFinCalculee();
}

async function gererSoumissionSeance(event) {
  event.preventDefault();
  masquerErreur(elements.seanceFormError);

  const dureeMinutes = recupererDureeSelectionnee();
  const screenshots = Array.from(elements.screenshotsInput.files);
  const donneesSeance = {
    etudiant: elements.etudiant.value.trim(),
    matiere: recupererValeurSelectionnee(elements.matiereCheckboxes),
    compte: recupererValeurSelectionnee(elements.compteCheckboxes),
    est_essai: recupererValeurSelectionnee(elements.essaiCheckboxes),
    date: elements.date.value,
    heure_debut: elements.heureDebut.value,
    duree_minutes: dureeMinutes,
    statut_seance: recupererValeurSelectionnee(elements.statutCheckboxes),
    description: elements.description.value.trim(),
  };
  const heureFinCalculee = calculerHeureFin(donneesSeance.heure_debut, dureeMinutes);

  if (!donneesSeance.matiere) {
    afficherErreur(elements.seanceFormError, "Sélectionnez une matière.");
    return;
  }

  if (!donneesSeance.compte) {
    afficherErreur(elements.seanceFormError, "Sélectionnez un compte.");
    return;
  }

  if (donneesSeance.est_essai === "") {
    afficherErreur(elements.seanceFormError, "Indiquez s'il s'agit d'une séance d'essai.");
    return;
  }

  if (!dureeMinutes) {
    afficherErreur(elements.seanceFormError, "Sélectionnez une durée.");
    return;
  }

  if (!donneesSeance.statut_seance) {
    afficherErreur(elements.seanceFormError, "Sélectionnez un statut.");
    return;
  }

  if (!donneesSeance.date) {
    afficherErreur(elements.seanceFormError, "La date est obligatoire.");
    return;
  }

  if (!estDateIsoValide(donneesSeance.date)) {
    afficherErreur(elements.seanceFormError, "La date est invalide.");
    return;
  }

  if (!elements.heureDebut.value) {
    afficherErreur(elements.seanceFormError, "L'heure de début est obligatoire.");
    return;
  }

  if (!estHeureDebutSeanceValide(donneesSeance.heure_debut)) {
    afficherErreur(
      elements.seanceFormError,
      "L'heure de début doit être choisie par tranches de 30 minutes."
    );
    return;
  }

  if (!heureFinCalculee) {
    afficherErreur(elements.seanceFormError, "La séance ne peut pas dépasser minuit.");
    return;
  }

  if (screenshots.length > 8) {
    afficherErreur(elements.seanceFormError, "Vous pouvez ajouter jusqu'à 8 screenshots.");
    return;
  }

  const mode = elements.seanceForm.dataset.mode || "creation";

  elements.saveSeanceButton.disabled = true;
  elements.saveSeanceButton.textContent =
    mode === "creation" ? "Création..." : "Sauvegarde...";

  try {
    let seance;

    if (mode === "modification") {
      seance = await modifierSeance(elements.seanceId.value, donneesSeance);
    } else {
      seance = await ajouterSeance(donneesSeance);
    }

    if (screenshots.length > 0) {
      try {
        await televerserPhotosDeSeance(seance.id, screenshots);
      } catch (erreurUpload) {
        afficherToast(
          `${mode === "creation" ? "Séance ajoutée" : "Séance mise à jour"}, mais l'ajout des screenshots a échoué : ${erreurUpload.message}`,
          "warning"
        );
      }
    }

    fermerModal(elements.seanceModal);
    await Promise.all([
      chargerSeances({ ouvrirSeanceId: seance.id }),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
    ]);
    afficherToast(
      mode === "creation" ? "Séance ajoutée." : "Séance mise à jour."
    );
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherErreur(elements.seanceFormError, erreur.message);
  } finally {
    elements.saveSeanceButton.disabled = false;
    elements.saveSeanceButton.textContent =
      mode === "creation" ? "Enregistrer" : "Sauvegarder";
  }
}

async function ouvrirDetailSeance(seance) {
  etat.seanceSelectionnee = seance;
  elements.detailTitle.textContent = seance.libelle;
  elements.detailStudent.textContent = seance.etudiant;
  elements.detailSubject.textContent = seance.matiere;
  elements.detailAccount.textContent = seance.compte;
  elements.detailDate.textContent = formatDate(seance.date);
  elements.detailTime.textContent = construirePlageHoraire(seance);
  elements.detailDuration.textContent = seance.duree_label || "-";
  elements.detailTrial.textContent = seance.essai_label || "Non";
  elements.detailCreatedBy.textContent = seance.cree_par_nom || "Inconnu";
  elements.detailUpdatedBy.textContent = seance.modifie_par_nom || "Inconnu";
  elements.detailCreatedAt.textContent = formatDateHeure(seance.created_at);
  elements.detailUpdatedAt.textContent = formatDateHeure(seance.updated_at);
  elements.detailDescription.textContent =
    seance.description || "Aucune description.";

  definirBadge(
    elements.detailStatusBadge,
    seance.statut_seance,
    libellesStatutSeance[seance.statut_seance]
  );
  mettreEnEtatActionsRapides();
  elements.detailPhotoCount.textContent = "...";
  elements.detailPhotos.innerHTML = '<div class="empty-state">Chargement des screenshots...</div>';

  ouvrirModal(elements.detailModal);

  try {
    const photos = await recupererPhotosDeSeance(seance.id);
    afficherScreenshots(photos);
  } catch (erreur) {
    if (erreur.status === 401) {
      fermerModal(elements.detailModal);
      await gererDeconnexion();
      return;
    }

    elements.detailPhotoCount.textContent = "0";
    elements.detailPhotos.innerHTML = `<div class="empty-state">${erreur.message}</div>`;
  }
}

function mettreEnEtatActionsRapides() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  elements.quickStatusButtons.forEach((bouton) => {
    bouton.disabled =
      bouton.dataset.status !== "reportee" &&
      bouton.dataset.status === etat.seanceSelectionnee.statut_seance;
  });
}

async function gererChangementStatut(nouveauStatut) {
  if (!etat.seanceSelectionnee) {
    return;
  }

  try {
    await changerStatutSeance(etat.seanceSelectionnee.id, nouveauStatut);
    await Promise.all([
      chargerSeances({ ouvrirSeanceId: etat.seanceSelectionnee.id }),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
    ]);
    afficherToast("Statut de la séance mis à jour.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

async function gererSuppressionSeance() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  const confirmation = window.confirm(
    `Supprimer définitivement la séance "${etat.seanceSelectionnee.libelle}" ?`
  );

  if (!confirmation) {
    return;
  }

  try {
    await supprimerSeance(etat.seanceSelectionnee.id);
    fermerModal(elements.detailModal);
    await Promise.all([
      chargerSeances(),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
    ]);
    afficherToast("Séance supprimée.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function afficherScreenshots(photos) {
  elements.detailPhotoCount.textContent = String(photos.length);

  if (photos.length === 0) {
    elements.detailPhotos.innerHTML =
      '<div class="empty-state">Aucun screenshot pour cette séance.</div>';
    return;
  }

  elements.detailPhotos.innerHTML = "";

  photos.forEach((photo) => {
    const carte = document.createElement("button");
    carte.type = "button";
    carte.className = "photo-card";
    carte.addEventListener("click", () => {
      ouvrirVisionneuseScreenshot(photo);
    });

    const image = document.createElement("img");
    image.src = photo.chemin_fichier;
    image.alt = photo.nom_fichier;
    image.loading = "lazy";

    const legende = document.createElement("span");
    legende.textContent = photo.nom_fichier;

    carte.append(image, legende);
    elements.detailPhotos.appendChild(carte);
  });
}

function ouvrirVisionneuseScreenshot(photo) {
  elements.previewTitle.textContent = "Screenshot";
  elements.previewImage.src = photo.chemin_fichier;
  elements.previewImage.alt = photo.nom_fichier;
  elements.previewFilename.textContent = photo.nom_fichier;
  elements.previewDownload.href = photo.chemin_fichier;
  elements.previewDownload.download = photo.nom_fichier;
  ouvrirModal(elements.screenshotPreviewModal);
}

function afficherFichiersSelectionnes() {
  const fichiers = Array.from(elements.screenshotsInput.files);
  elements.selectedFiles.innerHTML = "";

  if (fichiers.length === 0) {
    return;
  }

  fichiers.forEach((fichier) => {
    const balise = document.createElement("span");
    balise.className = "file-pill";
    balise.textContent = fichier.name;
    elements.selectedFiles.appendChild(balise);
  });
}

function viderFichiersSelectionnes() {
  elements.screenshotsInput.value = "";
  elements.selectedFiles.innerHTML = "";
}

function recupererDureeSelectionnee() {
  const valeur = recupererValeurSelectionnee(elements.dureeCheckboxes);
  return valeur ? Number(valeur) : 0;
}

function configurerOptionsStatut(mode) {
  const creationSeulement = mode === "creation";

  elements.statusOptions.forEach((option) => {
    const checkbox = option.querySelector(".statut-checkbox");
    const estEditionSeulement = option.classList.contains("status-option-edit-only");

    if (!checkbox || !estEditionSeulement) {
      return;
    }

    option.classList.toggle("hidden", creationSeulement);
    checkbox.disabled = creationSeulement;

    if (creationSeulement) {
      checkbox.checked = false;
    }
  });

  if (
    creationSeulement &&
    !["planifiee", "faite"].includes(recupererValeurSelectionnee(elements.statutCheckboxes))
  ) {
    definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  }
}

function definirDureeSelectionnee(dureeMinutes) {
  definirValeurSelectionnee(elements.dureeCheckboxes, String(dureeMinutes));
}

function definirHeureDebutSelectionnee(heureDebut) {
  if (!estHeureValide(heureDebut)) {
    elements.heureDebutHourSelect.value = heuresDebutDisponibles[0];
    elements.heureDebutMinuteSelect.value = minutesDebutDisponibles[0];
    elements.heureDebut.value = "";
    mettreAJourHeureFinCalculee();
    return;
  }

  const [heure, minute] = heureDebut.split(":");

  elements.heureDebutHourSelect.value = heure;
  elements.heureDebutMinuteSelect.value = minute;
  elements.heureDebut.value = `${heure}:${minute}`;
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureDebutSelectionnee() {
  const heure = elements.heureDebutHourSelect.value;
  const minute = elements.heureDebutMinuteSelect.value;

  elements.heureDebut.value = heure && minute ? `${heure}:${minute}` : "";
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureFinCalculee() {
  const heureDebut = elements.heureDebut.value;
  const dureeMinutes = recupererDureeSelectionnee();

  if (!heureDebut || !dureeMinutes) {
    elements.heureFinCalculee.value = "";
    return;
  }

  elements.heureFinCalculee.value = calculerHeureFin(heureDebut, dureeMinutes);
}

function calculerHeureFin(heureDebut, dureeMinutes) {
  if (!estHeureValide(heureDebut)) {
    return "";
  }

  const [heures, minutes] = heureDebut.split(":").map(Number);
  const totalMinutes = heures * 60 + minutes + Number(dureeMinutes);

  if (totalMinutes > 24 * 60) {
    return "";
  }

  const heuresFin = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutesFin = String(totalMinutes % 60).padStart(2, "0");
  return `${heuresFin}:${minutesFin}`;
}

function calculerDureeMinutesDepuisHeures(heureDebut, heureFin) {
  if (!estHeureValide(heureDebut) || !estHeureValide(heureFin)) {
    return 0;
  }

  const [heuresDebut, minutesDebut] = heureDebut.split(":").map(Number);
  const [heuresFin, minutesFin] = heureFin.split(":").map(Number);
  const totalDebut = heuresDebut * 60 + minutesDebut;
  const totalFin = heuresFin * 60 + minutesFin;
  const difference = totalFin - totalDebut;

  return difference > 0 ? difference : 0;
}

function formaterDureeHistorique(dureeMinutes) {
  if (!dureeMinutes) {
    return "-";
  }

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

function recupererHeureDebutParDefaut() {
  const maintenant = new Date();
  let heures = maintenant.getHours();
  let minutes = maintenant.getMinutes() <= 30 ? 30 : 0;

  if (minutes === 0) {
    heures += 1;
  }

  if (heures > 23) {
    return "23:30";
  }

  return `${String(heures).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function attacherSelectionUnique(checkboxes, callback) {
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        checkboxes.forEach((autreCheckbox) => {
          if (autreCheckbox !== checkbox) {
            autreCheckbox.checked = false;
          }
        });
      }

      if (callback) {
        callback();
      }
    });
  });
}

function recupererValeurSelectionnee(checkboxes) {
  const checkboxSelectionnee = checkboxes.find((checkbox) => checkbox.checked);
  return checkboxSelectionnee ? checkboxSelectionnee.value : "";
}

function definirValeurSelectionnee(checkboxes, valeur) {
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checkbox.value === valeur;
  });
}

function definirSousTitreModalSeance(message) {
  elements.seanceModalSubtitle.textContent = message;
  elements.seanceModalSubtitle.classList.toggle("hidden", !message);
}

function ouvrirModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function fermerModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  if (modal === elements.seanceModal) {
    elements.seanceForm.reset();
    masquerErreur(elements.seanceFormError);
    definirSousTitreModalSeance("");
    viderFichiersSelectionnes();
    elements.heureFinCalculee.value = "";
    elements.heureDebut.value = "";
    elements.heureDebutHourSelect.value = heuresDebutDisponibles[0];
    elements.heureDebutMinuteSelect.value = minutesDebutDisponibles[0];
  }

  if (modal === elements.screenshotPreviewModal) {
    elements.previewImage.src = "";
    elements.previewImage.alt = "";
    elements.previewFilename.textContent = "-";
    elements.previewDownload.href = "#";
    elements.previewDownload.removeAttribute("download");
  }

  if (
    elements.seanceModal.classList.contains("hidden") &&
    elements.detailModal.classList.contains("hidden") &&
    elements.screenshotPreviewModal.classList.contains("hidden")
  ) {
    document.body.classList.remove("modal-open");
  }
}

function afficherErreur(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function masquerErreur(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function definirBadge(element, type, texte) {
  element.className = "status-badge";
  element.classList.add(`badge-${type}`);
  element.textContent = texte;
}

function afficherToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}

function formatDate(date) {
  if (!estDateIsoValide(date)) {
    return date || "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatDateHeure(dateHeure) {
  if (!dateHeure) {
    return "-";
  }

  const dateNormalisee =
    typeof dateHeure === "string" ? dateHeure.replace(" ", "T") : dateHeure;
  const dateObjet = new Date(dateNormalisee);

  if (Number.isNaN(dateObjet.getTime())) {
    return String(dateHeure);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateObjet);
}

function formatDateHeureSecondes(dateHeure) {
  if (!dateHeure) {
    return "-";
  }

  const dateNormalisee =
    typeof dateHeure === "string" ? dateHeure.replace(" ", "T") : dateHeure;
  const dateObjet = new Date(dateNormalisee);

  if (Number.isNaN(dateObjet.getTime())) {
    return String(dateHeure);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(dateObjet);
}

function estDansSemaineCourante(dateIso) {
  if (!estDateIsoValide(dateIso)) {
    return false;
  }

  const maintenant = new Date();
  const debut = new Date(maintenant);
  const jour = (debut.getDay() + 6) % 7;
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - jour);

  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 7);

  const date = new Date(`${dateIso}T12:00:00`);
  return date >= debut && date < fin;
}

function construirePlageHoraire(seance) {
  const heureDebutValide = estHeureValide(seance.heure_debut);
  const heureFinValide = estHeureValide(seance.heure_fin);

  if (heureDebutValide && heureFinValide) {
    return `${seance.heure_debut} - ${seance.heure_fin}`;
  }

  if (heureDebutValide) {
    return seance.heure_debut;
  }

  return "-";
}
