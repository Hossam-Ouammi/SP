import {
  connecterUtilisateur,
  changerMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurCourant,
} from "./auth.js";
import {
  recupererVueAdministration,
  ajouterElementCatalogueAdmin,
  creerUtilisateurAdmin,
  supprimerUtilisateurAdmin,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  revoquerSessionsUtilisateurAdmin,
  revoquerSessionAdmin,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
} from "./admin.js";
import {
  recupererSeances,
  recupererOptionsSeances,
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
  "parent",
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
  parent: "Parent",
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
const matieresParDefaut = ["Maths", "Physique chimie", "Python", "C++"];
const comptesParDefaut = ["Abdo", "Yassine"];
const cleConnexionMemorisee = "gestion-seances-connexion-memorisee";
const etat = {
  utilisateur: null,
  seances: [],
  historique: [],
  monetisation: null,
  administration: null,
  catalogue: {
    matieres: [...matieresParDefaut],
    comptes: [...comptesParDefaut],
  },
  historiqueSelection: null,
  seanceSelectionnee: null,
  calendrier: null,
  sectionActive: "aujourdhui",
};

const elements = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  loginShowPassword: document.getElementById("login-show-password"),
  loginRemember: document.getElementById("login-remember"),
  loginError: document.getElementById("login-error"),
  loginButton: document.getElementById("login-button"),
  logoutButton: document.getElementById("logout-button"),
  addSeanceButton: document.getElementById("add-seance-button"),
  navTabs: Array.from(document.querySelectorAll(".nav-tab")),
  todaySection: document.getElementById("aujourdhui-section"),
  dashboardSection: document.getElementById("dashboard-section"),
  statistiquesSection: document.getElementById("statistiques-section"),
  utilisateurSection: document.getElementById("utilisateur-section"),
  monetisationSection: document.getElementById("monetisation-section"),
  historiqueSection: document.getElementById("historique-section"),
  todayDateLabel: document.getElementById("today-date-label"),
  todayCount: document.getElementById("today-count"),
  todayList: document.getElementById("today-list"),
  currentUserName: document.getElementById("current-user-name"),
  adminPanelTitle: document.getElementById("admin-panel-title"),
  adminPanelNote: document.getElementById("admin-panel-note"),
  adminGuideTitle: document.getElementById("admin-guide-title"),
  adminGuideNote: document.getElementById("admin-guide-note"),
  userUsername: document.getElementById("user-username"),
  userRoleBadge: document.getElementById("user-role-badge"),
  userAccessBadge: document.getElementById("user-access-badge"),
  userAdminAccess: document.getElementById("user-admin-access"),
  userLastLogin: document.getElementById("user-last-login"),
  userSecurityStatus: document.getElementById("user-security-status"),
  passwordSecurityNotice: document.getElementById("password-security-notice"),
  adminToolsPanel: document.getElementById("admin-tools-panel"),
  userPasswordForm: document.getElementById("user-password-form"),
  userPasswordError: document.getElementById("user-password-error"),
  currentPassword: document.getElementById("current-password"),
  newPassword: document.getElementById("new-password"),
  confirmPassword: document.getElementById("confirm-password"),
  savePasswordButton: document.getElementById("save-password-button"),
  adminTotalUsers: document.getElementById("admin-total-users"),
  adminActiveUsers: document.getElementById("admin-active-users"),
  adminReadonlyUsers: document.getElementById("admin-readonly-users"),
  adminActiveSessions: document.getElementById("admin-active-sessions"),
  adminUsersList: document.getElementById("admin-users-list"),
  adminCreateUserForm: document.getElementById("admin-create-user-form"),
  adminCreateUserName: document.getElementById("admin-new-user-name"),
  adminCreateUserEmail: document.getElementById("admin-new-user-email"),
  adminAddSubjectForm: document.getElementById("admin-add-subject-form"),
  adminNewSubjectName: document.getElementById("admin-new-subject-name"),
  adminSubjectList: document.getElementById("admin-subject-list"),
  adminAddSubjectCurrentPassword: document.getElementById(
    "admin-add-subject-current-password"
  ),
  adminAddSubjectError: document.getElementById("admin-add-subject-error"),
  adminAddSubjectButton: document.getElementById("admin-add-subject-button"),
  adminAddAccountForm: document.getElementById("admin-add-account-form"),
  adminNewAccountName: document.getElementById("admin-new-account-name"),
  adminAccountList: document.getElementById("admin-account-list"),
  adminAddAccountCurrentPassword: document.getElementById(
    "admin-add-account-current-password"
  ),
  adminAddAccountError: document.getElementById("admin-add-account-error"),
  adminAddAccountButton: document.getElementById("admin-add-account-button"),
  adminCreateUserCurrentPassword: document.getElementById(
    "admin-create-user-current-password"
  ),
  adminCreateUserError: document.getElementById("admin-create-user-error"),
  adminCreateUserButton: document.getElementById("admin-create-user-button"),
  adminDeleteUserForm: document.getElementById("admin-delete-user-form"),
  adminDeleteUserId: document.getElementById("admin-delete-user-id"),
  adminDeleteUserCurrentPassword: document.getElementById(
    "admin-delete-user-current-password"
  ),
  adminDeleteUserError: document.getElementById("admin-delete-user-error"),
  adminDeleteUserButton: document.getElementById("admin-delete-user-button"),
  adminResetPasswordForm: document.getElementById("admin-reset-password-form"),
  adminResetUserId: document.getElementById("admin-reset-user-id"),
  adminResetPasswordError: document.getElementById("admin-reset-password-error"),
  adminResetCurrentPassword: document.getElementById("admin-reset-current-password"),
  adminResetPasswordButton: document.getElementById("admin-reset-password-button"),
  adminToggleAccessForm: document.getElementById("admin-toggle-access-form"),
  adminAccessUserId: document.getElementById("admin-access-user-id"),
  adminToggleAccessStatus: document.getElementById("admin-toggle-access-status"),
  adminToggleAccessError: document.getElementById("admin-toggle-access-error"),
  adminToggleAccessCurrentPassword: document.getElementById(
    "admin-toggle-access-current-password"
  ),
  adminToggleAccessButton: document.getElementById("admin-toggle-access-button"),
  adminReadonlyForm: document.getElementById("admin-readonly-form"),
  adminReadonlyUserId: document.getElementById("admin-readonly-user-id"),
  adminReadonlyStatus: document.getElementById("admin-readonly-status"),
  adminReadonlyCurrentPassword: document.getElementById(
    "admin-readonly-current-password"
  ),
  adminReadonlyError: document.getElementById("admin-readonly-error"),
  adminReadonlyButton: document.getElementById("admin-readonly-button"),
  adminMonetisationForm: document.getElementById("admin-monetisation-form"),
  adminMonetisationUserId: document.getElementById("admin-monetisation-user-id"),
  adminMonetisationStatus: document.getElementById("admin-monetisation-status"),
  adminMonetisationCurrentPassword: document.getElementById(
    "admin-monetisation-current-password"
  ),
  adminMonetisationError: document.getElementById("admin-monetisation-error"),
  adminMonetisationButton: document.getElementById("admin-monetisation-button"),
  adminLogoutUserForm: document.getElementById("admin-logout-user-form"),
  adminLogoutUserId: document.getElementById("admin-logout-user-id"),
  adminLogoutCurrentPassword: document.getElementById("admin-logout-current-password"),
  adminLogoutUserError: document.getElementById("admin-logout-user-error"),
  adminLogoutUserButton: document.getElementById("admin-logout-user-button"),
  adminSessionCurrentPassword: document.getElementById("admin-session-current-password"),
  adminSessionError: document.getElementById("admin-session-error"),
  adminSessionsList: document.getElementById("admin-sessions-list"),
  adminClearSeancesForm: document.getElementById("admin-clear-seances-form"),
  adminClearSeancesError: document.getElementById("admin-clear-seances-error"),
  adminClearSeancesCurrentPassword: document.getElementById(
    "admin-clear-seances-current-password"
  ),
  adminClearSeancesButton: document.getElementById("admin-clear-seances-button"),
  adminClearHistoryForm: document.getElementById("admin-clear-history-form"),
  adminClearHistoryError: document.getElementById("admin-clear-history-error"),
  adminClearHistoryCurrentPassword: document.getElementById(
    "admin-clear-history-current-password"
  ),
  adminClearHistoryButton: document.getElementById("admin-clear-history-button"),
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
  monetisationTotalAmount: document.getElementById("monetisation-total-amount"),
  monetisationYassineAmountCard: document.getElementById("monetisation-yassine-amount-card"),
  monetisationAbdoAmountCard: document.getElementById("monetisation-abdo-amount-card"),
  monetisationYassineAmount: document.getElementById("monetisation-yassine-amount"),
  monetisationAbdoAmount: document.getElementById("monetisation-abdo-amount"),
  monetisationYassineRate: document.getElementById("monetisation-yassine-rate"),
  monetisationAbdoRate: document.getElementById("monetisation-abdo-rate"),
  monetisationYassineRateTable: document.getElementById("monetisation-yassine-rate-table"),
  monetisationAbdoRateTable: document.getElementById("monetisation-abdo-rate-table"),
  monetisationYassineBillableCount: document.getElementById(
    "monetisation-yassine-billable-count"
  ),
  monetisationAbdoBillableCount: document.getElementById(
    "monetisation-abdo-billable-count"
  ),
  monetisationYassineBillableCountTable: document.getElementById(
    "monetisation-yassine-billable-count-table"
  ),
  monetisationAbdoBillableCountTable: document.getElementById(
    "monetisation-abdo-billable-count-table"
  ),
  monetisationYassineTrialCount: document.getElementById("monetisation-yassine-trial-count"),
  monetisationAbdoTrialCount: document.getElementById("monetisation-abdo-trial-count"),
  monetisationYassineTrialCountTable: document.getElementById(
    "monetisation-yassine-trial-count-table"
  ),
  monetisationAbdoTrialCountTable: document.getElementById(
    "monetisation-abdo-trial-count-table"
  ),
  monetisationYassineDue: document.getElementById("monetisation-yassine-due"),
  monetisationAbdoDueTable: document.getElementById("monetisation-abdo-due-table"),
  historyCount: document.getElementById("history-count"),
  historyList: document.getElementById("history-list"),
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
  parent: document.getElementById("parent"),
  matiereOptions: document.getElementById("matiere-options"),
  compteOptions: document.getElementById("compte-options"),
  matiereCheckboxes: [],
  compteCheckboxes: [],
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
  detailParent: document.getElementById("detail-parent"),
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

function chargerConnexionMemorisee() {
  try {
    const valeurBrute = window.localStorage.getItem(cleConnexionMemorisee);
    if (!valeurBrute) {
      return null;
    }

    const connexion = JSON.parse(valeurBrute);
    return {
      username: String(connexion?.username || ""),
      motDePasse: String(connexion?.motDePasse || ""),
    };
  } catch (erreur) {
    return null;
  }
}

function enregistrerConnexionMemorisee(username, motDePasse) {
  try {
    window.localStorage.setItem(
      cleConnexionMemorisee,
      JSON.stringify({
        username,
        motDePasse,
      })
    );
  } catch (erreur) {
    // Ignore les environnements ou le stockage local n'est pas disponible.
  }
}

function effacerConnexionMemorisee() {
  try {
    window.localStorage.removeItem(cleConnexionMemorisee);
  } catch (erreur) {
    // Rien a faire.
  }
}

function appliquerConnexionMemorisee() {
  const connexion = chargerConnexionMemorisee();

  if (!connexion) {
    elements.loginRemember.checked = false;
    return;
  }

  elements.loginUsername.value = connexion.username;
  elements.loginPassword.value = connexion.motDePasse;
  elements.loginRemember.checked = Boolean(connexion.username || connexion.motDePasse);
}

function mettreAJourVisibiliteMotDePasseConnexion() {
  elements.loginPassword.type = elements.loginShowPassword.checked ? "text" : "password";
}

function utilisateurDoitChangerMotDePasse() {
  return Number(etat.utilisateur?.doit_changer_mot_de_passe) === 1;
}

function viderDonneesApplication() {
  etat.seances = [];
  etat.historique = [];
  etat.monetisation = null;
  etat.administration = null;
  etat.catalogue = {
    matieres: [...matieresParDefaut],
    comptes: [...comptesParDefaut],
  };
  etat.historiqueSelection = null;
  etat.seanceSelectionnee = null;

  if (etat.calendrier) {
    mettreAJourEvenements(etat.calendrier, []);
  }

  mettreAJourResume();
  afficherListeHistorique();
  viderDetailHistorique();
  viderMonetisation();
  viderAdministration();
  rendreOptionsCatalogueSeance();
}

async function chargerDonneesApplication() {
  if (utilisateurDoitChangerMotDePasse()) {
    viderDonneesApplication();
    return;
  }

  await Promise.all([
    chargerOptionsSeancesDisponibles(),
    chargerSeances(),
    chargerHistorique(),
    chargerMonetisationSiAutorise(),
    chargerAdministrationSiAutorise(),
  ]);
}

async function initialiserApplication() {
  appliquerConnexionMemorisee();
  mettreAJourVisibiliteMotDePasseConnexion();
  initialiserChoixHeureDebut();
  initialiserCatalogueSeanceParDefaut();
  attacherEcouteurs();

  try {
    const utilisateur = await recupererUtilisateurCourant();

    if (utilisateur) {
      etat.utilisateur = utilisateur;
      afficherApplication();
      await chargerDonneesApplication();
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

function normaliserListeCatalogue(valeurs, valeursParDefaut = []) {
  const valeursBrutes = Array.isArray(valeurs) ? valeurs : [];
  const liste = valeursBrutes
    .map((element) =>
      typeof element === "string" ? element : String(element?.valeur || "").trim()
    )
    .map((valeur) => String(valeur || "").trim())
    .filter(Boolean);

  const uniques = Array.from(new Set(liste));
  return uniques.length > 0 ? uniques : [...valeursParDefaut];
}

function obtenirMatieresDisponibles() {
  return normaliserListeCatalogue(etat.catalogue?.matieres, matieresParDefaut);
}

function obtenirComptesDisponibles() {
  return normaliserListeCatalogue(etat.catalogue?.comptes, comptesParDefaut);
}

function obtenirCompteParDefaut() {
  const comptes = obtenirComptesDisponibles();

  if (comptes.includes("Abdo")) {
    return "Abdo";
  }

  return comptes[0] || "";
}

function obtenirMatiereParDefaut() {
  const matieres = obtenirMatieresDisponibles();

  if (matieres.includes("Maths")) {
    return "Maths";
  }

  return matieres[0] || "";
}

function creerOptionCatalogueCheckbox({ nomChamp, classe, valeur }) {
  const etiquette = document.createElement("label");
  etiquette.className = "checkbox-option";

  const checkbox = document.createElement("input");
  checkbox.className = `single-checkbox ${classe}`;
  checkbox.name = nomChamp;
  checkbox.type = "checkbox";
  checkbox.value = valeur;

  const texte = document.createElement("span");
  texte.textContent = valeur;

  etiquette.append(checkbox, texte);
  return etiquette;
}

function rendreOptionsCatalogueSeance() {
  const matiereSelectionnee = recupererValeurSelectionnee(elements.matiereCheckboxes);
  const compteSelectionne = recupererValeurSelectionnee(elements.compteCheckboxes);
  const matieres = obtenirMatieresDisponibles();
  const comptes = obtenirComptesDisponibles();

  elements.matiereOptions.innerHTML = "";
  matieres.forEach((matiere) => {
    elements.matiereOptions.appendChild(
      creerOptionCatalogueCheckbox({
        nomChamp: "matiere",
        classe: "matiere-checkbox",
        valeur: matiere,
      })
    );
  });

  elements.compteOptions.innerHTML = "";
  comptes.forEach((compte) => {
    elements.compteOptions.appendChild(
      creerOptionCatalogueCheckbox({
        nomChamp: "compte",
        classe: "compte-checkbox",
        valeur: compte,
      })
    );
  });

  elements.matiereCheckboxes = Array.from(
    elements.matiereOptions.querySelectorAll(".matiere-checkbox")
  );
  elements.compteCheckboxes = Array.from(
    elements.compteOptions.querySelectorAll(".compte-checkbox")
  );

  attacherSelectionUnique(elements.matiereCheckboxes);
  attacherSelectionUnique(elements.compteCheckboxes);

  definirValeurSelectionnee(
    elements.matiereCheckboxes,
    matieres.includes(matiereSelectionnee) ? matiereSelectionnee : obtenirMatiereParDefaut()
  );
  definirValeurSelectionnee(
    elements.compteCheckboxes,
    comptes.includes(compteSelectionne) ? compteSelectionne : obtenirCompteParDefaut()
  );
}

function initialiserCatalogueSeanceParDefaut() {
  etat.catalogue = {
    matieres: [...matieresParDefaut],
    comptes: [...comptesParDefaut],
  };
  rendreOptionsCatalogueSeance();
}

function attacherEcouteurs() {
  elements.loginForm.addEventListener("submit", gererConnexion);
  elements.loginShowPassword.addEventListener(
    "change",
    mettreAJourVisibiliteMotDePasseConnexion
  );
  elements.loginRemember.addEventListener("change", () => {
    if (!elements.loginRemember.checked) {
      effacerConnexionMemorisee();
    }
  });
  elements.userPasswordForm.addEventListener("submit", gererModificationMotDePasse);
  elements.adminAddSubjectForm.addEventListener("submit", gererAjoutMatiereAdministration);
  elements.adminAddAccountForm.addEventListener("submit", gererAjoutCompteAdministration);
  elements.adminCreateUserForm.addEventListener("submit", gererCreationUtilisateurAdmin);
  elements.adminDeleteUserForm.addEventListener("submit", gererSuppressionUtilisateurAdmin);
  elements.adminResetPasswordForm.addEventListener(
    "submit",
    gererReinitialisationMotDePasseCompte
  );
  elements.adminToggleAccessForm.addEventListener(
    "submit",
    gererMiseAJourAccesUtilisateur
  );
  elements.adminReadonlyForm.addEventListener(
    "submit",
    gererMiseAJourLectureSeuleUtilisateur
  );
  elements.adminMonetisationForm.addEventListener(
    "submit",
    gererMiseAJourAccesMonetisationUtilisateur
  );
  elements.adminLogoutUserForm.addEventListener(
    "submit",
    gererRevoquerSessionsUtilisateur
  );
  elements.adminAccessUserId.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminReadonlyUserId.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminMonetisationUserId.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminLogoutUserId.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminDeleteUserId.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminClearSeancesForm.addEventListener("submit", gererSuppressionToutesLesSeances);
  elements.adminClearHistoryForm.addEventListener(
    "submit",
    gererSuppressionToutHistorique
  );
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
  elements.loginShowPassword.checked = false;
  appliquerConnexionMemorisee();
  mettreAJourVisibiliteMotDePasseConnexion();
  reinitialiserFormulaireUtilisateur();
  elements.passwordSecurityNotice.classList.add("hidden");
  mettreAJourNavigationProtegee();
}

function afficherApplication() {
  elements.loginView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  elements.currentUserName.textContent = etat.utilisateur.nom;
  mettreAJourResumeCompteConnecte();
  elements.adminToolsPanel.classList.toggle("hidden", !utilisateurPeutVoirAdministration());
  mettreAJourPanneauAdministration();
  mettreAJourVueAujourdhui();
  mettreAJourNavigationProtegee();
  afficherSectionApplication(utilisateurDoitChangerMotDePasse() ? "utilisateur" : etat.sectionActive);
}

function initialiserCalendrierSiNecessaire() {
  if (etat.calendrier) {
    return;
  }

  etat.calendrier = initialiserCalendrier(elements.calendar, {
    onDateClick: ouvrirFormulaireCreation,
    onEventClick: ouvrirDetailSeance,
  });

  mettreAJourEvenements(etat.calendrier, etat.seances);
}

function rafraichirCalendrierSiVisible(sectionDemandee = etat.sectionActive) {
  if (sectionDemandee !== "dashboard") {
    return;
  }

  initialiserCalendrierSiNecessaire();

  if (!etat.calendrier) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (typeof etat.calendrier.updateSize === "function") {
        etat.calendrier.updateSize();
      }
    });
  });
}

function afficherSectionApplication(section) {
  let sectionDemandee = section;

  if (utilisateurDoitChangerMotDePasse()) {
    sectionDemandee = "utilisateur";
  } else if (section === "aujourdhui" && !utilisateurPeutVoirAujourdhui()) {
    sectionDemandee = "dashboard";
  } else if (section === "monetisation" && !utilisateurPeutVoirMonetisation()) {
    sectionDemandee = utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard";
  }

  etat.sectionActive = sectionDemandee;

  const cartes = {
    aujourdhui: elements.todaySection,
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

  if (sectionDemandee === "utilisateur") {
    mettreAJourResumeCompteConnecte();
    if (utilisateurPeutVoirAdministration()) {
      chargerAdministrationSiAutorise();
    }
  }

  rafraichirCalendrierSiVisible(sectionDemandee);
}

function utilisateurEstHossam() {
  return String(etat.utilisateur?.email || "").trim().toLowerCase() === "hossam@test.com";
}

function utilisateurEstAdministrateur() {
  return Number(etat.utilisateur?.est_admin) === 1 || utilisateurEstHossam();
}

function utilisateurPeutVoirAdministration() {
  return utilisateurEstAdministrateur() && !utilisateurDoitChangerMotDePasse();
}

function utilisateurPeutVoirMonetisation() {
  return utilisateurEstHossam() || Number(etat.utilisateur?.peut_voir_monetisation) === 1;
}

function utilisateurPeutVoirAujourdhui() {
  return utilisateurEstHossam();
}

function utilisateurEstEnLectureSeule() {
  return !utilisateurPeutVoirAdministration() && Number(etat.utilisateur?.mode_lecture_seule) === 1;
}

function utilisateurPeutModifierDonnees() {
  return !utilisateurDoitChangerMotDePasse() && !utilisateurEstEnLectureSeule();
}

function mettreAJourNavigationProtegee() {
  const motDePasseAChanger = utilisateurDoitChangerMotDePasse();
  const lectureSeule = utilisateurEstEnLectureSeule();

  elements.addSeanceButton.classList.toggle("hidden", motDePasseAChanger || lectureSeule);
  elements.addSeanceButton.disabled = motDePasseAChanger || lectureSeule;

  elements.navTabs.forEach((bouton) => {
    const section = bouton.dataset.sectionTarget;

    if (motDePasseAChanger) {
      bouton.classList.toggle("hidden", section !== "utilisateur");
      return;
    }

    if (section === "monetisation") {
      bouton.classList.toggle("hidden", !utilisateurPeutVoirMonetisation());
      return;
    }

    if (section === "aujourdhui") {
      bouton.classList.toggle("hidden", !utilisateurPeutVoirAujourdhui());
      return;
    }

    bouton.classList.remove("hidden");
  });
}

function reinitialiserFormulaireUtilisateur() {
  elements.userPasswordForm.reset();
  masquerErreur(elements.userPasswordError);
  elements.adminCreateUserForm.reset();
  masquerErreur(elements.adminCreateUserError);
  elements.adminDeleteUserForm.reset();
  masquerErreur(elements.adminDeleteUserError);
  elements.adminResetPasswordForm.reset();
  masquerErreur(elements.adminResetPasswordError);
  elements.adminToggleAccessForm.reset();
  masquerErreur(elements.adminToggleAccessError);
  elements.adminReadonlyForm.reset();
  masquerErreur(elements.adminReadonlyError);
  elements.adminMonetisationForm.reset();
  masquerErreur(elements.adminMonetisationError);
  elements.adminLogoutUserForm.reset();
  masquerErreur(elements.adminLogoutUserError);
  elements.adminSessionCurrentPassword.value = "";
  masquerErreur(elements.adminSessionError);
  elements.adminClearSeancesForm.reset();
  masquerErreur(elements.adminClearSeancesError);
  elements.adminClearHistoryForm.reset();
  masquerErreur(elements.adminClearHistoryError);
}

function definirBadgeAdmin(element, texte, type) {
  element.className = "admin-status-badge";
  if (type) {
    element.classList.add(`admin-status-badge-${type}`);
  }
  element.textContent = texte;
}

function mettreAJourResumeCompteConnecte() {
  const estAdministrateur = utilisateurEstAdministrateur();
  const accesActif = Number(etat.utilisateur?.acces_active) === 1;
  const motDePasseAChanger = utilisateurDoitChangerMotDePasse();
  const boutonUtilisateur = elements.navTabs.find(
    (bouton) => bouton.dataset.sectionTarget === "utilisateur"
  );
  const lectureSeule = utilisateurEstEnLectureSeule();
  const badgesIdentite = elements.userRoleBadge?.parentElement || null;
  const carteOutilsSensibles = elements.userAdminAccess?.closest(".admin-identity-stat") || null;
  const statsIdentite = carteOutilsSensibles?.parentElement || null;

  elements.userUsername.textContent = etat.utilisateur?.nom || "-";
  elements.userSecurityStatus.textContent = motDePasseAChanger
    ? "Mot de passe temporaire detecte. Changez-le pour debloquer l'application."
    : lectureSeule
      ? "Compte securise en lecture seule. Les modifications sont bloquees."
      : estAdministrateur
        ? "Compte securise. Vous pouvez gerer votre acces depuis ce panneau."
        : "Compte securise. Vous pouvez modifier votre mot de passe depuis cet espace.";
  elements.passwordSecurityNotice.classList.toggle("hidden", !motDePasseAChanger);
  elements.userAdminAccess.textContent = utilisateurPeutVoirAdministration() ? "Oui" : "Non";
  elements.userLastLogin.textContent = etat.utilisateur?.dernier_login_at
    ? formatDateHeureSecondes(etat.utilisateur.dernier_login_at)
    : "Jamais";
  elements.adminPanelTitle.textContent = estAdministrateur ? "Admin panel" : "User admin";
  elements.adminPanelNote.textContent = estAdministrateur
    ? "Securite du compte et outils de controle reserves a Hossam."
    : "Securite du compte et modification du mot de passe.";
  elements.adminGuideTitle.textContent = estAdministrateur
    ? "Controle global"
    : "Espace utilisateur";
  elements.adminGuideNote.textContent = estAdministrateur
    ? "Ajout d'utilisateurs, sessions actives, lecture seule et actions sensibles sont centralises ici."
    : "Modifiez votre mot de passe et consultez votre derniere connexion depuis cet espace.";

  if (boutonUtilisateur) {
    boutonUtilisateur.textContent = estAdministrateur ? "Admin panel" : "User admin";
  }

  definirBadgeAdmin(
    elements.userRoleBadge,
    estAdministrateur ? "Admin" : "User",
    estAdministrateur ? "admin" : "user"
  );
  definirBadgeAdmin(
    elements.userAccessBadge,
    accesActif ? "Acces actif" : "Suspendu",
    accesActif ? "active" : "suspended"
  );

  if (badgesIdentite) {
    badgesIdentite.classList.toggle("hidden", !estAdministrateur);
  }

  if (carteOutilsSensibles) {
    carteOutilsSensibles.classList.toggle("hidden", !estAdministrateur);
  }

  if (statsIdentite) {
    statsIdentite.classList.toggle("admin-identity-stats-single", !estAdministrateur);
  }
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

    if (elements.loginRemember.checked) {
      enregistrerConnexionMemorisee(
        elements.loginUsername.value.trim(),
        elements.loginPassword.value
      );
    } else {
      effacerConnexionMemorisee();
    }

    etat.utilisateur = utilisateur;
    afficherApplication();
    await chargerDonneesApplication();
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
    viderDonneesApplication();
    etat.sectionActive = "aujourdhui";
    afficherConnexion();
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
    const resultat = await changerMotDePasse(motDePasseActuel, nouveauMotDePasse);
    etat.utilisateur = resultat.utilisateur;
    reinitialiserFormulaireUtilisateur();
    afficherApplication();
    await chargerDonneesApplication();
    afficherSectionApplication("aujourdhui");
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

async function gererCreationUtilisateurAdmin(event) {
  event.preventDefault();
  masquerErreur(elements.adminCreateUserError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  elements.adminCreateUserButton.disabled = true;
  elements.adminCreateUserButton.textContent = "Creation...";

  try {
    const resultat = await creerUtilisateurAdmin({
      nom: elements.adminCreateUserName.value.trim(),
      email: elements.adminCreateUserEmail.value.trim(),
      mot_de_passe_actuel: elements.adminCreateUserCurrentPassword.value,
    });
    elements.adminCreateUserForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Utilisateur ajoute.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminCreateUserError, erreur.message);
  } finally {
    elements.adminCreateUserButton.disabled = false;
    elements.adminCreateUserButton.textContent = "Ajouter l'utilisateur";
  }
}

async function gererSuppressionUtilisateurAdmin(event) {
  event.preventDefault();
  masquerErreur(elements.adminDeleteUserError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminDeleteUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminDeleteUserError, "Selectionnez un compte valide.");
    return;
  }

  const confirmation = window.confirm(
    `Supprimer definitivement le compte ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminDeleteUserButton.disabled = true;
  elements.adminDeleteUserButton.textContent = "Suppression...";

  try {
    const resultat = await supprimerUtilisateurAdmin(
      utilisateurId,
      elements.adminDeleteUserCurrentPassword.value
    );
    elements.adminDeleteUserForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Utilisateur supprime.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminDeleteUserError, erreur.message);
  } finally {
    elements.adminDeleteUserButton.disabled = false;
    elements.adminDeleteUserButton.textContent = "Supprimer l'utilisateur";
    mettreAJourControlesAdministration();
  }
}

async function gererAjoutElementCatalogueAdministration({
  type,
  valeur,
  motDePasseActuel,
  form,
  erreurElement,
  bouton,
  libelleChargement,
  libelleBouton,
  messageSucces,
}) {
  masquerErreur(erreurElement);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  bouton.disabled = true;
  bouton.textContent = libelleChargement;

  try {
    const resultat = await ajouterElementCatalogueAdmin(type, valeur, motDePasseActuel);
    form.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || messageSucces);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(erreurElement, erreur.message);
  } finally {
    bouton.disabled = false;
    bouton.textContent = libelleBouton;
  }
}

async function gererAjoutMatiereAdministration(event) {
  event.preventDefault();

  await gererAjoutElementCatalogueAdministration({
    type: "matiere",
    valeur: elements.adminNewSubjectName.value.trim(),
    motDePasseActuel: elements.adminAddSubjectCurrentPassword.value,
    form: elements.adminAddSubjectForm,
    erreurElement: elements.adminAddSubjectError,
    bouton: elements.adminAddSubjectButton,
    libelleChargement: "Ajout...",
    libelleBouton: "Ajouter la matière",
    messageSucces: "Matière ajoutée.",
  });
}

async function gererAjoutCompteAdministration(event) {
  event.preventDefault();

  await gererAjoutElementCatalogueAdministration({
    type: "compte",
    valeur: elements.adminNewAccountName.value.trim(),
    motDePasseActuel: elements.adminAddAccountCurrentPassword.value,
    form: elements.adminAddAccountForm,
    erreurElement: elements.adminAddAccountError,
    bouton: elements.adminAddAccountButton,
    libelleChargement: "Ajout...",
    libelleBouton: "Ajouter le compte",
    messageSucces: "Compte ajouté.",
  });
}

async function gererReinitialisationMotDePasseCompte(event) {
  event.preventDefault();
  masquerErreur(elements.adminResetPasswordError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminResetUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminResetPasswordError, "Selectionnez un compte valide.");
    return;
  }

  const confirmation = window.confirm(
    `Reinitialiser le mot de passe de ${compte.nom} a 123456 ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminResetPasswordButton.disabled = true;
  elements.adminResetPasswordButton.textContent = "Reinitialisation...";

  try {
    const resultat = await reinitialiserMotDePasseCompte(
      utilisateurId,
      elements.adminResetCurrentPassword.value
    );
    elements.adminResetPasswordForm.reset();

    if (resultat.must_reauthenticate) {
      await deconnecterUtilisateur().catch(() => {});
      etat.utilisateur = null;
      viderDonneesApplication();
      etat.sectionActive = "utilisateur";
      afficherConnexion();
      afficherToast("Votre mot de passe a ete reinitialise a 123456. Reconnectez-vous.");
      return;
    }

    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Mot de passe reinitialise.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminResetPasswordError, erreur.message);
  } finally {
    elements.adminResetPasswordButton.disabled = false;
    elements.adminResetPasswordButton.textContent = "Reinitialiser le mot de passe";
  }
}

async function gererMiseAJourAccesUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminToggleAccessError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminAccessUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminToggleAccessError, "Selectionnez un compte valide.");
    return;
  }

  const nouvelAccesActif = Number(compte.acces_active) !== 1;
  const confirmation = window.confirm(
    nouvelAccesActif
      ? `Reactiver l'acces de ${compte.nom} ?`
      : `Suspendre immediatement l'acces de ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminToggleAccessButton.disabled = true;
  elements.adminToggleAccessButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourAccesCompte(
      utilisateurId,
      nouvelAccesActif,
      elements.adminToggleAccessCurrentPassword.value
    );
    elements.adminToggleAccessForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminToggleAccessError, erreur.message);
  } finally {
    elements.adminToggleAccessButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}

async function gererMiseAJourLectureSeuleUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminReadonlyError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminReadonlyUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminReadonlyError, "Selectionnez un compte valide.");
    return;
  }

  const nouveauModeLectureSeule = Number(compte.mode_lecture_seule) !== 1;
  const confirmation = window.confirm(
    nouveauModeLectureSeule
      ? `Passer ${compte.nom} en lecture seule ?`
      : `Autoriser de nouveau ${compte.nom} a modifier les donnees ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminReadonlyButton.disabled = true;
  elements.adminReadonlyButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourLectureSeuleCompte(
      utilisateurId,
      nouveauModeLectureSeule,
      elements.adminReadonlyCurrentPassword.value
    );
    elements.adminReadonlyForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminReadonlyError, erreur.message);
  } finally {
    elements.adminReadonlyButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}

async function gererMiseAJourAccesMonetisationUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminMonetisationError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminMonetisationUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminMonetisationError, "Selectionnez un compte valide.");
    return;
  }

  const nouvelAccesMonetisation = Number(compte.peut_voir_monetisation) !== 1;
  const confirmation = window.confirm(
    nouvelAccesMonetisation
      ? `Afficher le menu Monetisation a ${compte.nom} ?`
      : `Masquer le menu Monetisation pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminMonetisationButton.disabled = true;
  elements.adminMonetisationButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourAccesMonetisationCompte(
      utilisateurId,
      nouvelAccesMonetisation,
      elements.adminMonetisationCurrentPassword.value
    );
    elements.adminMonetisationForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminMonetisationError, erreur.message);
  } finally {
    elements.adminMonetisationButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}

async function gererRevoquerSessionsUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminLogoutUserError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminLogoutUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminLogoutUserError, "Selectionnez un compte valide.");
    return;
  }

  const confirmation = window.confirm(
    `Fermer toutes les sessions actives de ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminLogoutUserButton.disabled = true;
  elements.adminLogoutUserButton.textContent = "Deconnexion...";

  try {
    const resultat = await revoquerSessionsUtilisateurAdmin(
      utilisateurId,
      elements.adminLogoutCurrentPassword.value
    );
    elements.adminLogoutUserForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminLogoutUserError, erreur.message);
  } finally {
    elements.adminLogoutUserButton.disabled = false;
    elements.adminLogoutUserButton.textContent = "Couper les sessions";
  }
}

async function gererRevoquerSessionIndividuelle(sessionId) {
  masquerErreur(elements.adminSessionError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const motDePasseActuel = elements.adminSessionCurrentPassword.value;

  if (!motDePasseActuel) {
    afficherErreur(
      elements.adminSessionError,
      "Entrez votre mot de passe actuel pour fermer une session."
    );
    return;
  }

  const confirmation = window.confirm("Fermer cette session ?");

  if (!confirmation) {
    return;
  }

  try {
    const resultat = await revoquerSessionAdmin(sessionId, motDePasseActuel);

    if (resultat.must_reauthenticate) {
      await deconnecterUtilisateur().catch(() => {});
      etat.utilisateur = null;
      viderDonneesApplication();
      afficherConnexion();
      afficherToast("Votre session actuelle a ete fermee.");
      return;
    }

    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminSessionError, erreur.message);
  }
}

async function gererSuppressionToutesLesSeances(event) {
  event.preventDefault();
  masquerErreur(elements.adminClearSeancesError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const confirmation = window.confirm(
    "Supprimer definitivement toutes les seances et tous les screenshots ?"
  );

  if (!confirmation) {
    return;
  }

  elements.adminClearSeancesButton.disabled = true;
  elements.adminClearSeancesButton.textContent = "Suppression...";

  try {
    const resultat = await supprimerToutesLesSeancesAdmin(
      elements.adminClearSeancesCurrentPassword.value
    );
    elements.adminClearSeancesForm.reset();

    if (!elements.detailModal.classList.contains("hidden")) {
      fermerModal(elements.detailModal);
    }

    if (!elements.seanceModal.classList.contains("hidden")) {
      fermerModal(elements.seanceModal);
    }

    if (!elements.screenshotPreviewModal.classList.contains("hidden")) {
      fermerModal(elements.screenshotPreviewModal);
    }

    etat.seanceSelectionnee = null;

    await Promise.all([
      chargerSeances(),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
      chargerAdministrationSiAutorise(),
    ]);
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminClearSeancesError, erreur.message);
  } finally {
    elements.adminClearSeancesButton.disabled = false;
    elements.adminClearSeancesButton.textContent = "Supprimer toutes les seances";
  }
}

async function gererSuppressionToutHistorique(event) {
  event.preventDefault();
  masquerErreur(elements.adminClearHistoryError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const confirmation = window.confirm(
    "Supprimer tout l'historique des actions ?"
  );

  if (!confirmation) {
    return;
  }

  elements.adminClearHistoryButton.disabled = true;
  elements.adminClearHistoryButton.textContent = "Suppression...";

  try {
    const resultat = await supprimerToutHistoriqueAdmin(
      elements.adminClearHistoryCurrentPassword.value
    );
    elements.adminClearHistoryForm.reset();
    await Promise.all([chargerHistorique(), chargerAdministrationSiAutorise()]);
    afficherToast(resultat.message);
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(elements.adminClearHistoryError, erreur.message);
  } finally {
    elements.adminClearHistoryButton.disabled = false;
    elements.adminClearHistoryButton.textContent = "Supprimer tout l'historique";
  }
}

async function chargerSeances(options = {}) {
  const seances = await recupererSeances();
  etat.seances = seances;
  mettreAJourEvenements(etat.calendrier, seances);
  mettreAJourResume();
  rafraichirCalendrierSiVisible();

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
      afficherSectionApplication(utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard");
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

async function chargerAdministrationSiAutorise() {
  if (!utilisateurPeutVoirAdministration()) {
    etat.administration = null;
    viderAdministration();
    return;
  }

  try {
    etat.administration = await recupererVueAdministration();
    if (etat.administration?.catalogue) {
      etat.catalogue = {
        matieres: normaliserListeCatalogue(
          etat.administration.catalogue.matieres,
          matieresParDefaut
        ),
        comptes: normaliserListeCatalogue(
          etat.administration.catalogue.comptes,
          comptesParDefaut
        ),
      };
      rendreOptionsCatalogueSeance();
    }
    mettreAJourPanneauAdministration();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      etat.administration = null;
      viderAdministration();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

async function chargerOptionsSeancesDisponibles() {
  try {
    const options = await recupererOptionsSeances();
    etat.catalogue = {
      matieres: normaliserListeCatalogue(options?.matieres, matieresParDefaut),
      comptes: normaliserListeCatalogue(options?.comptes, comptesParDefaut),
    };
    rendreOptionsCatalogueSeance();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    etat.catalogue = {
      matieres: [...matieresParDefaut],
      comptes: [...comptesParDefaut],
    };
    rendreOptionsCatalogueSeance();
  }
}

function mettreAJourResume() {
  elements.totalCount.textContent = String(etat.seances.length);
  mettreAJourVueAujourdhui();

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

function obtenirComptesAdministration() {
  return Array.isArray(etat.administration?.comptes) ? etat.administration.comptes : [];
}

function obtenirCatalogueAdministration(type) {
  if (!etat.administration?.catalogue) {
    return [];
  }

  return Array.isArray(etat.administration.catalogue[type])
    ? etat.administration.catalogue[type]
    : [];
}

function obtenirCompteAdministrationParId(utilisateurId) {
  return (
    obtenirComptesAdministration().find(
      (compte) => Number(compte.id) === Number(utilisateurId)
    ) || null
  );
}

function obtenirComptesCiblables(options = {}) {
  const exclureUtilisateurCourant = options.exclureUtilisateurCourant !== false;
  const exclureAdministrateurs = Boolean(options.exclureAdministrateurs);

  return obtenirComptesAdministration().filter((compte) => {
    if (
      exclureUtilisateurCourant &&
      Number(compte.id) === Number(etat.utilisateur?.id)
    ) {
      return false;
    }

    if (exclureAdministrateurs && Number(compte.est_admin) === 1) {
      return false;
    }

    return true;
  });
}

function formaterEtatAccesCompte(compte) {
  return Number(compte?.acces_active) === 1 ? "Actif" : "Suspendu";
}

function formaterEtatMotDePasseCompte(compte) {
  return Number(compte?.doit_changer_mot_de_passe) === 1 ? "A changer" : "A jour";
}

function formaterEtatLectureSeuleCompte(compte) {
  return Number(compte?.mode_lecture_seule) === 1 ? "Lecture seule" : "Modification autorisee";
}

function formaterEtatMonetisationCompte(compte) {
  return Number(compte?.peut_voir_monetisation) === 1 ? "Visible" : "Masquee";
}

function creerBadgeAdministration(texte, type) {
  const badge = document.createElement("span");
  definirBadgeAdmin(badge, texte, type);
  return badge;
}

function afficherListeCatalogueAdministration(container, elementsCatalogue, messageVide) {
  container.innerHTML = "";

  if (!Array.isArray(elementsCatalogue) || elementsCatalogue.length === 0) {
    container.innerHTML = `<div class="admin-user-empty">${messageVide}</div>`;
    return;
  }

  elementsCatalogue.forEach((elementCatalogue) => {
    const badge = document.createElement("span");
    badge.className = "file-pill";
    badge.textContent = elementCatalogue.valeur;
    container.appendChild(badge);
  });
}

function remplirSelectComptes(select, comptes, placeholder) {
  const valeurActuelle = String(select.value || "");

  if (comptes.length === 0) {
    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.disabled = true;
    return;
  }

  select.innerHTML = comptes
    .map((compte) => `<option value="${compte.id}">${compte.nom}</option>`)
    .join("");
  select.disabled = false;

  const valeurExiste = comptes.some(
    (compte) => String(compte.id) === valeurActuelle
  );
  select.value = valeurExiste ? valeurActuelle : String(comptes[0].id);
}

function selectionnerCompteAdministration(utilisateurId) {
  const valeur = String(utilisateurId || "");
  [
    elements.adminDeleteUserId,
    elements.adminResetUserId,
    elements.adminAccessUserId,
    elements.adminReadonlyUserId,
    elements.adminMonetisationUserId,
    elements.adminLogoutUserId,
  ].forEach((select) => {
    if (!select || !Array.from(select.options).some((option) => option.value === valeur)) {
      return;
    }

    select.value = valeur;
  });

  mettreAJourControlesAdministration();
}

function creerCarteUtilisateurAdministration(compte) {
  const carte = document.createElement("article");
  carte.className = "admin-user-row";

  const contenu = document.createElement("div");
  contenu.className = "admin-user-main";

  const entete = document.createElement("div");
  entete.className = "admin-user-head";

  const informations = document.createElement("div");
  const nom = document.createElement("h4");
  nom.className = "admin-user-name";
  nom.textContent = compte.nom;
  const email = document.createElement("div");
  email.className = "admin-user-email";
  email.textContent = compte.email;
  informations.append(nom, email);

  const badges = document.createElement("div");
  badges.className = "admin-user-badges";
  badges.append(
    creerBadgeAdministration(Number(compte.est_admin) === 1 ? "Admin" : "User", Number(compte.est_admin) === 1 ? "admin" : "user"),
    creerBadgeAdministration(formaterEtatAccesCompte(compte), Number(compte.acces_active) === 1 ? "active" : "suspended"),
    creerBadgeAdministration(formaterEtatMotDePasseCompte(compte), Number(compte.doit_changer_mot_de_passe) === 1 ? "warning" : "user")
  );

  if (Number(compte.est_admin) !== 1) {
    badges.append(
      creerBadgeAdministration(
        Number(compte.mode_lecture_seule) === 1 ? "Lecture seule" : "Acces complet",
        Number(compte.mode_lecture_seule) === 1 ? "warning" : "user"
      )
    );
  }

  entete.append(informations, badges);

  const meta = document.createElement("div");
  meta.className = "admin-user-meta";
  meta.textContent = compte.dernier_login_at
    ? `Derniere connexion : ${formatDateHeureSecondes(compte.dernier_login_at)}`
    : "Derniere connexion : jamais";

  const hint = document.createElement("div");
  hint.className = "admin-user-hint";
  hint.textContent =
    Number(compte.est_admin) === 1
      ? "Compte administrateur principal."
      : `Mot de passe : ${formaterEtatMotDePasseCompte(compte)}. ${formaterEtatLectureSeuleCompte(
          compte
        )}. Monetisation ${formaterEtatMonetisationCompte(compte).toLowerCase()}.`;

  contenu.append(entete, meta, hint);

  const actions = document.createElement("div");
  actions.className = "admin-user-actions";

  const boutonSelection = document.createElement("button");
  boutonSelection.type = "button";
  boutonSelection.className = "button secondary";
  boutonSelection.textContent = "Selectionner";
  boutonSelection.addEventListener("click", () => {
    selectionnerCompteAdministration(compte.id);
  });
  actions.appendChild(boutonSelection);

  carte.append(contenu, actions);
  return carte;
}

function afficherListeUtilisateursAdministration() {
  const comptes = obtenirComptesAdministration();
  elements.adminUsersList.innerHTML = "";

  if (comptes.length === 0) {
    elements.adminUsersList.innerHTML =
      '<div class="admin-user-empty">Aucun utilisateur disponible.</div>';
    return;
  }

  comptes.forEach((compte) => {
    elements.adminUsersList.appendChild(creerCarteUtilisateurAdministration(compte));
  });
}

function creerCarteSessionAdministration(session) {
  const carte = document.createElement("article");
  carte.className = `admin-session-item${
    session.session_courante ? " admin-session-item-current" : ""
  }`;

  const contenu = document.createElement("div");
  contenu.className = "admin-session-main";

  const entete = document.createElement("div");
  entete.className = "admin-session-head";

  const infos = document.createElement("div");
  const titre = document.createElement("h4");
  titre.className = "admin-session-title";
  titre.textContent = session.utilisateur_nom || "Utilisateur";
  const meta = document.createElement("div");
  meta.className = "admin-session-meta";
  meta.textContent = session.utilisateur_email || "Session utilisateur";
  infos.append(titre, meta);

  const badges = document.createElement("div");
  badges.className = "admin-session-badges";
  if (session.session_courante) {
    badges.appendChild(creerBadgeAdministration("Session courante", "admin"));
  }
  badges.appendChild(creerBadgeAdministration("Session active", "user"));

  entete.append(infos, badges);

  const details = document.createElement("div");
  details.className = "admin-session-agent";
  details.textContent = `IP : ${session.adresse_ip || "-"} | Derniere activite : ${
    session.updated_at ? formatDateHeureSecondes(session.updated_at) : "-"
  }`;

  const agent = document.createElement("div");
  agent.className = "admin-session-agent";
  agent.textContent = session.user_agent || "-";

  contenu.append(entete, details, agent);

  const actions = document.createElement("div");
  actions.className = "admin-session-actions";
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = session.session_courante ? "button danger" : "button secondary";
  bouton.textContent = session.session_courante ? "Fermer ma session" : "Fermer la session";
  bouton.addEventListener("click", async () => {
    await gererRevoquerSessionIndividuelle(session.sid);
  });
  actions.appendChild(bouton);

  carte.append(contenu, actions);
  return carte;
}

function afficherSessionsAdministration() {
  const sessions = Array.isArray(etat.administration?.sessions) ? etat.administration.sessions : [];
  elements.adminSessionsList.innerHTML = "";

  if (sessions.length === 0) {
    elements.adminSessionsList.innerHTML =
      '<div class="admin-session-empty">Aucune session active pour le moment.</div>';
    return;
  }

  sessions.forEach((session) => {
    elements.adminSessionsList.appendChild(creerCarteSessionAdministration(session));
  });
}

function mettreAJourControlesAdministration() {
  const compteSuppression = obtenirCompteAdministrationParId(elements.adminDeleteUserId.value);
  const compteAcces = obtenirCompteAdministrationParId(elements.adminAccessUserId.value);
  const compteLectureSeule = obtenirCompteAdministrationParId(elements.adminReadonlyUserId.value);
  const compteMonetisation = obtenirCompteAdministrationParId(
    elements.adminMonetisationUserId.value
  );
  const compteLogout = obtenirCompteAdministrationParId(elements.adminLogoutUserId.value);

  elements.adminDeleteUserButton.disabled = !compteSuppression;
  elements.adminDeleteUserButton.textContent = compteSuppression
    ? `Supprimer ${compteSuppression.nom}`
    : "Supprimer l'utilisateur";

  elements.adminToggleAccessStatus.textContent = compteAcces
    ? formaterEtatAccesCompte(compteAcces)
    : "-";
  elements.adminToggleAccessButton.disabled = !compteAcces;
  elements.adminToggleAccessButton.textContent = compteAcces
    ? Number(compteAcces.acces_active) === 1
      ? `Suspendre ${compteAcces.nom}`
      : `Reactiver ${compteAcces.nom}`
    : "Mettre a jour l'acces";
  elements.adminToggleAccessButton.classList.toggle(
    "danger",
    Boolean(compteAcces) && Number(compteAcces.acces_active) === 1
  );
  elements.adminToggleAccessButton.classList.toggle(
    "secondary",
    !compteAcces || Number(compteAcces.acces_active) !== 1
  );

  elements.adminReadonlyStatus.textContent = compteLectureSeule
    ? formaterEtatLectureSeuleCompte(compteLectureSeule)
    : "-";
  elements.adminReadonlyButton.disabled = !compteLectureSeule;
  elements.adminReadonlyButton.textContent = compteLectureSeule
    ? Number(compteLectureSeule.mode_lecture_seule) === 1
      ? `Retirer la lecture seule`
      : `Activer la lecture seule`
    : "Mettre a jour le mode";

  elements.adminMonetisationStatus.textContent = compteMonetisation
    ? formaterEtatMonetisationCompte(compteMonetisation)
    : "-";
  elements.adminMonetisationButton.disabled = !compteMonetisation;
  elements.adminMonetisationButton.textContent = compteMonetisation
    ? Number(compteMonetisation.peut_voir_monetisation) === 1
      ? `Masquer Monetisation`
      : `Afficher Monetisation`
    : "Mettre a jour Monetisation";

  elements.adminLogoutUserButton.disabled = !compteLogout;
  elements.adminLogoutUserButton.textContent = compteLogout
    ? `Couper les sessions de ${compteLogout.nom}`
    : "Couper les sessions";
}

function mettreAJourPanneauAdministration() {
  const comptes = obtenirComptesAdministration();
  const sessions = Array.isArray(etat.administration?.sessions) ? etat.administration.sessions : [];
  const matieres = obtenirCatalogueAdministration("matieres");
  const comptesSeance = obtenirCatalogueAdministration("comptes");
  const comptesActifs = comptes.filter((compte) => Number(compte.acces_active) === 1);
  const comptesLectureSeule = comptes.filter(
    (compte) => Number(compte.mode_lecture_seule) === 1
  );

  elements.adminTotalUsers.textContent = String(comptes.length);
  elements.adminActiveUsers.textContent = String(comptesActifs.length);
  elements.adminReadonlyUsers.textContent = String(comptesLectureSeule.length);
  elements.adminActiveSessions.textContent = String(sessions.length);

  afficherListeUtilisateursAdministration();
  afficherSessionsAdministration();
  afficherListeCatalogueAdministration(
    elements.adminSubjectList,
    matieres,
    "Aucune matière disponible."
  );
  afficherListeCatalogueAdministration(
    elements.adminAccountList,
    comptesSeance,
    "Aucun compte disponible."
  );

  remplirSelectComptes(elements.adminResetUserId, comptes, "Aucun compte");
  remplirSelectComptes(
    elements.adminDeleteUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminAccessUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminReadonlyUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminMonetisationUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminLogoutUserId,
    obtenirComptesCiblables(),
    "Aucune cible"
  );

  mettreAJourControlesAdministration();
}

function viderAdministration() {
  elements.adminTotalUsers.textContent = "0";
  elements.adminActiveUsers.textContent = "0";
  elements.adminReadonlyUsers.textContent = "0";
  elements.adminActiveSessions.textContent = "0";
  elements.adminUsersList.innerHTML =
    '<div class="admin-user-empty">Aucun utilisateur disponible.</div>';
  elements.adminSessionsList.innerHTML =
    '<div class="admin-session-empty">Aucune session active pour le moment.</div>';
  elements.adminSubjectList.innerHTML =
    '<div class="admin-user-empty">Aucune matière disponible.</div>';
  elements.adminAccountList.innerHTML =
    '<div class="admin-user-empty">Aucun compte disponible.</div>';

  [
    elements.adminDeleteUserId,
    elements.adminResetUserId,
    elements.adminAccessUserId,
    elements.adminReadonlyUserId,
    elements.adminMonetisationUserId,
    elements.adminLogoutUserId,
  ].forEach((select) => {
    select.innerHTML = '<option value="">Aucune donnee</option>';
    select.disabled = true;
  });

  elements.adminToggleAccessStatus.textContent = "-";
  elements.adminReadonlyStatus.textContent = "-";
  elements.adminMonetisationStatus.textContent = "-";
  elements.adminDeleteUserButton.textContent = "Supprimer l'utilisateur";
  elements.adminToggleAccessButton.textContent = "Mettre a jour l'acces";
  elements.adminReadonlyButton.textContent = "Mettre a jour le mode";
  elements.adminMonetisationButton.textContent = "Mettre a jour Monetisation";
  elements.adminLogoutUserButton.textContent = "Couper les sessions";
  elements.adminDeleteUserButton.disabled = true;
  elements.adminToggleAccessButton.disabled = true;
  elements.adminReadonlyButton.disabled = true;
  elements.adminMonetisationButton.disabled = true;
  elements.adminLogoutUserButton.disabled = true;
  elements.adminToggleAccessButton.classList.remove("danger");
  elements.adminToggleAccessButton.classList.add("secondary");
}

function obtenirDateLocaleIso(dateObjet = new Date()) {
  const annee = dateObjet.getFullYear();
  const mois = String(dateObjet.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function formaterDateAujourdhui() {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function obtenirCleTriHeure(heure) {
  if (!estHeureValide(heure)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [heures, minutes] = heure.split(":").map(Number);
  return heures * 60 + minutes;
}

function obtenirSeancesAujourdhui() {
  const dateAujourdhui = obtenirDateLocaleIso();

  return etat.seances
    .filter((seance) => seance.date === dateAujourdhui)
    .sort((premiereSeance, secondeSeance) => {
      return (
        obtenirCleTriHeure(premiereSeance.heure_debut) -
        obtenirCleTriHeure(secondeSeance.heure_debut)
      );
    });
}

function mettreAJourVueAujourdhui() {
  elements.todayDateLabel.textContent = formaterDateAujourdhui();

  const seancesAujourdhui = obtenirSeancesAujourdhui();
  elements.todayCount.textContent = String(seancesAujourdhui.length);
  elements.todayList.innerHTML = "";

  if (seancesAujourdhui.length === 0) {
    elements.todayList.innerHTML =
      '<div class="empty-state">Aucune séance prévue aujourd\'hui.</div>';
    return;
  }

  seancesAujourdhui.forEach((seance) => {
    elements.todayList.appendChild(creerCarteSeanceAujourdhui(seance));
  });
}

function creerCarteSeanceAujourdhui(seance) {
  const ligne = document.createElement("button");
  ligne.type = "button";
  ligne.className = "today-row";
  ligne.addEventListener("click", async () => {
    await ouvrirDetailSeance(seance);
  });

  const heure = document.createElement("span");
  heure.className = "today-time";
  heure.textContent = estHeureValide(seance.heure_debut) ? seance.heure_debut : "--:--";

  const carte = document.createElement("span");
  carte.className = `today-item today-item-${seance.statut_seance}`;

  const compteNormalise = normaliserNomCompte(seance.compte);
  const classeCompteAujourdhui = obtenirClasseCompteAujourdhui(compteNormalise);
  if (utilisateurEstHossam() && classeCompteAujourdhui) {
    carte.classList.add(classeCompteAujourdhui);
  }

  const entete = document.createElement("span");
  entete.className = "today-item-head";

  const titreZone = document.createElement("span");
  titreZone.className = "today-item-title";

  const etudiant = document.createElement("strong");
  etudiant.className = "today-item-student";
  etudiant.textContent = seance.etudiant || "Séance";

  const matiere = document.createElement("span");
  matiere.className = "today-item-subject";
  matiere.textContent = seance.matiere || "-";

  titreZone.append(etudiant, matiere);

  const badgeStatut = document.createElement("span");
  definirBadge(
    badgeStatut,
    seance.statut_seance,
    libellesStatutSeance[seance.statut_seance] || "Séance"
  );

  entete.append(titreZone, badgeStatut);

  const meta = document.createElement("span");
  meta.className = "today-item-meta";
  meta.append(
    creerPuceAujourdhui(construirePlageHoraire(seance)),
    creerPuceAujourdhui(seance.duree_label || "-"),
    creerPuceAujourdhui(
      seance.compte || "-",
      utilisateurEstHossam() && classeCompteAujourdhui
        ? ["today-meta-pill-account", classeCompteAujourdhui.replace("today-item", "today-meta-pill")]
        : []
    ),
    creerPuceAujourdhui(seance.est_essai ? "Essai" : "Normale")
  );

  carte.append(entete, meta);

  if (seance.description) {
    const description = document.createElement("span");
    description.className = "today-item-note";
    description.textContent = seance.description;
    carte.append(description);
  }

  ligne.append(heure, carte);
  return ligne;
}

function creerPuceAujourdhui(texte, classesSupplementaires = []) {
  const puce = document.createElement("span");
  puce.className = "today-meta-pill";
  classesSupplementaires.forEach((classe) => puce.classList.add(classe));
  puce.textContent = texte;
  return puce;
}

function obtenirClasseCompteAujourdhui(compte) {
  if (compte === "Yassine") {
    return "today-item-account-yassine";
  }

  if (compte === "Abdo") {
    return "today-item-account-abdo";
  }

  return "";
}

function normaliserNomCompte(compte) {
  const valeurBrute = String(compte || "").trim();
  const valeur = valeurBrute.toLowerCase();

  if (valeur === "yassine") {
    return "Yassine";
  }

  if (valeur === "abdo" || valeur === "ami") {
    return "Abdo";
  }

  return valeurBrute;
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

  elements.monetisationTotalAmount.textContent = formaterMontantDh(
    etat.monetisation.montant_total
  );
  elements.monetisationYassineAmountCard.textContent = formaterMontantDh(
    donneesYassine?.montant_du
  );
  elements.monetisationAbdoAmountCard.textContent = formaterMontantDh(
    donneesAbdo?.montant_du
  );
  elements.monetisationYassineAmount.textContent = formaterMontantDh(
    donneesYassine?.montant_du
  );
  elements.monetisationAbdoAmount.textContent = formaterMontantDh(
    donneesAbdo?.montant_du
  );
  elements.monetisationYassineRate.textContent = formaterMontantDh(
    donneesYassine?.tarif_unitaire
  );
  elements.monetisationAbdoRate.textContent = formaterMontantDh(
    donneesAbdo?.tarif_unitaire
  );
  elements.monetisationYassineRateTable.textContent = formaterMontantDh(
    donneesYassine?.tarif_unitaire
  );
  elements.monetisationAbdoRateTable.textContent = formaterMontantDh(
    donneesAbdo?.tarif_unitaire
  );
  elements.monetisationYassineBillableCount.textContent = String(
    donneesYassine?.seances_facturables || 0
  );
  elements.monetisationAbdoBillableCount.textContent = String(
    donneesAbdo?.seances_facturables || 0
  );
  elements.monetisationYassineBillableCountTable.textContent = String(
    donneesYassine?.seances_facturables || 0
  );
  elements.monetisationAbdoBillableCountTable.textContent = String(
    donneesAbdo?.seances_facturables || 0
  );
  elements.monetisationYassineTrialCount.textContent = String(
    donneesYassine?.seances_essai_faites || 0
  );
  elements.monetisationAbdoTrialCount.textContent = String(
    donneesAbdo?.seances_essai_faites || 0
  );
  elements.monetisationYassineTrialCountTable.textContent = String(
    donneesYassine?.seances_essai_faites || 0
  );
  elements.monetisationAbdoTrialCountTable.textContent = String(
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
  elements.monetisationTotalAmount.textContent = "0 dh";
  elements.monetisationYassineAmountCard.textContent = "0 dh";
  elements.monetisationAbdoAmountCard.textContent = "0 dh";
  elements.monetisationYassineAmount.textContent = "0 dh";
  elements.monetisationAbdoAmount.textContent = "0 dh";
  elements.monetisationYassineRate.textContent = "130 dh";
  elements.monetisationAbdoRate.textContent = "90 dh";
  elements.monetisationYassineRateTable.textContent = "130 dh";
  elements.monetisationAbdoRateTable.textContent = "90 dh";
  elements.monetisationYassineBillableCount.textContent = "0";
  elements.monetisationAbdoBillableCount.textContent = "0";
  elements.monetisationYassineBillableCountTable.textContent = "0";
  elements.monetisationAbdoBillableCountTable.textContent = "0";
  elements.monetisationYassineTrialCount.textContent = "0";
  elements.monetisationAbdoTrialCount.textContent = "0";
  elements.monetisationYassineTrialCountTable.textContent = "0";
  elements.monetisationAbdoTrialCountTable.textContent = "0";
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

    const presentationAction = obtenirPresentationActionHistorique(entree);
    bouton.classList.add(`history-item-tone-${presentationAction.tone}`);

    const zoneTitre = document.createElement("div");
    zoneTitre.className = "history-item-main";

    const badgeAction = document.createElement("span");
    badgeAction.className = `history-action-badge history-action-badge-${presentationAction.tone}`;
    badgeAction.textContent = presentationAction.badgeLabel;

    const titre = document.createElement("span");
    titre.className = "history-item-title";
    titre.textContent = presentationAction.label;

    const heure = document.createElement("span");
    heure.className = "history-item-time";
    heure.textContent = formatDateHeureSecondes(entree.created_at);

    zoneTitre.append(badgeAction, titre);
    entete.append(zoneTitre, heure);

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
  const presentationAction = obtenirPresentationActionHistorique(entree);
  elements.historyDetailEmpty.classList.add("hidden");
  elements.historyDetail.classList.remove("hidden");
  elements.historyDetailAction.textContent = presentationAction.label;
  elements.historyDetailAction.className = `history-action-badge history-action-badge-${presentationAction.tone} history-action-badge-detail`;
  elements.historyDetailSeance.textContent = entree.seance_libelle || "-";
  elements.historyDetailActor.textContent = obtenirNomActeurAffiche(entree.acteur_nom);
  elements.historyDetailDate.textContent = formatDateHeureSecondes(entree.created_at);

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
  elements.historyDetailAction.className = "";
  elements.historyDetailSeance.textContent = "-";
  elements.historyDetailActor.textContent = "-";
  elements.historyDetailDate.textContent = "-";
  elements.historyChangesTitle.textContent = "Détails";
  elements.historyChangesList.innerHTML = "";
}

function obtenirNomActeurAffiche(nomActeur) {
  if (String(nomActeur || "").trim() === "Ami") {
    return "Abdo";
  }

  return nomActeur || "-";
}

function normaliserCleHistorique(valeur) {
  return String(valeur || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obtenirChangementsHistorique(entree) {
  return Array.isArray(entree?.details?.changements) ? entree.details.changements : [];
}

function obtenirChangementStatutHistorique(entree) {
  return obtenirChangementsHistorique(entree).find(
    (changement) => String(changement?.champ || "").trim() === "statut_seance"
  );
}

function obtenirActionStatutHistorique(entree) {
  const changementStatut = obtenirChangementStatutHistorique(entree);
  const statutApres = normaliserCleHistorique(changementStatut?.apres);

  if (statutApres === "reportee") {
    return {
      label: "Modification de la séance - Reporter",
      badgeLabel: "Reporter",
      tone: "postpone",
    };
  }

  if (statutApres === "annulee") {
    return {
      label: "Modification de la séance - Annuler",
      badgeLabel: "Annuler",
      tone: "cancel",
    };
  }

  if (statutApres === "faite") {
    return {
      label: "Modification de la séance - Marquer faite",
      badgeLabel: "Faite",
      tone: "complete",
    };
  }

  if (statutApres === "planifiee") {
    return {
      label: "Modification de la séance - Planifier",
      badgeLabel: "Planifier",
      tone: "update",
    };
  }

  return null;
}

function obtenirNatureModificationHistorique(entree) {
  const changements = obtenirChangementsHistorique(entree);

  if (changements.length === 0) {
    return {
      label: "Modification de la séance",
      badgeLabel: "Modifier",
      tone: "update",
    };
  }

  const champs = new Set(
    changements
      .map((changement) => String(changement?.champ || "").trim())
      .filter(Boolean)
  );

  if (["date", "heure_debut", "heure_fin", "duree_minutes"].some((champ) => champs.has(champ))) {
    return {
      label: "Modification de la séance - Modifier l'horaire",
      badgeLabel: "Horaire",
      tone: "postpone",
    };
  }

  if (["etudiant", "parent", "matiere", "compte"].some((champ) => champs.has(champ))) {
    return {
      label: "Modification de la séance - Modifier les informations",
      badgeLabel: "Informations",
      tone: "update",
    };
  }

  if (champs.has("est_essai")) {
    return {
      label: "Modification de la séance - Changer le type",
      badgeLabel: "Type",
      tone: "update",
    };
  }

  if (champs.has("description")) {
    return {
      label: "Modification de la séance - Modifier la description",
      badgeLabel: "Description",
      tone: "update",
    };
  }

  return {
    label: "Modification de la séance - Mise à jour multiple",
    badgeLabel: "Mise à jour",
    tone: "update",
  };
}

function obtenirPresentationActionHistorique(entree) {
  if (entree?.action_type === "initialisation" || entree?.action_type === "seance_creee") {
    return {
      label: "Création de la séance",
      badgeLabel: "Création",
      tone: "create",
    };
  }

  if (entree?.action_type === "seance_supprimee") {
    return {
      label: "Suppression de la séance",
      badgeLabel: "Suppression",
      tone: "delete",
    };
  }

  if (entree?.action_type === "screenshots_ajoutes") {
    return {
      label: "Ajout de screenshots",
      badgeLabel: "Screenshots",
      tone: "upload",
    };
  }

  const actionStatut = obtenirActionStatutHistorique(entree);

  if (actionStatut) {
    return actionStatut;
  }

  if (["seance_modifiee", "statut_modifie"].includes(entree?.action_type)) {
    return obtenirNatureModificationHistorique(entree);
  }

  return {
    label: entree?.action_label || "Action",
    badgeLabel: "Action",
    tone: "update",
  };
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
      titre: "Changements appliqués",
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
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  configurerOptionsStatut("creation");
  definirSousTitreModalSeance("");
  elements.seanceModalTitle.textContent = "Nouvelle séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  elements.seanceId.value = "";
  definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  definirValeurSelectionnee(elements.compteCheckboxes, obtenirCompteParDefaut());
  definirValeurSelectionnee(elements.matiereCheckboxes, obtenirMatiereParDefaut());
  definirValeurSelectionnee(elements.essaiCheckboxes, "0");
  definirDureeSelectionnee(60);
  definirHeureDebutSelectionnee(recupererHeureDebutParDefaut());
  viderFichiersSelectionnes();

  if (dateSelectionnee) {
    elements.date.value = dateSelectionnee;
  }

  mettreAJourHeureFinCalculee();
  ouvrirModal(elements.seanceModal);
  elements.etudiant.focus();
}

function ouvrirFormulaireModification() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
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

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
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
  elements.parent.value = seance.parent || "";
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

  if (!utilisateurPeutModifierDonnees()) {
    afficherErreur(elements.seanceFormError, "Votre compte est en lecture seule.");
    return;
  }

  const dureeMinutes = recupererDureeSelectionnee();
  const screenshots = Array.from(elements.screenshotsInput.files);
  const donneesSeance = {
    etudiant: elements.etudiant.value.trim(),
    parent: elements.parent.value.trim(),
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

  if (!donneesSeance.etudiant) {
    afficherErreur(elements.seanceFormError, "Le nom de l'étudiant est obligatoire.");
    return;
  }

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
  elements.detailParent.textContent = seance.parent || "Non renseigne";
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

  elements.editSeanceButton.disabled = !utilisateurPeutModifierDonnees();
  elements.deleteSeanceButton.disabled = !utilisateurPeutModifierDonnees();

  elements.quickStatusButtons.forEach((bouton) => {
    bouton.disabled =
      !utilisateurPeutModifierDonnees() ||
      (bouton.dataset.status !== "reportee" &&
        bouton.dataset.status === etat.seanceSelectionnee.statut_seance);
  });
}

async function gererChangementStatut(nouveauStatut) {
  if (!etat.seanceSelectionnee) {
    return;
  }

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
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

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
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
    image.src = photo.url;
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
  elements.previewImage.src = photo.url;
  elements.previewImage.alt = photo.nom_fichier;
  elements.previewFilename.textContent = photo.nom_fichier;
  elements.previewDownload.href = photo.download_url || photo.url;
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

function attacherSelectionUnique(checkboxes, callback, options = {}) {
  const keepOneSelected = options.keepOneSelected === true;

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        checkboxes.forEach((autreCheckbox) => {
          if (autreCheckbox !== checkbox) {
            autreCheckbox.checked = false;
          }
        });
      } else if (keepOneSelected && !checkboxes.some((item) => item.checked)) {
        checkbox.checked = true;
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
