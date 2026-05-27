import {
  connecterUtilisateur,
  changerMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurCourant,
} from "./auth.js";
import {
  recupererVueAdministration,
  ajouterElementCatalogueAdmin,
  supprimerElementCatalogueAdmin,
  creerUtilisateurAdmin,
  supprimerUtilisateurAdmin,
  reinitialiserMotDePasseCompte,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  mettreAJourTarifHoraireCompte as mettreAJourTarifHoraireCompteAdmin,
  mettreAJourAccesAujourdhuiCompte,
  mettreAJourAccesIndisponibilitesCompte,
  revoquerSessionsUtilisateurAdmin,
  revoquerSessionAdmin,
  supprimerToutesLesSeancesAdmin,
  supprimerToutHistoriqueAdmin,
  recupererJournalAuthAdmin,
  recupererSessionsAdmin,
  revoquerSessionSpecifiqueAdmin,
  recupererIpsBloqueesAdmin,
  bloquerIpAdmin,
  debloquerIpAdmin,
  revoquerAppareilAutoLoginAdmin,
} from "./admin.js";
import {
  recupererSeances,
  recupererOptionsSeances,
  ajouterSeance,
  modifierSeance,
  supprimerSeance,
  changerStatutSeance,
  recupererIndisponibilites,
  creerIndisponibilite,
  supprimerIndisponibilite,
  recupererHistoriqueActions,
  recupererDetailHistorique,
  supprimerEntreeHistorique as supprimerEntreeHistoriqueApi,
  recupererMonetisation,
  telechargerReleveMonetisation,
} from "./seances.js";
import { initialiserCalendrier, mettreAJourEvenements } from "./calendrier.js";
import {
  recupererEtatNotificationsPush,
  synchroniserNotificationsPushActuelles,
  activerNotificationsPush,
  desactiverNotificationsPush,
  envoyerNotificationPushTest,
} from "./push.js";

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

const heuresDebutDisponibles = Array.from({ length: 15 }, (_, index) =>
  String(index + 8).padStart(2, "0")
);
const minutesDebutDisponibles = ["00", "30"];
const comptesMonetisationPrincipaux = ["Yassine", "Abdo"];
const cleConnexionMemorisee = "gestion-seances-connexion-memorisee";

function creerCatalogueVide() {
  return {
    matieres: [],
    comptes: [],
  };
}

const etat = {
  utilisateur: null,
  seances: [],
  indisponibilites: [],
  historique: [],
  monetisation: null,
  monetisationPeriodeMode: "monthly",
  monetisationFiltreAnnee: obtenirAnneeCouranteIso(),
  monetisationFiltreMoisVue: obtenirMoisCourantIso(),
  monetisationFiltreMois: obtenirMoisCourantIso(),
  monetisationComptesSelectionnes: [],
  monetisationSelectionInitialisee: false,
  administration: null,
  catalogue: creerCatalogueVide(),
  historiqueSelection: null,
  seanceSelectionnee: null,
  calendrier: null,
  sectionActive: "aujourdhui",
  notificationsPush: {
    supported: false,
    permission: "default",
    subscribed: false,
  },
};
const connexionTempsReel = {
  source: null,
  synchronisationProgrammee: null,
  synchronisationEnCours: false,
  synchronisationEnAttente: false,
  derniereNotificationCle: "",
  derniereNotificationAt: 0,
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
  indisponibilitesSection: document.getElementById("indisponibilites-section"),
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
  pushSettingsCard: document.getElementById("push-settings-card"),
  pushStatusLabel: document.getElementById("push-status-label"),
  pushPermissionLabel: document.getElementById("push-permission-label"),
  pushSettingsInfo: document.getElementById("push-settings-info"),
  pushSettingsError: document.getElementById("push-settings-error"),
  pushEnableButton: document.getElementById("push-enable-button"),
  pushDisableButton: document.getElementById("push-disable-button"),
  pushTestButton: document.getElementById("push-test-button"),
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
  adminUnavailabilityForm: document.getElementById("admin-unavailability-form"),
  adminUnavailabilityDate: document.getElementById("admin-unavailability-date"),
  adminUnavailabilityFullDay: document.getElementById("admin-unavailability-full-day"),
  adminUnavailabilityFullDayNote: document.getElementById(
    "admin-unavailability-full-day-note"
  ),
  adminUnavailabilityTimeFields: document.getElementById(
    "admin-unavailability-time-fields"
  ),
  adminUnavailabilityStart: document.getElementById("admin-unavailability-start"),
  adminUnavailabilityEnd: document.getElementById("admin-unavailability-end"),
  adminUnavailabilityReason: document.getElementById("admin-unavailability-reason"),
  adminUnavailabilityList: document.getElementById("admin-unavailability-list"),
  adminUnavailabilityError: document.getElementById("admin-unavailability-error"),
  adminUnavailabilityButton: document.getElementById("admin-unavailability-button"),
  adminCreateUserCurrentPassword: document.getElementById(
    "admin-create-user-current-password"
  ),
  adminSessionForm: document.getElementById("admin-session-form"),
  adminSessionCurrentPassword: document.getElementById("admin-session-current-password"),
  adminSessionError: document.getElementById("admin-session-error"),
  adminSessionsList: document.getElementById("admin-sessions-list"),
  adminTrustedDeviceForm: document.getElementById("admin-trusted-device-form"),
  adminTrustedDeviceCurrentPassword: document.getElementById(
    "admin-trusted-device-current-password"
  ),
  adminTrustedDeviceError: document.getElementById("admin-trusted-device-error"),
  adminTrustedDevicesList: document.getElementById("admin-trusted-devices-list"),
  adminAuditLogList: document.getElementById("admin-audit-log-list"),
  auditLogModal: document.getElementById("audit-log-modal"),
  auditLogModalSubtitle: document.getElementById("audit-log-modal-subtitle"),
  auditLogModalResult: document.getElementById("audit-log-modal-result"),
  auditLogModalAction: document.getElementById("audit-log-modal-action"),
  auditLogModalIdentifiant: document.getElementById("audit-log-modal-identifiant"),
  auditLogModalUser: document.getElementById("audit-log-modal-user"),
  auditLogModalIp: document.getElementById("audit-log-modal-ip"),
  auditLogModalDevice: document.getElementById("audit-log-modal-device"),
  auditLogModalDate: document.getElementById("audit-log-modal-date"),
  auditLogModalDetailsList: document.getElementById("audit-log-modal-details-list"),
  adminBlockIpForm: document.getElementById("admin-block-ip-form"),
  adminBlockIpAddress: document.getElementById("admin-block-ip-address"),
  adminBlockIpReason: document.getElementById("admin-block-ip-reason"),
  adminBlockIpPassword: document.getElementById("admin-block-ip-password"),
  adminBlockIpError: document.getElementById("admin-block-ip-error"),
  adminBlockedIpsList: document.getElementById("admin-blocked-ips-list"),
  adminCreateUserError: document.getElementById("admin-create-user-error"),
  adminCreateUserResult: document.getElementById("admin-create-user-result"),
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
  adminResetPasswordResult: document.getElementById("admin-reset-password-result"),
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
  adminTodayForm: document.getElementById("admin-today-form"),
  adminTodayUserId: document.getElementById("admin-today-user-id"),
  adminTodayStatus: document.getElementById("admin-today-status"),
  adminTodayCurrentPassword: document.getElementById("admin-today-current-password"),
  adminTodayError: document.getElementById("admin-today-error"),
  adminTodayButton: document.getElementById("admin-today-button"),
  adminUnavailabilityAccessForm: document.getElementById("admin-unavailability-access-form"),
  adminUnavailabilityAccessUserId: document.getElementById(
    "admin-unavailability-access-user-id"
  ),
  adminUnavailabilityAccessStatus: document.getElementById(
    "admin-unavailability-access-status"
  ),
  adminUnavailabilityAccessCurrentPassword: document.getElementById(
    "admin-unavailability-access-current-password"
  ),
  adminUnavailabilityAccessError: document.getElementById(
    "admin-unavailability-access-error"
  ),
  adminUnavailabilityAccessButton: document.getElementById(
    "admin-unavailability-access-button"
  ),
  adminMonetisationForm: document.getElementById("admin-monetisation-form"),
  adminMonetisationUserId: document.getElementById("admin-monetisation-user-id"),
  adminMonetisationStatus: document.getElementById("admin-monetisation-status"),
  adminMonetisationCurrentPassword: document.getElementById(
    "admin-monetisation-current-password"
  ),
  adminMonetisationError: document.getElementById("admin-monetisation-error"),
  adminMonetisationButton: document.getElementById("admin-monetisation-button"),
  adminRateForm: document.getElementById("admin-rate-form"),
  adminRateUserId: document.getElementById("admin-rate-user-id"),
  adminRateStatus: document.getElementById("admin-rate-status"),
  adminRateValue: document.getElementById("admin-rate-value"),
  adminRateCurrentPassword: document.getElementById("admin-rate-current-password"),
  adminRateError: document.getElementById("admin-rate-error"),
  adminRateButton: document.getElementById("admin-rate-button"),
  adminLogoutUserForm: document.getElementById("admin-logout-user-form"),
  adminLogoutUserId: document.getElementById("admin-logout-user-id"),
  adminLogoutCurrentPassword: document.getElementById("admin-logout-current-password"),
  adminLogoutUserError: document.getElementById("admin-logout-user-error"),
  adminLogoutUserButton: document.getElementById("admin-logout-user-button"),
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
  statsAccountsOverview: document.getElementById("stats-accounts-overview"),
  statsAccountsTable: document.getElementById("stats-accounts-table"),
  monetisationTotalAmount: document.getElementById("monetisation-total-amount"),
  monetisationPeriodTitle: document.getElementById("monetisation-period-title"),
  monetisationPreviousMonthButton: document.getElementById(
    "monetisation-previous-month-button"
  ),
  monetisationNextMonthButton: document.getElementById("monetisation-next-month-button"),
  monetisationModeOptionOneButton: document.getElementById("monetisation-mode-option-one-button"),
  monetisationModeOptionTwoButton: document.getElementById("monetisation-mode-option-two-button"),
  monetisationDownloadStatementButton: document.getElementById(
    "monetisation-download-statement-button"
  ),
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
  monetisationExtraSection: document.getElementById("monetisation-extra-section"),
  monetisationExtraAccounts: document.getElementById("monetisation-extra-accounts"),
  monetisationReportAccountsSection: document.getElementById(
    "monetisation-report-accounts-section"
  ),
  monetisationReportAccountsNote: document.getElementById("monetisation-report-accounts-note"),
  monetisationReportAccounts: document.getElementById("monetisation-report-accounts"),
  adminBlockIpButton: document.getElementById("admin-block-ip-button"),
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
  historyDeleteActions: document.getElementById("history-delete-actions"),
  historyDeleteForm: document.getElementById("history-delete-form"),
  historyDeleteCurrentPassword: document.getElementById("history-delete-current-password"),
  historyDeleteError: document.getElementById("history-delete-error"),
  historyDeleteButton: document.getElementById("history-delete-button"),
  historyDetailModal: document.getElementById("history-detail-modal"),
  historyDetailModalSubtitle: document.getElementById("history-detail-modal-subtitle"),
  historyDetailModalAction: document.getElementById("history-detail-modal-action"),
  historyDetailModalSeance: document.getElementById("history-detail-modal-seance"),
  historyDetailModalActor: document.getElementById("history-detail-modal-actor"),
  historyDetailModalDate: document.getElementById("history-detail-modal-date"),
  historyDetailModalChangesTitle: document.getElementById(
    "history-detail-modal-changes-title"
  ),
  historyDetailModalChangesList: document.getElementById(
    "history-detail-modal-changes-list"
  ),
  historyDetailModalDeleteActions: document.getElementById(
    "history-detail-modal-delete-actions"
  ),
  historyDetailModalDeleteForm: document.getElementById("history-detail-modal-delete-form"),
  historyDetailModalDeleteCurrentPassword: document.getElementById(
    "history-detail-modal-delete-current-password"
  ),
  historyDetailModalDeleteError: document.getElementById(
    "history-detail-modal-delete-error"
  ),
  historyDetailModalDeleteButton: document.getElementById(
    "history-detail-modal-delete-button"
  ),
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
  editSeanceButton: document.getElementById("edit-seance-button"),
  deleteSeanceButton: document.getElementById("delete-seance-button"),
  quickStatusButtons: Array.from(document.querySelectorAll(".quick-status-button")),
  toastContainer: document.getElementById("toast-container"),
};

document?.addEventListener("DOMContentLoaded", initialiserApplication);

function chargerConnexionMemorisee() {
  try {
    const valeurBrute = window.localStorage.getItem(cleConnexionMemorisee);
    if (!valeurBrute) {
      return null;
    }

    const connexion = JSON.parse(valeurBrute);
    return {
      username: String(connexion?.username || ""),
    };
  } catch (erreur) {
    return null;
  }
}

function enregistrerConnexionMemorisee(username) {
  try {
    window.localStorage.setItem(
      cleConnexionMemorisee,
      JSON.stringify({
        username,
      })
    );
  } catch (erreur) {
    // Ignore les environnements ou le stockage local n'est pas disponible.
  }
}

function obtenirIdentifiantAutocompleteMotDePasse() {
  return String(
    etat.utilisateur?.email ||
      etat.utilisateur?.nom ||
      elements.loginUsername?.value ||
      chargerConnexionMemorisee()?.username ||
      ""
  ).trim();
}

function synchroniserIdentifiantsFormulairesMotDePasse() {
  const formulaires = Array.from(document.querySelectorAll("form"));
  const identifiant = obtenirIdentifiantAutocompleteMotDePasse();

  formulaires.forEach((formulaire, index) => {
    if (!formulaire.querySelector('input[type="password"]')) {
      return;
    }

    Array.from(formulaire.querySelectorAll("input")).forEach((input) => {
      const autocompleteActuel = String(input.getAttribute("autocomplete") || "").trim();

      if (
        autocompleteActuel ||
        input.type === "password" ||
        input.dataset.passwordUsernameHelper === "true"
      ) {
        return;
      }

      if (["text", "email", "search", "tel", "url", "number"].includes(input.type || "text")) {
        input.setAttribute("autocomplete", "off");
      }
    });

    const champVisible = Array.from(formulaire.querySelectorAll("input")).find((input) => {
      const autocomplete = String(input.getAttribute("autocomplete") || "").toLowerCase();
      return autocomplete === "username" || autocomplete === "email";
    });
    const champHelper = formulaire.querySelector(
      'input[data-password-username-helper="true"]'
    );

    if (champVisible) {
      champHelper?.remove();
      return;
    }

    const helper =
      champHelper ||
      (() => {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "visually-hidden-autocomplete";
        input.tabIndex = -1;
        input.autocomplete = "username";
        input.setAttribute("aria-hidden", "true");
        input.dataset.passwordUsernameHelper = "true";
        input.name = `${formulaire.id || `password-form-${index + 1}`}-username`;
        formulaire.prepend(input);
        return input;
      })();

    helper.value = identifiant;
  });
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
  elements.loginRemember.checked = false;
}

function mettreAJourVisibiliteMotDePasseConnexion() {
  if (elements.loginPassword) elements.loginPassword.type = elements.loginShowPassword.checked ? "text" : "password";
}

function utilisateurDoitChangerMotDePasse() {
  return Number(etat.utilisateur?.doit_changer_mot_de_passe) === 1;
}

function rafraichirEvenementsCalendrier() {
  if (!etat.calendrier) {
    return;
  }

  mettreAJourEvenements(etat.calendrier, etat.seances, etat.indisponibilites);
}

function viderDonneesApplication() {
  etat.seances = [];
  etat.indisponibilites = [];
  etat.historique = [];
  etat.monetisation = null;
  etat.monetisationPeriodeMode = "monthly";
  etat.monetisationFiltreAnnee = obtenirAnneeCouranteIso();
  etat.monetisationFiltreMoisVue = obtenirMoisCourantIso();
  etat.monetisationFiltreMois = obtenirMoisCourantIso();
  etat.monetisationComptesSelectionnes = [];
  etat.monetisationSelectionInitialisee = false;
  etat.administration = null;
  etat.catalogue = creerCatalogueVide();
  etat.historiqueSelection = null;
  etat.seanceSelectionnee = null;

  if (etat.calendrier) {
    rafraichirEvenementsCalendrier();
  }

  mettreAJourResume();
  afficherListeHistorique();
  viderDetailHistorique();
  viderMonetisation();
  viderAdministration();
  afficherListeIndisponibilitesAdministration();
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
    chargerIndisponibilites(),
    chargerHistorique(),
    chargerMonetisationSiAutorise(),
    chargerAdministrationSiAutorise(),
  ]);
}

async function initialiserApplication() {
  appliquerConnexionMemorisee();
  synchroniserIdentifiantsFormulairesMotDePasse();
  mettreAJourVisibiliteMotDePasseConnexion();
  initialiserChoixHeureDebut();
  initialiserFormulaireIndisponibilite();
  initialiserCatalogueSeanceParDefaut();
  reinitialiserEtatNotificationsPush();
  attacherEcouteurs();
  mettreAJourCarteNotificationsPush();

  try {
    const utilisateur = await recupererUtilisateurCourant();

    if (utilisateur) {
      etat.utilisateur = utilisateur;
      afficherApplication();
      await chargerDonneesApplication();
    } else {
      afficherConnexion({ preserveFeedback: true });
    }
  } catch (erreur) {
    afficherConnexion({ preserveFeedback: true });
    afficherToast(erreur.message, "error");
  }
}

function initialiserChoixHeureDebut() {
  if (!elements.heureDebutHourSelect || !elements.heureDebutMinuteSelect) {
    return;
  }

  elements.heureDebutHourSelect.innerHTML = heuresDebutDisponibles
    .map((heure) => `<option value="${heure}">${heure}</option>`)
    .join("");

  elements.heureDebutMinuteSelect.innerHTML = minutesDebutDisponibles
    .map((minute) => `<option value="${minute}">${minute}</option>`)
    .join("");
}

function initialiserFormulaireIndisponibilite() {
  const controles = obtenirControlesIndisponibiliteActifs();

  if (!controles.form || !("reset" in controles.form)) {
    return;
  }

  controles.form.reset();
  controles.form.dataset.fullDay = "0";
  controles.dateInput.value = obtenirDateLocaleIso();
  controles.fullDayInput.checked = false;
  controles.startInput.value = recupererHeureDebutParDefaut();
  controles.endInput.value = calculerHeureFin(
    controles.startInput.value,
    60
  );
  mettreAJourModeJourCompletIndisponibilite();
  masquerErreur(controles.errorElement);
}

function obtenirControlesIndisponibiliteActifs() {
  const form =
    document.querySelector("#admin-unavailability-form") || elements.adminUnavailabilityForm;

  return {
    form,
    dateInput:
      form?.querySelector("#admin-unavailability-date") || elements.adminUnavailabilityDate,
    fullDayInput:
      form?.querySelector("#admin-unavailability-full-day") ||
      elements.adminUnavailabilityFullDay,
    fullDayNote:
      document.querySelector("#admin-unavailability-full-day-note") ||
      elements.adminUnavailabilityFullDayNote,
    timeFields:
      document.querySelector("#admin-unavailability-time-fields") ||
      elements.adminUnavailabilityTimeFields,
    startInput:
      form?.querySelector("#admin-unavailability-start") || elements.adminUnavailabilityStart,
    endInput:
      form?.querySelector("#admin-unavailability-end") || elements.adminUnavailabilityEnd,
    reasonInput:
      form?.querySelector("#admin-unavailability-reason") || elements.adminUnavailabilityReason,
    errorElement:
      form?.querySelector("#admin-unavailability-error") || elements.adminUnavailabilityError,
    button:
      form?.querySelector("#admin-unavailability-button") || elements.adminUnavailabilityButton,
  };
}

function mettreAJourModeJourCompletIndisponibilite() {
  const controles = obtenirControlesIndisponibiliteActifs();
  const jourComplet = Boolean(controles.fullDayInput?.checked);
  const conteneurHeures = controles.timeFields;
  const champsHeures = [controles.startInput, controles.endInput];

  if (controles.form) {
    controles.form.dataset.fullDay = jourComplet ? "1" : "0";
  }

  conteneurHeures?.classList.toggle("hidden", jourComplet);
  controles.fullDayNote?.classList.toggle("hidden", !jourComplet);
  if (!controles.button?.disabled) {
    controles.button.textContent = jourComplet
      ? "Ajouter la journee"
      : "Ajouter le creneau";
  }
  masquerErreur(controles.errorElement);

  champsHeures.forEach((champ) => {
    if (!champ) {
      return;
    }

    champ.disabled = jourComplet;
    champ.required = !jourComplet;
  });

  if (jourComplet) {
    controles.startInput.value = "00:00";
    controles.endInput.value = "23:59";
    return;
  }

  if (!controles.startInput.value) {
    controles.startInput.value = recupererHeureDebutParDefaut();
  }

  if (!controles.endInput.value || controles.endInput.value === "23:59") {
    controles.endInput.value = calculerHeureFin(
      controles.startInput.value,
      60
    );
  }
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
  return normaliserListeCatalogue(etat.catalogue?.matieres);
}

function obtenirComptesDisponibles() {
  return normaliserListeCatalogue(etat.catalogue?.comptes);
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

function ajouterValeurCatalogueLegacy(liste, valeur) {
  const valeurNormalisee = String(valeur || "").trim();

  if (!valeurNormalisee) {
    return liste;
  }

  const existe = liste.some(
    (element) => String(element || "").trim().toLowerCase() === valeurNormalisee.toLowerCase()
  );

  return existe ? liste : [...liste, valeurNormalisee];
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
  if (!elements.matiereOptions || !elements.compteOptions) {
    return;
  }

  const matiereSelectionnee = recupererValeurSelectionnee(elements.matiereCheckboxes);
  const compteSelectionne = recupererValeurSelectionnee(elements.compteCheckboxes);
  const matieres = obtenirMatieresDisponibles();
  const comptes = obtenirComptesDisponibles();
  const seanceEnEdition =
    elements.seanceForm?.dataset.mode === "modification" ? etat.seanceSelectionnee : null;
  const matieresAffichees = ajouterValeurCatalogueLegacy(matieres, seanceEnEdition?.matiere);
  const comptesAffiches = ajouterValeurCatalogueLegacy(comptes, seanceEnEdition?.compte);

  elements.matiereOptions.innerHTML = "";
  matieresAffichees.forEach((matiere) => {
    elements.matiereOptions.appendChild(
      creerOptionCatalogueCheckbox({
        nomChamp: "matiere",
        classe: "matiere-checkbox",
        valeur: matiere,
      })
    );
  });

  elements.compteOptions.innerHTML = "";
  comptesAffiches.forEach((compte) => {
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
    matieresAffichees.includes(matiereSelectionnee)
      ? matiereSelectionnee
      : seanceEnEdition?.matiere || obtenirMatiereParDefaut()
  );
  definirValeurSelectionnee(
    elements.compteCheckboxes,
    comptesAffiches.includes(compteSelectionne)
      ? compteSelectionne
      : seanceEnEdition?.compte || obtenirCompteParDefaut()
  );
}

function initialiserCatalogueSeanceParDefaut() {
  etat.catalogue = creerCatalogueVide();
  rendreOptionsCatalogueSeance();
}

function attacherEcouteurs() {
  elements.loginForm?.addEventListener("submit", gererConnexion);
  elements.loginShowPassword?.addEventListener(
    "change",
    mettreAJourVisibiliteMotDePasseConnexion
  );
  elements.loginRemember?.addEventListener("change", () => {
    if (!elements.loginRemember.checked) {
      effacerConnexionMemorisee();
    }
  });
  elements.userPasswordForm?.addEventListener("submit", gererModificationMotDePasse);
  elements.adminAddSubjectForm?.addEventListener("submit", gererAjoutMatiereAdministration);
  elements.adminAddAccountForm?.addEventListener("submit", gererAjoutCompteAdministration);
  elements.adminUnavailabilityForm?.addEventListener("submit", gererCreationIndisponibilite);
  elements.adminCreateUserForm?.addEventListener("submit", gererCreationUtilisateurAdmin);
  elements.adminDeleteUserForm?.addEventListener("submit", gererSuppressionUtilisateurAdmin);
  elements.adminResetPasswordForm?.addEventListener(
    "submit",
    gererReinitialisationMotDePasseCompte
  );
  elements.adminToggleAccessForm?.addEventListener(
    "submit",
    gererMiseAJourAccesUtilisateur
  );
  elements.adminReadonlyForm?.addEventListener(
    "submit",
    gererMiseAJourLectureSeuleUtilisateur
  );
  elements.adminTodayForm?.addEventListener("submit", gererMiseAJourAccesAujourdhuiUtilisateur);
  elements.adminUnavailabilityAccessForm?.addEventListener(
    "submit",
    gererMiseAJourAccesIndisponibilitesUtilisateur
  );
  elements.adminMonetisationForm?.addEventListener(
    "submit",
    gererMiseAJourAccesMonetisationUtilisateur
  );
  elements.adminRateForm?.addEventListener("submit", gererMiseAJourTarifHoraireUtilisateur);
  elements.adminLogoutUserForm?.addEventListener(
    "submit",
    gererRevoquerSessionsUtilisateur
  );
  elements.pushEnableButton?.addEventListener("click", gererActivationNotificationsPush);
  elements.pushDisableButton?.addEventListener("click", gererDesactivationNotificationsPush);
  elements.pushTestButton?.addEventListener("click", gererTestNotificationsPush);
  elements.adminAccessUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminReadonlyUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminTodayUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminUnavailabilityAccessUserId?.addEventListener(
    "change",
    mettreAJourControlesAdministration
  );
  elements.adminMonetisationUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminRateUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminLogoutUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.adminDeleteUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.monetisationPreviousMonthButton?.addEventListener("click", () => {
    naviguerPeriodeMonetisation("precedent");
  });
  elements.monetisationNextMonthButton?.addEventListener("click", () => {
    naviguerPeriodeMonetisation("suivant");
  });
  elements.monetisationModeOptionOneButton?.addEventListener("click", gererClicModePeriodeMonetisation);
  elements.monetisationModeOptionTwoButton?.addEventListener("click", gererClicModePeriodeMonetisation);
  elements.monetisationDownloadStatementButton?.addEventListener(
    "click",
    gererTelechargementReleveMonetisation
  );
  elements.adminClearSeancesForm?.addEventListener("submit", gererSuppressionToutesLesSeances);
  elements.adminClearHistoryForm?.addEventListener(
    "submit",
    gererSuppressionToutHistorique
  );
  elements.historyDeleteForm?.addEventListener("submit", gererSuppressionEntreeHistorique);
  elements.historyDetailModalDeleteForm?.addEventListener(
    "submit",
    gererSuppressionEntreeHistorique
  );
  elements.adminUnavailabilityFullDay?.addEventListener(
    "change",
    mettreAJourModeJourCompletIndisponibilite
  );
  elements.logoutButton?.addEventListener("click", gererDeconnexion);
  elements.navTabs.forEach((bouton) => {
    bouton?.addEventListener("click", () => {
      afficherSectionApplication(bouton.dataset.sectionTarget);
    });
  });
  elements.addSeanceButton?.addEventListener("click", () => {
    ouvrirFormulaireCreation();
  });
  elements.seanceForm?.addEventListener("submit", gererSoumissionSeance);
  elements.heureDebutHourSelect?.addEventListener("change", mettreAJourHeureDebutSelectionnee);
  elements.heureDebutMinuteSelect?.addEventListener(
    "change",
    mettreAJourHeureDebutSelectionnee
  );
  elements.editSeanceButton?.addEventListener("click", ouvrirFormulaireModification);
  elements.deleteSeanceButton?.addEventListener("click", gererSuppressionSeance);
  elements.adminBlockIpForm?.addEventListener("submit", gererBlocageIpAdmin);

  attacherSelectionUnique(elements.statutCheckboxes);
  attacherSelectionUnique(elements.dureeCheckboxes, mettreAJourHeureFinCalculee);
  attacherSelectionUnique(elements.essaiCheckboxes);

  elements.quickStatusButtons.forEach((bouton) => {
    if (bouton.dataset.status === "reportee") {
      bouton?.addEventListener("click", ouvrirFormulaireReport);
      return;
    }

    bouton?.addEventListener("click", async () => {
      await gererChangementStatut(bouton.dataset.status);
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element?.addEventListener("click", () => {
      fermerModal(document.getElementById(element.dataset.closeModal));
    });
  });
}

function afficherConnexion(options = {}) {
  fermerConnexionTempsReel();
  const preserveFeedback = options.preserveFeedback === true;
  elements.loginView.classList.remove("hidden");
  elements.appView.classList.add("hidden");
  elements.loginForm.reset();
  if (!preserveFeedback) {
    elements.loginError.classList.add("hidden");
  }
  elements.loginShowPassword.checked = false;
  appliquerConnexionMemorisee();
  synchroniserIdentifiantsFormulairesMotDePasse();
  mettreAJourVisibiliteMotDePasseConnexion();
  reinitialiserFormulaireUtilisateur();
  reinitialiserEtatNotificationsPush();
  mettreAJourCarteNotificationsPush();
  elements.passwordSecurityNotice.classList.add("hidden");
  mettreAJourNavigationProtegee();
}

function afficherApplication() {
  elements.loginView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  elements.currentUserName.textContent = etat.utilisateur.nom;
  synchroniserIdentifiantsFormulairesMotDePasse();
  mettreAJourResumeCompteConnecte();
  elements.adminToolsPanel.classList.toggle("hidden", !utilisateurPeutVoirAdministration());
  mettreAJourPanneauAdministration();
  mettreAJourVueAujourdhui();
  mettreAJourNavigationProtegee();
  mettreAJourCarteNotificationsPush();
  afficherSectionApplication(utilisateurDoitChangerMotDePasse() ? "utilisateur" : etat.sectionActive);
  demarrerConnexionTempsReel();
  rafraichirEtatNotificationsPush().catch(() => {});
}

function fermerConnexionTempsReel() {
  if (connexionTempsReel.synchronisationProgrammee) {
    window.clearTimeout(connexionTempsReel.synchronisationProgrammee);
    connexionTempsReel.synchronisationProgrammee = null;
  }

  if (connexionTempsReel.source) {
    connexionTempsReel.source.close();
    connexionTempsReel.source = null;
  }

  connexionTempsReel.synchronisationEnCours = false;
  connexionTempsReel.synchronisationEnAttente = false;
}

function demarrerConnexionTempsReel() {
  if (
    !etat.utilisateur ||
    utilisateurDoitChangerMotDePasse() ||
    connexionTempsReel.source ||
    typeof window.EventSource !== "function"
  ) {
    return;
  }

  const source = new window.EventSource("/api/realtime");
  connexionTempsReel.source = source;

  source?.addEventListener("app-updated", (event) => {
    const payload = parserEvenementTempsReel(event);
    notifierMiseAJourTempsReel(payload);
    programmerSynchronisationTempsReel();
  });

  source?.addEventListener("ping", () => {});

  source.onerror = () => {
    if (!etat.utilisateur) {
      fermerConnexionTempsReel();
    }
  };
}

function programmerSynchronisationTempsReel() {
  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    return;
  }

  if (connexionTempsReel.synchronisationProgrammee) {
    return;
  }

  connexionTempsReel.synchronisationProgrammee = window.setTimeout(() => {
    connexionTempsReel.synchronisationProgrammee = null;
    synchroniserApplicationDepuisTempsReel().catch((erreur) => {
      console.error("Synchronisation temps reel impossible :", erreur);
    });
  }, 350);
}

function appliquerDeconnexionLocale(message) {
  etat.utilisateur = null;
  viderDonneesApplication();
  etat.sectionActive = "aujourdhui";
  afficherConnexion();

  if (message) {
    afficherToast(message, "warning");
  }
}

async function synchroniserApplicationDepuisTempsReel() {
  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    return;
  }

  if (connexionTempsReel.synchronisationEnCours) {
    connexionTempsReel.synchronisationEnAttente = true;
    return;
  }

  connexionTempsReel.synchronisationEnCours = true;

  try {
    const utilisateurActualise = await recupererUtilisateurCourant();

    if (!utilisateurActualise) {
      appliquerDeconnexionLocale("Votre session a ete mise a jour. Reconnectez-vous.");
      return;
    }

    etat.utilisateur = utilisateurActualise;
    afficherApplication();

    const seanceOuverteId =
      etat.seanceSelectionnee && !elements.detailModal.classList.contains("hidden")
        ? Number(etat.seanceSelectionnee.id)
        : null;

    await Promise.all([
      chargerOptionsSeancesDisponibles(),
      chargerSeances(
        seanceOuverteId
          ? {
              ouvrirSeanceId: seanceOuverteId,
            }
          : {}
      ),
      chargerIndisponibilites(),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
      chargerAdministrationSiAutorise(),
    ]);
  } finally {
    connexionTempsReel.synchronisationEnCours = false;

    if (connexionTempsReel.synchronisationEnAttente) {
      connexionTempsReel.synchronisationEnAttente = false;
      programmerSynchronisationTempsReel();
    }
  }
}

function initialiserCalendrierSiNecessaire() {
  if (etat.calendrier) {
    return;
  }

  etat.calendrier = initialiserCalendrier(elements.calendar, {
    onDateClick: ouvrirFormulaireCreation,
    onEventClick: ouvrirDetailSeance,
    onIndisponibiliteClick: gererClicIndisponibilite,
  });

  rafraichirEvenementsCalendrier();
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
  } else if (section === "indisponibilites" && !utilisateurPeutVoirIndisponibilites()) {
    sectionDemandee = utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard";
  } else if (section === "aujourdhui" && !utilisateurPeutVoirAujourdhui()) {
    sectionDemandee = "dashboard";
  } else if (section === "monetisation" && !utilisateurPeutVoirMonetisation()) {
    sectionDemandee = utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard";
  }

  etat.sectionActive = sectionDemandee;

  const cartes = {
    aujourdhui: elements.todaySection,
    dashboard: elements.dashboardSection,
    indisponibilites: elements.indisponibilitesSection,
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

  if (sectionDemandee === "monetisation" && etat.monetisation) {
    mettreAJourMonetisation();
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
  return utilisateurEstHossam() || Number(etat.utilisateur?.peut_voir_aujourdhui) === 1;
}

function utilisateurPeutVoirIndisponibilites() {
  return (
    utilisateurEstHossam() ||
    Number(etat.utilisateur?.peut_voir_indisponibilites) === 1
  );
}

function utilisateurPeutGererIndisponibilites() {
  return utilisateurEstHossam() && !utilisateurDoitChangerMotDePasse();
}

function reinitialiserEtatNotificationsPush() {
  etat.notificationsPush = {
    supported: false,
    permission: "default",
    subscribed: false,
  };
}

function formaterPermissionNotificationsPush(permission) {
  if (permission === "granted") {
    return "Autorisee";
  }

  if (permission === "denied") {
    return "Refusee";
  }

  if (permission === "unsupported") {
    return "Non prise en charge";
  }

  return "A demander";
}

function mettreAJourCarteNotificationsPush() {
  if (!elements.pushSettingsCard) {
    return;
  }

  const notificationsPush = etat.notificationsPush || {};
  const supporte = notificationsPush.supported === true;
  const abonnementActif = notificationsPush.subscribed === true;
  const compteSecurise = !utilisateurDoitChangerMotDePasse();

  if (elements.pushStatusLabel) {
    elements.pushStatusLabel.textContent = supporte
      ? abonnementActif
        ? "Active"
        : "Inactive"
      : "Indisponible";
  }

  if (elements.pushPermissionLabel) {
    elements.pushPermissionLabel.textContent = formaterPermissionNotificationsPush(
      notificationsPush.permission
    );
  }

  if (elements.pushSettingsInfo) {
    if (!supporte) {
      elements.pushSettingsInfo.textContent =
        "Ce navigateur ne prend pas en charge les notifications push.";
    } else if (!compteSecurise) {
      elements.pushSettingsInfo.textContent =
        "Changez d'abord votre mot de passe pour activer les notifications sur cet appareil.";
    } else if (abonnementActif) {
      elements.pushSettingsInfo.textContent =
        "Les notifications temps reel et les rappels toutes les 2 heures sont actifs sur cet appareil.";
    } else {
      elements.pushSettingsInfo.textContent =
        "Les notifications sont desactivees sur cet appareil.";
    }
  }

  if (elements.pushEnableButton) {
    elements.pushEnableButton.disabled =
      !supporte || !compteSecurise || abonnementActif;
  }

  if (elements.pushDisableButton) {
    elements.pushDisableButton.disabled =
      !supporte || !compteSecurise || !abonnementActif;
  }

  if (elements.pushTestButton) {
    elements.pushTestButton.disabled =
      !supporte || !compteSecurise || !abonnementActif;
  }
}

async function rafraichirEtatNotificationsPush() {
  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    reinitialiserEtatNotificationsPush();
    mettreAJourCarteNotificationsPush();
    return;
  }

  try {
    etat.notificationsPush = await recupererEtatNotificationsPush();

    if (etat.notificationsPush.subscribed) {
      await synchroniserNotificationsPushActuelles();
    }
  } catch (erreur) {
    etat.notificationsPush = {
      supported: false,
      permission: "unsupported",
      subscribed: false,
    };
  }

  mettreAJourCarteNotificationsPush();
}

function seanceEstMasqueePourConfidentialite(seance) {
  return (
    Boolean(seance?.est_masquee_pour_confidentialite) ||
    Boolean(seance?.est_compte_hossam_prive)
  );
}

function obtenirMessageSeanceConfidentielle() {
  return "Ce creneau est reserve et visible uniquement par l'administrateur.";
}

function obtenirSeancesPourStatistiques() {
  return etat.seances.filter((seance) => !seanceEstMasqueePourConfidentialite(seance));
}

function seanceDoitEtreMasqueeDansAujourdhui(seance) {
  if (utilisateurEstAdministrateur()) {
    return false;
  }

  if (seanceEstMasqueePourConfidentialite(seance)) {
    return true;
  }

  if (estJourIntegralementIndisponible(seance?.date)) {
    return true;
  }

  return Boolean(
    trouverIndisponibiliteChevauchanteLocale({
      date: seance?.date,
      heure_debut: seance?.heure_debut,
      heure_fin: seance?.heure_fin,
    })
  );
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

    if (section === "indisponibilites") {
      bouton.classList.toggle("hidden", !utilisateurPeutVoirIndisponibilites());
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
  elements.adminAddSubjectForm.reset();
  masquerErreur(elements.adminAddSubjectError);
  elements.adminAddAccountForm.reset();
  masquerErreur(elements.adminAddAccountError);
  elements.adminCreateUserForm.reset();
  masquerErreur(elements.adminCreateUserError);
  masquerInfo(elements.adminCreateUserResult);
  elements.adminDeleteUserForm.reset();
  masquerErreur(elements.adminDeleteUserError);
  elements.adminResetPasswordForm.reset();
  masquerErreur(elements.adminResetPasswordError);
  masquerInfo(elements.adminResetPasswordResult);
  elements.adminToggleAccessForm.reset();
  masquerErreur(elements.adminToggleAccessError);
  elements.adminReadonlyForm.reset();
  masquerErreur(elements.adminReadonlyError);
  elements.adminTodayForm.reset();
  masquerErreur(elements.adminTodayError);
  elements.adminUnavailabilityAccessForm.reset();
  masquerErreur(elements.adminUnavailabilityAccessError);
  elements.adminMonetisationForm.reset();
  masquerErreur(elements.adminMonetisationError);
  elements.adminRateForm.reset();
  elements.adminRateValue.dataset.boundAccountId = "";
  masquerErreur(elements.adminRateError);
  masquerErreur(elements.pushSettingsError);
  elements.adminLogoutUserForm.reset();
  masquerErreur(elements.adminLogoutUserError);
  elements.adminSessionCurrentPassword.value = "";
  masquerErreur(elements.adminSessionError);
  elements.adminTrustedDeviceCurrentPassword.value = "";
  masquerErreur(elements.adminTrustedDeviceError);
  elements.adminClearSeancesForm.reset();
  masquerErreur(elements.adminClearSeancesError);
  elements.adminClearHistoryForm.reset();
  masquerErreur(elements.adminClearHistoryError);
  elements.adminUnavailabilityForm?.reset?.();
  masquerErreur(elements.adminUnavailabilityError);
  elements.adminBlockIpForm.reset();
  masquerErreur(elements.adminBlockIpError);
  initialiserFormulaireIndisponibilite();
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
    ? "Ajout d'utilisateurs, sessions actives, lecture seule et actions sensibles sont centralises ici. Les indisponibilites ont maintenant leur menu dedie."
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

  mettreAJourSuppressionHistorique(etat.historiqueSelection);
}

async function gererConnexion(event) {
  event.preventDefault();
  masquerErreur(elements.loginError);
  elements.loginButton.disabled = true;
  const originalText = elements.loginButton.textContent;
  elements.loginButton.textContent = "Connexion en cours...";
  elements.loginButton.textContent = "Connexion...";

  try {
    const utilisateur = await connecterUtilisateur(
      elements.loginUsername.value.trim(),
      elements.loginPassword.value,
      elements.loginRemember.checked
    );

    if (elements.loginRemember.checked) {
      enregistrerConnexionMemorisee(elements.loginUsername.value.trim());
    } else {
      effacerConnexionMemorisee();
    }

    etat.utilisateur = utilisateur;
    afficherApplication();
    await chargerDonneesApplication();
    afficherToast("Connexion reussie.");
  } catch (erreur) {
    if (erreur.status === 429 && erreur.retryAfter) {
      let restantes = parseInt(erreur.retryAfter, 10);
      if (!isNaN(restantes)) {
        if (elements.loginButton) elements.loginButton.disabled = true;
        afficherErreur(elements.loginError, "Trop de tentatives. Reessayez dans " + restantes + "s");
        const timer = setInterval(() => {
          restantes--;
          if (restantes <= 0) {
            clearInterval(timer);
            masquerErreur(elements.loginError);
            if (elements.loginButton) {
              elements.loginButton.disabled = false;
              elements.loginButton.textContent = originalText;
            }
          } else {
            afficherErreur(elements.loginError, "Trop de tentatives. Reessayez dans " + restantes + "s");
          }
        }, 1000);
        return;
      }
    }
    afficherErreur(elements.loginError, erreur.message);
  } finally {
    if (!elements.loginButton.disabled) {
      elements.loginButton.disabled = false;
      elements.loginButton.textContent = originalText;
    }
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

async function gererActivationNotificationsPush() {
  masquerErreur(elements.pushSettingsError);

  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    afficherErreur(
      elements.pushSettingsError,
      "Changez d'abord votre mot de passe pour activer les notifications."
    );
    return;
  }

  const texteInitial = elements.pushEnableButton.textContent;
  elements.pushEnableButton.disabled = true;
  elements.pushEnableButton.textContent = "Activation...";

  try {
    etat.notificationsPush = await activerNotificationsPush();
    mettreAJourCarteNotificationsPush();
    afficherToast("Notifications push activees sur cet appareil.");
  } catch (erreur) {
    afficherErreur(elements.pushSettingsError, erreur.message);
  } finally {
    elements.pushEnableButton.textContent = texteInitial;
    mettreAJourCarteNotificationsPush();
  }
}

async function gererDesactivationNotificationsPush() {
  masquerErreur(elements.pushSettingsError);

  const texteInitial = elements.pushDisableButton.textContent;
  elements.pushDisableButton.disabled = true;
  elements.pushDisableButton.textContent = "Desactivation...";

  try {
    etat.notificationsPush = await desactiverNotificationsPush();
    mettreAJourCarteNotificationsPush();
    afficherToast("Notifications push desactivees sur cet appareil.");
  } catch (erreur) {
    afficherErreur(elements.pushSettingsError, erreur.message);
  } finally {
    elements.pushDisableButton.textContent = texteInitial;
    mettreAJourCarteNotificationsPush();
  }
}

async function gererTestNotificationsPush() {
  masquerErreur(elements.pushSettingsError);

  const texteInitial = elements.pushTestButton.textContent;
  elements.pushTestButton.disabled = true;
  elements.pushTestButton.textContent = "Envoi...";

  try {
    const resultat = await envoyerNotificationPushTest();
    afficherToast(resultat.message || "Notification de test envoyee.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherErreur(elements.pushSettingsError, erreur.message);
  } finally {
    elements.pushTestButton.textContent = texteInitial;
    mettreAJourCarteNotificationsPush();
  }
}

async function gererCreationUtilisateurAdmin(event) {
  event.preventDefault();
  masquerErreur(elements.adminCreateUserError);
  masquerInfo(elements.adminCreateUserResult);

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
    const motDePasseTemporaire = String(resultat?.mot_de_passe_temporaire || "");
    elements.adminCreateUserForm.reset();
    if (motDePasseTemporaire) {
      afficherInfo(
        elements.adminCreateUserResult,
        `Code temporaire pour ${resultat?.utilisateur?.nom || "le nouvel utilisateur"} : ${motDePasseTemporaire}`
      );
    }
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

async function gererSuppressionElementCatalogueAdministration({
  type,
  elementCatalogue,
  motDePasseInput,
  erreurElement,
  bouton,
}) {
  masquerErreur(erreurElement);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const motDePasseActuel = String(motDePasseInput?.value || "");

  if (!motDePasseActuel) {
    afficherErreur(
      erreurElement,
      "Saisissez votre mot de passe actuel avant de supprimer cet element."
    );
    return;
  }

  const libelleType = type === "matiere" ? "matiere" : "compte";
  const confirmation = window.confirm(
    `Supprimer ${libelleType} ${elementCatalogue.valeur} du catalogue ? Les seances existantes resteront conservees.`
  );

  if (!confirmation) {
    return;
  }

  bouton.disabled = true;

  try {
    const resultat = await supprimerElementCatalogueAdmin(
      elementCatalogue.id,
      motDePasseActuel
    );
    if (motDePasseInput) {
      motDePasseInput.value = "";
    }
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Element du catalogue supprime.");
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
  }
}

async function gererCreationIndisponibilite(event) {
  event.preventDefault();
  const controles = obtenirControlesIndisponibiliteActifs();
  masquerErreur(controles.errorElement);

  if (!utilisateurPeutGererIndisponibilites()) {
    afficherSectionApplication("dashboard");
    return;
  }

  const date = controles.dateInput.value;
  const jourComplet =
    controles.form?.dataset.fullDay === "1" ||
    Boolean(controles.fullDayInput?.checked) ||
    Boolean(controles.timeFields?.classList.contains("hidden"));
  const heureDebut = jourComplet ? "00:00" : controles.startInput.value;
  const heureFin = jourComplet ? "23:59" : controles.endInput.value;
  const raison = controles.reasonInput.value.trim();

  if (!date || (!jourComplet && (!heureDebut || !heureFin))) {
    afficherErreur(
      controles.errorElement,
      "Date, heure de debut et heure de fin obligatoires."
    );
    return;
  }

  if (!estDateIsoValide(date)) {
    afficherErreur(controles.errorElement, "La date est invalide.");
    return;
  }

  if (!jourComplet) {
    if (!estHeureDebutSeanceValide(heureDebut) || !estHeureDebutSeanceValide(heureFin)) {
      afficherErreur(
        controles.errorElement,
        "Les heures doivent etre choisies par tranches de 30 minutes."
      );
      return;
    }

    if (calculerDureeMinutesDepuisHeures(heureDebut, heureFin) <= 0) {
      afficherErreur(
        controles.errorElement,
        "L'heure de fin doit etre posterieure a l'heure de debut."
      );
      return;
    }
  }

  if (raison.length > 200) {
    afficherErreur(
      controles.errorElement,
      "La raison ne peut pas depasser 200 caracteres."
    );
    return;
  }

  const conflit = trouverIndisponibiliteChevauchanteLocale({
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
  });

  if (conflit) {
    afficherErreur(
      controles.errorElement,
      "Ce creneau chevauche deja une indisponibilite existante."
    );
    return;
  }

  controles.button.disabled = true;
  controles.button.textContent = "Ajout...";

  try {
    await creerIndisponibilite({
      date,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      jour_complet: jourComplet,
      raison,
    });
    initialiserFormulaireIndisponibilite();
    await Promise.all([chargerIndisponibilites(), chargerHistorique()]);
    afficherToast(jourComplet ? "Journee indisponible ajoutee." : "Creneau indisponible ajoute.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(controles.errorElement, erreur.message);
  } finally {
    if (controles.button) {
      controles.button.disabled = false;
    }
    mettreAJourModeJourCompletIndisponibilite();
  }
}

async function gererSuppressionIndisponibilite(indisponibiliteId) {
  if (!utilisateurPeutGererIndisponibilites()) {
    afficherSectionApplication("dashboard");
    return;
  }

  const indisponibilite = etat.indisponibilites.find(
    (item) => Number(item.id) === Number(indisponibiliteId)
  );

  if (!indisponibilite) {
    return;
  }

  const confirmation = window.confirm(
    estIndisponibiliteJourCompletClient(indisponibilite)
      ? `Supprimer la journee indisponible du ${formatDate(indisponibilite.date)} ?`
      : `Supprimer le creneau indisponible du ${formatDate(indisponibilite.date)} de ${indisponibilite.heure_debut} a ${indisponibilite.heure_fin} ?`
  );

  if (!confirmation) {
    return;
  }

  try {
    const resultat = await supprimerIndisponibilite(indisponibilite.id);
    await Promise.all([chargerIndisponibilites(), chargerHistorique()]);
    afficherToast(resultat.message || "Creneau indisponible supprime.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

async function gererReinitialisationMotDePasseCompte(event) {
  event.preventDefault();
  masquerErreur(elements.adminResetPasswordError);
  masquerInfo(elements.adminResetPasswordResult);

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
    `Reinitialiser le mot de passe de ${compte.nom} et generer un nouveau code temporaire ?`
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
    const motDePasseTemporaire = String(resultat?.mot_de_passe_temporaire || "");
    elements.adminResetPasswordForm.reset();
    if (motDePasseTemporaire) {
      afficherInfo(
        elements.adminResetPasswordResult,
        `Code temporaire pour ${compte.nom} : ${motDePasseTemporaire}`
      );
    } else {
      masquerInfo(elements.adminResetPasswordResult);
    }

    if (resultat.must_reauthenticate) {
      await deconnecterUtilisateur().catch(() => {});
      etat.utilisateur = null;
      viderDonneesApplication();
      etat.sectionActive = "utilisateur";
      afficherConnexion();
      afficherToast(
        motDePasseTemporaire
          ? `Votre nouveau code temporaire est ${motDePasseTemporaire}. Reconnectez-vous.`
          : "Votre mot de passe a ete reinitialise. Reconnectez-vous."
      );
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
    const resultat = await revoquerSessionSpecifiqueAdmin(sessionId, motDePasseActuel);

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

async function gererRevocationAppareilAutoLogin(appareil) {
  masquerErreur(elements.adminTrustedDeviceError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const motDePasseActuel = elements.adminTrustedDeviceCurrentPassword.value;

  if (!motDePasseActuel) {
    afficherErreur(
      elements.adminTrustedDeviceError,
      "Entrez votre mot de passe actuel pour stopper l'auto-login de cet appareil."
    );
    return;
  }

  const confirmation = window.confirm(
    `Stopper l'auto-login de ${appareil.device_label || "cet appareil"} ?`
  );

  if (!confirmation) {
    return;
  }

  try {
    const resultat = await revoquerAppareilAutoLoginAdmin(appareil.id, motDePasseActuel);
    elements.adminTrustedDeviceCurrentPassword.value = "";
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Auto-login revoque.");
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

    afficherErreur(elements.adminTrustedDeviceError, erreur.message);
  }
}

async function gererBlocageIpAdmin(event) {
  event.preventDefault();
  masquerErreur(elements.adminBlockIpError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const ip = String(elements.adminBlockIpAddress.value || "").trim();
  const raison = String(elements.adminBlockIpReason.value || "").trim();
  const motDePasseActuel = elements.adminBlockIpPassword.value;

  if (!ip || !motDePasseActuel) {
    afficherErreur(
      elements.adminBlockIpError,
      "Entrez une adresse IP et votre mot de passe actuel."
    );
    return;
  }

  const confirmation = window.confirm(`Bloquer l'IP ${ip} ?`);

  if (!confirmation) {
    return;
  }

  if (elements.adminBlockIpButton) {
    elements.adminBlockIpButton.disabled = true;
    elements.adminBlockIpButton.textContent = "Blocage...";
  }

  try {
    const resultat = await bloquerIpAdmin(ip, raison, motDePasseActuel);
    elements.adminBlockIpForm.reset();
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

    afficherErreur(elements.adminBlockIpError, erreur.message);
  } finally {
    if (elements.adminBlockIpButton) {
      elements.adminBlockIpButton.disabled = false;
      elements.adminBlockIpButton.textContent = "Bloquer l'IP";
    }
  }
}

async function gererDeblocageIpAdmin(ip) {
  masquerErreur(elements.adminBlockIpError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const motDePasseActuel = elements.adminBlockIpPassword.value;

  if (!motDePasseActuel) {
    afficherErreur(
      elements.adminBlockIpError,
      "Entrez votre mot de passe actuel pour debloquer une IP."
    );
    return;
  }

  const confirmation = window.confirm(`Debloquer l'IP ${ip} ?`);

  if (!confirmation) {
    return;
  }

  try {
    const resultat = await debloquerIpAdmin(ip, motDePasseActuel);
    elements.adminBlockIpPassword.value = "";
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

    afficherErreur(elements.adminBlockIpError, erreur.message);
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
    "Supprimer définitivement toutes les séances ?"
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
    elements.adminClearSeancesButton.textContent = "Supprimer toutes les séances";
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

function obtenirControlesSuppressionHistorique() {
  return [
    {
      container: elements.historyDeleteActions,
      form: elements.historyDeleteForm,
      input: elements.historyDeleteCurrentPassword,
      error: elements.historyDeleteError,
      button: elements.historyDeleteButton,
    },
    {
      container: elements.historyDetailModalDeleteActions,
      form: elements.historyDetailModalDeleteForm,
      input: elements.historyDetailModalDeleteCurrentPassword,
      error: elements.historyDetailModalDeleteError,
      button: elements.historyDetailModalDeleteButton,
    },
  ].filter((controles) => controles.container && controles.input && controles.error && controles.button);
}

function obtenirControlesSuppressionHistoriqueDepuisDeclencheur(declencheur) {
  return (
    obtenirControlesSuppressionHistorique().find(
      (controles) => controles.button === declencheur || controles.form === declencheur
    ) || null
  );
}

function reinitialiserSuppressionHistorique() {
  obtenirControlesSuppressionHistorique().forEach((controles) => {
    controles.input.value = "";
    masquerErreur(controles.error);
    controles.button.disabled = false;
    controles.button.textContent = "Supprimer cette action";
  });
}

function mettreAJourSuppressionHistorique(entree = etat.historiqueSelection) {
  const visible = utilisateurPeutVoirAdministration() && Number(entree?.id) > 0;

  obtenirControlesSuppressionHistorique().forEach((controles) => {
    controles.container.classList.toggle("hidden", !visible);
    controles.button.dataset.entryId = visible ? String(entree.id) : "";

    if (!visible) {
      controles.input.value = "";
      masquerErreur(controles.error);
      controles.button.disabled = false;
      controles.button.textContent = "Supprimer cette action";
    }
  });
}

async function gererSuppressionEntreeHistorique(event) {
  event?.preventDefault?.();

  const controles =
    obtenirControlesSuppressionHistoriqueDepuisDeclencheur(event?.currentTarget) ||
    obtenirControlesSuppressionHistorique()[0];

  if (!controles) {
    return;
  }

  masquerErreur(controles.error);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    mettreAJourSuppressionHistorique(null);
    return;
  }

  const entreeId = Number(
    controles.button.dataset.entryId || etat.historiqueSelection?.id || 0
  );

  if (!Number.isInteger(entreeId) || entreeId <= 0) {
    afficherErreur(controles.error, "Selectionnez une entree d'historique valide.");
    return;
  }

  const motDePasseActuel = String(controles.input.value || "");

  if (!motDePasseActuel) {
    afficherErreur(
      controles.error,
      "Entrez votre mot de passe actuel pour supprimer cette action."
    );
    return;
  }

  const confirmation = window.confirm(
    "Supprimer cette entree d'historique ?"
  );

  if (!confirmation) {
    return;
  }

  const texteInitial = controles.button.textContent;
  controles.button.disabled = true;
  controles.button.textContent = "Suppression...";

  try {
    const resultat = await supprimerEntreeHistoriqueApi(entreeId, motDePasseActuel);
    etat.historiqueSelection = null;
    reinitialiserSuppressionHistorique();
    await chargerHistorique({ ouvrirEntreeId: null });
    afficherToast(resultat.message || "L'entree d'historique a ete supprimee.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      elements.adminToolsPanel.classList.add("hidden");
      mettreAJourSuppressionHistorique(null);
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(controles.error, erreur.message);
  } finally {
    controles.button.disabled = false;
    controles.button.textContent = texteInitial;
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

async function gererMiseAJourTarifHoraireUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminRateError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const compte = obtenirCompteCatalogueAdministrationParId(elements.adminRateUserId.value);

  if (!compte) {
    afficherErreur(elements.adminRateError, "Selectionnez un compte de seance valide.");
    return;
  }

  const tarifHoraire = Number(elements.adminRateValue.value);

  if (!Number.isInteger(tarifHoraire) || tarifHoraire < 0 || tarifHoraire > 5000) {
    afficherErreur(
      elements.adminRateError,
      "Entrez un tarif horaire entier entre 0 et 5000."
    );
    return;
  }

  const confirmation = window.confirm(
    `Definir le tarif horaire du compte ${compte.valeur} a ${tarifHoraire} dh ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminRateButton.disabled = true;
  elements.adminRateButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourTarifHoraireCompteAdmin(
      compte.id,
      tarifHoraire,
      elements.adminRateCurrentPassword.value
    );
    elements.adminRateForm.reset();
    elements.adminRateValue.dataset.boundAccountId = "";
    await Promise.all([chargerAdministrationSiAutorise(), chargerMonetisationSiAutorise()]);
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

    afficherErreur(elements.adminRateError, erreur.message);
  } finally {
    elements.adminRateButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}

async function gererMiseAJourAccesAujourdhuiUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminTodayError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminTodayUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(elements.adminTodayError, "Selectionnez un compte valide.");
    return;
  }

  const nouvelAccesAujourdhui = Number(compte.peut_voir_aujourdhui) !== 1;
  const confirmation = window.confirm(
    nouvelAccesAujourdhui
      ? `Afficher le menu Aujourd'hui a ${compte.nom} ?`
      : `Masquer le menu Aujourd'hui pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminTodayButton.disabled = true;
  elements.adminTodayButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourAccesAujourdhuiCompte(
      utilisateurId,
      nouvelAccesAujourdhui,
      elements.adminTodayCurrentPassword.value
    );
    elements.adminTodayForm.reset();
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

    afficherErreur(elements.adminTodayError, erreur.message);
  } finally {
    elements.adminTodayButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}

async function gererMiseAJourAccesIndisponibilitesUtilisateur(event) {
  event.preventDefault();
  masquerErreur(elements.adminUnavailabilityAccessError);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const utilisateurId = Number(elements.adminUnavailabilityAccessUserId.value);
  const compte = obtenirCompteAdministrationParId(utilisateurId);

  if (!compte) {
    afficherErreur(
      elements.adminUnavailabilityAccessError,
      "Selectionnez un compte valide."
    );
    return;
  }

  const nouvelAccesIndisponibilites = Number(compte.peut_voir_indisponibilites) !== 1;
  const confirmation = window.confirm(
    nouvelAccesIndisponibilites
      ? `Afficher le menu Indisponibilites a ${compte.nom} ?`
      : `Masquer le menu Indisponibilites pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminUnavailabilityAccessButton.disabled = true;
  elements.adminUnavailabilityAccessButton.textContent = "Mise a jour...";

  try {
    const resultat = await mettreAJourAccesIndisponibilitesCompte(
      utilisateurId,
      nouvelAccesIndisponibilites,
      elements.adminUnavailabilityAccessCurrentPassword.value
    );
    elements.adminUnavailabilityAccessForm.reset();
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

    afficherErreur(elements.adminUnavailabilityAccessError, erreur.message);
  } finally {
    elements.adminUnavailabilityAccessButton.disabled = false;
    mettreAJourControlesAdministration();
  }
}
async function chargerSeances(options = {}) {
  const seances = await recupererSeances();
  etat.seances = seances;
  rafraichirEvenementsCalendrier();
  mettreAJourResume();
  rafraichirCalendrierSiVisible();

  if (options.ouvrirSeanceId) {
    const seance = etat.seances.find(
      (item) => Number(item.id) === Number(options.ouvrirSeanceId)
    );

    if (seance) {
      await ouvrirDetailSeance(seance);
      return;
    }

    if (
      etat.seanceSelectionnee &&
      Number(etat.seanceSelectionnee.id) === Number(options.ouvrirSeanceId) &&
      !elements.detailModal.classList.contains("hidden")
    ) {
      fermerModal(elements.detailModal);
      etat.seanceSelectionnee = null;
    }
  }
}

async function chargerIndisponibilites() {
  if (!utilisateurPeutVoirIndisponibilites()) {
    etat.indisponibilites = [];
    rafraichirEvenementsCalendrier();
    afficherListeIndisponibilitesAdministration();

    if (etat.sectionActive === "indisponibilites") {
      afficherSectionApplication(
        utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard"
      );
    }

    return;
  }

  try {
    etat.indisponibilites = await recupererIndisponibilites();
    rafraichirEvenementsCalendrier();
    afficherListeIndisponibilitesAdministration();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      etat.indisponibilites = [];
      rafraichirEvenementsCalendrier();
      afficherListeIndisponibilitesAdministration();

      if (etat.sectionActive === "indisponibilites") {
        afficherSectionApplication(
          utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard"
        );
      }

      return;
    }

    etat.indisponibilites = [];
    rafraichirEvenementsCalendrier();
    afficherListeIndisponibilitesAdministration();
    afficherToast(erreur.message, "error");
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
    const modeActuel = normaliserModePeriodeMonetisation(etat.monetisationPeriodeMode);
    synchroniserPeriodeMonetisationAuPresent();
    etat.monetisation = await recupererMonetisation(
      modeActuel === "monthly"
        ? {
            mois: etat.monetisationFiltreMoisVue,
          }
        : {
            mode: modeActuel,
            annee: modeActuel === "annual" ? etat.monetisationFiltreAnnee : "",
          }
    );
    etat.monetisationPeriodeMode = normaliserModePeriodeMonetisation(
      etat.monetisation?.periode?.mode_selectionne
    );
    etat.monetisationFiltreAnnee = etat.monetisation?.periode?.annee_selectionnee
      ? normaliserFiltreAnneeMonetisation(etat.monetisation.periode.annee_selectionnee)
      : normaliserFiltreAnneeMonetisation(etat.monetisationFiltreAnnee);
    etat.monetisationFiltreMoisVue = etat.monetisation?.periode?.mois_selectionne
      ? normaliserFiltreMoisMonetisation(etat.monetisation.periode.mois_selectionne)
      : normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
    etat.monetisationFiltreMois = estMoisIsoValide(etat.monetisationFiltreMois)
      ? etat.monetisationFiltreMois
      : etat.monetisation?.periode?.mois_selectionne || obtenirMoisCourantIso();
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

    if (erreur.status === 400) {
      etat.monetisationPeriodeMode = "monthly";
      etat.monetisationFiltreAnnee = obtenirAnneeCouranteIso();
      etat.monetisationFiltreMoisVue = obtenirMoisCourantIso();
      etat.monetisationFiltreMois = obtenirMoisCourantIso();
      etat.monetisation = null;
      viderMonetisation();
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
        matieres: normaliserListeCatalogue(etat.administration.catalogue.matieres),
        comptes: normaliserListeCatalogue(etat.administration.catalogue.comptes),
      };
      rendreOptionsCatalogueSeance();
    }
    mettreAJourPanneauAdministration();
    afficherListeIndisponibilitesAdministration();
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
      matieres: normaliserListeCatalogue(options?.matieres),
      comptes: normaliserListeCatalogue(options?.comptes),
    };
    rendreOptionsCatalogueSeance();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    etat.catalogue = creerCatalogueVide();
    rendreOptionsCatalogueSeance();
  }
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
  elements.adminTrustedDevicesList.innerHTML =
    '<div class="admin-session-empty">Aucun appareil auto-login pour le moment.</div>';
  elements.adminAuditLogList.innerHTML =
    '<div class="admin-session-empty">Aucun log disponible.</div>';
  elements.adminBlockedIpsList.innerHTML =
    '<div class="admin-session-empty">Aucune IP bloquee.</div>';
  elements.adminSubjectList.innerHTML =
    '<div class="admin-user-empty">Aucune matière disponible.</div>';
  elements.adminAccountList.innerHTML =
    '<div class="admin-user-empty">Aucun compte disponible.</div>';
  elements.adminUnavailabilityList.innerHTML =
    '<div class="admin-session-empty">Aucun creneau indisponible pour le moment.</div>';
  masquerInfo(elements.adminCreateUserResult);
  masquerInfo(elements.adminResetPasswordResult);
  masquerErreur(elements.adminTrustedDeviceError);
  masquerErreur(elements.adminRateError);
  elements.adminUnavailabilityForm.classList.toggle(
    "hidden",
    !utilisateurPeutGererIndisponibilites()
  );

  [
    elements.adminDeleteUserId,
    elements.adminResetUserId,
    elements.adminAccessUserId,
    elements.adminReadonlyUserId,
    elements.adminTodayUserId,
    elements.adminUnavailabilityAccessUserId,
    elements.adminMonetisationUserId,
    elements.adminRateUserId,
    elements.adminLogoutUserId,
  ].forEach((select) => {
    if (select) {
      select.innerHTML = '<option value="">Aucune donnée</option>';
      select.disabled = true;
    }
  });

  elements.adminToggleAccessStatus.textContent = "-";
  elements.adminReadonlyStatus.textContent = "-";
  elements.adminTodayStatus.textContent = "-";
  elements.adminUnavailabilityAccessStatus.textContent = "-";
  elements.adminMonetisationStatus.textContent = "-";
  elements.adminRateStatus.textContent = "-";
  elements.adminDeleteUserButton.textContent = "Supprimer l'utilisateur";
  elements.adminToggleAccessButton.textContent = "Mettre à jour l'accès";
  elements.adminReadonlyButton.textContent = "Mettre à jour le mode";
  elements.adminTodayButton.textContent = "Mettre à jour Aujourd'hui";
  elements.adminUnavailabilityAccessButton.textContent = "Mettre à jour Indisponibilites";
  elements.adminMonetisationButton.textContent = "Mettre à jour Monetisation";
  elements.adminRateButton.textContent = "Mettre a jour le tarif";
  elements.adminLogoutUserButton.textContent = "Couper les sessions";
  elements.adminDeleteUserButton.disabled = true;
  elements.adminToggleAccessButton.disabled = true;
  elements.adminReadonlyButton.disabled = true;
  elements.adminTodayButton.disabled = true;
  elements.adminUnavailabilityAccessButton.disabled = true;
  elements.adminMonetisationButton.disabled = true;
  elements.adminRateButton.disabled = true;
  elements.adminLogoutUserButton.disabled = true;
  if (elements.adminRateValue) {
    elements.adminRateValue.value = "";
    elements.adminRateValue.dataset.boundAccountId = "";
  }
  if (elements.adminBlockIpButton) {
    elements.adminBlockIpButton.disabled = false;
    elements.adminBlockIpButton.textContent = "Bloquer l'IP";
  }
}

function obtenirDateLocaleIso(dateObjet = new Date()) {
  const annee = dateObjet.getFullYear();
  const mois = String(dateObjet.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function obtenirMoisCourantIso(dateObjet = new Date()) {
  return obtenirDateLocaleIso(dateObjet).slice(0, 7);
}

function obtenirAnneeCouranteIso(dateObjet = new Date()) {
  return obtenirDateLocaleIso(dateObjet).slice(0, 4);
}

function estMoisIsoValide(moisIso) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(moisIso || ""));
}

function estAnneeIsoValide(anneeIso) {
  return /^\d{4}$/.test(String(anneeIso || ""));
}

function normaliserFiltreMoisMonetisation(valeur) {
  const valeurNormalisee = String(valeur || "").trim();

  if (!valeurNormalisee || valeurNormalisee === "all") {
    return "all";
  }

  return estMoisIsoValide(valeurNormalisee) ? valeurNormalisee : obtenirMoisCourantIso();
}

function normaliserFiltreAnneeMonetisation(valeur) {
  const valeurNormalisee = String(valeur || "").trim();
  return estAnneeIsoValide(valeurNormalisee) ? valeurNormalisee : obtenirAnneeCouranteIso();
}

function normaliserModePeriodeMonetisation(valeur) {
  const mode = String(valeur || "").trim().toLowerCase();

  if (mode === "global") {
    return "global";
  }

  if (mode === "annual") {
    return "annual";
  }

  return "monthly";
}

function formaterMoisIso(moisIso) {
  if (!estMoisIsoValide(moisIso)) {
    return "Tous les mois";
  }

  const libelle = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${moisIso}-01T12:00:00`));

  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

function formaterAnneeIso(anneeIso) {
  return estAnneeIsoValide(anneeIso) ? anneeIso : obtenirAnneeCouranteIso();
}

function construireMoisIsoDepuisAnnee(anneeIso, moisReference = obtenirMoisCourantIso()) {
  const anneeNormalisee = normaliserFiltreAnneeMonetisation(anneeIso);
  const moisNormalise = estMoisIsoValide(moisReference) ? moisReference : obtenirMoisCourantIso();
  return `${anneeNormalisee}-${moisNormalise.slice(5, 7)}`;
}

function decalerMoisIso(moisIso, decalage) {
  const moisNormalise = estMoisIsoValide(moisIso) ? moisIso : obtenirMoisCourantIso();
  const [annee, mois] = moisNormalise.split("-").map((valeur) => Number.parseInt(valeur, 10));
  const date = new Date(annee, mois - 1 + Number(decalage || 0), 1);
  return obtenirMoisCourantIso(date);
}

function decalerAnneeIso(anneeIso, decalage) {
  const anneeNormalisee = normaliserFiltreAnneeMonetisation(anneeIso);
  const valeurDecalage = Number(decalage || 0);
  const prochaineAnnee = Number.parseInt(anneeNormalisee, 10) + valeurDecalage;

  if (!Number.isInteger(prochaineAnnee) || prochaineAnnee < 1 || prochaineAnnee > 9999) {
    return anneeNormalisee;
  }

  return String(prochaineAnnee).padStart(4, "0");
}

function limiterMoisMonetisationAuPresent(moisIso) {
  const moisNormalise = normaliserFiltreMoisMonetisation(moisIso);
  const moisCourant = obtenirMoisCourantIso();

  if (!estMoisIsoValide(moisNormalise)) {
    return moisCourant;
  }

  return moisNormalise.localeCompare(moisCourant) > 0 ? moisCourant : moisNormalise;
}

function limiterAnneeMonetisationAuPresent(anneeIso) {
  const anneeNormalisee = normaliserFiltreAnneeMonetisation(anneeIso);
  const anneeCourante = obtenirAnneeCouranteIso();
  return anneeNormalisee.localeCompare(anneeCourante) > 0 ? anneeCourante : anneeNormalisee;
}

function synchroniserPeriodeMonetisationAuPresent() {
  const modeActuel = normaliserModePeriodeMonetisation(etat.monetisationPeriodeMode);

  if (modeActuel === "monthly") {
    const moisLimite = limiterMoisMonetisationAuPresent(etat.monetisationFiltreMoisVue);
    etat.monetisationFiltreMoisVue = moisLimite;
    etat.monetisationFiltreAnnee = moisLimite.slice(0, 4);
    return;
  }

  const anneeLimitee = limiterAnneeMonetisationAuPresent(etat.monetisationFiltreAnnee);
  etat.monetisationFiltreAnnee = anneeLimitee;
  etat.monetisationFiltreMoisVue = limiterMoisMonetisationAuPresent(
    construireMoisIsoDepuisAnnee(anneeLimitee, etat.monetisationFiltreMoisVue)
  );
}

function obtenirModesAlternatifsMonetisation(modeActuel) {
  if (modeActuel === "annual") {
    return [
      { mode: "monthly", label: "Mensuelle" },
      { mode: "global", label: "Globale" },
    ];
  }

  if (modeActuel === "global") {
    return [
      { mode: "monthly", label: "Mensuelle" },
      { mode: "annual", label: "Annuelle" },
    ];
  }

  return [
    { mode: "annual", label: "Annuelle" },
    { mode: "global", label: "Globale" },
  ];
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
    .filter(
      (seance) =>
        seance.date === dateAujourdhui && !seanceDoitEtreMasqueeDansAujourdhui(seance)
    )
    .sort((premiereSeance, secondeSeance) => {
      return (
        obtenirCleTriHeure(premiereSeance.heure_debut) -
        obtenirCleTriHeure(secondeSeance.heure_debut)
      );
    });
}

function mettreAJourVueAujourdhui() {
  if (elements.todayDateLabel) {
    elements.todayDateLabel.textContent = formaterDateAujourdhui();
  }

  const seancesAujourdhui = obtenirSeancesAujourdhui();
  if (elements.todayCount) {
    elements.todayCount.textContent = String(seancesAujourdhui.length);
  }
  
  if (elements.todayList) {
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
}

function creerCarteSeanceAujourdhui(seance) {
  const estConfidentielle = seanceEstMasqueePourConfidentialite(seance);
  const ligne = document.createElement("button");
  ligne.type = "button";
  ligne.className = "today-row";
  ligne.addEventListener("click", async () => {
    if (estConfidentielle) {
      afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
      return;
    }

    await ouvrirDetailSeance(seance);
  });

  const heure = document.createElement("span");
  heure.className = "today-time";
  heure.textContent = estHeureValide(seance.heure_debut) ? seance.heure_debut : "--:--";

  const carte = document.createElement("span");
  carte.className = `today-item today-item-${seance.statut_seance}`;
  if (estConfidentielle) {
    carte.classList.add("today-item-confidentielle");
  }

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
  if (estConfidentielle) {
    definirBadge(badgeStatut, "confidentielle", "Indisponible");
  } else {
    definirBadge(
      badgeStatut,
      seance.statut_seance,
      libellesStatutSeance[seance.statut_seance] || "Séance"
    );
  }

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
  if (Array.isArray(classesSupplementaires)) {
    classesSupplementaires.forEach((classe) => puce.classList.add(classe));
  } else if (typeof classesSupplementaires === 'string') {
    puce.classList.add(classesSupplementaires);
  }
  puce.textContent = texte;
  return puce;
}

function obtenirClasseCompteAujourdhui(compte) {
  if (compte === "Yassine") return "today-item-account-yassine";
  if (compte === "Abdo") return "today-item-account-abdo";
  return "";
}

function normaliserNomCompte(compte) {
  const valeurBrute = String(compte || "").trim();
  const valeur = valeurBrute.toLowerCase();
  if (valeur === "yassine") return "Yassine";
  if (valeur === "abdo" || valeur === "ami") return "Abdo";
  return valeurBrute;
}

function calculerStatistiquesCompte(compteRecherche) {
  const seancesDuCompte = obtenirSeancesPourStatistiques().filter(
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

function formaterMontantDh(montant) {
  const montantNormalise = Number(montant);

  if (!Number.isFinite(montantNormalise)) {
    return "0 dh";
  }

  const options = Number.isInteger(montantNormalise)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  return `${new Intl.NumberFormat("fr-FR", options).format(montantNormalise)} dh`;
}

function creerEmptyState(message, className = "empty-state") {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = message;
  return element;
}

function obtenirStatistiquesMonetisationCompte(nomCompte) {
  const statsCompte = etat.monetisation?.comptes?.[nomCompte];

  if (statsCompte) {
    return statsCompte;
  }

  const tarifsParDefaut = {
    Yassine: 130,
    Abdo: 90,
    Hossam: 150,
  };

  return {
    tarif_unitaire: tarifsParDefaut[nomCompte] || 0,
    seances_facturables: 0,
    seances_essai_faites: 0,
    montant_du: 0,
  };
}

function obtenirComptesMonetisationDisponibles() {
  const ordreComptes = Array.isArray(etat.monetisation?.ordre_comptes)
    ? etat.monetisation.ordre_comptes
    : Object.keys(etat.monetisation?.comptes || {});

  return Array.from(
    new Set(
      ordreComptes
        .map((nomCompte) => String(nomCompte || "").trim())
        .filter(Boolean)
    )
  );
}

function utilisateurPeutChoisirComptesReleveMonetisation() {
  return utilisateurEstHossam() && utilisateurPeutVoirMonetisation();
}

function obtenirComptesAutorisesPourReleveMonetisation() {
  const comptesDisponibles = obtenirComptesMonetisationDisponibles();

  if (utilisateurPeutChoisirComptesReleveMonetisation()) {
    return comptesDisponibles;
  }

  return comptesDisponibles.filter(
    (nomCompte) => String(nomCompte || "").trim().toLowerCase() !== "hossam"
  );
}

function synchroniserSelectionComptesMonetisation() {
  const comptesDisponibles = obtenirComptesAutorisesPourReleveMonetisation();

  if (!utilisateurPeutChoisirComptesReleveMonetisation()) {
    etat.monetisationComptesSelectionnes = [...comptesDisponibles];
    etat.monetisationSelectionInitialisee = true;
    return;
  }

  if (!etat.monetisationSelectionInitialisee) {
    etat.monetisationComptesSelectionnes = [...comptesDisponibles];
    etat.monetisationSelectionInitialisee = true;
    return;
  }

  const selectionCourante = new Set(
    etat.monetisationComptesSelectionnes.map((nomCompte) => String(nomCompte || "").trim())
  );
  etat.monetisationComptesSelectionnes = comptesDisponibles.filter((nomCompte) =>
    selectionCourante.has(String(nomCompte || "").trim())
  );
  etat.monetisationSelectionInitialisee = true;
}

function obtenirComptesMonetisationSelectionnes() {
  const comptesDisponibles = obtenirComptesAutorisesPourReleveMonetisation();

  if (!utilisateurPeutChoisirComptesReleveMonetisation()) {
    return comptesDisponibles;
  }

  const selectionCourante = new Set(
    etat.monetisationComptesSelectionnes.map((nomCompte) => String(nomCompte || "").trim())
  );

  return comptesDisponibles.filter((nomCompte) =>
    selectionCourante.has(String(nomCompte || "").trim())
  );
}

function obtenirConfigurationReleveMonetisation() {
  const modeActuel = normaliserModePeriodeMonetisation(etat.monetisationPeriodeMode);

  if (modeActuel === "annual") {
    const anneeSelectionnee = normaliserFiltreAnneeMonetisation(etat.monetisationFiltreAnnee);
    return {
      options: {
        mode: "annual",
        annee: anneeSelectionnee,
        format: "pdf",
      },
      periodeValide: estAnneeIsoValide(anneeSelectionnee),
      texteBouton: "Telecharger releve annuel",
      messageSucces: "Le releve annuel a ete telecharge.",
      nomFichierSecours: `releve-monetisation-annuelle-${anneeSelectionnee}.pdf`,
    };
  }

  if (modeActuel === "global") {
    return {
      options: {
        mode: "global",
        format: "pdf",
      },
      periodeValide: true,
      texteBouton: "Telecharger releve global",
      messageSucces: "Le releve global a ete telecharge.",
      nomFichierSecours: "releve-monetisation-globale.pdf",
    };
  }

  const moisSelectionne = normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
  return {
    options: {
      mois: moisSelectionne,
      format: "pdf",
    },
    periodeValide: estMoisIsoValide(moisSelectionne),
    texteBouton: "Telecharger releve mensuel",
    messageSucces: "Le releve mensuel a ete telecharge.",
    nomFichierSecours: `releve-monetisation-mensuelle-${moisSelectionne}.pdf`,
  };
}

function mettreAJourControlesPeriodeMonetisation() {
  const modeActuel = normaliserModePeriodeMonetisation(etat.monetisationPeriodeMode);
  const anneeActuelle = normaliserFiltreAnneeMonetisation(etat.monetisationFiltreAnnee);
  const moisActuel = normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
  const anneeCourante = obtenirAnneeCouranteIso();
  const moisCourant = obtenirMoisCourantIso();
  const modesAlternatifs = obtenirModesAlternatifsMonetisation(modeActuel);

  if (elements.monetisationPeriodTitle) {
    elements.monetisationPeriodTitle.textContent =
      modeActuel === "global"
        ? "Vue Globale"
        : modeActuel === "annual"
          ? formaterAnneeIso(anneeActuelle)
          : formaterMoisIso(moisActuel);
  }

  if (elements.monetisationPreviousMonthButton) {
    elements.monetisationPreviousMonthButton.disabled = modeActuel === "global";
  }

  if (elements.monetisationNextMonthButton) {
    elements.monetisationNextMonthButton.disabled =
      modeActuel === "global" ||
      (modeActuel === "annual"
        ? anneeActuelle.localeCompare(anneeCourante) >= 0
        : moisActuel.localeCompare(moisCourant) >= 0);
  }

  if (elements.monetisationModeOptionOneButton) {
    elements.monetisationModeOptionOneButton.textContent = modesAlternatifs[0].label;
    elements.monetisationModeOptionOneButton.dataset.mode = modesAlternatifs[0].mode;
  }

  if (elements.monetisationModeOptionTwoButton) {
    elements.monetisationModeOptionTwoButton.textContent = modesAlternatifs[1].label;
    elements.monetisationModeOptionTwoButton.dataset.mode = modesAlternatifs[1].mode;
  }
}

function mettreAJourEtatExportMonetisation() {
  const comptesSelectionnes = obtenirComptesMonetisationSelectionnes();
  const configurationReleve = obtenirConfigurationReleveMonetisation();

  if (elements.monetisationDownloadStatementButton) {
    if (elements.monetisationDownloadStatementButton.dataset.loading !== "true") {
      elements.monetisationDownloadStatementButton.textContent = configurationReleve.texteBouton;
    }

    elements.monetisationDownloadStatementButton.disabled =
      !configurationReleve.periodeValide || comptesSelectionnes.length === 0;
  }
}

function afficherSelectionComptesMonetisation() {
  if (!elements.monetisationReportAccountsSection || !elements.monetisationReportAccounts) {
    mettreAJourEtatExportMonetisation();
    return;
  }

  if (!utilisateurPeutChoisirComptesReleveMonetisation()) {
    elements.monetisationReportAccounts.innerHTML = "";
    elements.monetisationReportAccountsSection.classList.add("hidden");
    mettreAJourEtatExportMonetisation();
    return;
  }

  const comptesDisponibles = obtenirComptesAutorisesPourReleveMonetisation();
  const comptesSelectionnes = new Set(obtenirComptesMonetisationSelectionnes());

  elements.monetisationReportAccounts.innerHTML = "";

  if (comptesDisponibles.length === 0) {
    elements.monetisationReportAccountsSection.classList.add("hidden");
    mettreAJourEtatExportMonetisation();
    return;
  }

  comptesDisponibles.forEach((nomCompte) => {
    const label = document.createElement("label");
    label.className = "checkbox-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = comptesSelectionnes.has(nomCompte);
    input.dataset.compte = nomCompte;
    input.addEventListener("change", () => {
      const selectionCourante = new Set(obtenirComptesMonetisationSelectionnes());

      if (input.checked) {
        selectionCourante.add(nomCompte);
      } else {
        selectionCourante.delete(nomCompte);
      }

      etat.monetisationComptesSelectionnes = comptesDisponibles.filter((compte) =>
        selectionCourante.has(compte)
      );
      etat.monetisationSelectionInitialisee = true;
      afficherSelectionComptesMonetisation();
    });

    const contenu = document.createElement("span");
    contenu.textContent = nomCompte;

    label.append(input, contenu);
    elements.monetisationReportAccounts.appendChild(label);
  });

  if (elements.monetisationReportAccountsNote) {
    const nombreSelectionnes = comptesSelectionnes.size;
    elements.monetisationReportAccountsNote.textContent =
      nombreSelectionnes > 0
        ? `${nombreSelectionnes} compte(s) inclus dans le releve.`
        : "Choisis au moins un compte a inclure dans le releve.";
  }

  elements.monetisationReportAccountsSection.classList.remove("hidden");
  mettreAJourEtatExportMonetisation();
}

async function gererClicModePeriodeMonetisation(event) {
  const mode = String(event?.currentTarget?.dataset?.mode || "").trim();

  if (!mode) {
    return;
  }

  await appliquerModePeriodeMonetisation(mode);
}

async function appliquerModePeriodeMonetisation(mode) {
  const modeNormalise = normaliserModePeriodeMonetisation(mode);

  if (modeNormalise === etat.monetisationPeriodeMode) {
    return;
  }

  if (modeNormalise === "annual") {
    const moisVue = normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
    if (estMoisIsoValide(moisVue)) {
      etat.monetisationFiltreAnnee = limiterAnneeMonetisationAuPresent(moisVue.slice(0, 4));
    }
  }

  if (modeNormalise === "monthly") {
    const moisVueActuel = normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
    const anneeCible = limiterAnneeMonetisationAuPresent(etat.monetisationFiltreAnnee);
    etat.monetisationFiltreMoisVue = limiterMoisMonetisationAuPresent(
      construireMoisIsoDepuisAnnee(anneeCible, moisVueActuel)
    );
  }

  etat.monetisationPeriodeMode = modeNormalise;
  synchroniserPeriodeMonetisationAuPresent();
  mettreAJourControlesPeriodeMonetisation();
  mettreAJourEtatExportMonetisation();
  await chargerMonetisationSiAutorise();
}

async function naviguerPeriodeMonetisation(direction) {
  const modeActuel = normaliserModePeriodeMonetisation(etat.monetisationPeriodeMode);
  const decalage = direction === "precedent" ? -1 : 1;

  if (modeActuel === "global") {
    return;
  }

  if (modeActuel === "monthly") {
    const moisActuel = normaliserFiltreMoisMonetisation(etat.monetisationFiltreMoisVue);
    const moisCible = limiterMoisMonetisationAuPresent(decalerMoisIso(moisActuel, decalage));

    if (moisCible === moisActuel) {
      return;
    }

    etat.monetisationFiltreMoisVue = moisCible;
    etat.monetisationFiltreAnnee = moisCible.slice(0, 4);
    mettreAJourControlesPeriodeMonetisation();
    mettreAJourEtatExportMonetisation();
    await chargerMonetisationSiAutorise();
    return;
  }

  const anneeActuelle = normaliserFiltreAnneeMonetisation(etat.monetisationFiltreAnnee);
  const anneeCible = limiterAnneeMonetisationAuPresent(decalerAnneeIso(anneeActuelle, decalage));

  if (anneeCible === anneeActuelle) {
    return;
  }

  etat.monetisationFiltreAnnee = anneeCible;
  etat.monetisationFiltreMoisVue = limiterMoisMonetisationAuPresent(
    construireMoisIsoDepuisAnnee(
      anneeCible,
      etat.monetisationFiltreMoisVue
    )
  );
  mettreAJourControlesPeriodeMonetisation();
  mettreAJourEtatExportMonetisation();
  await chargerMonetisationSiAutorise();
}

async function gererTelechargementReleveMonetisation() {
  const comptesSelectionnes = obtenirComptesMonetisationSelectionnes();
  const configurationReleve = obtenirConfigurationReleveMonetisation();

  if (!configurationReleve.periodeValide) {
    afficherToast("Selectionnez une periode valide pour telecharger le releve.", "warning");
    return;
  }

  if (comptesSelectionnes.length === 0) {
    afficherToast("Selectionnez au moins un compte pour generer le releve.", "warning");
    return;
  }

  const texteInitial =
    elements.monetisationDownloadStatementButton?.textContent || configurationReleve.texteBouton;

  if (elements.monetisationDownloadStatementButton) {
    elements.monetisationDownloadStatementButton.dataset.loading = "true";
    elements.monetisationDownloadStatementButton.disabled = true;
    elements.monetisationDownloadStatementButton.textContent = "Preparation...";
  }

  try {
    const resultat = await telechargerReleveMonetisation(
      configurationReleve.options,
      comptesSelectionnes
    );
    const url = URL.createObjectURL(resultat.blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = resultat.fileName || configurationReleve.nomFichierSecours;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    afficherToast(configurationReleve.messageSucces, "success");
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
  } finally {
    if (elements.monetisationDownloadStatementButton) {
      delete elements.monetisationDownloadStatementButton.dataset.loading;
      elements.monetisationDownloadStatementButton.textContent = texteInitial;
    }

    mettreAJourEtatExportMonetisation();
  }
}

function parserEvenementTempsReel(event) {
  if (!event?.data) {
    return {};
  }

  try {
    return JSON.parse(event.data);
  } catch (error) {
    return {};
  }
}

function construireMessageNotificationTempsReel(payload = {}) {
  const acteur = String(payload.actorName || "").trim() || "Quelqu'un";
  const messagesParAction = {
    seance_added: `${acteur} a ajoute une seance.`,
    seance_updated: `${acteur} a modifie une seance.`,
    seance_status_updated: `${acteur} a modifie le statut d'une seance.`,
    seance_deleted: `${acteur} a supprime une seance.`,
    unavailability_added: `${acteur} a ajoute une indisponibilite.`,
    full_day_unavailability_added: `${acteur} a bloque une journee complete.`,
    unavailability_deleted: `${acteur} a supprime une indisponibilite.`,
    catalogue_updated: `${acteur} a mis a jour le catalogue.`,
    catalogue_deleted: `${acteur} a supprime un element du catalogue.`,
    history_updated: `${acteur} a mis a jour l'historique.`,
    administration_updated: `${acteur} a effectue une action d'administration.`,
    session_updated: `${acteur} a mis a jour une session.`,
    application_updated: `${acteur} a mis a jour l'application.`,
  };

  if (payload.action && messagesParAction[payload.action]) {
    return messagesParAction[payload.action];
  }

  if (payload.actorName && payload.message) {
    return `${acteur} : ${payload.message}`;
  }

  const messagesParScope = {
    seances: "Les séances ont été mises à jour.",
    indisponibilites: "Les indisponibilités ont été mises à jour.",
    historique: "L'historique a été mis à jour.",
    catalogue: "Le catalogue a été mis à jour.",
    administration: "Le panneau d'administration a été mis à jour.",
    application: "L'application a été mise à jour.",
  };

  return messagesParScope[payload.scope] || messagesParScope.application;
}

function obtenirComptesMonetisationSupplementaires() {
  const ordreComptes = Array.isArray(etat.monetisation?.ordre_comptes)
    ? etat.monetisation.ordre_comptes
    : Object.keys(etat.monetisation?.comptes || {});

  return ordreComptes
    .filter((nomCompte) => !comptesMonetisationPrincipaux.includes(nomCompte))
    .map((nomCompte) => ({
      nom: nomCompte,
      stats: obtenirStatistiquesMonetisationCompte(nomCompte),
    }));
}

function notifierMiseAJourTempsReel(payload = {}) {
  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    return;
  }

  const acteurId = Number(payload.actorId || 0);

  if (acteurId && acteurId === Number(etat.utilisateur.id)) {
    return;
  }

  const cleNotification = `${payload.scope || "application"}:${payload.action || "action"}:${acteurId || "inconnu"}:${payload.message || ""}`;
  const maintenant = Date.now();

  if (
    connexionTempsReel.derniereNotificationCle === cleNotification &&
    maintenant - connexionTempsReel.derniereNotificationAt < 1500
  ) {
    return;
  }

  connexionTempsReel.derniereNotificationCle = cleNotification;
  connexionTempsReel.derniereNotificationAt = maintenant;

  afficherToast(construireMessageNotificationTempsReel(payload), "success");
}

function appliquerStatistiquesMonetisation(prefixe, statsCompte) {
  const cle = prefixe === "yassine" ? "Yassine" : "Abdo";
  const stats = statsCompte || obtenirStatistiquesMonetisationCompte(cle);

  const champs = {
    yassine: {
      amountCard: elements.monetisationYassineAmountCard,
      amount: elements.monetisationYassineAmount,
      rate: elements.monetisationYassineRate,
      rateTable: elements.monetisationYassineRateTable,
      billableCount: elements.monetisationYassineBillableCount,
      billableCountTable: elements.monetisationYassineBillableCountTable,
      trialCount: elements.monetisationYassineTrialCount,
      trialCountTable: elements.monetisationYassineTrialCountTable,
      due: elements.monetisationYassineDue,
    },
    abdo: {
      amountCard: elements.monetisationAbdoAmountCard,
      amount: elements.monetisationAbdoAmount,
      rate: elements.monetisationAbdoRate,
      rateTable: elements.monetisationAbdoRateTable,
      billableCount: elements.monetisationAbdoBillableCount,
      billableCountTable: elements.monetisationAbdoBillableCountTable,
      trialCount: elements.monetisationAbdoTrialCount,
      trialCountTable: elements.monetisationAbdoTrialCountTable,
      due: elements.monetisationAbdoDueTable,
    },
  }[prefixe];

  if (!champs) {
    return;
  }

  const montantFormate = formaterMontantDh(stats.montant_du);
  const tarifFormate = formaterMontantDh(stats.tarif_unitaire);

  if (champs.amountCard) champs.amountCard.textContent = montantFormate;
  if (champs.amount) champs.amount.textContent = montantFormate;
  if (champs.rate) champs.rate.textContent = tarifFormate;
  if (champs.rateTable) champs.rateTable.textContent = tarifFormate;
  if (champs.billableCount) {
    champs.billableCount.textContent = String(Number(stats.seances_facturables) || 0);
  }
  if (champs.billableCountTable) {
    champs.billableCountTable.textContent = String(Number(stats.seances_facturables) || 0);
  }
  if (champs.trialCount) {
    champs.trialCount.textContent = String(Number(stats.seances_essai_faites) || 0);
  }
  if (champs.trialCountTable) {
    champs.trialCountTable.textContent = String(Number(stats.seances_essai_faites) || 0);
  }
  if (champs.due) champs.due.textContent = montantFormate;
}

function creerCarteMonetisationSupplementaire(nomCompte, stats) {
  const carte = document.createElement("article");
  carte.className = "account-stats-card monetisation-account-card";

  const enTete = document.createElement("div");
  enTete.className = "account-stats-header";

  const titre = document.createElement("div");
  const nom = document.createElement("h3");
  nom.textContent = nomCompte;
  titre.append(nom);

  const total = document.createElement("strong");
  total.className = "account-stats-total";
  total.textContent = formaterMontantDh(stats.montant_du);
  enTete.append(titre, total);

  const liste = document.createElement("div");
  liste.className = "account-stats-list";

  [
    ["Tarif unitaire", formaterMontantDh(stats.tarif_unitaire)],
    ["Seances facturables", String(Number(stats.seances_facturables) || 0)],
    ["Seances d'essai faites", String(Number(stats.seances_essai_faites) || 0)],
  ].forEach(([libelle, valeur]) => {
    const ligne = document.createElement("div");
    ligne.className = "stats-list-row";

    const label = document.createElement("span");
    label.textContent = libelle;

    const contenu = document.createElement("strong");
    contenu.textContent = valeur;

    ligne.append(label, contenu);
    liste.appendChild(ligne);
  });

  carte.append(enTete, liste);
  return carte;
}

function afficherComptesMonetisationSupplementaires() {
  if (!elements.monetisationExtraSection || !elements.monetisationExtraAccounts) {
    return;
  }

  const comptesSupplementaires = obtenirComptesMonetisationSupplementaires();
  elements.monetisationExtraAccounts.innerHTML = "";

  if (comptesSupplementaires.length === 0) {
    elements.monetisationExtraSection.classList.add("hidden");
    return;
  }

  comptesSupplementaires.forEach(({ nom, stats }) => {
    elements.monetisationExtraAccounts.appendChild(
      creerCarteMonetisationSupplementaire(nom, stats)
    );
  });

  elements.monetisationExtraSection.classList.remove("hidden");
}

function viderMonetisation() {
  if (!etat.monetisation) {
    etat.monetisationComptesSelectionnes = [];
    etat.monetisationSelectionInitialisee = false;
  }

  if (elements.monetisationTotalAmount) {
    elements.monetisationTotalAmount.textContent = formaterMontantDh(0);
  }

  appliquerStatistiquesMonetisation("yassine");
  appliquerStatistiquesMonetisation("abdo");
  mettreAJourControlesPeriodeMonetisation();

  if (elements.monetisationExtraAccounts) {
    elements.monetisationExtraAccounts.innerHTML = "";
  }

  if (elements.monetisationExtraSection) {
    elements.monetisationExtraSection.classList.add("hidden");
  }

  if (elements.monetisationReportAccounts) {
    elements.monetisationReportAccounts.innerHTML = "";
  }

  if (elements.monetisationReportAccountsSection) {
    elements.monetisationReportAccountsSection.classList.add("hidden");
  }

  mettreAJourEtatExportMonetisation();
}

function mettreAJourMonetisation() {
  const yassine = obtenirStatistiquesMonetisationCompte("Yassine");
  const abdo = obtenirStatistiquesMonetisationCompte("Abdo");
  const ordreComptes = Array.isArray(etat.monetisation?.ordre_comptes)
    ? etat.monetisation.ordre_comptes
    : Object.keys(etat.monetisation?.comptes || {});

  const montantTotal = Number(etat.monetisation?.montant_total);
  const totalCalcule = ordreComptes.reduce(
    (total, nomCompte) => total + Number(obtenirStatistiquesMonetisationCompte(nomCompte).montant_du || 0),
    0
  );
  const totalVisible = Number.isFinite(montantTotal)
    ? montantTotal
    : totalCalcule;

  if (elements.monetisationTotalAmount) {
    elements.monetisationTotalAmount.textContent = formaterMontantDh(totalVisible);
  }

  synchroniserSelectionComptesMonetisation();
  mettreAJourControlesPeriodeMonetisation();
  appliquerStatistiquesMonetisation("yassine", yassine);
  appliquerStatistiquesMonetisation("abdo", abdo);
  afficherComptesMonetisationSupplementaires();
  afficherSelectionComptesMonetisation();
}

function mettreAJourResume() {
  const seancesPourStatistiques = obtenirSeancesPourStatistiques();
  elements.totalCount.textContent = String(seancesPourStatistiques.length);
  mettreAJourVueAujourdhui();

  const comptes = Array.from(
    new Set(seancesPourStatistiques.map((seance) => normaliserNomCompte(seance.compte)))
  )
    .filter(Boolean)
    .sort();

  elements.statsAccountsOverview.innerHTML = "";

  const carteTotale = document.createElement("article");
  carteTotale.className = "panel stat-overview-card stat-overview-card-primary";
  const labelTotal = document.createElement("span");
  labelTotal.className = "stat-overview-label";
  labelTotal.textContent = "Total general";
  const valeurTotale = document.createElement("strong");
  valeurTotale.className = "stat-overview-value";
  valeurTotale.textContent = String(seancesPourStatistiques.length);
  carteTotale.append(labelTotal, valeurTotale);
  elements.statsAccountsOverview.appendChild(carteTotale);

  comptes.forEach((nomCompte) => {
    const stats = calculerStatistiquesCompte(nomCompte);
    const card = document.createElement("article");
    card.className = "panel stat-overview-card";
    const label = document.createElement("span");
    label.className = "stat-overview-label";
    label.textContent = nomCompte;
    const value = document.createElement("strong");
    value.className = "stat-overview-value";
    value.textContent = String(stats.faites);
    const note = document.createElement("span");
    note.className = "stat-overview-note";
    note.textContent = `${stats.total} total · ${stats.faitesRegulieres} reg. · ${stats.faitesEssai} essai`;
    card.append(label, value, note);
    elements.statsAccountsOverview.appendChild(card);
  });

  if (comptes.length > 0) {
    const enTetesTableau = [
      "Compte",
      "Total",
      "Planifiees",
      "Faites",
      "Regulieres",
      "Essai",
      "Reportees",
      "Annulees",
    ];
    const table = document.createElement("table");
    table.className = "stats-comparison-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    enTetesTableau.forEach((titre) => {
      const th = document.createElement("th");
      th.textContent = titre;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");

    comptes.forEach((nomCompte) => {
      const stats = calculerStatistiquesCompte(nomCompte);
      const row = document.createElement("tr");

      const compteCell = document.createElement("td");
      compteCell.dataset.label = enTetesTableau[0];
      const compteStrong = document.createElement("strong");
      compteStrong.textContent = nomCompte;
      compteCell.appendChild(compteStrong);
      row.appendChild(compteCell);

      [
        stats.total,
        stats.planifiees,
        stats.faites,
        stats.faitesRegulieres,
        stats.faitesEssai,
        stats.reportees,
        stats.annulees,
      ].forEach((valeur, index) => {
        const td = document.createElement("td");
        td.dataset.label = enTetesTableau[index + 1];

        if (index === 2) {
          const badge = document.createElement("span");
          badge.className = "badge-faite";
          badge.textContent = String(valeur);
          td.appendChild(badge);
        } else {
          td.textContent = String(valeur);
        }

        row.appendChild(td);
      });

      tbody.appendChild(row);
    });

    table.append(thead, tbody);
    elements.statsAccountsTable.innerHTML = "";
    elements.statsAccountsTable.appendChild(table);
  } else {
    elements.statsAccountsTable.innerHTML = "";
    elements.statsAccountsTable.appendChild(
      creerEmptyState("Aucune donnee statistique disponible.")
    );
  }
}

function obtenirComptesAdministration() {
  return Array.isArray(etat.administration?.comptes) ? etat.administration.comptes : [];
}

function obtenirAppareilsAutoLoginAdministration() {
  return Array.isArray(etat.administration?.trusted_devices)
    ? etat.administration.trusted_devices
    : [];
}

function obtenirCatalogueAdministration(type) {
  if (!etat.administration?.catalogue) {
    return [];
  }

  return Array.isArray(etat.administration.catalogue[type])
    ? etat.administration.catalogue[type]
    : [];
}

function obtenirCompteCatalogueAdministrationParId(compteId) {
  return (
    obtenirCatalogueAdministration("comptes").find(
      (compte) => Number(compte.id) === Number(compteId)
    ) || null
  );
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

function formaterTarifHoraireCompte(compte) {
  return formaterMontantDh(Number(compte?.tarif_horaire || 0));
}

function formaterEtatAujourdhuiCompte(compte) {
  return Number(compte?.peut_voir_aujourdhui) === 1 ? "Visible" : "Masque";
}

function formaterEtatIndisponibilitesCompte(compte) {
  return Number(compte?.peut_voir_indisponibilites) === 1 ? "Visible" : "Masque";
}

function creerBadgeAdministration(texte, type) {
  const badge = document.createElement("span");
  definirBadgeAdmin(badge, texte, type);
  return badge;
}

function afficherListeCatalogueAdministration(container, elementsCatalogue, messageVide) {
  container.innerHTML = "";

  if (!Array.isArray(elementsCatalogue) || elementsCatalogue.length === 0) {
    container.appendChild(creerEmptyState(messageVide, "admin-user-empty"));
    return;
  }

  elementsCatalogue.forEach((elementCatalogue) => {
    const item = document.createElement("div");
    item.className = "admin-catalog-item";

    const label = document.createElement("span");
    label.className = "admin-catalog-item-label";
    label.textContent = elementCatalogue.valeur;
    item.appendChild(label);

    if (container === elements.adminSubjectList || container === elements.adminAccountList) {
      const type = container === elements.adminSubjectList ? "matiere" : "compte";
      const motDePasseInput =
        type === "matiere"
          ? elements.adminAddSubjectCurrentPassword
          : elements.adminAddAccountCurrentPassword;
      const erreurElement =
        type === "matiere"
          ? elements.adminAddSubjectError
          : elements.adminAddAccountError;

      const action = document.createElement("button");
      action.type = "button";
      action.className = "admin-catalog-remove";
      action.textContent = "x";
      action.title = `Supprimer ${elementCatalogue.valeur}`;
      action?.addEventListener("click", async () => {
        await gererSuppressionElementCatalogueAdministration({
          type,
          elementCatalogue,
          motDePasseInput,
          erreurElement,
          bouton: action,
        });
      });
      item.appendChild(action);
    }

    container.appendChild(item);
  });
}

function remplirSelectComptes(select, comptes, placeholder) {
  const valeurActuelle = String(select.value || "");

  select.innerHTML = "";

  if (comptes.length === 0) {
    const optionVide = document.createElement("option");
    optionVide.value = "";
    optionVide.textContent = placeholder;
    select.appendChild(optionVide);
    select.disabled = true;
    return;
  }

  comptes.forEach((compte) => {
    const option = document.createElement("option");
    option.value = String(compte.id);
    option.textContent = compte.nom || compte.valeur || "Compte";
    select.appendChild(option);
  });
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
    elements.adminTodayUserId,
    elements.adminUnavailabilityAccessUserId,
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
  boutonSelection?.addEventListener("click", () => {
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
  bouton?.addEventListener("click", async () => {
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

function creerCarteAppareilAutoLoginAdministration(appareil) {
  const carte = document.createElement("article");
  carte.className = "admin-session-item";

  const contenu = document.createElement("div");
  contenu.className = "admin-session-main";

  const entete = document.createElement("div");
  entete.className = "admin-session-head";

  const infos = document.createElement("div");
  const titre = document.createElement("h4");
  titre.className = "admin-session-title";
  titre.textContent = appareil.device_label || "Appareil reconnu";
  const meta = document.createElement("div");
  meta.className = "admin-session-meta";
  meta.textContent = `${appareil.utilisateur_nom || "Utilisateur"} - ${appareil.utilisateur_email || "-"}`;
  infos.append(titre, meta);

  const badges = document.createElement("div");
  badges.className = "admin-session-badges";
  badges.appendChild(creerBadgeAdministration("Auto-login", "admin"));
  entete.append(infos, badges);

  const details = document.createElement("div");
  details.className = "admin-session-agent";
  details.textContent = `IP : ${appareil.adresse_ip || "-"} | Derniere utilisation : ${
    appareil.last_used_at ? formatDateHeureSecondes(appareil.last_used_at) : "-"
  }`;

  const agent = document.createElement("div");
  agent.className = "admin-session-agent";
  agent.textContent = appareil.user_agent || "-";

  contenu.append(entete, details, agent);

  const actions = document.createElement("div");
  actions.className = "admin-session-actions";
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "button danger";
  bouton.textContent = "Stopper l'auto-login";
  bouton.addEventListener("click", async () => {
    await gererRevocationAppareilAutoLogin(appareil);
  });
  actions.appendChild(bouton);

  carte.append(contenu, actions);
  return carte;
}

function afficherAppareilsAutoLoginAdministration() {
  const appareils = obtenirAppareilsAutoLoginAdministration();
  elements.adminTrustedDevicesList.innerHTML = "";

  if (appareils.length === 0) {
    elements.adminTrustedDevicesList.innerHTML =
      '<div class="admin-session-empty">Aucun appareil auto-login pour le moment.</div>';
    return;
  }

  appareils.forEach((appareil) => {
    elements.adminTrustedDevicesList.appendChild(
      creerCarteAppareilAutoLoginAdministration(appareil)
    );
  });
}

function normaliserTexteAudit(valeur, fallback = "-") {
  if (valeur === null || valeur === undefined) {
    return fallback;
  }

  const texte = String(valeur).trim();
  return texte ? texte : fallback;
}

function formaterLibelleAudit(texte) {
  const valeur = normaliserTexteAudit(texte, "");
  if (!valeur) {
    return "-";
  }

  const libelle = valeur.replace(/[_-]+/g, " ").trim();
  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

function lireDetailsJournalAudit(log) {
  if (!log?.details_json) {
    return null;
  }

  if (typeof log.details_json === "object") {
    return log.details_json;
  }

  try {
    return JSON.parse(log.details_json);
  } catch {
    return { details: log.details_json };
  }
}

function formaterValeurDetailAudit(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") {
    return "-";
  }

  if (typeof valeur === "object") {
    try {
      return JSON.stringify(valeur, null, 2);
    } catch {
      return String(valeur);
    }
  }

  return String(valeur);
}

function viderDetailJournalAuditModal() {
  if (!elements.auditLogModal) {
    return;
  }

  elements.auditLogModalResult.textContent = "-";
  elements.auditLogModalAction.textContent = "-";
  elements.auditLogModalIdentifiant.textContent = "-";
  elements.auditLogModalUser.textContent = "-";
  elements.auditLogModalIp.textContent = "-";
  elements.auditLogModalDevice.textContent = "-";
  elements.auditLogModalDate.textContent = "-";
  elements.auditLogModalSubtitle.textContent = "";
  elements.auditLogModalSubtitle.classList.add("hidden");
  elements.auditLogModalDetailsList.innerHTML = "";
}

function ouvrirDetailJournalAudit(log) {
  if (!elements.auditLogModal) {
    return;
  }

  const identifiant = normaliserTexteAudit(log.identifiant, "Activite");
  const utilisateur =
    normaliserTexteAudit(log.utilisateur_nom, "") ||
    normaliserTexteAudit(log.utilisateur_email, "") ||
    normaliserTexteAudit(log.identifiant, "-");
  const details = lireDetailsJournalAudit(log);

  elements.auditLogModalResult.textContent =
    log.resultat === "success" ? "Succes" : "Echec";
  elements.auditLogModalAction.textContent = formaterLibelleAudit(log.action_type);
  elements.auditLogModalIdentifiant.textContent = identifiant;
  elements.auditLogModalUser.textContent = utilisateur;
  elements.auditLogModalIp.textContent = normaliserTexteAudit(log.adresse_ip);
  elements.auditLogModalDevice.textContent = normaliserTexteAudit(log.user_agent);
  elements.auditLogModalDate.textContent = formatDateHeureSecondes(log.created_at);
  elements.auditLogModalSubtitle.textContent = `${identifiant} · ${formaterLibelleAudit(
    log.action_type
  )}`;
  elements.auditLogModalSubtitle.classList.remove("hidden");
  elements.auditLogModalDetailsList.innerHTML = "";

  const entreesDetails =
    details && typeof details === "object" ? Object.entries(details).filter(([, valeur]) => valeur) : [];

  if (entreesDetails.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-change-card";
    const titre = document.createElement("strong");
    titre.textContent = "Aucun detail supplementaire";
    const texte = document.createElement("p");
    texte.textContent = "Cette entree ne contient pas d'information supplementaire.";
    empty.append(titre, texte);
    elements.auditLogModalDetailsList.appendChild(empty);
  } else {
    entreesDetails.forEach(([cle, valeur]) => {
      const carte = document.createElement("div");
      carte.className = "history-change-card";

      const titre = document.createElement("strong");
      titre.textContent = formaterLibelleAudit(cle);

      const texte = document.createElement("p");
      texte.textContent = formaterValeurDetailAudit(valeur);

      carte.append(titre, texte);
      elements.auditLogModalDetailsList.appendChild(carte);
    });
  }

  ouvrirModal(elements.auditLogModal);
}

function afficherJournalAuthAdministration() {
  const logs = Array.isArray(etat.administration?.journal_auth) ? etat.administration.journal_auth : [];
  elements.adminAuditLogList.innerHTML = "";

  if (logs.length === 0) {
    elements.adminAuditLogList.innerHTML = '<div class="admin-session-empty">Aucun log disponible.</div>';
    return;
  }

  logs.forEach((log) => {
    const ligne = document.createElement("button");
    ligne.type = "button";
    ligne.className = `admin-audit-item ${log.resultat === "success" ? "success" : "failed"}`;
    ligne.addEventListener("click", () => ouvrirDetailJournalAudit(log));

    const head = document.createElement("div");
    head.className = "admin-audit-head";

    const titre = document.createElement("strong");
    titre.className = "admin-audit-title";
    titre.textContent = normaliserTexteAudit(log.identifiant, "Activite");

    const resultat = document.createElement("span");
    resultat.className = `admin-audit-result ${
      log.resultat === "success" ? "success" : "failed"
    }`;
    resultat.textContent = log.resultat === "success" ? "Succes" : "Echec";
    head.append(titre, resultat);

    const detail = document.createElement("p");
    detail.className = "admin-audit-detail";
    detail.textContent = formaterLibelleAudit(log.action_type);

    const meta = document.createElement("div");
    meta.className = "admin-audit-meta";

    const date = document.createElement("span");
    date.className = "admin-audit-date";
    date.textContent = formatDateHeureSecondes(log.created_at);

    const ip = document.createElement("span");
    ip.textContent = normaliserTexteAudit(log.adresse_ip, "IP inconnue");

    meta.append(date, ip);
    ligne.append(head, detail, meta);
    elements.adminAuditLogList.appendChild(ligne);
  });
}

function afficherIpsBloqueesAdministration() {
  const ips = Array.isArray(etat.administration?.ips_bloquees) ? etat.administration.ips_bloquees : [];
  elements.adminBlockedIpsList.innerHTML = "";

  if (ips.length === 0) {
    elements.adminBlockedIpsList.innerHTML = '<div class="admin-session-empty">Aucune IP bloquee.</div>';
    return;
  }

  ips.forEach(item => {
    const ligne = document.createElement("div");
    ligne.className = "admin-blocked-ip-item";

    const info = document.createElement("div");
    info.className = "admin-blocked-ip-info";
    const titre = document.createElement("strong");
    titre.textContent = item.ip || "-";
    const retourLigne = document.createElement("br");
    const details = document.createElement("small");
    const raison = item.raison || "Aucune raison";
    const auteur = item.bloque_par_nom || "administrateur";
    details.textContent = `${raison} (par ${auteur})`;
    info.append(titre, retourLigne, details);

    const action = document.createElement("button");
    action.className = "button-icon danger";
    action.innerHTML = '<i class="fas fa-trash"></i>';
    action.title = "Debloquer";
    action.onclick = () => gererDeblocageIpAdmin(item.ip);

    ligne.append(info, action);
    elements.adminBlockedIpsList.appendChild(ligne);
  });
}

function estIndisponibiliteJourCompletClient(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function construireLibelleIndisponibilite(indisponibilite) {
  return `${formatDate(indisponibilite.date)} · ${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`;
}

function construireLibelleIndisponibiliteAdministration(indisponibilite) {
  if (estIndisponibiliteJourCompletClient(indisponibilite)) {
    return `${formatDate(indisponibilite.date)} - Jour complet`;
  }

  return `${formatDate(indisponibilite.date)} - ${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`;
}

function afficherListeIndisponibilitesAdministration() {
  const indisponibilites = Array.isArray(etat.indisponibilites) ? etat.indisponibilites : [];
  elements.adminUnavailabilityList.innerHTML = "";

  if (indisponibilites.length === 0) {
    elements.adminUnavailabilityList.innerHTML =
      '<div class="admin-session-empty">Aucun creneau indisponible pour le moment.</div>';
    return;
  }

  indisponibilites.forEach((indisponibilite) => {
    const carte = document.createElement("article");
    carte.className = "admin-session-item";

    const contenu = document.createElement("div");
    contenu.className = "admin-session-main";

    const entete = document.createElement("div");
    entete.className = "admin-session-head";

    const titre = document.createElement("h4");
    titre.className = "admin-session-title";
    titre.textContent = construireLibelleIndisponibiliteAdministration(indisponibilite);

    const badges = document.createElement("div");
    badges.className = "admin-session-badges";
    badges.appendChild(creerBadgeAdministration("Indisponible", "warning"));
    if (estIndisponibiliteJourCompletClient(indisponibilite)) {
      badges.appendChild(creerBadgeAdministration("Jour complet", "warning"));
    }

    entete.append(titre, badges);

    const details = document.createElement("div");
    details.className = "admin-session-meta";
    details.textContent = estIndisponibiliteJourCompletClient(indisponibilite)
      ? indisponibilite.raison
        ? `Jour entier bloque. Raison : ${indisponibilite.raison}`
        : "Jour entier bloque."
      : indisponibilite.raison
        ? `Raison : ${indisponibilite.raison}`
        : "Aucune raison renseignee.";

    contenu.append(entete, details);

    const actions = document.createElement("div");
    actions.className = "admin-session-actions";

    if (utilisateurPeutGererIndisponibilites()) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "button danger";
      bouton.textContent = "Supprimer";
      bouton?.addEventListener("click", async () => {
        await gererSuppressionIndisponibilite(indisponibilite.id);
      });
      actions.appendChild(bouton);
    }

    carte.append(contenu, actions);
    elements.adminUnavailabilityList.appendChild(carte);
  });
}

function mettreAJourControlesAdministration() {
  const compteSuppression = obtenirCompteAdministrationParId(elements.adminDeleteUserId.value);
  const compteAcces = obtenirCompteAdministrationParId(elements.adminAccessUserId.value);
  const compteLectureSeule = obtenirCompteAdministrationParId(elements.adminReadonlyUserId.value);
  const compteAujourdhui = obtenirCompteAdministrationParId(elements.adminTodayUserId.value);
  const compteIndisponibilites = obtenirCompteAdministrationParId(
    elements.adminUnavailabilityAccessUserId.value
  );
  const compteMonetisation = obtenirCompteAdministrationParId(
    elements.adminMonetisationUserId.value
  );
  const compteTarif = obtenirCompteCatalogueAdministrationParId(elements.adminRateUserId.value);
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

  elements.adminTodayStatus.textContent = compteAujourdhui
    ? formaterEtatAujourdhuiCompte(compteAujourdhui)
    : "-";
  elements.adminTodayButton.disabled = !compteAujourdhui;
  elements.adminTodayButton.textContent = compteAujourdhui
    ? Number(compteAujourdhui.peut_voir_aujourdhui) === 1
      ? `Masquer Aujourd'hui`
      : `Afficher Aujourd'hui`
    : "Mettre a jour Aujourd'hui";

  elements.adminUnavailabilityAccessStatus.textContent = compteIndisponibilites
    ? formaterEtatIndisponibilitesCompte(compteIndisponibilites)
    : "-";
  elements.adminUnavailabilityAccessButton.disabled = !compteIndisponibilites;
  elements.adminUnavailabilityAccessButton.textContent = compteIndisponibilites
    ? Number(compteIndisponibilites.peut_voir_indisponibilites) === 1
      ? `Masquer Indisponibilites`
      : `Afficher Indisponibilites`
    : "Mettre a jour Indisponibilites";

  elements.adminMonetisationStatus.textContent = compteMonetisation
    ? formaterEtatMonetisationCompte(compteMonetisation)
    : "-";
  elements.adminMonetisationButton.disabled = !compteMonetisation;
  elements.adminMonetisationButton.textContent = compteMonetisation
    ? Number(compteMonetisation.peut_voir_monetisation) === 1
      ? `Masquer Monetisation`
      : `Afficher Monetisation`
    : "Mettre a jour Monetisation";

  elements.adminRateStatus.textContent = compteTarif
    ? formaterTarifHoraireCompte(compteTarif)
    : "-";
  elements.adminRateButton.disabled = !compteTarif;
  elements.adminRateButton.textContent = compteTarif
    ? `Mettre a jour le tarif de ${compteTarif.valeur}`
    : "Mettre a jour le tarif";
  if (elements.adminRateValue) {
    const compteLie = compteTarif ? String(compteTarif.id) : "";
    if (elements.adminRateValue.dataset.boundAccountId !== compteLie) {
      elements.adminRateValue.value = compteTarif
        ? String(Number(compteTarif.tarif_horaire || 0))
        : "";
      elements.adminRateValue.dataset.boundAccountId = compteLie;
    }
  }

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
  elements.adminUnavailabilityForm.classList.toggle(
    "hidden",
    !utilisateurPeutGererIndisponibilites()
  );

  afficherListeUtilisateursAdministration();
  afficherSessionsAdministration();
  afficherAppareilsAutoLoginAdministration();
  afficherJournalAuthAdministration();
  afficherIpsBloqueesAdministration();
  afficherListeIndisponibilitesAdministration();
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
    elements.adminTodayUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminUnavailabilityAccessUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminMonetisationUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun collaborateur"
  );
  remplirSelectComptes(
    elements.adminRateUserId,
    comptesSeance,
    "Aucun compte de seance"
  );
  remplirSelectComptes(
    elements.adminLogoutUserId,
    obtenirComptesCiblables(),
    "Aucune cible"
  );

  mettreAJourControlesAdministration();
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
    bouton?.addEventListener("click", async () => {
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
    if (estHistoriqueDetailEnModal()) {
      ouvrirModal(elements.historyDetailModal);
    }
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function estHistoriqueDetailEnModal() {
  return globalThis.matchMedia?.("(max-width: 720px)")?.matches ?? false;
}

function remplirDetailHistoriqueCibles(cibles, entree, presentationAction, detailsHistorique) {
  cibles.action.textContent = presentationAction.label;
  cibles.action.className = `history-action-badge history-action-badge-${presentationAction.tone} history-action-badge-detail`;
  cibles.seance.textContent = entree.seance_libelle || "-";
  cibles.actor.textContent = obtenirNomActeurAffiche(entree.acteur_nom);
  cibles.date.textContent = formatDateHeureSecondes(entree.created_at);
  cibles.changesTitle.textContent = detailsHistorique.titre;
  cibles.changesList.innerHTML = "";

  if (cibles.subtitle) {
    cibles.subtitle.textContent = presentationAction.label;
    cibles.subtitle.classList.toggle("hidden", !presentationAction.label);
  }

  if (detailsHistorique.lignes.length === 0) {
    cibles.changesList.innerHTML =
      '<div class="empty-state">Aucun detail supplementaire pour cette action.</div>';
    return;
  }

  detailsHistorique.lignes.forEach((ligne) => {
    if (detailsHistorique.mode === "changement") {
      cibles.changesList.appendChild(creerCarteChangementHistorique(ligne));
      return;
    }

    cibles.changesList.appendChild(creerCarteInformationHistorique(ligne));
  });
}

function afficherDetailHistorique(entree) {
  const presentationAction = obtenirPresentationActionHistorique(entree);
  const detailsHistorique = normaliserDetailsHistorique(entree);
  elements.historyDetailEmpty.classList.add("hidden");
  elements.historyDetail.classList.remove("hidden");
  remplirDetailHistoriqueCibles(
    {
      action: elements.historyDetailAction,
      seance: elements.historyDetailSeance,
      actor: elements.historyDetailActor,
      date: elements.historyDetailDate,
      changesTitle: elements.historyChangesTitle,
      changesList: elements.historyChangesList,
    },
    entree,
    presentationAction,
    detailsHistorique
  );
  remplirDetailHistoriqueCibles(
    {
      action: elements.historyDetailModalAction,
      seance: elements.historyDetailModalSeance,
      actor: elements.historyDetailModalActor,
      date: elements.historyDetailModalDate,
      changesTitle: elements.historyDetailModalChangesTitle,
      changesList: elements.historyDetailModalChangesList,
      subtitle: elements.historyDetailModalSubtitle,
    },
    entree,
    presentationAction,
    detailsHistorique
  );
  reinitialiserSuppressionHistorique();
  mettreAJourSuppressionHistorique(entree);
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
  elements.historyDetailModalAction.textContent = "-";
  elements.historyDetailModalAction.className = "";
  elements.historyDetailModalSeance.textContent = "-";
  elements.historyDetailModalActor.textContent = "-";
  elements.historyDetailModalDate.textContent = "-";
  elements.historyDetailModalChangesTitle.textContent = "Details";
  elements.historyDetailModalChangesList.innerHTML = "";
  elements.historyDetailModalSubtitle.textContent = "";
  elements.historyDetailModalSubtitle.classList.add("hidden");
  reinitialiserSuppressionHistorique();
  mettreAJourSuppressionHistorique(null);
  if (!elements.historyDetailModal.classList.contains("hidden")) {
    fermerModal(elements.historyDetailModal);
  }
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

  if (entree?.action_type === "indisponibilite_creee") {
    return {
      label: "Creation d'un creneau indisponible",
      badgeLabel: "Indispo",
      tone: "blocked",
    };
  }

  if (entree?.action_type === "indisponibilite_supprimee") {
    return {
      label: "Suppression d'un creneau indisponible",
      badgeLabel: "Indispo",
      tone: "blocked",
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

  const dateIsoSelectionnee = extraireDateIsoDepuisValeurCalendrier(dateSelectionnee);

  if (dateIsoSelectionnee && estJourIntegralementIndisponible(dateIsoSelectionnee)) {
    afficherToast(
      `Le ${formatDate(dateIsoSelectionnee)} est indisponible toute la journee.`,
      "warning"
    );
    return;
  }

  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  rendreOptionsCatalogueSeance();
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

  if (dateIsoSelectionnee) {
    elements.date.value = dateIsoSelectionnee;
  }

  mettreAJourHeureFinCalculee();
  ouvrirModal(elements.seanceModal);
  elements.etudiant.focus();
}

function ouvrirFormulaireModification() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  if (seanceEstMasqueePourConfidentialite(etat.seanceSelectionnee)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
    return;
  }

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  rendreOptionsCatalogueSeance();
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

  if (seanceEstMasqueePourConfidentialite(etat.seanceSelectionnee)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
    return;
  }

  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  rendreOptionsCatalogueSeance();
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

  const mode = elements.seanceForm.dataset.mode || "creation";
  const conflitIndisponibilite = trouverIndisponibiliteChevauchanteLocale({
    date: donneesSeance.date,
    heure_debut: donneesSeance.heure_debut,
    heure_fin: heureFinCalculee,
  });

  if (
    conflitIndisponibilite &&
    !(
      mode === "modification" &&
      creneauSeanceEquivalent(
        etat.seanceSelectionnee,
        donneesSeance.date,
        donneesSeance.heure_debut,
        heureFinCalculee
      )
    )
  ) {
    afficherErreur(
      elements.seanceFormError,
      construireMessageIndisponibiliteClient(conflitIndisponibilite)
    );
    return;
  }

  const conflitSeanceConfidentielle = trouverSeanceConfidentielleChevauchanteLocale({
    date: donneesSeance.date,
    heure_debut: donneesSeance.heure_debut,
    heure_fin: heureFinCalculee,
    ignorerSeanceId: mode === "modification" ? etat.seanceSelectionnee?.id : null,
  });

  if (
    conflitSeanceConfidentielle &&
    !(
      mode === "modification" &&
      creneauSeanceEquivalent(
        etat.seanceSelectionnee,
        donneesSeance.date,
        donneesSeance.heure_debut,
        heureFinCalculee
      )
    )
  ) {
    afficherErreur(elements.seanceFormError, obtenirMessageSeanceConfidentielle());
    return;
  }

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

function gererClicIndisponibilite(indisponibilite) {
  if (indisponibilite?.est_seance_confidentielle) {
    const dateLabel = indisponibilite?.date ? formatDate(indisponibilite.date) : "";
    const messageConfidentiel = estIndisponibiliteJourCompletClient(indisponibilite)
      ? dateLabel
        ? `Jour complet indisponible : ${dateLabel}. Raison : Seance Hossam.`
        : "Jour complet indisponible. Raison : Seance Hossam."
      : `Creneau indisponible${dateLabel ? ` : ${dateLabel}` : ""}${
          indisponibilite?.heure_debut && indisponibilite?.heure_fin
            ? `, ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`
            : ""
        }. Raison : Seance Hossam.`;
    afficherToast(messageConfidentiel, "warning");
    return;
  }

  const raison = String(indisponibilite?.raison || "").trim();
  const messagePlage = estIndisponibiliteJourCompletClient(indisponibilite)
    ? "Jour complet indisponible"
    : `Creneau indisponible : ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`;

  if (utilisateurPeutGererIndisponibilites()) {
    afficherToast(
      raison
        ? `${messagePlage} (${raison}).`
        : `${messagePlage}.`,
      "warning"
    );
    return;
  }

  afficherToast(
    raison
      ? estIndisponibiliteJourCompletClient(indisponibilite)
        ? `Hossam a bloque toute cette journee : ${raison}.`
        : `Hossam a bloque ce creneau : ${raison}.`
      : estIndisponibiliteJourCompletClient(indisponibilite)
        ? "Cette journee a ete marquee comme indisponible par Hossam."
        : "Ce creneau a ete marque comme indisponible par Hossam.",
    "warning"
  );
}

async function ouvrirDetailSeance(seance) {
  if (seanceEstMasqueePourConfidentialite(seance)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
    return;
  }

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

  ouvrirModal(elements.detailModal);
}

function mettreEnEtatActionsRapides() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  const actionsBloquees =
    !utilisateurPeutModifierDonnees() || seanceEstMasqueePourConfidentialite(etat.seanceSelectionnee);

  elements.editSeanceButton.disabled = actionsBloquees;
  elements.deleteSeanceButton.disabled = actionsBloquees;

  elements.quickStatusButtons.forEach((bouton) => {
    bouton.disabled =
      actionsBloquees ||
      (bouton.dataset.status !== "reportee" &&
        bouton.dataset.status === etat.seanceSelectionnee.statut_seance);
  });
}

async function gererChangementStatut(nouveauStatut) {
  if (!etat.seanceSelectionnee) {
    return;
  }

  if (seanceEstMasqueePourConfidentialite(etat.seanceSelectionnee)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
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

  if (seanceEstMasqueePourConfidentialite(etat.seanceSelectionnee)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
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

  if (totalMinutes >= 24 * 60) {
    return "";
  }

  const heuresFin = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutesFin = String(totalMinutes % 60).padStart(2, "0");
  return `${heuresFin}:${minutesFin}`;
}

function calculerDureeMinutesDepuisHeures(heureDebut, heureFin) {
  if (!estHeureValide(heureDebut) || !estHeureFinLegacyValide(heureFin)) {
    return 0;
  }

  const [heuresDebut, minutesDebut] = heureDebut.split(":").map(Number);
  const [heuresFin, minutesFin] = heureFin.split(":").map(Number);
  const totalDebut = heuresDebut * 60 + minutesDebut;
  const totalFin = heuresFin * 60 + minutesFin;
  const difference = totalFin - totalDebut;

  return difference > 0 ? difference : 0;
}

function creneauSeanceEquivalent(seance, date, heureDebut, heureFin) {
  if (!seance) {
    return false;
  }

  return (
    seance.date === date &&
    seance.heure_debut === heureDebut &&
    seance.heure_fin === heureFin
  );
}

function trouverSeanceConfidentielleChevauchanteLocale({
  date,
  heure_debut: heureDebut,
  heure_fin: heureFin,
  ignorerSeanceId = null,
}) {
  if (utilisateurEstAdministrateur()) {
    return null;
  }

  return (
    etat.seances.find((seance) => {
      if (!seanceEstMasqueePourConfidentialite(seance) || seance.date !== date) {
        return false;
      }

      if (ignorerSeanceId && Number(seance.id) === Number(ignorerSeanceId)) {
        return false;
      }

      return (
        calculerDureeMinutesDepuisHeures(seance.heure_debut, heureFin) > 0 &&
        calculerDureeMinutesDepuisHeures(heureDebut, seance.heure_fin) > 0
      );
    }) || null
  );
}

function trouverIndisponibiliteChevauchanteLocale({
  date,
  heure_debut: heureDebut,
  heure_fin: heureFin,
}) {
  return etat.indisponibilites.find((indisponibilite) => {
    if (indisponibilite.date !== date) {
      return false;
    }

    return (
      calculerDureeMinutesDepuisHeures(indisponibilite.heure_debut, heureFin) > 0 &&
      calculerDureeMinutesDepuisHeures(heureDebut, indisponibilite.heure_fin) > 0
    );
  }) || null;
}

function estJourIntegralementIndisponible(date) {
  return (
    etat.indisponibilites.find(
      (indisponibilite) =>
        indisponibilite.date === date && estIndisponibiliteJourCompletClient(indisponibilite)
    ) || null
  );
}

function extraireDateIsoDepuisValeurCalendrier(valeur) {
  const texte = String(valeur || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return texte;
  }

  const correspondance = texte.match(/^(\d{4}-\d{2}-\d{2})/);
  return correspondance ? correspondance[1] : "";
}

function construireMessageIndisponibiliteClient(indisponibilite) {
  const raison = String(indisponibilite?.raison || "").trim();
  const base = estIndisponibiliteJourCompletClient(indisponibilite)
    ? `Cette journee est indisponible le ${indisponibilite.date}.`
    : `Ce creneau est indisponible le ${indisponibilite.date} de ${indisponibilite.heure_debut} a ${indisponibilite.heure_fin}.`;

  if (!raison) {
    return base;
  }

  return `${base} Raison : ${raison}.`;
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

function estHeureFinLegacyValide(heure) {
  return estHeureValide(heure) || heure === "24:00";
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

  if (heures < 8) {
    return "08:00";
  }

  if (heures > 22 || (heures === 22 && minutes > 30)) {
    return "22:30";
  }

  return `${String(heures).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function attacherSelectionUnique(checkboxes, callback, options = {}) {
  const keepOneSelected = options.keepOneSelected === true;

  checkboxes.forEach((checkbox) => {
    checkbox?.addEventListener("change", () => {
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
    elements.heureFinCalculee.value = "";
    elements.heureDebut.value = "";
    elements.heureDebutHourSelect.value = heuresDebutDisponibles[0];
    elements.heureDebutMinuteSelect.value = minutesDebutDisponibles[0];
  }

  if (modal === elements.auditLogModal) {
    viderDetailJournalAuditModal();
  }

  if (
    elements.seanceModal.classList.contains("hidden") &&
    elements.detailModal.classList.contains("hidden") &&
    elements.historyDetailModal.classList.contains("hidden") &&
    (elements.auditLogModal ? elements.auditLogModal.classList.contains("hidden") : true)
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

function afficherInfo(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function masquerInfo(element) {
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
  const heureFinValide = estHeureFinLegacyValide(seance.heure_fin);

  if (heureDebutValide && heureFinValide) {
    return `${seance.heure_debut} - ${seance.heure_fin}`;
  }

  if (heureDebutValide) {
    return seance.heure_debut;
  }

  return "-";
}
