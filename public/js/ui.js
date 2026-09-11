import {
  connecterUtilisateur,
  changerMotDePasse,
  deconnecterUtilisateur,
  recupererUtilisateurCourant,
} from "./auth.js";
import {
  recupererVueAdministration,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  mettreAJourAccesAujourdhuiCompte,
  mettreAJourAccesIndisponibilitesCompte,
  revoquerSessionsUtilisateurAdmin,
  revoquerSessionAdmin,
  executerMaintenanceSqliteAdmin,
  recupererJournalAuthAdmin,
  recupererSessionsAdmin,
  revoquerSessionSpecifiqueAdmin,
  recupererIpsBloqueesAdmin,
  bloquerIpAdmin,
  debloquerIpAdmin,
  revoquerAppareilAutoLoginAdmin,
  supprimerCompteAdmin,
} from "./admin.js";
import {
  recupererSeances,
  recupererOptionsSeances,
  ajouterSeance,
  modifierSeance,
  supprimerSeance,
  changerStatutSeance,
  recupererIndisponibilites,
  recupererIndisponibilitesCalendrierCentral,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  recupererHistoriqueActions,
  recupererDetailHistorique,
  supprimerEntreeHistorique as supprimerEntreeHistoriqueApi,
  recupererStatistiques,
  recupererMonetisation,
  telechargerReleveMonetisation,
} from "./seances.js";
import {
  initialiserCalendrier,
  mettreAJourEvenements,
  mettreAJourHorlogeCalendrier,
  mettreAJourPlageHoraireCalendrier,
  creerPalettesDisponibiliteProfesseurs,
} from "./calendrier.js?v=20260909-unified-dashboard";
import {
  recupererEtatNotificationsPush,
  synchroniserNotificationsPushActuelles,
  activerNotificationsPush,
  desactiverNotificationsPush,
  envoyerNotificationPushTest,
} from "./push.js";
import {
  recupererIdentifiantsHandlersPublics,
  soumettreDemandeCompte,
  demanderLienReinitialisation,
  activerCompteAvecJeton,
  reinitialiserMotDePasseAvecJeton,
  recupererDemandesCompte,
  approuverDemandeCompte,
  refuserDemandeCompte,
  renvoyerActivationCompte,
  recupererDemandesCompteAdministration,
  approuverDemandeCompteAdministration,
  refuserDemandeCompteAdministration,
  renvoyerActivationCompteAdministration,
} from "./account-lifecycle.js";
import {
  recupererProfesseursEquipe,
  recupererTarificationEquipe,
  ajouterMatiereEquipe,
  modifierMatiereEquipe,
  supprimerMatiereEquipe,
  modifierTarificationEquipe,
  modifierProfesseurEquipe,
  envoyerLienResetProfesseur,
} from "./equipe.js";
import {
  recupererReglagesEspace,
  modifierReglagesCalendrierEspace,
  modifierEtatCalendrierPublic,
} from "./workspace-settings.js";
import { recupererAnalysesGlobalesAdministration } from "./admin-analytics.js";
import { envoyerRequete } from "./http.js";

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
];

const libellesCreationHistorique = {
  etudiant: "Étudiant",
  parent: "Parent",
  matiere: "Matière",
  compte: "Réalisateur",
  est_essai: "Type de séance",
  date: "Date",
  heure_debut: "Heure de début",
  heure_fin: "Heure de fin",
  duree_minutes: "Durée",
  statut_seance: "Statut",
};

let heuresDebutDisponibles = Array.from({ length: 15 }, (_, index) =>
  String(index + 8).padStart(2, "0")
);
let heuresIndisponibiliteDisponibles = Array.from({ length: 16 }, (_, index) =>
  String(index + 8).padStart(2, "0")
);
const minutesDebutDisponibles = ["00", "30"];
const minutesFinIndisponibiliteDisponibles = ["00", "30", "59"];
let comptesMonetisationPrincipaux = [];
const cleConnexionMemorisee = "gestion-seances-connexion-memorisee";
const delaiTripleClicIndisponibiliteMs = 1200;
const selecteurElementsFocusablesModal = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
const retoursFocusDesModales = new WeakMap();

function creerCatalogueVide() {
  return {
    matieres: [],
    comptes: [],
    intervenants: [],
  };
}

// Au chargement du module, les réglages serveur ne sont pas encore disponibles.
// Ces valeurs initiales ne doivent donc pas appeler les helpers du calendrier :
// ceux-ci lisent `etat`, qui est précisément en cours d'initialisation ici.
// Les filtres sont ensuite normalisés avec le fuseau central dès que les
// réglages sont chargés.
const dateInitialeApplication = new Date();
const anneeInitialeApplication = String(dateInitialeApplication.getFullYear());
const moisInitialApplication = `${anneeInitialeApplication}-${String(
  dateInitialeApplication.getMonth() + 1
).padStart(2, "0")}`;
const jourInitialApplication = `${moisInitialApplication}-${String(
  dateInitialeApplication.getDate()
).padStart(2, "0")}`;

const etat = {
  utilisateur: null,
  cycleCompte: null,
  seances: [],
  indisponibilites: [],
  equipe: [],
  tarificationEquipe: { matieres: [], realisateurs: [] },
  demandesEquipe: [],
  demandesAdministration: [],
  equipesDisponibles: [],
  reglagesEspace: null,
  historique: [],
  monetisation: null,
  monetisationPeriodeMode: "monthly",
  monetisationFiltreAnnee: anneeInitialeApplication,
  monetisationFiltreMoisVue: moisInitialApplication,
  monetisationFiltreMois: moisInitialApplication,
  monetisationComptesSelectionnes: [],
  monetisationSelectionInitialisee: false,
  monetisationDateDebut: `${moisInitialApplication}-01`,
  monetisationDateFin: jourInitialApplication,
  monetisationGlobales: false,
  monetisationIntervenantsSelectionnes: [],
  monetisationResultatsVisibles: false,
  statistiques: null,
  statistiquesDateDebut: `${moisInitialApplication}-01`,
  statistiquesDateFin: jourInitialApplication,
  statistiquesGlobales: false,
  statistiquesResultatsVisibles: false,
  statistiquesRequeteVersion: 0,
  administration: null,
  analysesGlobalesAdministration: null,
  adminVueActive: "accounts",
  catalogue: creerCatalogueVide(),
  historiqueSelection: null,
  seanceSelectionnee: null,
  indisponibiliteSelectionnee: null,
  clicIndisponibilite: {
    id: null,
    count: 0,
    lastAt: 0,
  },
  calendrier: null,
  calendrierIndisponibilites: null,
  vueIndisponibilitesActive: "declaration",
  sectionActive: "aujourdhui",
  notificationsPush: {
    supported: false,
    permission: "default",
    subscribed: false,
  },
};
const vuesAdministration = {
  accounts: {
    titre: "Comptes",
  },
  catalogue: {
    titre: "Catalogue",
  },
  access: {
    titre: "Accès",
  },
  analytics: {
    titre: "Analyses globales",
  },
  security: {
    titre: "Sécurité",
  },
  maintenance: {
    titre: "Maintenance",
  },
  password: {
    titre: "MDP",
  },
  notifications: {
    titre: "Notifications",
  },
  danger: {
    titre: "Zone critique",
  },
};
const vuesAdministrationValides = new Set(Object.keys(vuesAdministration));
const vuesIndisponibilitesValides = new Set(["declaration"]);
const connexionTempsReel = {
  source: null,
  synchronisationProgrammee: null,
  synchronisationEnCours: false,
  synchronisationEnAttente: false,
  derniereNotificationCle: "",
  derniereNotificationAt: 0,
};
const horlogeCalendriers = {
  timer: null,
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
  showAccountRequestButton: document.getElementById("show-account-request-button"),
  showPasswordResetButton: document.getElementById("show-password-reset-button"),
  accountRequestForm: document.getElementById("account-request-form"),
  accountRequestName: document.getElementById("account-request-name"),
  accountRequestEmail: document.getElementById("account-request-email"),
  accountRequestRole: document.getElementById("account-request-role"),
  accountRequestHandlerField: document.getElementById("account-request-handler-field"),
  accountRequestHandler: document.getElementById("account-request-handler"),
  accountRequestError: document.getElementById("account-request-error"),
  passwordResetRequestForm: document.getElementById("password-reset-request-form"),
  passwordResetIdentifier: document.getElementById("password-reset-identifier"),
  passwordResetRequestError: document.getElementById("password-reset-request-error"),
  accountTokenForm: document.getElementById("account-token-form"),
  accountTokenTitle: document.getElementById("account-token-title"),
  accountTokenPassword: document.getElementById("account-token-password"),
  accountTokenPasswordConfirmation: document.getElementById(
    "account-token-password-confirmation"
  ),
  accountTokenError: document.getElementById("account-token-error"),
  logoutButton: document.getElementById("logout-button"),
  addSeanceButton: document.getElementById("add-seance-button"),
  navTabs: Array.from(document.querySelectorAll(".nav-tab")),
  todaySection: document.getElementById("aujourdhui-section"),
  dashboardSection: document.getElementById("dashboard-section"),
  calendrierSection: document.getElementById("calendrier-section"),
  calendarSettingsPanel: document.getElementById("calendar-settings-panel"),
  indisponibilitesSection: document.getElementById("indisponibilites-section"),
  equipeSection: document.getElementById("equipe-section"),
  statistiquesSection: document.getElementById("statistiques-section"),
  utilisateurSection: document.getElementById("utilisateur-section"),
  monetisationSection: document.getElementById("monetisation-section"),
  historiqueSection: document.getElementById("historique-section"),
  todayDateLabel: document.getElementById("today-date-label"),
  todayCount: document.getElementById("today-count"),
  todayList: document.getElementById("today-list"),
  teamList: document.getElementById("team-list"),
  teamPendingRequests: document.getElementById("team-pending-requests"),
  teamSubjectForm: document.getElementById("team-subject-form"),
  teamSubjectInput: document.getElementById("team-subject-input"),
  teamSubjectAddButton: document.getElementById("team-subject-add-button"),
  teamSubjectList: document.getElementById("team-subject-list"),
  teamTarificationForm: document.getElementById("team-tarification-form"),
  teamTarificationTable: document.getElementById("team-tarification-table"),
  teamTarificationSaveButton: document.getElementById("team-tarification-save-button"),
  workspaceSettingsCard: document.getElementById("workspace-settings-card"),
  workspaceSettingsForm: document.getElementById("workspace-settings-form"),
  calendarStartTime: document.getElementById("calendar-start-time"),
  calendarEndTime: document.getElementById("calendar-end-time"),
  workspaceSettingsError: document.getElementById("workspace-settings-error"),
  workspaceSettingsButton: document.getElementById("workspace-settings-button"),
  publicCalendarSettings: document.getElementById("public-calendar-settings"),
  publicCalendarTimezoneForm: document.getElementById("public-calendar-timezone-form"),
  publicCalendarTimezone: document.getElementById("public-calendar-timezone"),
  publicCalendarTimezoneError: document.getElementById("public-calendar-timezone-error"),
  publicCalendarTimezoneButton: document.getElementById("public-calendar-timezone-button"),
  publicCalendarStatus: document.getElementById("public-calendar-status"),
  publicCalendarLink: document.getElementById("public-calendar-link"),
  publicCalendarToggleButton: document.getElementById("public-calendar-toggle-button"),
  publicCalendarCopyButton: document.getElementById("public-calendar-copy-button"),
  currentUserName: document.getElementById("current-user-name"),
  currentUserPublicId: document.getElementById("current-user-public-id"),
  userNavLabel: document.getElementById("user-nav-label"),
  teamRequestBadge: document.getElementById("team-request-badge"),
  adminRequestBadge: document.getElementById("admin-request-badge"),
  adminPanelTitle: document.getElementById("admin-panel-title"),
  adminGuideTitle: document.getElementById("admin-guide-title"),
  userUsername: document.getElementById("user-username"),
  userRoleBadge: document.getElementById("user-role-badge"),
  userAccessBadge: document.getElementById("user-access-badge"),
  userAdminAccess: document.getElementById("user-admin-access"),
  userLastLogin: document.getElementById("user-last-login"),
  userSecurityStatus: document.getElementById("user-security-status"),
  passwordSecurityNotice: document.getElementById("password-security-notice"),
  adminToolsPanel: document.getElementById("admin-tools-panel"),
  adminViewTabs: Array.from(document.querySelectorAll("[data-admin-view]")),
  adminGroupItems: Array.from(document.querySelectorAll("[data-admin-group]")),
  adminGroupShells: Array.from(document.querySelectorAll("[data-admin-group-shell]")),
  adminActionsTitle: document.getElementById("admin-actions-title"),
  userPasswordForm: document.getElementById("user-password-form"),
  userPasswordError: document.getElementById("user-password-error"),
  currentPassword: document.getElementById("current-password"),
  newPassword: document.getElementById("new-password"),
  confirmPassword: document.getElementById("confirm-password"),
  savePasswordButton: document.getElementById("save-password-button"),
  teamMembershipCard: document.getElementById("team-membership-card"),
  teamMembershipForm: document.getElementById("team-membership-form"),
  teamMembershipHandler: document.getElementById("team-membership-handler"),
  teamMembershipDescription: document.getElementById("team-membership-description"),
  teamMembershipError: document.getElementById("team-membership-error"),
  teamMembershipSubmit: document.getElementById("team-membership-submit"),
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
  adminAccountRequestsList: document.getElementById("admin-account-requests-list"),
  adminGlobalAnalyticsForm: document.getElementById("admin-global-analytics-form"),
  adminGlobalAnalyticsDu: document.getElementById("admin-global-analytics-du"),
  adminGlobalAnalyticsAu: document.getElementById("admin-global-analytics-au"),
  adminGlobalAnalyticsButton: document.getElementById("admin-global-analytics-button"),
  adminGlobalAnalyticsError: document.getElementById("admin-global-analytics-error"),
  adminGlobalAnalyticsResults: document.getElementById("admin-global-analytics-results"),
  adminGlobalAnalyticsTotal: document.getElementById("admin-global-analytics-total"),
  adminGlobalAnalyticsFaites: document.getElementById("admin-global-analytics-faites"),
  adminGlobalAnalyticsHeures: document.getElementById("admin-global-analytics-heures"),
  adminGlobalAnalyticsMontant: document.getElementById("admin-global-analytics-montant"),
  adminGlobalAnalyticsIntervenants: document.getElementById(
    "admin-global-analytics-intervenants"
  ),
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
  adminUnavailabilityError: document.getElementById("admin-unavailability-error"),
  adminUnavailabilityButton: document.getElementById("admin-unavailability-button"),
  unavailabilityViewTabs: Array.from(document.querySelectorAll("[data-unavailability-view]")),
  unavailabilityWorkbenchNav: document.getElementById("unavailability-workbench-nav"),
  unavailabilityPanels: Array.from(document.querySelectorAll("[data-unavailability-panel]")),
  unavailabilityDeclarationPanel: document.getElementById(
    "unavailability-declaration-panel"
  ),
  unavailabilityCalendar: document.getElementById("unavailability-calendar"),
  unavailabilityDetailModal: document.getElementById("unavailability-detail-modal"),
  unavailabilityDetailTitle: document.getElementById("unavailability-detail-title"),
  unavailabilityDetailSubtitle: document.getElementById("unavailability-detail-subtitle"),
  unavailabilityDetailBadge: document.getElementById("unavailability-detail-badge"),
  unavailabilityDetailDate: document.getElementById("unavailability-detail-date"),
  unavailabilityDetailTime: document.getElementById("unavailability-detail-time"),
  unavailabilityDetailCreatedBy: document.getElementById(
    "unavailability-detail-created-by"
  ),
  unavailabilityDetailCreatedAt: document.getElementById(
    "unavailability-detail-created-at"
  ),
  editUnavailabilityButton: document.getElementById("edit-unavailability-button"),
  duplicateUnavailabilityButton: document.getElementById(
    "duplicate-unavailability-button"
  ),
  deleteUnavailabilityButton: document.getElementById("delete-unavailability-button"),
  unavailabilityFormPanel: document.getElementById("unavailability-form-panel"),
  unavailabilityFormTitle: document.getElementById("unavailability-form-title"),
  unavailabilityModalForm: document.getElementById("unavailability-modal-form"),
  unavailabilityModalDate: document.getElementById("unavailability-modal-date"),
  unavailabilityModalFullDay: document.getElementById("unavailability-modal-full-day"),
  unavailabilityModalFullDayNote: document.getElementById(
    "unavailability-modal-full-day-note"
  ),
  unavailabilityModalTimeFields: document.getElementById(
    "unavailability-modal-time-fields"
  ),
  unavailabilityModalStart: document.getElementById("unavailability-modal-start"),
  unavailabilityModalEnd: document.getElementById("unavailability-modal-end"),
  unavailabilityModalStartHourSelect: document.getElementById(
    "unavailability-modal-start-hour-select"
  ),
  unavailabilityModalStartMinuteSelect: document.getElementById(
    "unavailability-modal-start-minute-select"
  ),
  unavailabilityModalEndHourSelect: document.getElementById(
    "unavailability-modal-end-hour-select"
  ),
  unavailabilityModalEndMinuteSelect: document.getElementById(
    "unavailability-modal-end-minute-select"
  ),
  unavailabilityModalError: document.getElementById("unavailability-modal-error"),
  cancelUnavailabilityFormButton: document.getElementById(
    "cancel-unavailability-form-button"
  ),
  saveUnavailabilityButton: document.getElementById("save-unavailability-button"),
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
  adminLogoutUserForm: document.getElementById("admin-logout-user-form"),
  adminLogoutUserId: document.getElementById("admin-logout-user-id"),
  adminLogoutCurrentPassword: document.getElementById("admin-logout-current-password"),
  adminDeleteUserForm: document.getElementById("admin-delete-user-form"),
  adminDeleteUserId: document.getElementById("admin-delete-user-id"),
  adminDeleteUserPassword: document.getElementById("admin-delete-user-password"),
  adminDeleteUserError: document.getElementById("admin-delete-user-error"),
  adminDeleteUserButton: document.getElementById("admin-delete-user-button"),
  adminLogoutUserError: document.getElementById("admin-logout-user-error"),
  adminLogoutUserButton: document.getElementById("admin-logout-user-button"),
  adminMaintenanceSqliteForm: document.getElementById("admin-maintenance-sqlite-form"),
  adminMaintenanceSqliteStatus: document.getElementById("admin-maintenance-sqlite-status"),
  adminMaintenanceSqliteCurrentPassword: document.getElementById(
    "admin-maintenance-sqlite-current-password"
  ),
  adminMaintenanceSqliteError: document.getElementById("admin-maintenance-sqlite-error"),
  adminMaintenanceSqliteResult: document.getElementById("admin-maintenance-sqlite-result"),
  adminMaintenanceSqliteButton: document.getElementById("admin-maintenance-sqlite-button"),
  calendar: document.getElementById("calendar"),
  statsFilterForm: document.getElementById("stats-filter-form"),
  statsDateStart: document.getElementById("stats-date-start"),
  statsDateEnd: document.getElementById("stats-date-end"),
  statsGlobalToggle: document.getElementById("stats-global-toggle"),
  statsCalculateButton: document.getElementById("stats-calculate-button"),
  statsFilterError: document.getElementById("stats-filter-error"),
  statsResults: document.getElementById("stats-results"),
  totalCount: document.getElementById("total-count"),
  statsAccountsOverview: document.getElementById("stats-accounts-overview"),
  statsAccountsTable: document.getElementById("stats-accounts-table"),
  monetisationFilterForm: document.getElementById("monetisation-filter-form"),
  monetisationDateStart: document.getElementById("monetisation-date-start"),
  monetisationDateEnd: document.getElementById("monetisation-date-end"),
  monetisationGlobalToggle: document.getElementById("monetisation-global-toggle"),
  monetisationCalculateButton: document.getElementById("monetisation-calculate-button"),
  monetisationFilterError: document.getElementById("monetisation-filter-error"),
  monetisationResults: document.getElementById("monetisation-results"),
  monetisationTotalsByIntervenant: document.getElementById(
    "monetisation-totals-by-intervenant"
  ),
  monetisationDetails: document.getElementById("monetisation-details"),
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
  monetisationPrimaryOneAmountCard: document.getElementById("monetisation-primary-one-amount-card"),
  monetisationPrimaryTwoAmountCard: document.getElementById("monetisation-primary-two-amount-card"),
  monetisationPrimaryOneAmount: document.getElementById("monetisation-primary-one-amount"),
  monetisationPrimaryTwoAmount: document.getElementById("monetisation-primary-two-amount"),
  monetisationPrimaryOneRate: document.getElementById("monetisation-primary-one-rate"),
  monetisationPrimaryTwoRate: document.getElementById("monetisation-primary-two-rate"),
  monetisationPrimaryOneBillableCount: document.getElementById(
    "monetisation-primary-one-billable-count"
  ),
  monetisationPrimaryTwoBillableCount: document.getElementById(
    "monetisation-primary-two-billable-count"
  ),
  monetisationPrimaryOneTrialCount: document.getElementById(
    "monetisation-primary-one-trial-count"
  ),
  monetisationPrimaryTwoTrialCount: document.getElementById(
    "monetisation-primary-two-trial-count"
  ),
  monetisationPrimaryOneCard: document.getElementById("monetisation-primary-one-card"),
  monetisationPrimaryTwoCard: document.getElementById("monetisation-primary-two-card"),
  monetisationPrimaryOneDetails: document.getElementById("monetisation-primary-one-details"),
  monetisationPrimaryTwoDetails: document.getElementById("monetisation-primary-two-details"),
  monetisationPrimaryOneLabel: document.getElementById("monetisation-primary-one-label"),
  monetisationPrimaryTwoLabel: document.getElementById("monetisation-primary-two-label"),
  monetisationPrimaryOneTitle: document.getElementById("monetisation-primary-one-title"),
  monetisationPrimaryTwoTitle: document.getElementById("monetisation-primary-two-title"),
  monetisationExtraSection: document.getElementById("monetisation-extra-section"),
  monetisationExtraAccounts: document.getElementById("monetisation-extra-accounts"),
  monetisationReportAccountsSection: document.getElementById(
    "monetisation-report-accounts-section"
  ),
  monetisationReportAccountsSummary: document.getElementById(
    "monetisation-report-accounts-summary"
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
  seanceIntervenantField: document.getElementById("seance-intervenant-field"),
  seanceIntervenant: document.getElementById("seance-intervenant"),
  statusOptions: Array.from(document.querySelectorAll(".status-option")),
  date: document.getElementById("date"),
  heureDebut: document.getElementById("heure_debut"),
  heureDebutHourSelect: document.getElementById("heure-debut-hour-select"),
  heureDebutMinuteSelect: document.getElementById("heure-debut-minute-select"),
  heureFinCalculee: document.getElementById("heure_fin_calculee"),
  dureeCheckboxes: Array.from(document.querySelectorAll(".duration-checkbox")),
  statutCheckboxes: Array.from(document.querySelectorAll(".statut-checkbox")),
  essaiCheckboxes: Array.from(document.querySelectorAll(".essai-checkbox")),
  descriptionSection: document.getElementById("description-section"),
  statusSection: document.getElementById("status-section"),
  description: document.getElementById("description"),
  seanceChoiceModal: document.getElementById("seance-choice-modal"),
  seanceChoiceList: document.getElementById("seance-choice-list"),
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
  duplicateSeanceButton: document.getElementById("duplicate-seance-button"),
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

function obtenirProfesseursCalendrierCentral() {
  const equipe = Array.isArray(etat.equipe) ? etat.equipe : [];
  const idHandler = Number(etat.utilisateur?.id || 0);
  const professeursParId = new Map();

  equipe.forEach((professeur) => {
    const id = Number(professeur?.id || 0);
    if (!Number.isInteger(id) || id <= 0 || id === idHandler) {
      return;
    }

    if (
      professeur?.acces_active === false ||
      Number(professeur?.acces_active) === 0 ||
      String(professeur?.statut_compte || "active").toLowerCase() !== "active"
    ) {
      return;
    }

    professeursParId.set(id, {
      ...professeur,
      id,
    });
  });

  return Array.from(professeursParId.values()).sort(
    (premier, second) =>
      String(premier.public_id || premier.nom || "").localeCompare(
        String(second.public_id || second.nom || ""),
        "fr"
      ) || premier.id - second.id
  );
}

function construireDonneesDisponibiliteCalendrierCentral() {
  return {
    // Le fond collectif ne dépend que des Professeurs rattachés : le Handler
    // reste réservable même si tous les Professeurs sont indisponibles.
    professeurs: obtenirProfesseursCalendrierCentral(),
    seances: etat.seances,
    indisponibilites: etat.indisponibilites,
    handlerId: Number(etat.utilisateur?.id || 0) || null,
    plageHoraire: obtenirPlageCalendrierEffective(),
  };
}

function obtenirPasCreneauCalendrierCentral() {
  return 30;
}

function appliquerCouleursEquipeAuxSeancesCalendrier(seances = []) {
  if (!utilisateurEstHandler()) {
    return seances;
  }

  const realisateurs = [
    {
      ...etat.utilisateur,
      id: Number(etat.utilisateur?.id || 0),
      acces_active: etat.utilisateur?.acces_active ?? 1,
      statut_compte: etat.utilisateur?.statut_compte || "active",
    },
    ...obtenirProfesseursCalendrierCentral(),
  ].filter((intervenant) => Number(intervenant?.id || 0) > 0);
  const couleursParIntervenant = new Map(
    Array.from(creerPalettesDisponibiliteProfesseurs(realisateurs).entries()).map(
      ([intervenantId, palette]) => [
      Number(intervenantId),
      String(palette?.backgroundColor || "").trim(),
      ]
    )
  );

  if (couleursParIntervenant.size === 0) {
    return seances;
  }

  return (Array.isArray(seances) ? seances : []).map((seance) => {
    const couleur = couleursParIntervenant.get(Number(seance?.intervenant_id));
    return couleur ? { ...seance, intervenant_couleur_calendrier: couleur } : seance;
  });
}

function mettreAJourFiltreCalendrierCentral() {
  if (elements.calendar) {
    elements.calendar.dataset.centralCalendarMode = utilisateurEstHandler() ? "central" : "";
  }
}

function obtenirDonneesCalendrierIndisponibilitesPersonnelles() {
  const realisateurId = Number(etat.utilisateur?.id || 0);
  const estPropre = (element) => Number(element?.intervenant_id) === realisateurId;

  return {
    seances: (Array.isArray(etat.seances) ? etat.seances : []).filter(estPropre),
    indisponibilites: (Array.isArray(etat.indisponibilites)
      ? etat.indisponibilites
      : []
    ).filter(estPropre),
  };
}

function rafraichirEvenementsCalendrier() {
  if (etat.calendrier) {
    const seancesCalendrier = appliquerCouleursEquipeAuxSeancesCalendrier(etat.seances);
    mettreAJourEvenements(
      etat.calendrier,
      seancesCalendrier,
      etat.indisponibilites,
      utilisateurEstHandler()
        ? {
            vue: "central",
            disponibilites: construireDonneesDisponibiliteCalendrierCentral(),
          }
        : undefined
    );
  }

  if (etat.calendrierIndisponibilites) {
    const donneesPersonnelles = obtenirDonneesCalendrierIndisponibilitesPersonnelles();
    mettreAJourEvenements(
      etat.calendrierIndisponibilites,
      donneesPersonnelles.seances,
      donneesPersonnelles.indisponibilites
    );
  }

  mettreAJourFiltreCalendrierCentral();
}

function viderDonneesApplication() {
  arreterHorlogeCalendriers();
  etat.seances = [];
  etat.indisponibilites = [];
  etat.equipe = [];
  etat.tarificationEquipe = { matieres: [], realisateurs: [] };
  etat.demandesEquipe = [];
  etat.demandesAdministration = [];
  etat.reglagesEspace = null;
  etat.historique = [];
  etat.monetisation = null;
  etat.monetisationPeriodeMode = "monthly";
  etat.monetisationFiltreAnnee = obtenirAnneeCouranteIso();
  etat.monetisationFiltreMoisVue = obtenirMoisCourantIso();
  etat.monetisationFiltreMois = obtenirMoisCourantIso();
  etat.monetisationComptesSelectionnes = [];
  etat.monetisationSelectionInitialisee = false;
  etat.monetisationDateDebut = `${obtenirMoisCourantIso()}-01`;
  etat.monetisationDateFin = obtenirDateLocaleIso();
  etat.monetisationGlobales = false;
  etat.monetisationIntervenantsSelectionnes = [];
  etat.monetisationResultatsVisibles = false;
  etat.statistiques = null;
  etat.statistiquesDateDebut = `${obtenirMoisCourantIso()}-01`;
  etat.statistiquesDateFin = obtenirDateLocaleIso();
  etat.statistiquesGlobales = false;
  etat.statistiquesResultatsVisibles = false;
  etat.statistiquesRequeteVersion += 1;
  etat.administration = null;
  etat.catalogue = creerCatalogueVide();
  etat.historiqueSelection = null;
  etat.seanceSelectionnee = null;
  etat.indisponibiliteSelectionnee = null;
  etat.vueIndisponibilitesActive = "declaration";

  if (etat.calendrier || etat.calendrierIndisponibilites) {
    rafraichirEvenementsCalendrier();
  }

  mettreAJourResume();
  afficherListeHistorique();
  viderDetailHistorique();
  viderMonetisation();
  viderAdministration();
  afficherEquipe();
  afficherReglagesEspace();
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
    chargerEquipeSiAutorise(),
    chargerHistorique(),
    chargerMonetisationSiAutorise(),
    chargerAdministrationSiAutorise(),
    chargerReglagesEspaceSiAutorise(),
    chargerEquipesDisponiblesSiProfesseur(),
  ]);
}

async function initialiserApplication() {
  initialiserCycleCompteDepuisHash();
  appliquerConnexionMemorisee();
  synchroniserIdentifiantsFormulairesMotDePasse();
  mettreAJourVisibiliteMotDePasseConnexion();
  initialiserChoixHeureDebut();
  initialiserChoixHeuresIndisponibilite();
  synchroniserChoixHeuresCalendrier();
  initialiserFormulaireIndisponibilite();
  initialiserCatalogueSeanceParDefaut();
  reinitialiserEtatNotificationsPush();
  attacherEcouteurs();
  mettreAJourCarteNotificationsPush();

  // login-lifecycle.js intentionally takes over the root page for a public
  // activation/reset URL, including when that URL is opened from an already
  // signed-in browser. Do not let the normal /auth/me bootstrap replace the
  // one-time-password form with the dashboard.
  if (window.__gestionSeancesLifecycleRoutePublique === true) {
    afficherConnexion({ preserveFeedback: true });
    return;
  }

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

function convertirHeureCalendrierClientEnMinutes(heure, { fin = false } = {}) {
  const valeur = String(heure || "").trim();
  if (fin && (valeur === "00:00" || valeur === "24:00")) {
    return 24 * 60;
  }
  const correspondance = valeur.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return correspondance ? Number(correspondance[1]) * 60 + Number(correspondance[2]) : null;
}

function formaterMinutesCalendrierClient(minutes, { fin = false } = {}) {
  const total = Number(minutes);
  if (fin && total === 24 * 60) return "00:00";
  if (!Number.isFinite(total) || total < 0 || total >= 24 * 60) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function obtenirBornesCalendrierClient() {
  const plage = obtenirPlageCalendrierEffective();
  const debut = convertirHeureCalendrierClientEnMinutes(plage.calendar_start_time);
  const fin = convertirHeureCalendrierClientEnMinutes(plage.calendar_end_time, { fin: true });
  return {
    debut: Number.isFinite(debut) ? debut : 8 * 60,
    fin: Number.isFinite(fin) && fin > debut ? fin : 23 * 60 + 30,
  };
}

function intervalleEstDansPlageCalendrierClient(heureDebut, heureFin) {
  const debut = convertirHeureCalendrierClientEnMinutes(heureDebut);
  const fin = convertirHeureCalendrierClientEnMinutes(heureFin, { fin: true });
  const bornes = obtenirBornesCalendrierClient();
  return (
    Number.isFinite(debut) &&
    Number.isFinite(fin) &&
    fin > debut &&
    debut >= bornes.debut &&
    fin <= bornes.fin
  );
}

function messagePlageCalendrierClient() {
  const plage = obtenirPlageCalendrierEffective();
  return `Le créneau doit rester dans la plage du calendrier (${plage.calendar_start_time}–${plage.calendar_end_time}).`;
}

function creerCreneauxDebutSeanceCalendrier() {
  const { debut, fin } = obtenirBornesCalendrierClient();
  const creneaux = [];
  // Toute heure proposée doit au moins pouvoir accueillir une séance d'une
  // heure, la plus courte des durées métier.
  for (let minutes = debut; minutes + 60 <= fin; minutes += 30) {
    creneaux.push(formaterMinutesCalendrierClient(minutes));
  }
  return creneaux;
}

function remplirMinutesDebutPourHeure(heure, valeurSouhaitee = "") {
  if (!elements.heureDebutMinuteSelect) return;
  const minutes = creerCreneauxDebutSeanceCalendrier()
    .filter((creneau) => creneau.startsWith(`${heure}:`))
    .map((creneau) => creneau.slice(3));
  remplirSelectOptionsSimples(
    elements.heureDebutMinuteSelect,
    minutes.length > 0 ? minutes : minutesDebutDisponibles
  );
  elements.heureDebutMinuteSelect.value = selectContientValeur(
    elements.heureDebutMinuteSelect,
    valeurSouhaitee
  )
    ? valeurSouhaitee
    : elements.heureDebutMinuteSelect.options[0]?.value || "";
}

function initialiserChoixHeureDebut(valeurSouhaitee = "") {
  if (!elements.heureDebutHourSelect || !elements.heureDebutMinuteSelect) {
    return;
  }

  const creneaux = creerCreneauxDebutSeanceCalendrier();
  const heures = Array.from(new Set(creneaux.map((creneau) => creneau.slice(0, 2))));
  const [heureSouhaitee, minuteSouhaitee] = String(valeurSouhaitee || "").split(":");
  heuresDebutDisponibles = heures.length > 0 ? heures : ["08"];
  elements.heureDebutHourSelect.innerHTML = heuresDebutDisponibles
    .map((heure) => `<option value="${heure}">${heure}</option>`)
    .join("");
  elements.heureDebutHourSelect.value = selectContientValeur(
    elements.heureDebutHourSelect,
    heureSouhaitee
  )
    ? heureSouhaitee
    : heuresDebutDisponibles[0];
  remplirMinutesDebutPourHeure(elements.heureDebutHourSelect.value, minuteSouhaitee);
}

function remplirSelectOptionsSimples(select, valeurs) {
  if (!select) {
    return;
  }

  select.innerHTML = valeurs
    .map((valeur) => `<option value="${valeur}">${valeur}</option>`)
    .join("");
}

function initialiserChoixHeuresIndisponibilite() {
  remplirSelectOptionsSimples(
    elements.unavailabilityModalStartHourSelect,
    heuresIndisponibiliteDisponibles
  );
  const finMinuit = obtenirPlageCalendrierEffective().calendar_end_time === "00:00";
  remplirSelectOptionsSimples(
    elements.unavailabilityModalEndHourSelect,
    finMinuit ? [...heuresIndisponibiliteDisponibles, "00"] : heuresIndisponibiliteDisponibles
  );

  [
    elements.unavailabilityModalStartMinuteSelect,
  ].forEach((select) => {
    remplirSelectOptionsSimples(select, minutesDebutDisponibles);
  });

  remplirSelectOptionsSimples(
    elements.unavailabilityModalEndMinuteSelect,
    minutesFinIndisponibiliteDisponibles
  );
}

function synchroniserChoixHeuresCalendrier() {
  const heureActuelle = String(elements.heureDebut?.value || "");
  initialiserChoixHeureDebut(heureActuelle);

  const { debut, fin } = obtenirBornesCalendrierClient();
  const heures = [];
  for (let minutes = debut; minutes < fin; minutes += 30) {
    heures.push(String(Math.floor(minutes / 60)).padStart(2, "0"));
  }
  heuresIndisponibiliteDisponibles = Array.from(new Set(heures)).filter(
    (heure) => heure !== "24"
  );
  initialiserChoixHeuresIndisponibilite();

}

function selectContientValeur(select, valeur) {
  return Array.from(select?.options || []).some(
    (option) => option.value === String(valeur || "")
  );
}

function definirHeureIndisponibilite(controles, type, heure) {
  const estFinMinuit = type === "end" && (heure === "00:00" || heure === "24:00");
  const heureNormalisee = estFinMinuit
    ? "00:00"
    : estHeureValide(heure)
      ? heure
      : recupererHeureDebutParDefaut();
  const [heures, minutes] = heureNormalisee.split(":");
  const input = controles?.[`${type}Input`];
  const hourSelect = controles?.[`${type}HourSelect`];
  const minuteSelect = controles?.[`${type}MinuteSelect`];

  if (input) {
    input.value = heureNormalisee;
  }

  if (hourSelect && minuteSelect) {
    if (!selectContientValeur(hourSelect, heures)) {
      hourSelect.add(new Option(heures, heures));
    }
    hourSelect.value = heures;
    if (!selectContientValeur(minuteSelect, minutes)) {
      minuteSelect.add(new Option(minutes, minutes));
    }
    minuteSelect.value = selectContientValeur(minuteSelect, minutes)
      ? minutes
      : minutesDebutDisponibles[0];
  }
}

function lireHeureIndisponibilite(controles, type) {
  const input = controles?.[`${type}Input`];
  const hourSelect = controles?.[`${type}HourSelect`];
  const minuteSelect = controles?.[`${type}MinuteSelect`];

  if (hourSelect && minuteSelect) {
    const heures = hourSelect.value;
    const minutes = minuteSelect.value;
    return heures && minutes ? `${heures}:${minutes}` : "";
  }

  return input?.value || "";
}

function formaterHeureFinIndisponibilitePourSaisie(heure) {
  return heure === "24:00" ? "00:00" : heure;
}

function obtenirChampsHeuresIndisponibilite(controles) {
  return [
    controles?.startInput,
    controles?.endInput,
    controles?.startHourSelect,
    controles?.startMinuteSelect,
    controles?.endHourSelect,
    controles?.endMinuteSelect,
  ].filter(Boolean);
}

function configurerChampsHeuresIndisponibilite(controles, { disabled, required }) {
  obtenirChampsHeuresIndisponibilite(controles).forEach((champ) => {
    champ.disabled = disabled;
    champ.required = required;
  });
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
  controles.endInput.value = formaterHeureFinIndisponibilitePourSaisie(
    calculerHeureFin(controles.startInput.value, 60)
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
      ? "Ajouter la journée"
      : "Ajouter le créneau";
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
    controles.endInput.value = formaterHeureFinIndisponibilitePourSaisie(
      calculerHeureFin(controles.startInput.value, 60)
    );
  }
}

function obtenirControlesIndisponibiliteModal() {
  return {
    form: elements.unavailabilityModalForm,
    dateInput: elements.unavailabilityModalDate,
    fullDayInput: elements.unavailabilityModalFullDay,
    fullDayNote: elements.unavailabilityModalFullDayNote,
    timeFields: elements.unavailabilityModalTimeFields,
    startInput: elements.unavailabilityModalStart,
    endInput: elements.unavailabilityModalEnd,
    startHourSelect: elements.unavailabilityModalStartHourSelect,
    startMinuteSelect: elements.unavailabilityModalStartMinuteSelect,
    endHourSelect: elements.unavailabilityModalEndHourSelect,
    endMinuteSelect: elements.unavailabilityModalEndMinuteSelect,
    errorElement: elements.unavailabilityModalError,
    button: elements.saveUnavailabilityButton,
  };
}

function mettreAJourModeJourCompletIndisponibiliteModal() {
  const controles = obtenirControlesIndisponibiliteModal();
  const jourComplet = Boolean(controles.fullDayInput?.checked);

  if (controles.form) {
    controles.form.dataset.fullDay = jourComplet ? "1" : "0";
  }

  controles.timeFields?.classList.toggle("hidden", jourComplet);
  controles.fullDayNote?.classList.toggle("hidden", !jourComplet);
  masquerErreur(controles.errorElement);

  configurerChampsHeuresIndisponibilite(controles, {
    disabled: jourComplet,
    required: !jourComplet,
  });

  if (jourComplet) {
    definirHeureIndisponibilite(controles, "start", "00:00");
    definirHeureIndisponibilite(controles, "end", "23:59");
    return;
  }

  const heureDebut = lireHeureIndisponibilite(controles, "start");
  const heureFin = lireHeureIndisponibilite(controles, "end");

  if (!heureDebut || heureDebut === "00:00") {
    definirHeureIndisponibilite(controles, "start", recupererHeureDebutParDefaut());
  }

  if (
    !heureFin ||
    heureFin === "23:59" ||
    calculerDureeMinutesDepuisHeures(lireHeureIndisponibilite(controles, "start"), heureFin) <= 0
  ) {
    const debutActuel = lireHeureIndisponibilite(controles, "start");
    definirHeureIndisponibilite(controles, "end", calculerHeureFin(debutActuel, 60));
  }
}

function lireDonneesIndisponibiliteDepuisControles(controles) {
  const jourComplet =
    controles.form?.dataset.fullDay === "1" ||
    Boolean(controles.fullDayInput?.checked) ||
    Boolean(controles.timeFields?.classList.contains("hidden"));

  return {
    date: controles.dateInput.value,
    heure_debut: jourComplet ? "00:00" : lireHeureIndisponibilite(controles, "start"),
    heure_fin: jourComplet ? "23:59" : lireHeureIndisponibilite(controles, "end"),
    jour_complet: jourComplet,
    raison: "",
  };
}

function estHeureFinIndisponibiliteClientValide(heure) {
  return estHeureDebutSeanceValide(heure) || heure === "23:59" || heure === "24:00";
}

function validerDonneesIndisponibiliteClient(
  donneesIndisponibilite,
  errorElement,
  options = {}
) {
  const { date, heure_debut: heureDebut, heure_fin: heureFin, jour_complet: jourComplet } =
    donneesIndisponibilite;

  if (!date || (!jourComplet && (!heureDebut || !heureFin))) {
    afficherErreur(errorElement, "Date, heure de début et heure de fin obligatoires.");
    return false;
  }

  if (!estDateIsoValide(date)) {
    afficherErreur(errorElement, "La date est invalide.");
    return false;
  }

  if (!jourComplet) {
    if (
      !estHeureDebutSeanceValide(heureDebut) ||
      !estHeureFinIndisponibiliteClientValide(heureFin)
    ) {
      afficherErreur(errorElement, "Les heures doivent être choisies par tranches de 30 minutes.");
      return false;
    }

    if (calculerDureeMinutesDepuisHeures(heureDebut, heureFin) <= 0) {
      afficherErreur(errorElement, "L'heure de fin doit être postérieure à l'heure de début.");
      return false;
    }

    const indisponibiliteExistante = options.indisponibiliteExistante;
    const finHistorique = String(indisponibiliteExistante?.heure_fin || "");
    const finSaisie = String(heureFin || "");
    const conservePlageHistorique =
      indisponibiliteExistante &&
      String(indisponibiliteExistante.heure_debut || "") === String(heureDebut || "") &&
      (finHistorique === finSaisie ||
        (["00:00", "24:00"].includes(finHistorique) &&
          ["00:00", "24:00"].includes(finSaisie)));
    if (!conservePlageHistorique && !intervalleEstDansPlageCalendrierClient(heureDebut, heureFin)) {
      afficherErreur(errorElement, messagePlageCalendrierClient());
      return false;
    }
  }

  if (jourComplet) {
    const jourDejaBloque = etat.indisponibilites.find((indisponibilite) => {
      if (indisponibilite.date !== date || !estIndisponibiliteJourCompletClient(indisponibilite)) {
        return false;
      }

      return !(
        options.ignorerIndisponibiliteId &&
        Number(indisponibilite.id) === Number(options.ignorerIndisponibiliteId)
      );
    });

    if (jourDejaBloque) {
      afficherErreur(errorElement, "Cette journée est déjà indisponible.");
      return false;
    }

    return true;
  }

  const conflit = trouverIndisponibiliteChevauchanteLocale({
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    ignorerIndisponibiliteId: options.ignorerIndisponibiliteId || null,
  });

  if (conflit) {
    afficherErreur(errorElement, "Ce créneau chevauche déjà une indisponibilité existante.");
    return false;
  }

  return true;
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

function normaliserIntervenantsSeance(valeurs) {
  const parId = new Map();

  (Array.isArray(valeurs) ? valeurs : []).forEach((intervenant) => {
    const id = Number(intervenant?.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    parId.set(id, {
      ...intervenant,
      id,
      nom: String(intervenant?.nom || "").trim(),
      public_id: String(intervenant?.public_id || "").trim() || null,
    });
  });

  return Array.from(parId.values()).sort(
    (premier, second) =>
      String(premier.public_id || premier.nom || "").localeCompare(
        String(second.public_id || second.nom || ""),
        "fr"
      ) || premier.id - second.id
  );
}

function obtenirMatieresDisponibles() {
  return normaliserListeCatalogue(etat.catalogue?.matieres);
}

function obtenirComptesDisponibles() {
  return normaliserListeCatalogue(etat.catalogue?.comptes);
}

function obtenirCompteParDefaut() {
  const comptes = obtenirComptesDisponibles();
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

function obtenirValeurCatalogueActiveOuDefaut(liste, valeur, valeurParDefaut) {
  const valeurNormalisee = String(valeur || "").trim();

  if (!valeurNormalisee) {
    return valeurParDefaut;
  }

  const valeurActive = liste.find(
    (element) => String(element || "").trim().toLowerCase() === valeurNormalisee.toLowerCase()
  );

  return valeurActive || valeurParDefaut;
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
  if (!elements.matiereOptions) {
    return;
  }

  const matiereSelectionnee = recupererValeurSelectionnee(elements.matiereCheckboxes);
  const matieres = obtenirMatieresDisponibles();
  const seanceEnEdition =
    elements.seanceForm?.dataset.mode === "modification" ? etat.seanceSelectionnee : null;
  const matieresAffichees = ajouterValeurCatalogueLegacy(matieres, seanceEnEdition?.matiere);

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

  elements.matiereCheckboxes = Array.from(
    elements.matiereOptions.querySelectorAll(".matiere-checkbox")
  );
  elements.compteCheckboxes = [];

  attacherSelectionUnique(elements.matiereCheckboxes, mettreAJourEtapesFormulaireSeance);

  definirValeurSelectionnee(
    elements.matiereCheckboxes,
    seanceEnEdition
      ? obtenirValeurCatalogueActiveOuDefaut(
          matieresAffichees,
          seanceEnEdition.matiere,
          obtenirMatiereParDefaut()
        )
      : matieresAffichees.includes(matiereSelectionnee)
        ? matiereSelectionnee
        : ""
  );
  rendreOptionsIntervenantsSeance();
}

function initialiserCatalogueSeanceParDefaut() {
  etat.catalogue = creerCatalogueVide();
  rendreOptionsCatalogueSeance();
}

function obtenirIntervenantsSeance() {
  return normaliserIntervenantsSeance(etat.catalogue?.intervenants);
}

function libelleIntervenantSeance(intervenant) {
  const nom = String(intervenant?.nom || "").trim();
  const identifiant = String(intervenant?.public_id || "").trim();
  const estUtilisateurCourant = Number(intervenant?.id) === Number(etat.utilisateur?.id);
  const base = nom || identifiant || "Réalisateur";
  return estUtilisateurCourant ? `${base} (vous)` : base;
}

function obtenirCreneauSelectionnePourIntervenants() {
  const date = String(elements.date?.value || "").trim();
  const heureDebut = String(elements.heureDebut?.value || "").trim();
  const dureeMinutes = recupererDureeSelectionnee();
  const heureFin = calculerHeureFin(heureDebut, dureeMinutes);

  if (!estDateIsoValide(date) || !estHeureDebutSeanceValide(heureDebut) || !heureFin) {
    return null;
  }

  return {
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
  };
}

function intervenantEstDisponiblePourCreneau(intervenantId, creneau, options = {}) {
  const id = Number(intervenantId || 0);
  const idHandler = Number(etat.utilisateur?.id || 0);
  const ignorerSeanceId = options.ignorerSeanceId || null;

  if (!id || !creneau) {
    return false;
  }

  const conflitSeance = trouverSeanceChevauchanteLocale({
    ...creneau,
    intervenantId: id,
    ignorerSeanceId,
  });

  if (conflitSeance) {
    return false;
  }

  // Le Handler peut placer sa propre séance sur n'importe quel créneau de sa
  // journée. Ses indisponibilités historiques ne doivent pas l'empêcher de
  // remplir le créneau collectif grisé.
  if (id === idHandler) {
    return true;
  }

  return !(
    estJourIntegralementIndisponible(creneau.date, id) ||
    trouverIndisponibiliteChevauchanteLocale({
      ...creneau,
      intervenantId: id,
    })
  );
}

function obtenirIntervenantsEligiblesPourCreneauSeance() {
  const intervenants = obtenirIntervenantsSeance();
  const creneau = obtenirCreneauSelectionnePourIntervenants();
  const mode = elements.seanceForm?.dataset.mode || "creation";
  const seanceEnEdition = mode === "modification" ? etat.seanceSelectionnee : null;
  const intervenantEditionId = Number(seanceEnEdition?.intervenant_id || 0);
  const creneauEstCeluiDeLaSeanceEnEdition =
    Boolean(seanceEnEdition) &&
    String(seanceEnEdition.date || "") === creneau?.date &&
    String(seanceEnEdition.heure_debut || "") === creneau?.heure_debut &&
    String(seanceEnEdition.heure_fin || "") === creneau?.heure_fin;

  if (!creneau) {
    return mode === "modification" ? intervenants : [];
  }

  return intervenants.filter((intervenant) => {
    // Une modification uniquement descriptive doit rester possible si une
    // indisponibilité a été déclarée après la séance existante.
    if (
      mode === "modification" &&
      creneauEstCeluiDeLaSeanceEnEdition &&
      intervenant.id === intervenantEditionId
    ) {
      return true;
    }

    return intervenantEstDisponiblePourCreneau(intervenant.id, creneau, {
      ignorerSeanceId: seanceEnEdition?.id || null,
    });
  });
}

function definirIntervenantSeanceSelectionne(intervenantId, { obligatoire = false } = {}) {
  const select = elements.seanceIntervenant;
  const champ = elements.seanceIntervenantField;
  const estHandler = utilisateurEstHandler();

  if (!select || !champ) {
    return null;
  }

  champ.classList.toggle("hidden", !estHandler);
  select.required = estHandler && obligatoire;
  select.disabled = !estHandler || !utilisateurPeutModifierDonnees();

  if (!estHandler) {
    select.value = "";
    return Number(etat.utilisateur?.id || 0) || null;
  }

  const intervenants = obtenirIntervenantsEligiblesPourCreneauSeance();
  const idDemande = Number(intervenantId || 0);
  const optionExiste = intervenants.some((intervenant) => intervenant.id === idDemande);
  const idParDefaut = optionExiste && idDemande ? idDemande : null;

  if (idParDefaut && !Array.from(select.options).some((option) => Number(option.value) === idParDefaut)) {
    const intervenant = intervenants.find((item) => item.id === idParDefaut);
    const option = new Option(
      intervenant ? libelleIntervenantSeance(intervenant) : "Intervenant",
      String(idParDefaut)
    );
    select.add(option);
  }

  select.value = idParDefaut ? String(idParDefaut) : "";
  return idParDefaut;
}

function rendreOptionsIntervenantsSeance() {
  const select = elements.seanceIntervenant;
  const champ = elements.seanceIntervenantField;

  if (!select || !champ) {
    return;
  }

  const valeurCourante = Number(select.value || 0);
  const seanceEnEdition =
    elements.seanceForm?.dataset.mode === "modification" ? etat.seanceSelectionnee : null;
  const intervenantSeance = Number(seanceEnEdition?.intervenant_id || 0);
  const intervenants = obtenirIntervenantsEligiblesPourCreneauSeance();

  select.replaceChildren();
  if (intervenants.length === 0) {
    select.appendChild(new Option("Aucun réalisateur disponible", ""));
  } else {
    select.appendChild(new Option("Choisir un réalisateur", ""));
    intervenants.forEach((intervenant) => {
      select.appendChild(new Option(libelleIntervenantSeance(intervenant), String(intervenant.id)));
    });
  }

  definirIntervenantSeanceSelectionne(
    intervenantSeance || valeurCourante,
    { obligatoire: true }
  );
}

function definirChampsSeanceDesactives(champs, desactives) {
  champs.filter(Boolean).forEach((champ) => {
    champ.disabled = Boolean(desactives);
  });
}

function definirProgressionCreationSeance({ dateConfirmee = false, horaireConfirme = false } = {}) {
  if (!elements.seanceForm) {
    return;
  }

  elements.seanceForm.dataset.dateConfirmed = dateConfirmee ? "true" : "false";
  elements.seanceForm.dataset.timeConfirmed = horaireConfirme ? "true" : "false";
}

function marquerDateSeanceCommeChoisie() {
  if (!elements.seanceForm) {
    return;
  }

  elements.seanceForm.dataset.dateConfirmed = "true";
  // Un changement de date doit être suivi d'un choix explicite de l'horaire.
  elements.seanceForm.dataset.timeConfirmed = "false";
  mettreAJourEtapesFormulaireSeance();
}

function marquerHoraireSeanceCommeChoisi() {
  if (elements.seanceForm) {
    elements.seanceForm.dataset.timeConfirmed = "true";
  }
}

function mettreAJourEtapesFormulaireSeance() {
  if (!elements.seanceForm) {
    return;
  }

  const mode = elements.seanceForm.dataset.mode || "creation";
  const estModification = mode === "modification";
  const modifiable = utilisateurPeutModifierDonnees();
  const informationsValides = Boolean(
    String(elements.etudiant?.value || "").trim() &&
      recupererValeurSelectionnee(elements.matiereCheckboxes)
  );
  const dateValide = estDateIsoValide(String(elements.date?.value || ""));
  const creneauValide = Boolean(obtenirCreneauSelectionnePourIntervenants());
  const horaireConfirme = elements.seanceForm.dataset.timeConfirmed === "true";
  const autoriserDate = modifiable;
  const autoriserHoraire = modifiable;
  const autoriserRealisateur = modifiable && creneauValide && horaireConfirme;

  definirChampsSeanceDesactives([elements.date], !autoriserDate);
  definirChampsSeanceDesactives(
    [elements.heureDebutHourSelect, elements.heureDebutMinuteSelect],
    !autoriserHoraire
  );
  definirChampsSeanceDesactives(elements.dureeCheckboxes, !autoriserHoraire);

  if (utilisateurEstHandler()) {
    rendreOptionsIntervenantsSeance();
    if (elements.seanceIntervenant) {
      elements.seanceIntervenant.disabled = !autoriserRealisateur;
    }
  }

  const intervenantSelectionne = obtenirIntervenantCibleSeance();
  definirChampsSeanceDesactives(elements.essaiCheckboxes, !modifiable);
  definirChampsSeanceDesactives(elements.statutCheckboxes, !modifiable);

  if (elements.description) {
    elements.description.disabled = !modifiable;
  }

  if (elements.saveSeanceButton) {
    elements.saveSeanceButton.disabled = !(
      modifiable &&
      informationsValides &&
      dateValide &&
      creneauValide &&
      autoriserRealisateur &&
      intervenantSelectionne
    );
  }
}

function masquerFormulairesCycleCompte(excepte = null) {
  [
    elements.accountRequestForm,
    elements.passwordResetRequestForm,
    elements.accountTokenForm,
  ].forEach((formulaire) => {
    if (formulaire && formulaire !== excepte) {
      formulaire.classList.add("hidden");
    }
  });
}

function mettreAJourChampHandlerDemande() {
  const estProfesseur = elements.accountRequestRole?.value === "professeur";
  elements.accountRequestHandlerField?.classList.toggle("hidden", !estProfesseur);

  if (elements.accountRequestHandler) {
    elements.accountRequestHandler.required = estProfesseur;
    if (!estProfesseur) {
      elements.accountRequestHandler.value = "";
    }
  }
}

async function chargerHandlersPourDemande() {
  if (!elements.accountRequestHandler) {
    return;
  }

  elements.accountRequestHandler.innerHTML = '<option value="">Chargement…</option>';
  elements.accountRequestHandler.disabled = true;

  try {
    const identifiants = await recupererIdentifiantsHandlersPublics();
    elements.accountRequestHandler.innerHTML = '<option value="">Choisir un Handler</option>';

    identifiants.forEach((identifiant) => {
      const option = document.createElement("option");
      option.value = identifiant;
      option.textContent = identifiant;
      elements.accountRequestHandler.appendChild(option);
    });

    if (identifiants.length === 0) {
      elements.accountRequestHandler.innerHTML = '<option value="">Aucun Handler disponible</option>';
    }
  } catch (erreur) {
    elements.accountRequestHandler.innerHTML = '<option value="">Indisponible</option>';
    afficherErreur(elements.accountRequestError, erreur.message);
  } finally {
    elements.accountRequestHandler.disabled = false;
  }
}

async function ouvrirDemandeCompte() {
  if (!elements.accountRequestForm) {
    return;
  }

  const doitAfficher = elements.accountRequestForm.classList.contains("hidden");
  masquerFormulairesCycleCompte(doitAfficher ? elements.accountRequestForm : null);
  elements.accountRequestForm.classList.toggle("hidden", !doitAfficher);
  masquerErreur(elements.accountRequestError);

  if (doitAfficher) {
    mettreAJourChampHandlerDemande();
    await chargerHandlersPourDemande();
    elements.accountRequestName?.focus();
  }
}

function ouvrirDemandeResetMotDePasse() {
  if (!elements.passwordResetRequestForm) {
    return;
  }

  const doitAfficher = elements.passwordResetRequestForm.classList.contains("hidden");
  masquerFormulairesCycleCompte(doitAfficher ? elements.passwordResetRequestForm : null);
  elements.passwordResetRequestForm.classList.toggle("hidden", !doitAfficher);
  masquerErreur(elements.passwordResetRequestError);

  if (doitAfficher) {
    elements.passwordResetIdentifier?.focus();
  }
}

async function gererDemandeCompte(event) {
  event.preventDefault();
  masquerErreur(elements.accountRequestError);

  const role = elements.accountRequestRole?.value || "";
  const donnees = {
    nom: elements.accountRequestName?.value || "",
    email: elements.accountRequestEmail?.value || "",
    role,
  };

  if (role === "professeur") {
    donnees.handler_public_id = elements.accountRequestHandler?.value || "";
  }

  try {
    const resultat = await soumettreDemandeCompte(donnees);
    elements.accountRequestForm?.reset();
    mettreAJourChampHandlerDemande();
    afficherToast(resultat.message || "Votre demande a été prise en compte.");
  } catch (erreur) {
    afficherErreur(elements.accountRequestError, erreur.message);
  }
}

async function gererDemandeResetMotDePasse(event) {
  event.preventDefault();
  masquerErreur(elements.passwordResetRequestError);

  try {
    const resultat = await demanderLienReinitialisation(elements.passwordResetIdentifier?.value || "");
    elements.passwordResetRequestForm?.reset();
    afficherToast(resultat.message || "Si le compte existe, un lien vient d'être envoyé.");
  } catch (erreur) {
    afficherErreur(elements.passwordResetRequestError, erreur.message);
  }
}

function initialiserCycleCompteDepuisHash() {
  // login-lifecycle.js owns the one-time-link fragment when it has completed
  // its setup. Its flow deliberately preserves the fragment until successful
  // submission so a simple refresh does not discard a valid reset link.
  if (window.__gestionSeancesLoginLifecycle) {
    return;
  }

  const hash = String(window.location.hash || "").replace(/^#/, "");
  const correspondance = /^(activation|reset-password)\?token=([A-Za-z0-9_-]{43})$/.exec(hash);

  if (!correspondance || !elements.accountTokenForm) {
    return;
  }

  etat.cycleCompte = {
    type: correspondance[1],
    token: correspondance[2],
  };
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  masquerFormulairesCycleCompte(elements.accountTokenForm);
  elements.accountTokenForm.classList.remove("hidden");
  elements.accountTokenTitle.textContent =
    etat.cycleCompte.type === "activation"
      ? "Activez votre compte"
      : "Réinitialisez votre mot de passe";
}

async function gererCycleCompteAvecJeton(event) {
  event.preventDefault();
  masquerErreur(elements.accountTokenError);

  if (!etat.cycleCompte?.token) {
    afficherErreur(elements.accountTokenError, "Le lien est invalide ou a déjà été utilisé.");
    return;
  }

  const motDePasse = elements.accountTokenPassword?.value || "";
  const confirmation = elements.accountTokenPasswordConfirmation?.value || "";
  if (motDePasse !== confirmation) {
    afficherErreur(elements.accountTokenError, "Les deux mots de passe ne correspondent pas.");
    return;
  }

  try {
    const resultat =
      etat.cycleCompte.type === "activation"
        ? await activerCompteAvecJeton(etat.cycleCompte.token, motDePasse)
        : await reinitialiserMotDePasseAvecJeton(etat.cycleCompte.token, motDePasse);
    etat.cycleCompte = null;
    elements.accountTokenForm?.reset();
    elements.accountTokenForm?.classList.add("hidden");
    afficherToast(resultat.message || "Votre mot de passe a été enregistré. Vous pouvez vous connecter.");
  } catch (erreur) {
    afficherErreur(elements.accountTokenError, erreur.message);
  }
}

function attacherEcouteurs() {
  elements.loginForm?.addEventListener("submit", gererConnexion);
  // The public lifecycle has its own small, failure-isolated script loaded
  // before this module. Keeping a single event owner avoids duplicate reset
  // emails/submissions once the main application has initialised.
  if (!window.__gestionSeancesLoginLifecycle) {
    elements.showAccountRequestButton?.addEventListener("click", ouvrirDemandeCompte);
    elements.showPasswordResetButton?.addEventListener("click", ouvrirDemandeResetMotDePasse);
    elements.accountRequestRole?.addEventListener("change", mettreAJourChampHandlerDemande);
    elements.accountRequestForm?.addEventListener("submit", gererDemandeCompte);
    elements.passwordResetRequestForm?.addEventListener("submit", gererDemandeResetMotDePasse);
    elements.accountTokenForm?.addEventListener("submit", gererCycleCompteAvecJeton);
    elements.loginShowPassword?.addEventListener(
      "change",
      mettreAJourVisibiliteMotDePasseConnexion
    );
  }
  elements.loginRemember?.addEventListener("change", () => {
    if (!elements.loginRemember.checked) {
      effacerConnexionMemorisee();
    }
  });
  elements.userPasswordForm?.addEventListener("submit", gererModificationMotDePasse);
  elements.teamMembershipForm?.addEventListener("submit", gererDemandeRattachementEquipe);
  elements.adminViewTabs.forEach((bouton) => {
    bouton?.addEventListener("click", () => {
      afficherVueAdministration(bouton.dataset.adminView);
    });
  });
  elements.unavailabilityViewTabs.forEach((bouton) => {
    bouton?.addEventListener("click", () => {
      afficherVueIndisponibilites(bouton.dataset.unavailabilityView);
    });
  });
  elements.adminGlobalAnalyticsForm?.addEventListener(
    "submit",
    gererActualisationAnalysesGlobalesAdministration
  );
  elements.adminUnavailabilityForm?.addEventListener("submit", gererCreationIndisponibilite);
  elements.workspaceSettingsForm?.addEventListener("submit", gererModificationReglagesCalendrier);
  elements.publicCalendarTimezoneForm?.addEventListener(
    "submit",
    gererModificationFuseauCalendrierPublic
  );
  elements.publicCalendarToggleButton?.addEventListener(
    "click",
    gererBasculeCalendrierPublic
  );
  elements.publicCalendarCopyButton?.addEventListener("click", copierLienCalendrierPublic);
  elements.teamSubjectForm?.addEventListener("submit", gererAjoutMatiereEquipe);
  elements.teamTarificationForm?.addEventListener(
    "submit",
    gererEnregistrementTarificationEquipe
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
  elements.adminLogoutUserForm?.addEventListener(
    "submit",
    gererRevoquerSessionsUtilisateur
  );
  elements.adminDeleteUserForm?.addEventListener("submit", gererSuppressionCompteAdministration);
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
  elements.adminLogoutUserId?.addEventListener("change", mettreAJourControlesAdministration);
  elements.monetisationPreviousMonthButton?.addEventListener("click", () => {
    naviguerPeriodeMonetisation("precedent");
  });
  elements.monetisationNextMonthButton?.addEventListener("click", () => {
    naviguerPeriodeMonetisation("suivant");
  });
  elements.monetisationModeOptionOneButton?.addEventListener("click", gererClicModePeriodeMonetisation);
  elements.monetisationModeOptionTwoButton?.addEventListener("click", gererClicModePeriodeMonetisation);
  elements.monetisationFilterForm?.addEventListener("submit", gererCalculMonetisation);
  elements.monetisationDateStart?.addEventListener("input", gererChangementFiltreMonetisation);
  elements.monetisationDateStart?.addEventListener("change", gererChangementFiltreMonetisation);
  elements.monetisationDateEnd?.addEventListener("input", gererChangementFiltreMonetisation);
  elements.monetisationDateEnd?.addEventListener("change", gererChangementFiltreMonetisation);
  elements.monetisationGlobalToggle?.addEventListener(
    "change",
    gererChangementModeMonetisationGlobales
  );
  elements.statsFilterForm?.addEventListener("submit", gererCalculStatistiques);
  elements.statsDateStart?.addEventListener("input", gererChangementFiltreStatistiques);
  elements.statsDateStart?.addEventListener("change", gererChangementFiltreStatistiques);
  elements.statsDateEnd?.addEventListener("input", gererChangementFiltreStatistiques);
  elements.statsDateEnd?.addEventListener("change", gererChangementFiltreStatistiques);
  elements.statsGlobalToggle?.addEventListener("change", gererChangementModeStatistiquesGlobales);
  elements.monetisationDownloadStatementButton?.addEventListener(
    "click",
    gererTelechargementReleveMonetisation
  );
  elements.adminMaintenanceSqliteForm?.addEventListener(
    "submit",
    gererMaintenanceSqliteAdmin
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
  elements.unavailabilityModalFullDay?.addEventListener(
    "change",
    mettreAJourModeJourCompletIndisponibiliteModal
  );
  elements.unavailabilityModalForm?.addEventListener(
    "submit",
    gererSoumissionIndisponibiliteModal
  );
  elements.editUnavailabilityButton?.addEventListener(
    "click",
    ouvrirFormulaireModificationIndisponibilite
  );
  elements.duplicateUnavailabilityButton?.addEventListener(
    "click",
    ouvrirFormulaireDuplicationIndisponibilite
  );
  elements.deleteUnavailabilityButton?.addEventListener("click", async () => {
    if (etat.indisponibiliteSelectionnee) {
      await gererSuppressionIndisponibilite(etat.indisponibiliteSelectionnee.id);
    }
  });
  elements.cancelUnavailabilityFormButton?.addEventListener("click", () => {
    if (elements.unavailabilityModalForm?.dataset.mode === "creation") {
      fermerModal(elements.unavailabilityDetailModal);
      reinitialiserFormulaireIndisponibiliteModal();
      return;
    }

    masquerFormulaireIndisponibiliteModal();
  });
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
  elements.etudiant?.addEventListener("input", mettreAJourEtapesFormulaireSeance);
  elements.date?.addEventListener("change", marquerDateSeanceCommeChoisie);
  elements.seanceIntervenant?.addEventListener("change", mettreAJourEtapesFormulaireSeance);
  elements.heureDebutHourSelect?.addEventListener("change", () => {
    marquerHoraireSeanceCommeChoisi();
    mettreAJourHeureDebutSelectionnee();
  });
  elements.heureDebutMinuteSelect?.addEventListener(
    "change",
    () => {
      marquerHoraireSeanceCommeChoisi();
      mettreAJourHeureDebutSelectionnee();
    }
  );
  elements.editSeanceButton?.addEventListener("click", ouvrirFormulaireModification);
  elements.duplicateSeanceButton?.addEventListener("click", ouvrirFormulaireDuplication);
  elements.deleteSeanceButton?.addEventListener("click", gererSuppressionSeance);
  elements.adminBlockIpForm?.addEventListener("submit", gererBlocageIpAdmin);

  attacherSelectionUnique(elements.statutCheckboxes);
  attacherSelectionUnique(elements.dureeCheckboxes, () => {
    marquerHoraireSeanceCommeChoisi();
    mettreAJourHeureFinCalculee();
    mettreAJourEtapesFormulaireSeance();
  });
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
  document.addEventListener("keydown", gererNavigationClavierModales);
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
  if (elements.currentUserPublicId) {
    elements.currentUserPublicId.textContent = `ID : ${etat.utilisateur.public_id || "-"}`;
  }
  synchroniserIdentifiantsFormulairesMotDePasse();
  mettreAJourResumeCompteConnecte();
  elements.adminToolsPanel.classList.toggle("hidden", !utilisateurPeutVoirAdministration());
  mettreAJourPanneauAdministration();
  mettreAJourVueAujourdhui();
  mettreAJourFormulaireStatistiques();
  mettreAJourVisibiliteResultatsStatistiques();
  mettreAJourNavigationProtegee();
  mettreAJourFiltreCalendrierCentral();
  mettreAJourEspaceIndisponibilites();
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
      console.error("Synchronisation temps réel impossible :", erreur);
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
      appliquerDeconnexionLocale("Votre session a été mise à jour. Reconnectez-vous.");
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
      chargerEquipeSiAutorise(),
      chargerHistorique(),
      chargerMonetisationSiAutorise(),
      chargerAdministrationSiAutorise(),
      chargerReglagesEspaceSiAutorise(),
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
    plageHoraire: obtenirPlageCalendrierEffective(),
    pasCreneauMinutes: obtenirPasCreneauCalendrierCentral(),
    timezoneCentrale: obtenirFuseauHoraireCalendrierCentral(),
    onSlotClick: gererClicCreneauCalendrierSeance,
    onSelect: gererSelectionCalendrierSeance,
    onEventClick: ouvrirDetailsOuChoixSeance,
    onIndisponibiliteClick: gererClicIndisponibilite,
    onDatesSet: () => {
      if (utilisateurEstHandler()) {
        rafraichirEvenementsCalendrier();
      }
    },
  });

  demarrerHorlogeCalendriers();
  rafraichirEvenementsCalendrier();
}

function initialiserCalendrierIndisponibilitesSiNecessaire() {
  if (
    etat.calendrierIndisponibilites ||
    !elements.unavailabilityCalendar ||
    !utilisateurPeutGererIndisponibilites()
  ) {
    return;
  }

  etat.calendrierIndisponibilites = initialiserCalendrier(elements.unavailabilityCalendar, {
    plageHoraire: obtenirPlageCalendrierEffective(),
    timezoneCentrale: obtenirFuseauHoraireCalendrierCentral(),
    onSlotClick: gererClicCreneauCalendrierIndisponibilite,
    onSelect: gererSelectionCalendrierIndisponibilite,
    onEventClick: ouvrirDetailSeance,
    onIndisponibiliteClick: (indisponibilite) => {
      if (utilisateurPeutGererIndisponibilites()) {
        ouvrirDetailIndisponibilite(indisponibilite);
        return;
      }

      gererClicIndisponibilite(indisponibilite);
    },
    selectionMobileRapide: true,
  });

  demarrerHorlogeCalendriers();
  rafraichirEvenementsCalendrier();
}

function mettreAJourTailleCalendrier(calendrier) {
  if (!calendrier) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (typeof calendrier.updateSize === "function") {
        calendrier.updateSize();
      }
    });
  });
}

function rafraichirCalendrierSiVisible(sectionDemandee = etat.sectionActive) {
  if (sectionDemandee === "dashboard") {
    initialiserCalendrierSiNecessaire();
    mettreAJourTailleCalendrier(etat.calendrier);
    return;
  }

  if (
    sectionDemandee !== "indisponibilites" ||
    etat.vueIndisponibilitesActive !== "declaration" ||
    !utilisateurPeutGererIndisponibilites()
  ) {
    return;
  }

  initialiserCalendrierIndisponibilitesSiNecessaire();
  mettreAJourTailleCalendrier(etat.calendrierIndisponibilites);
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
  } else if (section === "equipe" && !utilisateurPeutVoirEquipe()) {
    sectionDemandee = utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard";
  } else if (section === "calendrier" && !utilisateurEstHandler()) {
    sectionDemandee = utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard";
  }

  etat.sectionActive = sectionDemandee;

  const cartes = {
    aujourdhui: elements.todaySection,
    dashboard: elements.dashboardSection,
    calendrier: elements.calendrierSection,
    indisponibilites: elements.indisponibilitesSection,
    equipe: elements.equipeSection,
    statistiques: elements.statistiquesSection,
    utilisateur: elements.utilisateurSection,
    monetisation: elements.monetisationSection,
    historique: elements.historiqueSection,
  };

  Object.entries(cartes).forEach(([cle, element]) => {
    element.classList.toggle("hidden", cle !== sectionDemandee);
  });

  elements.navTabs.forEach((bouton) => {
    const estActive = bouton.dataset.sectionTarget === sectionDemandee;
    bouton.classList.toggle("is-active", estActive);

    if (estActive) {
      bouton.setAttribute("aria-current", "page");
      // On mobile the workspace navigation intentionally scrolls horizontally.
      // Keep the selected destination entirely readable instead of leaving its
      // label clipped against an edge of the scroll container.
      bouton.scrollIntoView({ block: "nearest", inline: "center" });
    } else {
      bouton.removeAttribute("aria-current");
    }
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

  if (sectionDemandee === "statistiques") {
    mettreAJourFormulaireStatistiques();
    mettreAJourStatistiques();
  }

  if (sectionDemandee === "indisponibilites") {
    afficherVueIndisponibilites(etat.vueIndisponibilitesActive);
    return;
  }

  if (sectionDemandee === "equipe") {
    afficherEquipe();
  }

  rafraichirCalendrierSiVisible(sectionDemandee);
}

function afficherVueIndisponibilites(vueDemandee = "declaration") {
  const vue = vuesIndisponibilitesValides.has(vueDemandee)
    ? vueDemandee
    : "declaration";

  etat.vueIndisponibilitesActive = vue;

  elements.unavailabilityViewTabs.forEach((bouton) => {
    bouton.classList.toggle("is-active", bouton.dataset.unavailabilityView === vue);
  });

  elements.unavailabilityPanels.forEach((panneau) => {
    panneau.classList.toggle("hidden", panneau.dataset.unavailabilityPanel !== vue);
  });

  mettreAJourEspaceIndisponibilites();
  rafraichirCalendrierSiVisible("indisponibilites");
}

function rolesUtilisateurCourant() {
  return Array.isArray(etat.utilisateur?.scope?.roles) ? etat.utilisateur.scope.roles : [];
}

function utilisateurEstAdministrateur() {
  return rolesUtilisateurCourant().includes("super_admin");
}

function utilisateurEstHandler() {
  return rolesUtilisateurCourant().includes("handler");
}

function utilisateurEstProfesseur() {
  return rolesUtilisateurCourant().includes("professeur");
}

function mettreAJourBadge(element, nombre) {
  if (!element) return;
  const total = Math.max(0, Number(nombre) || 0);
  element.textContent = total > 99 ? "99+" : String(total);
  element.classList.toggle("hidden", total === 0);
}

async function chargerEquipesDisponiblesSiProfesseur() {
  if ((!utilisateurEstProfesseur() && !utilisateurEstHandler()) || utilisateurDoitChangerMotDePasse()) {
    etat.equipesDisponibles = [];
    afficherDemandeRattachementEquipe();
    return;
  }
  try {
    const resultat = await envoyerRequete("/api/team-memberships/available");
    etat.equipesDisponibles = Array.isArray(resultat.equipes) ? resultat.equipes : [];
  } catch (_) {
    etat.equipesDisponibles = [];
  }
  afficherDemandeRattachementEquipe();
}

function afficherDemandeRattachementEquipe() {
  const visible = (utilisateurEstProfesseur() || utilisateurEstHandler()) && !utilisateurDoitChangerMotDePasse();
  elements.teamMembershipCard?.classList.toggle("hidden", !visible);
  if (!visible || !elements.teamMembershipHandler) return;
  elements.teamMembershipHandler.replaceChildren(new Option("Choisir une equipe", ""));
  etat.equipesDisponibles.forEach((equipe) => {
    elements.teamMembershipHandler.appendChild(
      new Option(`${equipe.public_id} - ${equipe.nom}`, String(equipe.id))
    );
  });
  elements.teamMembershipSubmit.disabled = etat.equipesDisponibles.length === 0;
}

async function gererDemandeRattachementEquipe(event) {
  event.preventDefault();
  masquerErreur(elements.teamMembershipError);
  if (!elements.teamMembershipForm?.reportValidity()) return;
  elements.teamMembershipSubmit.disabled = true;
  try {
    const resultat = await envoyerRequete("/api/team-memberships/requests", {
      method: "POST",
      body: {
        handler_id: Number(elements.teamMembershipHandler.value),
        description: elements.teamMembershipDescription.value,
      },
    });
    elements.teamMembershipForm.reset();
    afficherToast(resultat.message || "Demande envoyee.", "success");
    await chargerEquipesDisponiblesSiProfesseur();
  } catch (error) {
    afficherErreur(elements.teamMembershipError, error.message);
    elements.teamMembershipSubmit.disabled = false;
  }
}

function utilisateurPeutVoirAdministration() {
  return utilisateurEstAdministrateur() && !utilisateurDoitChangerMotDePasse();
}

function utilisateurPeutVoirMonetisation() {
  return (
    (utilisateurEstHandler() || utilisateurEstProfesseur()) &&
    !utilisateurDoitChangerMotDePasse()
  );
}

function utilisateurPeutVoirAujourdhui() {
  return (
    (utilisateurEstHandler() || utilisateurEstProfesseur()) &&
    !utilisateurDoitChangerMotDePasse()
  );
}

function utilisateurPeutVoirIndisponibilites() {
  // Indisponibilites are personal declarations of Professors. A Handler
  // consults them only through the central Dashboard, not a separate panel.
  return (
    utilisateurEstProfesseur() &&
    !utilisateurEstHandler() &&
    !utilisateurDoitChangerMotDePasse()
  );
}

function utilisateurPeutGererIndisponibilites() {
  return utilisateurPeutVoirIndisponibilites();
}

function mettreAJourEspaceIndisponibilites() {
  const peutGerer = utilisateurPeutGererIndisponibilites();

  // This section is intentionally a single personal calendar: positive
  // availability rules and exceptions are not part of it.
  elements.unavailabilityWorkbenchNav?.classList.add("hidden");
  elements.unavailabilityDeclarationPanel?.classList.toggle("hidden", !peutGerer);
}

function utilisateurPeutVoirEquipe() {
  return utilisateurEstHandler() && !utilisateurDoitChangerMotDePasse();
}

function utilisateurPeutConfigurerReglagesEspace() {
  return utilisateurEstHandler() && !utilisateurDoitChangerMotDePasse();
}

function utilisateurPeutLireReglagesCalendrier() {
  return (utilisateurEstHandler() || utilisateurEstProfesseur()) && !utilisateurDoitChangerMotDePasse();
}

function obtenirPlageCalendrierEffective() {
  const calendrier = etat.reglagesEspace?.calendrier || {};
  return {
    calendar_start_time: calendrier.calendar_start_time || "08:00",
    calendar_end_time: calendrier.calendar_end_time || "23:30",
  };
}

function appliquerConfigurationCalendrier() {
  const plageHoraire = obtenirPlageCalendrierEffective();
  const fuseauHoraire = obtenirFuseauHoraireCalendrierCentral();
  [etat.calendrier, etat.calendrierIndisponibilites].forEach((calendrier) => {
    if (calendrier) {
      mettreAJourPlageHoraireCalendrier(calendrier, plageHoraire);
      mettreAJourHorlogeCalendrier(calendrier, fuseauHoraire);
    }
  });
  demarrerHorlogeCalendriers();
  synchroniserChoixHeuresCalendrier();
  rafraichirEvenementsCalendrier();
  mettreAJourVueAujourdhui();
}

function lienPublicAbsolu(lien) {
  const valeur = String(lien || "").trim();
  if (!valeur) {
    return "";
  }

  try {
    return new URL(valeur, window.location.origin).toString();
  } catch (erreur) {
    return "";
  }
}

function memoriserReglagesEspace(reglages) {
  if (!reglages || typeof reglages !== "object") {
    etat.reglagesEspace = null;
    return;
  }

  const lienPrecedent = etat.reglagesEspace?.calendrier_public?.lien_public || null;
  etat.reglagesEspace = {
    ...reglages,
    calendrier_public: {
      ...(reglages.calendrier_public || {}),
      lien_public: reglages.calendrier_public?.lien_public || lienPrecedent,
    },
  };
  appliquerConfigurationCalendrier();
}

function afficherReglagesEspace() {
  if (!elements.workspaceSettingsCard) {
    return;
  }

  const visible = utilisateurPeutConfigurerReglagesEspace();
  elements.workspaceSettingsCard.classList.toggle("hidden", !visible);
  if (!visible) {
    return;
  }

  const reglages = etat.reglagesEspace || {};
  const calendrierPublic = reglages.calendrier_public || {};
  const estHandler = utilisateurEstHandler();
  const modifiable = utilisateurPeutModifierDonnees() && reglages.calendrier?.modifiable === true;
  const lien = lienPublicAbsolu(calendrierPublic.lien_public);

  if (elements.calendarStartTime) {
    elements.calendarStartTime.value = reglages.calendrier?.calendar_start_time || "08:00";
    elements.calendarStartTime.disabled = !modifiable;
  }
  if (elements.calendarEndTime) {
    elements.calendarEndTime.value = reglages.calendrier?.calendar_end_time || "23:30";
    elements.calendarEndTime.disabled = !modifiable;
  }
  if (elements.workspaceSettingsButton) {
    elements.workspaceSettingsButton.disabled = !modifiable;
  }

  elements.publicCalendarSettings?.classList.toggle("hidden", !estHandler);
  if (!estHandler) {
    return;
  }

  if (elements.publicCalendarTimezone) {
    synchroniserOptionFuseauCalendrierPublic(
      elements.publicCalendarTimezone,
      obtenirFuseauHoraireCalendrierPublic(reglages)
    );
    elements.publicCalendarTimezone.disabled = !modifiable;
  }
  if (elements.publicCalendarTimezoneButton) {
    elements.publicCalendarTimezoneButton.disabled = !modifiable;
  }

  const possedeJeton = calendrierPublic.jeton_configure === true;
  const actif = calendrierPublic.actif === true;
  if (elements.publicCalendarStatus) {
    elements.publicCalendarStatus.textContent = actif ? "Actif" : "Désactivé";
  }
  if (elements.publicCalendarLink) {
    elements.publicCalendarLink.value = lien;
    elements.publicCalendarLink.classList.toggle("hidden", !lien);
  }
  if (elements.publicCalendarToggleButton) {
    elements.publicCalendarToggleButton.disabled = !modifiable || !possedeJeton || !actif;
    elements.publicCalendarToggleButton.textContent = "Désactiver le lien";
  }
  if (elements.publicCalendarCopyButton) {
    elements.publicCalendarCopyButton.disabled = !lien;
  }
}

async function chargerReglagesEspaceSiAutorise() {
  if (!utilisateurPeutLireReglagesCalendrier()) {
    etat.reglagesEspace = null;
    afficherReglagesEspace();
    return;
  }

  try {
    memoriserReglagesEspace(await recupererReglagesEspace());
    afficherReglagesEspace();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    etat.reglagesEspace = null;
    afficherReglagesEspace();
    if (erreur.status !== 403) {
      afficherToast(erreur.message, "error");
    }
  }
}

async function gererModificationReglagesCalendrier(event) {
  event.preventDefault();
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  if (!utilisateurPeutConfigurerReglagesEspace()) {
    afficherToast("Seul le Handler peut modifier le calendrier de l’espace.", "warning");
    return;
  }

  const calendarStartTime = String(elements.calendarStartTime?.value || "").trim();
  const calendarEndTime = String(elements.calendarEndTime?.value || "").trim();
  masquerErreur(elements.workspaceSettingsError);
  elements.workspaceSettingsButton.disabled = true;
  try {
    let resultat;
    try {
      resultat = await modifierReglagesCalendrierEspace({
        calendar_start_time: calendarStartTime,
        calendar_end_time: calendarEndTime,
      });
    } catch (erreur) {
      if (erreur.status !== 409 || erreur.code !== "CALENDAR_RANGE_DATA_WARNING") {
        throw erreur;
      }

      const avertissement = erreur.avertissement || {};
      const resume = [
        `${Number(avertissement.seances_futures?.total) || 0} séance(s) future(s)`,
        `${Number(avertissement.disponibilites_futures?.total) || 0} disponibilité(s)`,
        `${Number(avertissement.exceptions_futures?.total) || 0} exception(s)`,
        `${Number(avertissement.indisponibilites_futures?.total) || 0} indisponibilité(s)`,
      ].join(", ");
      const confirmer = window.confirm(
        `${resume} seraient hors de la nouvelle plage. Elles ne seront ni supprimées ni modifiées. Enregistrer quand même ?`
      );
      if (!confirmer) {
        return;
      }
      resultat = await modifierReglagesCalendrierEspace({
        calendar_start_time: calendarStartTime,
        calendar_end_time: calendarEndTime,
        confirm_out_of_range: true,
      });
    }
    memoriserReglagesEspace(resultat.reglages);
    afficherReglagesEspace();
    afficherToast(resultat.message || "Paramètres du calendrier mis à jour.", "success");
  } catch (erreur) {
    afficherErreur(elements.workspaceSettingsError, erreur.message);
  } finally {
    afficherReglagesEspace();
  }
}

function obtenirFuseauHoraireCalendrierPublic(reglages = etat.reglagesEspace) {
  return (
    String(reglages?.calendrier_public?.public_calendar_timezone || "GMT+1").trim() ||
    "GMT+1"
  );
}

function synchroniserOptionFuseauCalendrierPublic(select, fuseau) {
  if (!select) {
    return;
  }

  const valeur = String(fuseau || "GMT+1").trim() || "GMT+1";
  const valeursSimples = new Set(["GMT+1", "GMT+2", "GMT+3", "GMT+4"]);
  // Le contrat produit n'admet plus de zone IANA historique : la migration
  // normalise toute valeur persistée vers GMT+1 avant ce rendu.
  select.value = valeursSimples.has(valeur) ? valeur : "GMT+1";
}

async function gererModificationFuseauCalendrierPublic(event) {
  event.preventDefault();
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  if (!utilisateurPeutConfigurerReglagesEspace()) {
    afficherToast("Seul le Handler peut modifier le calendrier public.", "warning");
    return;
  }

  const publicCalendarTimezone = obtenirFuseauHoraireCalendrierPublic({
    calendrier_public: {
      public_calendar_timezone: elements.publicCalendarTimezone?.value,
    },
  });
  masquerErreur(elements.publicCalendarTimezoneError);
  if (elements.publicCalendarTimezoneButton) {
    elements.publicCalendarTimezoneButton.disabled = true;
  }

  try {
    const resultat = await modifierEtatCalendrierPublic({
      public_calendar_timezone: publicCalendarTimezone,
      actif: true,
    });
    memoriserReglagesEspace(resultat.reglages);
    afficherReglagesEspace();
    afficherToast(resultat.message || "Décalage du calendrier public mis à jour.", "success");
  } catch (erreur) {
    afficherErreur(elements.publicCalendarTimezoneError, erreur.message);
  } finally {
    afficherReglagesEspace();
  }
}

async function gererBasculeCalendrierPublic() {
  const calendrierPublic = etat.reglagesEspace?.calendrier_public || {};
  if (!calendrierPublic.jeton_configure || !calendrierPublic.actif) {
    return;
  }

  elements.publicCalendarToggleButton.disabled = true;
  try {
    const resultat = await modifierEtatCalendrierPublic(false);
    memoriserReglagesEspace(resultat.reglages);
    afficherReglagesEspace();
    afficherToast(resultat.message, "success");
  } catch (erreur) {
    afficherToast(erreur.message, "error");
    afficherReglagesEspace();
  }
}

async function copierLienCalendrierPublic() {
  const lien = String(elements.publicCalendarLink?.value || "").trim();
  if (!lien) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(lien);
    } else {
      elements.publicCalendarLink.focus();
      elements.publicCalendarLink.select();
      document.execCommand("copy");
    }
    afficherToast("Lien public copié.", "success");
  } catch (erreur) {
    afficherToast("Copiez le lien affiché manuellement.", "warning");
  }
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

  return "À demander";
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
        "Les notifications temps réel et les rappels toutes les 2 heures sont actifs sur cet appareil.";
    } else {
      elements.pushSettingsInfo.textContent =
        "Les notifications sont désactivées sur cet appareil.";
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
  return Boolean(seance?.est_masquee_pour_confidentialite);
}

function obtenirMessageSeanceConfidentielle() {
  return "Ce créneau est réservé et visible uniquement par l'administrateur.";
}

function seanceDoitEtreMasqueeDansAujourdhui(seance) {
  if (utilisateurEstAdministrateur()) {
    return false;
  }

  // La liste "Aujourd'hui" doit refléter les séances reçues dans le scope
  // privé de l'utilisateur. Une indisponibilité est une règle de création,
  // pas une raison de faire disparaître une séance existante : pour un
  // Handler, `etat.indisponibilites` contient celles de toute son équipe et
  // pouvait donc masquer la séance du professeur B à cause de celle du
  // professeur A. Seules les séances explicitement confidentielles restent
  // masquées pour un non-administrateur.
  return seanceEstMasqueePourConfidentialite(seance);
}

function utilisateurEstEnLectureSeule() {
  return !utilisateurEstAdministrateur() && Number(etat.utilisateur?.mode_lecture_seule) === 1;
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

    if (section === "equipe") {
      bouton.classList.toggle("hidden", !utilisateurPeutVoirEquipe());
      return;
    }

    if (section === "calendrier") {
      bouton.classList.toggle("hidden", !utilisateurEstHandler());
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
  masquerErreur(elements.pushSettingsError);
  elements.adminLogoutUserForm.reset();
  masquerErreur(elements.adminLogoutUserError);
  elements.adminSessionCurrentPassword.value = "";
  masquerErreur(elements.adminSessionError);
  elements.adminTrustedDeviceCurrentPassword.value = "";
  masquerErreur(elements.adminTrustedDeviceError);
  elements.adminMaintenanceSqliteForm.reset();
  masquerErreur(elements.adminMaintenanceSqliteError);
  masquerInfo(elements.adminMaintenanceSqliteResult);
  elements.adminMaintenanceSqliteStatus.textContent = "Non vérifié";
  elements.adminUnavailabilityForm?.reset?.();
  masquerErreur(elements.adminUnavailabilityError);
  elements.adminBlockIpForm.reset();
  masquerErreur(elements.adminBlockIpError);
  initialiserFormulaireIndisponibilite();
}

function obtenirVueAdministrationValide(vue) {
  return vuesAdministrationValides.has(vue) ? vue : "accounts";
}

function elementAdministrationAppartientVue(element, vue) {
  return String(element?.dataset?.adminGroup || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(vue);
}

function mettreAJourVisibiliteGroupesAdministration(vue) {
  elements.adminGroupItems.forEach((element) => {
    element.classList.toggle(
      "hidden",
      !elementAdministrationAppartientVue(element, vue)
    );
  });

  elements.adminGroupShells.forEach((shell) => {
    const contientElementVisible = Array.from(shell.querySelectorAll("[data-admin-group]")).some(
      (element) => !element.classList.contains("hidden")
    );

    shell.classList.toggle("hidden", !contientElementVisible);
  });
}

function mettreAJourDispositionAdministration(activee) {
  const layout = elements.adminToolsPanel?.closest(".admin-panel-layout");

  if (!layout) {
    return;
  }

  layout.classList.toggle("admin-panel-layout-workbench", Boolean(activee));
  layout.classList.toggle("admin-panel-layout-password", activee && etat.adminVueActive === "password");
}

function afficherVueAdministration(vueDemandee = "accounts") {
  const vue = obtenirVueAdministrationValide(vueDemandee);
  const configuration = vuesAdministration[vue];
  etat.adminVueActive = vue;
  mettreAJourDispositionAdministration(true);

  elements.adminViewTabs.forEach((bouton) => {
    const actif = bouton.dataset.adminView === vue;
    bouton.classList.toggle("is-active", actif);
    bouton.setAttribute("aria-selected", actif ? "true" : "false");
  });

  if (elements.adminActionsTitle) {
    elements.adminActionsTitle.textContent = configuration.titre;
  }

  mettreAJourVisibiliteGroupesAdministration(vue);

  if (vue === "analytics") {
    chargerAnalysesGlobalesAdministration();
  }
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
  if (elements.currentUserPublicId) {
    elements.currentUserPublicId.textContent = `ID : ${etat.utilisateur?.public_id || "-"}`;
  }
  elements.userSecurityStatus.textContent = motDePasseAChanger
    ? "Mot de passe temporaire détecté. Changez-le pour débloquer l'application."
    : lectureSeule
      ? "Compte sécurisé en lecture seule. Les modifications sont bloquées."
      : estAdministrateur
        ? "Compte sécurisé. Vous pouvez gérer votre accès depuis ce panneau."
        : "Compte securise. Vous pouvez modifier votre mot de passe depuis cet espace.";
  elements.passwordSecurityNotice.classList.toggle("hidden", !motDePasseAChanger);
  elements.userAdminAccess.textContent = utilisateurPeutVoirAdministration() ? "Oui" : "Non";
  elements.userLastLogin.textContent = etat.utilisateur?.dernier_login_at
    ? formatDateHeureSecondes(etat.utilisateur.dernier_login_at)
    : "Jamais";
  elements.adminPanelTitle.textContent = estAdministrateur ? "Panneau admin" : "Espace utilisateur";
  elements.adminGuideTitle.textContent = estAdministrateur
    ? "Contrôle global"
    : "Espace utilisateur";

  if (boutonUtilisateur) {
    if (elements.userNavLabel) {
      elements.userNavLabel.textContent = estAdministrateur ? "Panneau admin" : "Espace utilisateur";
    }
  }

  definirBadgeAdmin(
    elements.userRoleBadge,
    estAdministrateur ? "Admin" : "Utilisateur",
    estAdministrateur ? "admin" : "user"
  );
  definirBadgeAdmin(
    elements.userAccessBadge,
    accesActif ? "Accès actif" : "Suspendu",
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
  let verrouilleParRateLimit = false;
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
    afficherToast("Connexion réussie.");
  } catch (erreur) {
    if (erreur.status === 429 && erreur.retryAfter) {
      let restantes = parseInt(erreur.retryAfter, 10);
      if (!isNaN(restantes)) {
        verrouilleParRateLimit = true;
        if (elements.loginButton) elements.loginButton.disabled = true;
        afficherErreur(elements.loginError, "Trop de tentatives. Réessayez dans " + restantes + "s");
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
            afficherErreur(elements.loginError, "Trop de tentatives. Réessayez dans " + restantes + "s");
          }
        }, 1000);
        return;
      }
    }
    afficherErreur(elements.loginError, erreur.message);
  } finally {
    if (!verrouilleParRateLimit) {
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
    afficherToast("Notifications push activées sur cet appareil.");
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
  elements.pushDisableButton.textContent = "Désactivation...";

  try {
    etat.notificationsPush = await desactiverNotificationsPush();
    mettreAJourCarteNotificationsPush();
    afficherToast("Notifications push désactivées sur cet appareil.");
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
    afficherToast(resultat.message || "Notification de test envoyée.");
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



async function gererCreationIndisponibilite(event) {
  event.preventDefault();
  const controles = obtenirControlesIndisponibiliteActifs();
  masquerErreur(controles.errorElement);

  if (!utilisateurPeutGererIndisponibilites()) {
    afficherSectionApplication("dashboard");
    return;
  }

  const donneesIndisponibilite = lireDonneesIndisponibiliteDepuisControles(controles);

  if (!validerDonneesIndisponibiliteClient(donneesIndisponibilite, controles.errorElement)) {
    return;
  }

  controles.button.disabled = true;
  controles.button.textContent = "Ajout...";

  try {
    const resultatIndisponibilite = await creerIndisponibilite(donneesIndisponibilite);
    const nombreFragments = extraireIndisponibilitesDepuisResultat(
      resultatIndisponibilite
    ).length;
    initialiserFormulaireIndisponibilite();
    await Promise.all([chargerIndisponibilites(), chargerHistorique()]);
    afficherToast(
      donneesIndisponibilite.jour_complet && nombreFragments > 1
        ? `${nombreFragments} créneaux indisponibles créés sur les plages libres.`
        : donneesIndisponibilite.jour_complet
        ? "Journée indisponible ajoutée."
        : "Créneau indisponible ajouté."
    );
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

  if (!indisponibiliteAppartientAuRealisateurCourant(indisponibilite)) {
    afficherToast("Vous pouvez modifier uniquement vos propres indisponibilités.", "warning");
    return;
  }

  const confirmation = window.confirm(
    estIndisponibiliteJourCompletClient(indisponibilite)
      ? `Supprimer la journée indisponible du ${formatDate(indisponibilite.date)} ?`
      : `Supprimer le créneau indisponible du ${formatDate(indisponibilite.date)} de ${indisponibilite.heure_debut} à ${indisponibilite.heure_fin} ?`
  );

  if (!confirmation) {
    return;
  }

  try {
    const resultat = await supprimerIndisponibilite(indisponibilite.id);
    await Promise.all([chargerIndisponibilites(), chargerHistorique()]);
    if (
      etat.indisponibiliteSelectionnee &&
      Number(etat.indisponibiliteSelectionnee.id) === Number(indisponibilite.id) &&
      elements.unavailabilityDetailModal &&
      !elements.unavailabilityDetailModal.classList.contains("hidden")
    ) {
      fermerModal(elements.unavailabilityDetailModal);
      etat.indisponibiliteSelectionnee = null;
    }
    afficherToast(resultat.message || "Créneau indisponible supprimé.");
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

function definirSousTitreModalIndisponibilite(message) {
  elements.unavailabilityDetailSubtitle.textContent = message;
  elements.unavailabilityDetailSubtitle.classList.toggle("hidden", !message);
}

function definirFormulaireIndisponibiliteModalOuvert(ouvert) {
  elements.unavailabilityDetailModal?.classList.toggle(
    "is-unavailability-form-open",
    Boolean(ouvert)
  );
}

function definirModeCreationIndisponibiliteModal(creation) {
  if (creation) {
    definirModeConfirmationIndisponibilite(false);
  }

  elements.unavailabilityDetailModal?.classList.toggle(
    "is-unavailability-creation-mode",
    Boolean(creation)
  );
}

function definirModeConfirmationIndisponibilite(confirmation) {
  elements.unavailabilityDetailModal?.classList.toggle(
    "is-unavailability-confirmation-mode",
    Boolean(confirmation)
  );
}

function construirePlageIndisponibilite(indisponibilite) {
  if (estIndisponibiliteJourCompletClient(indisponibilite)) {
    return "Jour complet";
  }

  return `${indisponibilite.heure_debut} - ${indisponibilite.heure_fin}`;
}

function trouverIndisponibiliteLocale(indisponibiliteId) {
  return etat.indisponibilites.find(
    (indisponibilite) => Number(indisponibilite.id) === Number(indisponibiliteId)
  );
}

function indisponibiliteAppartientAuRealisateurCourant(indisponibilite) {
  return (
    Number(indisponibilite?.intervenant_id) > 0 &&
    Number(indisponibilite?.intervenant_id) === Number(etat.utilisateur?.id)
  );
}

function reinitialiserFormulaireIndisponibiliteModal() {
  const controles = obtenirControlesIndisponibiliteModal();
  controles.form?.reset?.();

  if (controles.form) {
    controles.form.dataset.mode = "";
    controles.form.dataset.indisponibiliteId = "";
    controles.form.dataset.fullDay = "0";
  }

  controles.fullDayInput.checked = false;
  definirHeureIndisponibilite(controles, "start", recupererHeureDebutParDefaut());
  definirHeureIndisponibilite(
    controles,
    "end",
    calculerHeureFin(recupererHeureDebutParDefaut(), 60)
  );
  controles.button.disabled = false;
  controles.button.textContent = "Sauvegarder";
  masquerErreur(controles.errorElement);
  mettreAJourModeJourCompletIndisponibiliteModal();
}

function masquerFormulaireIndisponibiliteModal() {
  elements.unavailabilityFormPanel?.classList.add("hidden");
  definirFormulaireIndisponibiliteModalOuvert(false);
  definirModeCreationIndisponibiliteModal(false);
  definirModeConfirmationIndisponibilite(false);
  reinitialiserFormulaireIndisponibiliteModal();
  definirSousTitreModalIndisponibilite("");
}

function remplirFormulaireIndisponibiliteModal(indisponibilite, options = {}) {
  const controles = obtenirControlesIndisponibiliteModal();
  const dupliquer = options.mode === "duplication";

  controles.dateInput.value = dupliquer ? "" : indisponibilite.date || "";
  controles.fullDayInput.checked = estIndisponibiliteJourCompletClient(indisponibilite);
  definirHeureIndisponibilite(
    controles,
    "start",
    indisponibilite.heure_debut || recupererHeureDebutParDefaut()
  );
  definirHeureIndisponibilite(
    controles,
    "end",
    indisponibilite.heure_fin ||
      calculerHeureFin(lireHeureIndisponibilite(controles, "start"), 60)
  );
  mettreAJourModeJourCompletIndisponibiliteModal();
}

function construireSelectionIndisponibilite(selection = {}) {
  const date = extraireDateIsoDepuisValeurCalendrier(selection.date);
  const dateFin = extraireDateIsoDepuisValeurCalendrier(selection.date_fin || selection.date);
  const touteLaJournee = Boolean(selection.toute_la_journee);
  let heureDebut = selection.heure_debut || recupererHeureDebutParDefaut();
  let heureFin = selection.heure_fin || "";

  if (!estHeureDebutSeanceValide(heureDebut)) {
    heureDebut = recupererHeureDebutParDefaut();
  }

  if (!estHeureFinIndisponibiliteClientValide(heureFin)) {
    heureFin = calculerHeureFin(heureDebut, selection.heure_debut ? 30 : 60);
  }

  if (calculerDureeMinutesDepuisHeures(heureDebut, heureFin) <= 0) {
    heureFin = calculerHeureFin(heureDebut, 60);
  }

  return {
    date,
    dateFin,
    heureDebut,
    heureFin,
    touteLaJournee,
  };
}

function extraireIndisponibilitesDepuisResultat(resultat) {
  if (Array.isArray(resultat?.indisponibilites) && resultat.indisponibilites.length > 0) {
    return resultat.indisponibilites.filter(Boolean);
  }

  return resultat?.indisponibilite ? [resultat.indisponibilite] : [];
}

function choisirIndisponibiliteResultat(resultat, donneesIndisponibilite = {}) {
  const indisponibilites = extraireIndisponibilitesDepuisResultat(resultat);

  if (indisponibilites.length === 0) {
    return null;
  }

  if (!donneesIndisponibilite.jour_complet) {
    return indisponibilites[0];
  }

  return (
    indisponibilites.find(
      (indisponibilite) => !estIndisponibiliteJourCompletClient(indisponibilite)
    ) || indisponibilites[0]
  );
}

function definirActionsDetailIndisponibiliteVisibles(visible) {
  [
    elements.editUnavailabilityButton,
    elements.duplicateUnavailabilityButton,
    elements.deleteUnavailabilityButton,
  ].forEach((bouton) => {
    bouton?.classList.toggle("hidden", !visible);
  });
}

function ouvrirFormulaireCreationIndisponibiliteDepuisCalendrier(selection = {}) {
  if (!utilisateurPeutGererIndisponibilites()) {
    afficherToast("Vous n'avez pas les droits pour gérer ces disponibilités.", "warning");
    return;
  }

  const selectionNormalisee = construireSelectionIndisponibilite(selection);

  if (!selectionNormalisee.date) {
    return;
  }

  if (
    selectionNormalisee.dateFin &&
    selectionNormalisee.dateFin !== selectionNormalisee.date
  ) {
    afficherToast("Sélectionnez un seul jour à la fois.", "warning");
    return;
  }

  const controles = obtenirControlesIndisponibiliteModal();
  reinitialiserFormulaireIndisponibiliteModal();
  etat.indisponibiliteSelectionnee = null;

  elements.unavailabilityDetailTitle.textContent = "Nouvelle indisponibilité";
  elements.unavailabilityDetailBadge.textContent = selectionNormalisee.touteLaJournee
    ? "Jour complet"
    : "Indisponible";
  elements.unavailabilityDetailDate.textContent = formatDate(selectionNormalisee.date);
  elements.unavailabilityDetailTime.textContent = selectionNormalisee.touteLaJournee
    ? "Jour complet"
    : `${selectionNormalisee.heureDebut} - ${selectionNormalisee.heureFin}`;
  elements.unavailabilityDetailCreatedBy.textContent = etat.utilisateur?.nom || "Utilisateur";
  elements.unavailabilityDetailCreatedAt.textContent = "-";
  definirActionsDetailIndisponibiliteVisibles(false);

  controles.form.dataset.mode = "creation";
  controles.form.dataset.indisponibiliteId = "";
  controles.dateInput.value = selectionNormalisee.date;
  controles.fullDayInput.checked = selectionNormalisee.touteLaJournee;
  definirHeureIndisponibilite(controles, "start", selectionNormalisee.heureDebut);
  definirHeureIndisponibilite(controles, "end", selectionNormalisee.heureFin);
  elements.unavailabilityFormPanel?.classList.remove("hidden");
  definirFormulaireIndisponibiliteModalOuvert(true);
  definirModeConfirmationIndisponibilite(false);
  definirModeCreationIndisponibiliteModal(true);
  elements.unavailabilityFormTitle.textContent = "Déclarer une indisponibilité";
  controles.button.textContent = "Ajouter";
  mettreAJourModeJourCompletIndisponibiliteModal();
  definirSousTitreModalIndisponibilite("");
  ouvrirModal(elements.unavailabilityDetailModal);
  controles.dateInput.focus();
}

function ouvrirDetailIndisponibilite(indisponibilite, options = {}) {
  if (!indisponibilite || !elements.unavailabilityDetailModal) {
    return;
  }

  const indisponibiliteLocale = trouverIndisponibiliteLocale(indisponibilite.id) || indisponibilite;
  etat.indisponibiliteSelectionnee = indisponibiliteLocale;

  elements.unavailabilityDetailTitle.textContent = estIndisponibiliteJourCompletClient(
    indisponibiliteLocale
  )
    ? "Journée indisponible"
    : "Créneau indisponible";
  elements.unavailabilityDetailBadge.textContent = estIndisponibiliteJourCompletClient(
    indisponibiliteLocale
  )
    ? "Jour complet"
    : "Indisponible";
  elements.unavailabilityDetailDate.textContent = formatDate(indisponibiliteLocale.date);
  elements.unavailabilityDetailTime.textContent = construirePlageIndisponibilite(
    indisponibiliteLocale
  );
  elements.unavailabilityDetailCreatedBy.textContent =
    indisponibiliteLocale.cree_par_nom || "Utilisateur";
  elements.unavailabilityDetailCreatedAt.textContent = indisponibiliteLocale.created_at
    ? formatDateHeureSecondes(indisponibiliteLocale.created_at)
    : "-";
  definirActionsDetailIndisponibiliteVisibles(
    utilisateurPeutGererIndisponibilites() &&
      indisponibiliteAppartientAuRealisateurCourant(indisponibiliteLocale)
  );
  masquerFormulaireIndisponibiliteModal();
  definirModeConfirmationIndisponibilite(Boolean(options.confirmation));
  ouvrirModal(elements.unavailabilityDetailModal);
}

function ouvrirFormulaireModificationIndisponibilite() {
  if (
    !etat.indisponibiliteSelectionnee ||
    !utilisateurPeutGererIndisponibilites() ||
    !indisponibiliteAppartientAuRealisateurCourant(etat.indisponibiliteSelectionnee)
  ) {
    return;
  }

  const controles = obtenirControlesIndisponibiliteModal();
  controles.form.dataset.mode = "modification";
  controles.form.dataset.indisponibiliteId = etat.indisponibiliteSelectionnee.id;
  elements.unavailabilityFormPanel?.classList.remove("hidden");
  definirFormulaireIndisponibiliteModalOuvert(true);
  definirModeCreationIndisponibiliteModal(false);
  definirModeConfirmationIndisponibilite(false);
  elements.unavailabilityFormTitle.textContent = "Modifier l'indisponibilité";
  controles.button.textContent = "Sauvegarder";
  remplirFormulaireIndisponibiliteModal(etat.indisponibiliteSelectionnee);
  definirSousTitreModalIndisponibilite("");
  controles.dateInput.focus();
}

function ouvrirFormulaireDuplicationIndisponibilite() {
  if (
    !etat.indisponibiliteSelectionnee ||
    !utilisateurPeutGererIndisponibilites() ||
    !indisponibiliteAppartientAuRealisateurCourant(etat.indisponibiliteSelectionnee)
  ) {
    return;
  }

  const controles = obtenirControlesIndisponibiliteModal();
  controles.form.dataset.mode = "duplication";
  controles.form.dataset.indisponibiliteId = "";
  elements.unavailabilityFormPanel?.classList.remove("hidden");
  definirFormulaireIndisponibiliteModalOuvert(true);
  definirModeCreationIndisponibiliteModal(false);
  definirModeConfirmationIndisponibilite(false);
  elements.unavailabilityFormTitle.textContent = "Dupliquer l'indisponibilité";
  controles.button.textContent = "Créer la copie";
  remplirFormulaireIndisponibiliteModal(etat.indisponibiliteSelectionnee, {
    mode: "duplication",
  });
  definirSousTitreModalIndisponibilite("Choisissez une nouvelle date avant d'enregistrer.");
  controles.dateInput.focus();
}

async function gererSoumissionIndisponibiliteModal(event) {
  event.preventDefault();

  if (!utilisateurPeutGererIndisponibilites()) {
    fermerModal(elements.unavailabilityDetailModal);
    afficherSectionApplication("dashboard");
    return;
  }

  const controles = obtenirControlesIndisponibiliteModal();
  const mode = controles.form?.dataset.mode || "modification";
  const indisponibiliteId = Number(controles.form?.dataset.indisponibiliteId || 0);

  if (
    mode === "modification" &&
    !indisponibiliteAppartientAuRealisateurCourant(etat.indisponibiliteSelectionnee)
  ) {
    afficherErreur(
      controles.errorElement,
      "Vous pouvez modifier uniquement vos propres indisponibilités."
    );
    return;
  }

  const donneesIndisponibilite = lireDonneesIndisponibiliteDepuisControles(controles);

  masquerErreur(controles.errorElement);

  const valide = validerDonneesIndisponibiliteClient(
    donneesIndisponibilite,
    controles.errorElement,
    {
      ignorerIndisponibiliteId: mode === "modification" ? indisponibiliteId : null,
      indisponibiliteExistante:
        mode === "modification" ? etat.indisponibiliteSelectionnee : null,
    }
  );

  if (!valide) {
    return;
  }

  controles.button.disabled = true;
  const libelleInitial = controles.button.textContent;
  const creation = mode === "creation" || mode === "duplication";
  controles.button.textContent = creation ? "Création..." : "Sauvegarde...";

  try {
    const resultatIndisponibilite = creation
      ? await creerIndisponibilite(donneesIndisponibilite)
      : await modifierIndisponibilite(indisponibiliteId, donneesIndisponibilite);
    const indisponibiliteReference = choisirIndisponibiliteResultat(
      resultatIndisponibilite,
      donneesIndisponibilite
    );

    await Promise.all([chargerIndisponibilites(), chargerHistorique()]);
    const indisponibiliteActualisee = indisponibiliteReference
      ? trouverIndisponibiliteLocale(indisponibiliteReference.id) || indisponibiliteReference
      : null;

    if (indisponibiliteActualisee) {
      if (creation) {
        fermerModal(elements.unavailabilityDetailModal);
        elements.unavailabilityDetailModal?.getBoundingClientRect();
      }

      ouvrirDetailIndisponibilite(indisponibiliteActualisee, {
        confirmation: creation,
      });
    } else {
      fermerModal(elements.unavailabilityDetailModal);
    }

    const nombreFragments = extraireIndisponibilitesDepuisResultat(
      resultatIndisponibilite
    ).length;
    afficherToast(
      donneesIndisponibilite.jour_complet && nombreFragments > 1
        ? `${nombreFragments} créneaux indisponibles créés sur les plages libres.`
        : mode === "creation"
          ? "Indisponibilité ajoutée."
          : mode === "duplication"
            ? "Indisponibilité dupliquée."
            : "Indisponibilité modifiée."
    );
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      fermerModal(elements.unavailabilityDetailModal);
      afficherSectionApplication("dashboard");
      afficherToast(erreur.message, "error");
      return;
    }

    afficherErreur(controles.errorElement, erreur.message);
  } finally {
    controles.button.disabled = false;
    controles.button.textContent = libelleInitial;
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
    afficherErreur(elements.adminToggleAccessError, "Sélectionnez un compte valide.");
    return;
  }

  const nouvelAccesActif = Number(compte.acces_active) !== 1;
  const confirmation = window.confirm(
    nouvelAccesActif
      ? `Réactiver l'accès de ${compte.nom} ?`
      : `Suspendre immédiatement l'accès de ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminToggleAccessButton.disabled = true;
  elements.adminToggleAccessButton.textContent = "Mise à jour...";

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
    afficherErreur(elements.adminLogoutUserError, "Sélectionnez un compte valide.");
    return;
  }

  const confirmation = window.confirm(
    `Fermer toutes les sessions actives de ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminLogoutUserButton.disabled = true;
  elements.adminLogoutUserButton.textContent = "Déconnexion...";

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
      afficherToast("Votre session actuelle a été fermée.");
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
    afficherToast(resultat.message || "Auto-login révoqué.");
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
      "Entrez votre mot de passe actuel pour débloquer une IP."
    );
    return;
  }

  const confirmation = window.confirm(`Débloquer l'IP ${ip} ?`);

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



function formaterResultatCheckpointSqlite(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") {
    return "WAL non detaille";
  }

  const busy = Number(checkpoint.busy ?? checkpoint.BUSY ?? 0);
  const log = Number(checkpoint.log ?? checkpoint.LOG ?? 0);
  const checkpointed = Number(checkpoint.checkpointed ?? checkpoint.CHECKPOINTED ?? 0);

  return `WAL busy ${busy}, log ${log}, checkpoint ${checkpointed}`;
}

async function gererMaintenanceSqliteAdmin(event) {
  event.preventDefault();
  masquerErreur(elements.adminMaintenanceSqliteError);
  masquerInfo(elements.adminMaintenanceSqliteResult);

  if (!utilisateurPeutVoirAdministration()) {
    elements.adminToolsPanel.classList.add("hidden");
    return;
  }

  const motDePasseActuel = elements.adminMaintenanceSqliteCurrentPassword.value;

  if (!motDePasseActuel) {
    afficherErreur(
      elements.adminMaintenanceSqliteError,
      "Entrez votre mot de passe actuel pour lancer la maintenance."
    );
    return;
  }

  elements.adminMaintenanceSqliteButton.disabled = true;
  elements.adminMaintenanceSqliteButton.textContent = "Vérification...";

  try {
    const resultat = await executerMaintenanceSqliteAdmin(motDePasseActuel);
    const maintenance = resultat.maintenance || {};
    const integrite = String(maintenance.integrity_check || "unknown");
    const checkpoint = formaterResultatCheckpointSqlite(maintenance.wal_checkpoint);
    const statut = integrite === "ok" ? "Base OK" : "À vérifier";

    elements.adminMaintenanceSqliteForm.reset();
    elements.adminMaintenanceSqliteStatus.textContent = `${statut} - ${integrite}`;
    afficherInfo(
      elements.adminMaintenanceSqliteResult,
      `Integrite: ${integrite}. ${checkpoint}. Optimisation: ${maintenance.optimize || "ok"}.`
    );
    afficherToast(resultat.message || "Maintenance SQLite terminée.");
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

    afficherErreur(elements.adminMaintenanceSqliteError, erreur.message);
  } finally {
    elements.adminMaintenanceSqliteButton.disabled = false;
    elements.adminMaintenanceSqliteButton.textContent = "Vérifier SQLite";
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
    afficherErreur(controles.error, "Sélectionnez une entrée d'historique valide.");
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
    "Supprimer cette entrée d'historique ?"
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
    afficherToast(resultat.message || "L'entrée d'historique a été supprimée.");
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
    afficherErreur(elements.adminReadonlyError, "Sélectionnez un compte valide.");
    return;
  }

  const nouveauModeLectureSeule = Number(compte.mode_lecture_seule) !== 1;
  const confirmation = window.confirm(
    nouveauModeLectureSeule
      ? `Passer ${compte.nom} en lecture seule ?`
      : `Autoriser de nouveau ${compte.nom} à modifier les données ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminReadonlyButton.disabled = true;
  elements.adminReadonlyButton.textContent = "Mise à jour...";

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
    afficherErreur(elements.adminMonetisationError, "Sélectionnez un compte valide.");
    return;
  }

  const nouvelAccesMonetisation = Number(compte.peut_voir_monetisation) !== 1;
  const confirmation = window.confirm(
    nouvelAccesMonetisation
      ? `Afficher le menu Monétisation ? ${compte.nom} ?`
      : `Masquer le menu Monétisation pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminMonetisationButton.disabled = true;
  elements.adminMonetisationButton.textContent = "Mise à jour...";

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

async function gererSuppressionCompteAdministration(event) {
  event.preventDefault();
  masquerErreur(elements.adminDeleteUserError);
  const utilisateurId = Number(elements.adminDeleteUserId?.value || 0);
  const compte = obtenirCompteAdministrationParId(utilisateurId);
  if (!compte || !elements.adminDeleteUserPassword?.value) return;
  if (!window.confirm(`Supprimer définitivement le compte ${compte.nom} ?`)) return;
  elements.adminDeleteUserButton.disabled = true;
  try {
    const resultat = await supprimerCompteAdmin(utilisateurId, elements.adminDeleteUserPassword.value);
    elements.adminDeleteUserForm.reset();
    await chargerAdministrationSiAutorise();
    afficherToast(resultat.message || "Compte supprimé.", "success");
  } catch (error) {
    afficherErreur(elements.adminDeleteUserError, error.message);
  } finally {
    elements.adminDeleteUserButton.disabled = false;
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
    afficherErreur(elements.adminTodayError, "Sélectionnez un compte valide.");
    return;
  }

  const nouvelAccesAujourdhui = Number(compte.peut_voir_aujourdhui) !== 1;
  const confirmation = window.confirm(
    nouvelAccesAujourdhui
      ? `Afficher le menu Aujourd'hui à ${compte.nom} ?`
      : `Masquer le menu Aujourd'hui pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminTodayButton.disabled = true;
  elements.adminTodayButton.textContent = "Mise à jour...";

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

  if (!compte || !comptePeutGererIndisponibilitesAdministration(compte)) {
    afficherErreur(
      elements.adminUnavailabilityAccessError,
      "Sélectionnez un professeur valide."
    );
    return;
  }

  const nouvelAccesIndisponibilites = Number(compte.peut_voir_indisponibilites) !== 1;
  const confirmation = window.confirm(
    nouvelAccesIndisponibilites
      ? `Afficher le menu Indisponibilités ? ${compte.nom} ?`
      : `Masquer le menu Indisponibilités pour ${compte.nom} ?`
  );

  if (!confirmation) {
    return;
  }

  elements.adminUnavailabilityAccessButton.disabled = true;
  elements.adminUnavailabilityAccessButton.textContent = "Mise à jour...";

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
  try {
    // A Handler never opens the personal unavailability module. Its central
    // calendar receives only the minimal, team-scoped projection required to
    // draw collective unavailable slots. A Professor keeps the personal API.
    etat.indisponibilites = utilisateurEstHandler()
      ? await recupererIndisponibilitesCalendrierCentral()
      : await recupererIndisponibilites();
    rafraichirEvenementsCalendrier();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      etat.indisponibilites = [];
      rafraichirEvenementsCalendrier();

      if (etat.sectionActive === "indisponibilites") {
        afficherSectionApplication(
          utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard"
        );
      }

      return;
    }

    etat.indisponibilites = [];
    rafraichirEvenementsCalendrier();
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

async function chargerMonetisationSiAutorise({ calculExplicite = false } = {}) {
  // Les synchronisations automatiques servent à garder la liste des
  // réalisateurs à jour, mais ne doivent jamais réafficher un ancien relevé.
  // Seul le submit « Calculer » est autorisé à rendre les résultats visibles.
  if (!calculExplicite) {
    masquerResultatsMonetisation();
  }

  if (!utilisateurPeutVoirMonetisation()) {
    etat.monetisation = null;
    viderMonetisation();
    return false;
  }

  try {
    normaliserPeriodePersonnaliseeMonetisation();
    etat.monetisation = await recupererMonetisation(
      etat.monetisationGlobales
        ? {
            mode: "global",
            intervenant_ids: etat.monetisationIntervenantsSelectionnes,
          }
        : {
            du: etat.monetisationDateDebut,
            au: etat.monetisationDateFin,
            intervenant_ids: etat.monetisationIntervenantsSelectionnes,
          }
    );
    synchroniserSelectionIntervenantsMonetisation();
    mettreAJourMonetisation();
    return true;
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return false;
    }

    if (erreur.status === 403) {
      etat.monetisation = null;
      viderMonetisation();
      afficherSectionApplication(utilisateurPeutVoirAujourdhui() ? "aujourdhui" : "dashboard");
      return false;
    }

    if (erreur.status === 400) {
      etat.monetisationDateDebut = `${obtenirMoisCourantIso()}-01`;
      etat.monetisationDateFin = obtenirDateLocaleIso();
      etat.monetisationGlobales = false;
      etat.monetisation = null;
      viderMonetisation();
    }

    if (calculExplicite) {
      afficherToast(erreur.message, "error");
    }
    return false;
  }
}

function ajouterChampEquipe(formulaire, { libelle, controle }) {
  const champ = document.createElement("label");
  champ.className = "field team-field";
  const titre = document.createElement("span");
  titre.textContent = libelle;
  champ.append(titre, controle);
  formulaire.appendChild(champ);
  return controle;
}

function creerCaseEquipe(libelle, cochee, desactivee) {
  const etiquette = document.createElement("label");
  etiquette.className = "checkbox-option";
  const caseACocher = document.createElement("input");
  caseACocher.type = "checkbox";
  caseACocher.checked = cochee === true;
  caseACocher.disabled = desactivee;
  const texte = document.createElement("span");
  texte.textContent = libelle;
  etiquette.append(caseACocher, texte);
  return { etiquette, caseACocher };
}

function normaliserTarificationEquipe(tarification) {
  const matieres = Array.isArray(tarification?.matieres)
    ? tarification.matieres.filter((matiere) => Number(matiere?.id) > 0)
    : [];
  const realisateurs = Array.isArray(tarification?.realisateurs)
    ? tarification.realisateurs.filter((realisateur) => Number(realisateur?.id) > 0)
    : [];

  return { matieres, realisateurs };
}

function obtenirTarifEquipeParMatiere(realisateur, matiereId) {
  const tarif = Array.isArray(realisateur?.tarifs_matieres)
    ? realisateur.tarifs_matieres.find(
        (element) => Number(element?.matiere_id) === Number(matiereId)
      )
    : null;
  const valeur = tarif?.tarif_horaire;
  return valeur === null || valeur === undefined || valeur === "" || !Number.isFinite(Number(valeur))
    ? null
    : Number(valeur);
}

function libelleRealisateurTarification(realisateur) {
  const nom = String(realisateur?.nom || "Réalisateur").trim() || "Réalisateur";
  return realisateur?.est_handler ? `${nom} (vous)` : nom;
}

async function actualiserTarificationEtMatieresEquipe() {
  await Promise.all([chargerEquipeSiAutorise(), chargerOptionsSeancesDisponibles()]);
}

function creerLigneMatiereEquipe(matiere) {
  const ligne = document.createElement("div");
  ligne.className = "team-subject-item";

  const libelle = document.createElement("span");
  libelle.className = "team-subject-name";
  libelle.textContent = matiere.libelle;
  ligne.appendChild(libelle);

  const actions = document.createElement("div");
  actions.className = "team-subject-actions";
  const modifiable = utilisateurPeutModifierDonnees();

  const renommer = document.createElement("button");
  renommer.type = "button";
  renommer.className = "button secondary team-subject-action";
  renommer.textContent = "Renommer";
  renommer.disabled = !modifiable;
  renommer.addEventListener("click", async () => {
    if (!utilisateurPeutModifierDonnees()) {
      afficherToast("Votre compte est en lecture seule.", "warning");
      return;
    }

    const nouveauLibelle = window.prompt("Nom de la matière", matiere.libelle);
    if (nouveauLibelle === null || String(nouveauLibelle).trim() === matiere.libelle) {
      return;
    }

    renommer.disabled = true;
    supprimer.disabled = true;
    try {
      const resultat = await modifierMatiereEquipe(matiere.id, nouveauLibelle);
      await actualiserTarificationEtMatieresEquipe();
      afficherToast(resultat.message || "Matière mise à jour.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      renommer.disabled = !utilisateurPeutModifierDonnees();
      supprimer.disabled = !utilisateurPeutModifierDonnees();
    }
  });

  const supprimer = document.createElement("button");
  supprimer.type = "button";
  supprimer.className = "button secondary team-subject-action";
  supprimer.textContent = "Supprimer";
  supprimer.disabled = !modifiable;
  supprimer.addEventListener("click", async () => {
    if (!utilisateurPeutModifierDonnees()) {
      afficherToast("Votre compte est en lecture seule.", "warning");
      return;
    }

    if (!window.confirm(`Supprimer la matière « ${matiere.libelle} » ?`)) {
      return;
    }

    renommer.disabled = true;
    supprimer.disabled = true;
    try {
      const resultat = await supprimerMatiereEquipe(matiere.id);
      await actualiserTarificationEtMatieresEquipe();
      afficherToast(resultat.message || "Matière supprimée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      renommer.disabled = !utilisateurPeutModifierDonnees();
      supprimer.disabled = !utilisateurPeutModifierDonnees();
    }
  });

  actions.append(renommer, supprimer);
  ligne.appendChild(actions);
  return ligne;
}

function afficherGestionMatieresEquipe() {
  const peutVoir = utilisateurPeutVoirEquipe();
  const peutModifier = peutVoir && utilisateurPeutModifierDonnees();
  const { matieres, realisateurs } = normaliserTarificationEquipe(etat.tarificationEquipe);

  if (elements.teamSubjectInput) {
    elements.teamSubjectInput.disabled = !peutModifier;
  }
  if (elements.teamSubjectAddButton) {
    elements.teamSubjectAddButton.disabled = !peutModifier;
  }

  if (elements.teamSubjectList) {
    elements.teamSubjectList.innerHTML = "";
    if (peutVoir && matieres.length === 0) {
      elements.teamSubjectList.appendChild(
        creerEmptyState("Aucune matière.", "admin-user-empty")
      );
    } else if (peutVoir) {
      matieres.forEach((matiere) => {
        elements.teamSubjectList.appendChild(creerLigneMatiereEquipe(matiere));
      });
    }
  }

  if (!elements.teamTarificationTable) {
    return;
  }

  elements.teamTarificationTable.innerHTML = "";
  const peutConfigurerTarifs = peutModifier && matieres.length > 0 && realisateurs.length > 0;
  if (elements.teamTarificationSaveButton) {
    elements.teamTarificationSaveButton.disabled = !peutConfigurerTarifs;
  }

  if (!peutVoir || matieres.length === 0) {
    if (peutVoir) {
      elements.teamTarificationTable.appendChild(
        creerEmptyState("Ajoutez une matière pour définir les tarifs.", "admin-user-empty")
      );
    }
    return;
  }

  if (realisateurs.length === 0) {
    elements.teamTarificationTable.appendChild(
      creerEmptyState("Aucun réalisateur disponible.", "admin-user-empty")
    );
    return;
  }

  const tableau = document.createElement("table");
  tableau.className = "team-tarification-table";
  const entete = document.createElement("thead");
  const ligneEntete = document.createElement("tr");
  const celluleMatiere = document.createElement("th");
  celluleMatiere.scope = "col";
  celluleMatiere.textContent = "Matière";
  ligneEntete.appendChild(celluleMatiere);

  realisateurs.forEach((realisateur) => {
    const cellule = document.createElement("th");
    cellule.scope = "col";
    cellule.textContent = libelleRealisateurTarification(realisateur);
    if (realisateur.est_handler) {
      cellule.classList.add("team-tarification-handler");
    }
    ligneEntete.appendChild(cellule);
  });
  entete.appendChild(ligneEntete);

  const corps = document.createElement("tbody");
  matieres.forEach((matiere) => {
    const ligne = document.createElement("tr");
    const celluleMatiere = document.createElement("th");
    celluleMatiere.scope = "row";
    celluleMatiere.textContent = matiere.libelle;
    ligne.appendChild(celluleMatiere);

    realisateurs.forEach((realisateur) => {
      const cellule = document.createElement("td");
      const saisie = document.createElement("input");
      const tarif = obtenirTarifEquipeParMatiere(realisateur, matiere.id);
      saisie.type = "number";
      saisie.min = "0";
      saisie.max = "100000";
      saisie.step = "1";
      saisie.inputMode = "numeric";
      saisie.placeholder = "—";
      saisie.value = tarif === null ? "" : String(tarif);
      saisie.dataset.tarifIntervenantId = String(realisateur.id);
      saisie.dataset.tarifMatiereId = String(matiere.id);
      saisie.setAttribute(
        "aria-label",
        `Tarif horaire de ${libelleRealisateurTarification(realisateur)} en ${matiere.libelle}`
      );
      saisie.disabled =
        !peutModifier || realisateur.actif === false || Number(realisateur.actif) === 0;
      cellule.append(saisie, document.createTextNode(" dh"));
      ligne.appendChild(cellule);
    });
    corps.appendChild(ligne);
  });

  tableau.append(entete, corps);
  elements.teamTarificationTable.appendChild(tableau);
}

async function gererAjoutMatiereEquipe(event) {
  event.preventDefault();
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  const libelle = String(elements.teamSubjectInput?.value || "").trim();
  if (!libelle) {
    elements.teamSubjectInput?.focus();
    return;
  }

  if (elements.teamSubjectAddButton) {
    elements.teamSubjectAddButton.disabled = true;
  }
  try {
    const resultat = await ajouterMatiereEquipe(libelle);
    if (elements.teamSubjectInput) {
      elements.teamSubjectInput.value = "";
    }
    await actualiserTarificationEtMatieresEquipe();
    afficherToast(resultat.message || "Matière ajoutée.", "success");
  } catch (erreur) {
    afficherToast(erreur.message, "error");
  } finally {
    if (elements.teamSubjectAddButton) {
      elements.teamSubjectAddButton.disabled = !utilisateurPeutModifierDonnees();
    }
  }
}

function collecterTarifsEquipeFormulaire() {
  if (!elements.teamTarificationTable) {
    return [];
  }

  const tarifs = [];
  const saisies = elements.teamTarificationTable.querySelectorAll(
    "input[data-tarif-intervenant-id][data-tarif-matiere-id]"
  );
  for (const saisie of saisies) {
    if (saisie.disabled) {
      continue;
    }

    const valeur = String(saisie.value || "").trim();
    if (valeur && (!Number.isInteger(Number(valeur)) || Number(valeur) < 0 || Number(valeur) > 100000)) {
      saisie.focus();
      throw new Error("Chaque tarif doit être un entier entre 0 et 100000 dh.");
    }

    tarifs.push({
      intervenant_id: Number(saisie.dataset.tarifIntervenantId),
      matiere_id: Number(saisie.dataset.tarifMatiereId),
      tarif_horaire: valeur === "" ? null : Number(valeur),
    });
  }
  return tarifs;
}

async function gererEnregistrementTarificationEquipe(event) {
  event.preventDefault();
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  let tarifs;
  try {
    tarifs = collecterTarifsEquipeFormulaire();
  } catch (erreur) {
    afficherToast(erreur.message, "error");
    return;
  }

  if (tarifs.length === 0) {
    return;
  }

  if (elements.teamTarificationSaveButton) {
    elements.teamTarificationSaveButton.disabled = true;
  }
  try {
    const resultat = await modifierTarificationEquipe(tarifs);
    etat.tarificationEquipe = normaliserTarificationEquipe(resultat.tarification);
    afficherEquipe();
    afficherToast(resultat.message || "Tarifs par matière enregistrés.", "success");
  } catch (erreur) {
    afficherToast(erreur.message, "error");
    if (elements.teamTarificationSaveButton) {
      elements.teamTarificationSaveButton.disabled = !utilisateurPeutModifierDonnees();
    }
  }
}

function creerCarteProfesseurEquipe(professeur) {
  const carte = document.createElement("article");
  carte.className = "admin-user-row team-member-card";
  const contenu = document.createElement("div");
  contenu.className = "admin-user-main";
  const entete = document.createElement("div");
  entete.className = "admin-user-head";
  const identite = document.createElement("div");
  const nom = document.createElement("h4");
  nom.className = "admin-user-name";
  nom.textContent = professeur.nom || "Professeur";
  // IDs and email addresses are deliberately not rendered in the team list.
  // They remain internal API identifiers used only by the action handlers.
  identite.append(nom);
  const badges = document.createElement("div");
  badges.className = "admin-user-badges";
  badges.append(
    creerBadgeAdministration(
      professeur.statut_compte === "active" ? "Actif" : "Suspendu",
      professeur.statut_compte === "active" ? "active" : "suspended"
    )
  );
  entete.append(identite, badges);
  contenu.appendChild(entete);

  const modifiable = utilisateurPeutModifierDonnees();
  const formulaire = document.createElement("form");
  formulaire.className = "team-member-form";
  const statut = document.createElement("select");
  [
    ["active", "Actif"],
    ["suspendu", "Suspendu"],
  ].forEach(([valeur, texte]) => {
    const option = document.createElement("option");
    option.value = valeur;
    option.textContent = texte;
    statut.appendChild(option);
  });
  statut.value = professeur.statut_compte === "suspendu" ? "suspendu" : "active";
  statut.disabled = !modifiable;
  ajouterChampEquipe(formulaire, { libelle: "État du compte", controle: statut });

  const actions = document.createElement("div");
  actions.className = "form-actions team-actions";
  const enregistrer = document.createElement("button");
  enregistrer.type = "submit";
  enregistrer.className = "button primary";
  enregistrer.textContent = "Enregistrer";
  enregistrer.disabled = !modifiable;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "button secondary";
  reset.textContent = "Reset password";
  reset.disabled = !modifiable || professeur.statut_compte !== "active";
  actions.append(enregistrer, reset);
  formulaire.appendChild(actions);

  formulaire.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!utilisateurPeutModifierDonnees()) {
      afficherToast("Votre compte est en lecture seule.", "warning");
      return;
    }
    enregistrer.disabled = true;
    try {
      await modifierProfesseurEquipe(professeur.id, {
        statut_compte: statut.value,
      });
      await chargerEquipeSiAutorise();
      afficherToast("Professeur mis à jour.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
    } finally {
      enregistrer.disabled = !utilisateurPeutModifierDonnees();
    }
  });

  reset.addEventListener("click", async () => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${professeur.nom} ?`)) {
      return;
    }
    reset.disabled = true;
    try {
      const resultat = await envoyerLienResetProfesseur(professeur.id);
      afficherToast(resultat.message || "Réinitialisation du mot de passe demandée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
    } finally {
      reset.disabled = !utilisateurPeutModifierDonnees() || statut.value !== "active";
    }
  });

  carte.append(contenu, formulaire);
  return carte;
}

function creerCarteDemandeEquipe(demande) {
  const carte = document.createElement("article");
  carte.className = "admin-user-row team-request-card";
  const contenu = document.createElement("div");
  contenu.className = "admin-user-main";
  const nom = document.createElement("h4");
  nom.className = "admin-user-name";
  nom.textContent = demande.nom || "Demande Professeur";
  const meta = document.createElement("div");
  meta.className = "admin-user-email";
  meta.textContent = `${demande.email || ""} · ${demande.handler_public_id || ""}`;
  if (demande.type_demande === "rattachement") {
    meta.textContent = `${demande.email || ""} · ${demande.public_id || ""} · ${demande.description || ""}`;
  }
  contenu.append(nom, meta);
  const actions = document.createElement("div");
  actions.className = "admin-user-actions";
  const approuver = document.createElement("button");
  approuver.type = "button";
  approuver.className = "button primary";
  approuver.textContent = "Approuver";
  const refuser = document.createElement("button");
  refuser.type = "button";
  refuser.className = "button secondary";
  refuser.textContent = "Refuser";
  const modifiable = utilisateurPeutModifierDonnees();
  approuver.disabled = !modifiable;
  refuser.disabled = !modifiable;
  approuver.addEventListener("click", async () => {
    approuver.disabled = true;
    refuser.disabled = true;
    try {
      const resultat = demande.type_demande === "rattachement"
        ? await envoyerRequete(`/api/team-memberships/requests/${Number(demande.id)}/approve`, { method: "POST" })
        : await approuverDemandeCompte(demande.id);
      await chargerEquipeSiAutorise();
      afficherToast(resultat.message || "Demande approuvée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      approuver.disabled = !utilisateurPeutModifierDonnees();
      refuser.disabled = !utilisateurPeutModifierDonnees();
    }
  });
  refuser.addEventListener("click", async () => {
    if (!window.confirm(`Refuser la demande de ${demande.nom} ?`)) {
      return;
    }
    approuver.disabled = true;
    refuser.disabled = true;
    try {
      const resultat = demande.type_demande === "rattachement"
        ? await envoyerRequete(`/api/team-memberships/requests/${Number(demande.id)}/reject`, { method: "POST" })
        : await refuserDemandeCompte(demande.id);
      await chargerEquipeSiAutorise();
      afficherToast(resultat.message || "Demande refusée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      approuver.disabled = !utilisateurPeutModifierDonnees();
      refuser.disabled = !utilisateurPeutModifierDonnees();
    }
  });
  actions.append(approuver, refuser);
  carte.append(contenu, actions);
  return carte;
}

function afficherEquipe() {
  if (!elements.teamList || !elements.teamPendingRequests) {
    return;
  }
  elements.teamList.innerHTML = "";
  elements.teamPendingRequests.innerHTML = "";
  mettreAJourBadge(elements.teamRequestBadge, etat.demandesEquipe.length);

  if (!utilisateurPeutVoirEquipe()) {
    afficherGestionMatieresEquipe();
    return;
  }
  if (etat.demandesEquipe.length === 0) {
    elements.teamPendingRequests.appendChild(
      creerEmptyState("Aucune demande en attente.", "admin-user-empty")
    );
  } else {
    etat.demandesEquipe.forEach((demande) => {
      elements.teamPendingRequests.appendChild(creerCarteDemandeEquipe(demande));
    });
  }

  if (etat.equipe.length === 0) {
    elements.teamList.appendChild(creerEmptyState("Aucun Professeur rattaché.", "admin-user-empty"));
  } else {
    etat.equipe.forEach((professeur) => {
      elements.teamList.appendChild(creerCarteProfesseurEquipe(professeur));
    });
  }

  afficherGestionMatieresEquipe();
}

function creerCarteDemandeAdministration(demande) {
  const carte = document.createElement("article");
  carte.className = "admin-user-row team-request-card";
  const contenu = document.createElement("div");
  contenu.className = "admin-user-main";
  const nom = document.createElement("h4");
  nom.className = "admin-user-name";
  nom.textContent = demande.nom || "Demande de compte";
  const meta = document.createElement("div");
  meta.className = "admin-user-email";
  const role = demande.role_demande === "handler" ? "Handler" : "Professeur";
  const cible = demande.handler_public_id ? ` · ${demande.handler_public_id}` : "";
  meta.textContent = `${demande.email || ""} · ${role}${cible}`;
  contenu.append(nom, meta);

  const actions = document.createElement("div");
  actions.className = "admin-user-actions";
  const approuver = document.createElement("button");
  approuver.type = "button";
  approuver.className = "button primary";
  approuver.textContent = "Approuver";
  const refuser = document.createElement("button");
  refuser.type = "button";
  refuser.className = "button secondary";
  refuser.textContent = "Refuser";
  const modifiable = utilisateurPeutModifierDonnees();
  approuver.disabled = !modifiable;
  refuser.disabled = !modifiable;

  const recharger = async () => {
    await Promise.all([
      chargerAdministrationSiAutorise(),
      chargerHistorique(),
      chargerEquipeSiAutorise(),
    ]);
  };
  approuver.addEventListener("click", async () => {
    if (!window.confirm(`Approuver la demande de ${demande.nom} ?`)) return;
    approuver.disabled = true;
    refuser.disabled = true;
    try {
      const resultat = await approuverDemandeCompteAdministration(demande.id);
      await recharger();
      afficherToast(resultat.message || "Demande approuvée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      approuver.disabled = !utilisateurPeutModifierDonnees();
      refuser.disabled = !utilisateurPeutModifierDonnees();
    }
  });
  refuser.addEventListener("click", async () => {
    if (!window.confirm(`Refuser la demande de ${demande.nom} ?`)) return;
    approuver.disabled = true;
    refuser.disabled = true;
    try {
      const resultat = await refuserDemandeCompteAdministration(demande.id);
      await recharger();
      afficherToast(resultat.message || "Demande refusée.", "success");
    } catch (erreur) {
      afficherToast(erreur.message, "error");
      approuver.disabled = !utilisateurPeutModifierDonnees();
      refuser.disabled = !utilisateurPeutModifierDonnees();
    }
  });
  actions.append(approuver, refuser);
  carte.append(contenu, actions);
  return carte;
}

function afficherDemandesAdministration() {
  if (!elements.adminAccountRequestsList) return;
  elements.adminAccountRequestsList.innerHTML = "";
  const demandes = Array.isArray(etat.demandesAdministration)
    ? etat.demandesAdministration
    : [];
  mettreAJourBadge(elements.adminRequestBadge, demandes.length);

  if (demandes.length === 0) {
    elements.adminAccountRequestsList.appendChild(
      creerEmptyState("Aucune demande en attente.", "admin-user-empty")
    );
    return;
  }

  demandes.forEach((demande) => {
    elements.adminAccountRequestsList.appendChild(creerCarteDemandeAdministration(demande));
  });
}

async function chargerEquipeSiAutorise() {
  if (!utilisateurPeutVoirEquipe()) {
    etat.equipe = [];
    etat.tarificationEquipe = { matieres: [], realisateurs: [] };
    etat.demandesEquipe = [];
    afficherEquipe();
    if (utilisateurEstHandler()) {
      rafraichirEvenementsCalendrier();
    }
    return;
  }
  try {
    const [equipe, demandesEquipe, tarificationEquipe, rattachements] = await Promise.all([
      recupererProfesseursEquipe(),
      recupererDemandesCompte(),
      recupererTarificationEquipe(),
      envoyerRequete("/api/team-memberships/requests/received"),
    ]);
    etat.equipe = equipe;
    etat.tarificationEquipe = normaliserTarificationEquipe(tarificationEquipe);
    etat.demandesEquipe = [
      ...demandesEquipe,
      ...(Array.isArray(rattachements.demandes)
        ? rattachements.demandes.map((demande) => ({ ...demande, type_demande: "rattachement" }))
        : []),
    ];
    afficherEquipe();
    if (utilisateurEstHandler()) {
      rafraichirEvenementsCalendrier();
    }
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }
    etat.equipe = [];
    etat.tarificationEquipe = { matieres: [], realisateurs: [] };
    etat.demandesEquipe = [];
    afficherEquipe();
    if (utilisateurEstHandler()) {
      rafraichirEvenementsCalendrier();
    }
    if (erreur.status !== 403) {
      afficherToast(erreur.message, "error");
    }
  }
}

async function chargerAdministrationSiAutorise() {
  if (!utilisateurPeutVoirAdministration()) {
    etat.administration = null;
    etat.demandesAdministration = [];
    viderAdministration();
    return;
  }

  try {
    const [administration, demandesAdministration] = await Promise.all([
      recupererVueAdministration(),
      recupererDemandesCompteAdministration(),
    ]);
    etat.administration = administration;
    etat.demandesAdministration = demandesAdministration;
    if (etat.administration?.catalogue) {
      etat.catalogue = {
        matieres: normaliserListeCatalogue(etat.administration.catalogue.matieres),
        comptes: normaliserListeCatalogue(etat.administration.catalogue.comptes),
        intervenants: etat.catalogue?.intervenants || [],
      };
      rendreOptionsCatalogueSeance();
    }
    mettreAJourPanneauAdministration();
    afficherDemandesAdministration();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    if (erreur.status === 403) {
      etat.administration = null;
      etat.demandesAdministration = [];
      viderAdministration();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function obtenirPeriodeAnalysesGlobalesAdministration() {
  const aujourdHui = obtenirDateLocaleIso();
  const valeurAu = String(elements.adminGlobalAnalyticsAu?.value || "").trim();
  const valeurDu = String(elements.adminGlobalAnalyticsDu?.value || "").trim();
  const au = valeurAu || aujourdHui;
  const du = valeurDu || `${au.slice(0, 7)}-01`;

  if (elements.adminGlobalAnalyticsDu) {
    elements.adminGlobalAnalyticsDu.value = du;
    elements.adminGlobalAnalyticsDu.max = aujourdHui;
  }
  if (elements.adminGlobalAnalyticsAu) {
    elements.adminGlobalAnalyticsAu.value = au;
    elements.adminGlobalAnalyticsAu.max = aujourdHui;
  }

  return { du, au };
}

function afficherAnalysesGlobalesAdministration() {
  const analyse = etat.analysesGlobalesAdministration;
  const resultat = elements.adminGlobalAnalyticsResults;

  if (!resultat) {
    return;
  }

  if (!analyse) {
    resultat.classList.add("hidden");
    elements.adminGlobalAnalyticsIntervenants?.replaceChildren();
    return;
  }

  const statistiques = analyse.statistiques || {};
  const monetisation = analyse.monetisation || {};
  resultat.classList.remove("hidden");

  if (elements.adminGlobalAnalyticsTotal) {
    elements.adminGlobalAnalyticsTotal.textContent = String(statistiques.total_seances || 0);
  }
  if (elements.adminGlobalAnalyticsFaites) {
    elements.adminGlobalAnalyticsFaites.textContent = String(statistiques.seances_faites || 0);
  }
  if (elements.adminGlobalAnalyticsHeures) {
    elements.adminGlobalAnalyticsHeures.textContent = String(statistiques.heures_totales || 0);
  }
  if (elements.adminGlobalAnalyticsMontant) {
    elements.adminGlobalAnalyticsMontant.textContent = formaterMontantDh(
      Number(monetisation.montant_total || 0)
    );
  }

  const liste = elements.adminGlobalAnalyticsIntervenants;
  if (!liste) {
    return;
  }

  liste.replaceChildren();
  const intervenants = Array.isArray(statistiques.intervenants)
    ? statistiques.intervenants
    : [];
  if (intervenants.length === 0) {
    const vide = document.createElement("p");
    vide.className = "section-note";
    vide.textContent = "Aucune séance pour la période sélectionnée.";
    liste.append(vide);
    return;
  }

  intervenants.forEach((intervenant) => {
    const ligne = document.createElement("article");
    ligne.className = "admin-global-analytics-row";

    const identite = document.createElement("strong");
    identite.textContent = intervenant.libelle || "Intervenant";

    const details = document.createElement("span");
    details.textContent = [
      `${Number(intervenant.total_seances || 0)} séance(s)`,
      `${Number(intervenant.heures_totales || 0)} h`,
      `${Number(intervenant.seances_faites || 0)} faite(s)`,
    ].join(" · ");

    ligne.append(identite, details);
    liste.append(ligne);
  });
}

async function chargerAnalysesGlobalesAdministration() {
  if (!utilisateurPeutVoirAdministration()) {
    etat.analysesGlobalesAdministration = null;
    afficherAnalysesGlobalesAdministration();
    return;
  }

  const periode = obtenirPeriodeAnalysesGlobalesAdministration();
  const bouton = elements.adminGlobalAnalyticsButton;
  const texteInitial = bouton?.textContent || "Actualiser";
  masquerErreur(elements.adminGlobalAnalyticsError);
  if (bouton) {
    bouton.disabled = true;
    bouton.textContent = "Chargement…";
  }

  try {
    const analyse = await recupererAnalysesGlobalesAdministration(periode);
    if (analyse?.portee?.type !== "super_admin_globale") {
      throw new Error("La portée globale Super Admin est absente.");
    }
    etat.analysesGlobalesAdministration = analyse;
    afficherAnalysesGlobalesAdministration();
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }
    etat.analysesGlobalesAdministration = null;
    afficherAnalysesGlobalesAdministration();
    afficherErreur(
      elements.adminGlobalAnalyticsError,
      erreur.message || "Impossible de charger les analyses globales."
    );
  } finally {
    if (bouton) {
      bouton.disabled = false;
      bouton.textContent = texteInitial;
    }
  }
}

async function gererActualisationAnalysesGlobalesAdministration(event) {
  event.preventDefault();
  await chargerAnalysesGlobalesAdministration();
}

async function chargerOptionsSeancesDisponibles() {
  try {
    const options = await recupererOptionsSeances();
    etat.catalogue = {
      matieres: normaliserListeCatalogue(options?.matieres),
      comptes: normaliserListeCatalogue(options?.comptes),
      intervenants: normaliserIntervenantsSeance(options?.intervenants),
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
  etat.analysesGlobalesAdministration = null;
  afficherAnalysesGlobalesAdministration();
  masquerErreur(elements.adminGlobalAnalyticsError);
  elements.adminTotalUsers.textContent = "0";
  elements.adminActiveUsers.textContent = "0";
  elements.adminReadonlyUsers.textContent = "0";
  elements.adminActiveSessions.textContent = "0";
  elements.adminUsersList.innerHTML =
    '<div class="admin-user-empty">Aucun utilisateur disponible.</div>';
  if (elements.adminAccountRequestsList) {
    elements.adminAccountRequestsList.innerHTML =
      '<div class="admin-user-empty">Aucune demande en attente.</div>';
  }
  elements.adminSessionsList.innerHTML =
    '<div class="admin-session-empty">Aucune session active pour le moment.</div>';
  elements.adminTrustedDevicesList.innerHTML =
    '<div class="admin-session-empty">Aucun appareil auto-login pour le moment.</div>';
  elements.adminAuditLogList.innerHTML =
    '<div class="admin-session-empty">Aucun log disponible.</div>';
  elements.adminBlockedIpsList.innerHTML =
    '<div class="admin-session-empty">Aucune IP bloquée.</div>';
  masquerErreur(elements.adminTrustedDeviceError);
  elements.adminUnavailabilityForm?.classList.toggle(
    "hidden",
    !utilisateurPeutGererIndisponibilites()
  );

  [
    elements.adminAccessUserId,
    elements.adminReadonlyUserId,
    elements.adminTodayUserId,
    elements.adminUnavailabilityAccessUserId,
    elements.adminMonetisationUserId,
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
  elements.adminToggleAccessButton.textContent = "Mettre à jour l'accès";
  elements.adminReadonlyButton.textContent = "Mettre à jour le mode";
  elements.adminTodayButton.textContent = "Mettre à jour Aujourd'hui";
  elements.adminUnavailabilityAccessButton.textContent = "Mettre à jour Indisponibilités";
  elements.adminMonetisationButton.textContent = "Mettre à jour Monétisation";
  elements.adminLogoutUserButton.textContent = "Couper les sessions";
  elements.adminToggleAccessButton.disabled = true;
  elements.adminReadonlyButton.disabled = true;
  elements.adminTodayButton.disabled = true;
  elements.adminUnavailabilityAccessButton.disabled = true;
  elements.adminMonetisationButton.disabled = true;
  elements.adminLogoutUserButton.disabled = true;
  if (elements.adminBlockIpButton) {
    elements.adminBlockIpButton.disabled = false;
    elements.adminBlockIpButton.textContent = "Bloquer l'IP";
  }
}

function obtenirFuseauHoraireCalendrierCentral() {
  // La référence horaire centrale est fournie en lecture seule par le serveur.
  // Le fuseau choisi pour le calendrier public ne doit jamais traverser cette
  // frontière et modifier les dates, sélecteurs ou horloges authentifiés.
  return String(etat.reglagesEspace?.calendrier?.reference_timezone || "").trim();
}

function actualiserHorlogeCalendriers() {
  const fuseauHoraire = obtenirFuseauHoraireCalendrierCentral();
  [etat.calendrier, etat.calendrierIndisponibilites].forEach((calendrier) => {
    mettreAJourHorlogeCalendrier(calendrier, fuseauHoraire);
  });
}

function demarrerHorlogeCalendriers() {
  if (!etat.utilisateur || utilisateurDoitChangerMotDePasse()) {
    return;
  }

  actualiserHorlogeCalendriers();
  if (horlogeCalendriers.timer) {
    return;
  }

  horlogeCalendriers.timer = window.setInterval(() => {
    if (document.visibilityState !== "hidden") {
      actualiserHorlogeCalendriers();
    }
  }, 60 * 1000);
}

function arreterHorlogeCalendriers() {
  if (horlogeCalendriers.timer) {
    window.clearInterval(horlogeCalendriers.timer);
    horlogeCalendriers.timer = null;
  }
}

function extrairePartiesHorlogeCalendrier(dateObjet = new Date()) {
  const fuseauHoraire = obtenirFuseauHoraireCalendrierCentral();
  if (fuseauHoraire) {
    try {
      const parties = new Intl.DateTimeFormat("en-CA", {
        timeZone: fuseauHoraire,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(dateObjet);
      const resultat = {};
      parties.forEach((partie) => {
        if (partie.type !== "literal") resultat[partie.type] = partie.value;
      });
      if (resultat.year && resultat.month && resultat.day) {
        return resultat;
      }
    } catch (erreur) {
      // Une valeur centrale ancienne ou invalide ne doit jamais empêcher les
      // formulaires de fonctionner : le navigateur reste le repli sûr.
    }
  }

  return {
    year: String(dateObjet.getFullYear()),
    month: String(dateObjet.getMonth() + 1).padStart(2, "0"),
    day: String(dateObjet.getDate()).padStart(2, "0"),
    hour: String(dateObjet.getHours()).padStart(2, "0"),
    minute: String(dateObjet.getMinutes()).padStart(2, "0"),
  };
}

function obtenirDateLocaleIso(dateObjet = new Date()) {
  const parties = extrairePartiesHorlogeCalendrier(dateObjet);
  if (parties.year && parties.month && parties.day) {
    return `${parties.year}-${parties.month}-${parties.day}`;
  }

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
    timeZone: obtenirFuseauHoraireCalendrierCentral() || undefined,
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
  const fuseau = obtenirFuseauHoraireCalendrierCentral();
  const dateAujourdhui = fuseau
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: fuseau,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .reduce((resultat, partie) => {
          if (partie.type !== "literal") resultat[partie.type] = partie.value;
          return resultat;
        }, {})
    : null;
  const dateIso = dateAujourdhui
    ? `${dateAujourdhui.year}-${dateAujourdhui.month}-${dateAujourdhui.day}`
    : obtenirDateLocaleIso();

  return etat.seances
    .filter(
      (seance) =>
        seance.date === dateIso && !seanceDoitEtreMasqueeDansAujourdhui(seance)
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
  if (utilisateurEstHandler() && classeCompteAujourdhui) {
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
      utilisateurEstHandler() && classeCompteAujourdhui
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
  return "";
}

function normaliserNomCompte(compte) {
  return String(compte || "").trim();
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

function normaliserTarifsHorairesMonetisation(source = {}) {
  // Une liste vide est significative : aucun tarif n'a été appliqué sur la
  // période. Pour les anciennes réponses API qui ne possèdent pas encore la
  // liste, on conserve le tarif unitaire historique comme solution de repli.
  const tarifsBruts = Array.isArray(source?.tarifs_horaires)
    ? source.tarifs_horaires
    : [source?.tarif_unitaire];

  return Array.from(
    new Set(
      tarifsBruts.flatMap((valeur) => {
        if (
          valeur === null ||
          valeur === undefined ||
          (typeof valeur === "string" && valeur.trim() === "")
        ) {
          return [];
        }

        const tarif = Number(valeur);
        return Number.isFinite(tarif) && tarif >= 0 ? [tarif] : [];
      })
    )
  ).sort((premierTarif, secondTarif) => premierTarif - secondTarif);
}

function formaterTarifsAppliquesMonetisation(source = {}) {
  const tarifs = normaliserTarifsHorairesMonetisation(source);
  return tarifs.length ? tarifs.map(formaterMontantDh).join(" · ") : "—";
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

  return {
    tarif_unitaire: 0,
    tarifs_horaires: [],
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
  return utilisateurEstHandler() && utilisateurPeutVoirMonetisation();
}

function obtenirComptesAutorisesPourReleveMonetisation() {
  // The server already returns only the instructors visible in the caller's
  // Handler/Professeur scope.  The UI must not apply a second, name-based
  // visibility rule.
  return obtenirComptesMonetisationDisponibles();
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
      texteBouton: "Télécharger le relevé annuel",
      messageSucces: "Le relevé annuel a été téléchargé.",
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
      texteBouton: "Télécharger le relevé global",
      messageSucces: "Le relevé global a été téléchargé.",
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
    texteBouton: "Télécharger le relevé mensuel",
    messageSucces: "Le relevé mensuel a été téléchargé.",
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
  const resultatsVisibles =
    etat.monetisationResultatsVisibles === true && Boolean(etat.monetisation);

  if (elements.monetisationDownloadStatementButton) {
    if (elements.monetisationDownloadStatementButton.dataset.loading !== "true") {
      elements.monetisationDownloadStatementButton.textContent = configurationReleve.texteBouton;
    }

    elements.monetisationDownloadStatementButton.disabled =
      !resultatsVisibles ||
      !configurationReleve.periodeValide ||
      comptesSelectionnes.length === 0;
    elements.monetisationDownloadStatementButton.hidden = !resultatsVisibles;
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
        ? `${nombreSelectionnes} compte(s) inclus dans le relevé.`
        : "Sélectionnez au moins un compte à inclure dans le relevé.";
  }

  elements.monetisationReportAccountsSection.classList.remove("hidden");
  mettreAJourEtatExportMonetisation();
}

function estDateIsoMonetisationValide(valeur) {
  const texte = String(valeur || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texte) && !Number.isNaN(new Date(`${texte}T12:00:00`).getTime());
}

function normaliserPeriodePersonnaliseeMonetisation() {
  const aujourdHui = obtenirDateLocaleIso();
  const debutParDefaut = `${obtenirMoisCourantIso()}-01`;

  if (!estDateIsoMonetisationValide(etat.monetisationDateDebut)) {
    etat.monetisationDateDebut = debutParDefaut;
  }

  if (!estDateIsoMonetisationValide(etat.monetisationDateFin)) {
    etat.monetisationDateFin = aujourdHui;
  }

  if (etat.monetisationDateFin > aujourdHui) {
    etat.monetisationDateFin = aujourdHui;
  }
}

function synchroniserModeGlobalMonetisation() {
  const modeGlobal = etat.monetisationGlobales === true;

  if (elements.monetisationGlobalToggle) {
    elements.monetisationGlobalToggle.checked = modeGlobal;
  }

  [elements.monetisationDateStart, elements.monetisationDateEnd].forEach((champ) => {
    if (!champ) {
      return;
    }

    champ.disabled = modeGlobal;
    champ.required = !modeGlobal;
  });
}

function obtenirIntervenantsMonetisationDisponibles() {
  const intervenants = Array.isArray(etat.monetisation?.intervenants_disponibles)
    ? etat.monetisation.intervenants_disponibles
    : [];
  const vus = new Set();

  return intervenants
    .map((intervenant) => ({
      id: Number(intervenant?.intervenant_id),
      nom: String(intervenant?.nom || "").trim(),
    }))
    .filter(({ id, nom }) => Number.isInteger(id) && id > 0 && nom && !vus.has(id) && vus.add(id))
    .sort((premier, second) => premier.nom.localeCompare(second.nom, "fr") || premier.id - second.id);
}

function synchroniserSelectionIntervenantsMonetisation() {
  const disponibles = obtenirIntervenantsMonetisationDisponibles();
  const idsDisponibles = new Set(disponibles.map((intervenant) => intervenant.id));

  if (!etat.monetisationSelectionInitialisee) {
    etat.monetisationIntervenantsSelectionnes = [...idsDisponibles];
    etat.monetisationSelectionInitialisee = true;
    return;
  }

  const selection = new Set(
    etat.monetisationIntervenantsSelectionnes
      .map((intervenantId) => Number(intervenantId))
      .filter((intervenantId) => idsDisponibles.has(intervenantId))
  );
  etat.monetisationIntervenantsSelectionnes = disponibles
    .map((intervenant) => intervenant.id)
    .filter((intervenantId) => selection.has(intervenantId));
}

function obtenirIntervenantsMonetisationSelectionnes() {
  const disponibles = obtenirIntervenantsMonetisationDisponibles();
  const selection = new Set(
    etat.monetisationIntervenantsSelectionnes.map((intervenantId) => Number(intervenantId))
  );
  return disponibles
    .map((intervenant) => intervenant.id)
    .filter((intervenantId) => selection.has(intervenantId));
}

function mettreAJourLibellesSelectionIntervenantsMonetisation(disponibles, selection) {
  const nombreSelectionnes = disponibles.filter((intervenant) => selection.has(intervenant.id)).length;

  if (elements.monetisationReportAccountsNote) {
    elements.monetisationReportAccountsNote.textContent = disponibles.length
      ? `${nombreSelectionnes} réalisateur(s) sélectionné(s).`
      : "Aucun réalisateur n'est disponible dans votre périmètre.";
  }

  if (elements.monetisationReportAccountsSummary) {
    elements.monetisationReportAccountsSummary.textContent = disponibles.length
      ? nombreSelectionnes > 0
        ? `${nombreSelectionnes} réalisateur(s) sélectionné(s)`
        : "Choisir les réalisateurs"
      : "Aucun réalisateur disponible";
  }
}

function mettreAJourFormulaireMonetisation() {
  normaliserPeriodePersonnaliseeMonetisation();

  if (elements.monetisationDateStart) {
    elements.monetisationDateStart.value = etat.monetisationDateDebut;
    elements.monetisationDateStart.max = obtenirDateLocaleIso();
  }

  if (elements.monetisationDateEnd) {
    elements.monetisationDateEnd.value = etat.monetisationDateFin;
    elements.monetisationDateEnd.max = obtenirDateLocaleIso();
  }

  synchroniserModeGlobalMonetisation();
}

function mettreAJourEtatExportMonetisationPersonnalise() {
  const intervenantsSelectionnes = obtenirIntervenantsMonetisationSelectionnes();
  const periodeValide =
    etat.monetisationGlobales === true ||
    (estDateIsoMonetisationValide(etat.monetisationDateDebut) &&
      estDateIsoMonetisationValide(etat.monetisationDateFin) &&
      etat.monetisationDateDebut <= etat.monetisationDateFin);

  if (elements.monetisationDownloadStatementButton?.dataset.loading !== "true") {
    elements.monetisationDownloadStatementButton.textContent = etat.monetisationGlobales
      ? "Télécharger le relevé global"
      : "Télécharger le relevé";
  }

  if (elements.monetisationDownloadStatementButton) {
    elements.monetisationDownloadStatementButton.disabled =
      !etat.monetisationResultatsVisibles ||
      !etat.monetisation ||
      !periodeValide ||
      intervenantsSelectionnes.length === 0;
  }
}

function mettreAJourVisibiliteResultatsMonetisation() {
  const resultatsVisibles =
    etat.monetisationResultatsVisibles === true && Boolean(etat.monetisation);

  if (elements.monetisationResults) {
    elements.monetisationResults.classList.toggle("hidden", !resultatsVisibles);
    elements.monetisationResults.hidden = !resultatsVisibles;
    elements.monetisationResults.toggleAttribute("inert", !resultatsVisibles);
  }

  if (elements.monetisationDownloadStatementButton) {
    elements.monetisationDownloadStatementButton.hidden = !resultatsVisibles;
    if (!resultatsVisibles) {
      elements.monetisationDownloadStatementButton.disabled = true;
    }
  }
}

function masquerResultatsMonetisation() {
  etat.monetisationResultatsVisibles = false;
  mettreAJourVisibiliteResultatsMonetisation();
}

function afficherSelectionIntervenantsMonetisation() {
  if (!elements.monetisationReportAccounts) {
    return;
  }

  const disponibles = obtenirIntervenantsMonetisationDisponibles();
  const selection = new Set(obtenirIntervenantsMonetisationSelectionnes());
  const selecteur = elements.monetisationReportAccounts;
  selecteur.replaceChildren();
  selecteur.setAttribute("aria-disabled", disponibles.length === 0 ? "true" : "false");

  if (disponibles.length === 0) {
    const messageVide = document.createElement("p");
    messageVide.className = "monetisation-report-accounts-empty";
    messageVide.textContent = "Aucun réalisateur disponible";
    selecteur.appendChild(messageVide);
  } else {
    disponibles.forEach((intervenant) => {
      const option = document.createElement("label");
      option.className = "monetisation-report-account-option";

      const caseACocher = document.createElement("input");
      caseACocher.type = "checkbox";
      caseACocher.name = "monetisation-intervenants";
      caseACocher.value = String(intervenant.id);
      caseACocher.checked = selection.has(intervenant.id);
      caseACocher.addEventListener("change", () => {
        const prochaineSelection = new Set(
          Array.from(selecteur.querySelectorAll('input[name="monetisation-intervenants"]:checked'))
            .map((caseSelectionnee) => Number(caseSelectionnee.value))
            .filter((intervenantId) => Number.isInteger(intervenantId) && intervenantId > 0)
        );
        etat.monetisationIntervenantsSelectionnes = disponibles
          .map((realisateur) => realisateur.id)
          .filter((intervenantId) => prochaineSelection.has(intervenantId));
        etat.monetisationSelectionInitialisee = true;

        const selectionMiseAJour = new Set(obtenirIntervenantsMonetisationSelectionnes());
        mettreAJourLibellesSelectionIntervenantsMonetisation(disponibles, selectionMiseAJour);
        masquerResultatsMonetisation();
        mettreAJourEtatExportMonetisationPersonnalise();
      });

      const texte = document.createElement("span");
      // Les identifiants servent seulement au transport interne : le libellé
      // visible reste strictement le nom du réalisateur.
      texte.textContent = intervenant.nom;

      option.append(caseACocher, texte);
      selecteur.appendChild(option);
    });
  }

  mettreAJourLibellesSelectionIntervenantsMonetisation(disponibles, selection);

  elements.monetisationReportAccountsSection?.classList.remove("hidden");
  mettreAJourEtatExportMonetisationPersonnalise();
}

function gererChangementFiltreMonetisation() {
  etat.monetisationDateDebut = String(elements.monetisationDateStart?.value || "").trim();
  etat.monetisationDateFin = String(elements.monetisationDateEnd?.value || "").trim();
  masquerErreur(elements.monetisationFilterError);
  masquerResultatsMonetisation();
  mettreAJourEtatExportMonetisationPersonnalise();
}

function gererChangementModeMonetisationGlobales() {
  etat.monetisationGlobales = Boolean(elements.monetisationGlobalToggle?.checked);
  masquerErreur(elements.monetisationFilterError);
  synchroniserModeGlobalMonetisation();
  masquerResultatsMonetisation();
  mettreAJourEtatExportMonetisationPersonnalise();
}

async function gererCalculMonetisation(event) {
  event.preventDefault();
  masquerErreur(elements.monetisationFilterError);
  const globale = Boolean(elements.monetisationGlobalToggle?.checked);
  const dateDebut = String(elements.monetisationDateStart?.value || "").trim();
  const dateFin = String(elements.monetisationDateEnd?.value || "").trim();

  if (!globale) {
    if (!estDateIsoMonetisationValide(dateDebut) || !estDateIsoMonetisationValide(dateFin)) {
      afficherErreur(elements.monetisationFilterError, "Saisissez une date de début et une date de fin valides.");
      return;
    }

    if (dateDebut > dateFin) {
      afficherErreur(elements.monetisationFilterError, "La date de début doit précéder la date de fin.");
      return;
    }

    if (dateFin > obtenirDateLocaleIso()) {
      afficherErreur(elements.monetisationFilterError, "La date de fin ne peut pas être dans le futur.");
      return;
    }
  }

  if (obtenirIntervenantsMonetisationSelectionnes().length === 0) {
    afficherErreur(elements.monetisationFilterError, "Sélectionnez au moins un réalisateur.");
    return;
  }

  etat.monetisationGlobales = globale;
  if (!globale) {
    etat.monetisationDateDebut = dateDebut;
    etat.monetisationDateFin = dateFin;
  }
  masquerResultatsMonetisation();
  if (elements.monetisationCalculateButton) {
    elements.monetisationCalculateButton.disabled = true;
    elements.monetisationCalculateButton.textContent = "Calcul...";
  }

  try {
    const calculEffectue = await chargerMonetisationSiAutorise({ calculExplicite: true });
    if (calculEffectue) {
      etat.monetisationResultatsVisibles = true;
      mettreAJourVisibiliteResultatsMonetisation();
      mettreAJourEtatExportMonetisationPersonnalise();
    }
  } finally {
    if (elements.monetisationCalculateButton) {
      elements.monetisationCalculateButton.disabled = false;
      elements.monetisationCalculateButton.textContent = "Calculer";
    }
  }
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
  if (!etat.monetisationResultatsVisibles || !etat.monetisation) {
    afficherToast("Calculez la monétisation avant de télécharger le relevé.", "warning");
    return;
  }

  const globale = etat.monetisationGlobales === true;
  const intervenantsSelectionnes = obtenirIntervenantsMonetisationSelectionnes();
  const periodeValide =
    globale ||
    (estDateIsoMonetisationValide(etat.monetisationDateDebut) &&
      estDateIsoMonetisationValide(etat.monetisationDateFin) &&
      etat.monetisationDateDebut <= etat.monetisationDateFin);

  if (!periodeValide) {
    afficherToast("Sélectionnez une période valide pour télécharger le relevé.", "warning");
    return;
  }

  if (intervenantsSelectionnes.length === 0) {
    afficherToast("Sélectionnez au moins un réalisateur pour générer le relevé.", "warning");
    return;
  }

  const texteInitial =
    elements.monetisationDownloadStatementButton?.textContent ||
    (globale ? "Télécharger le relevé global" : "Télécharger le relevé");

  if (elements.monetisationDownloadStatementButton) {
    elements.monetisationDownloadStatementButton.dataset.loading = "true";
    elements.monetisationDownloadStatementButton.disabled = true;
    elements.monetisationDownloadStatementButton.textContent = "Préparation...";
  }

  try {
    const resultat = await telechargerReleveMonetisation(
      globale
        ? {
            mode: "global",
            intervenant_ids: intervenantsSelectionnes,
            format: "pdf",
          }
        : {
            du: etat.monetisationDateDebut,
            au: etat.monetisationDateFin,
            intervenant_ids: intervenantsSelectionnes,
            format: "pdf",
          }
    );
    const url = URL.createObjectURL(resultat.blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download =
      resultat.fileName ||
      (globale
        ? "releve-monetisation-globale.pdf"
        : `releve-monetisation-periode-${etat.monetisationDateDebut}-${etat.monetisationDateFin}.pdf`);
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    afficherToast("Le relevé a été téléchargé.", "success");
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

    mettreAJourEtatExportMonetisationPersonnalise();
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
    seance_added: `${acteur} a ajouté une séance.`,
    seance_updated: `${acteur} a modifié une séance.`,
    seance_status_updated: `${acteur} a modifié le statut d'une séance.`,
    seance_deleted: `${acteur} a supprimé une séance.`,
    unavailability_added: `${acteur} a ajouté une indisponibilité.`,
    full_day_unavailability_added: `${acteur} a bloqué une journée complète.`,
    unavailability_updated: `${acteur} a modifié une indisponibilité.`,
    unavailability_deleted: `${acteur} a supprimé une indisponibilité.`,
    catalogue_updated: `${acteur} a mis à jour le catalogue.`,
    catalogue_deleted: `${acteur} a supprimé un élément du catalogue.`,
    history_updated: `${acteur} a mis à jour l'historique.`,
    administration_updated: `${acteur} a effectue une action d'administration.`,
    session_updated: `${acteur} a mis à jour une session.`,
    application_updated: `${acteur} a mis à jour l'application.`,
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
    disponibilites: "Les disponibilités ont été mises à jour.",
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

function appliquerStatistiquesMonetisation(emplacement, statsCompte) {
  const stats = statsCompte || {
    tarif_unitaire: 0,
    tarifs_horaires: [],
    seances_facturables: 0,
    seances_essai_faites: 0,
    montant_du: 0,
  };

  const champs = {
    primaryOne: {
      amountCard: elements.monetisationPrimaryOneAmountCard,
      amount: elements.monetisationPrimaryOneAmount,
      rate: elements.monetisationPrimaryOneRate,
      billableCount: elements.monetisationPrimaryOneBillableCount,
      trialCount: elements.monetisationPrimaryOneTrialCount,
    },
    primaryTwo: {
      amountCard: elements.monetisationPrimaryTwoAmountCard,
      amount: elements.monetisationPrimaryTwoAmount,
      rate: elements.monetisationPrimaryTwoRate,
      billableCount: elements.monetisationPrimaryTwoBillableCount,
      trialCount: elements.monetisationPrimaryTwoTrialCount,
    },
  }[emplacement];

  if (!champs) {
    return;
  }

  const montantFormate = formaterMontantDh(stats.montant_du);
  const tarifFormate = formaterTarifsAppliquesMonetisation(stats);

  if (champs.amountCard) champs.amountCard.textContent = montantFormate;
  if (champs.amount) champs.amount.textContent = montantFormate;
  if (champs.rate) champs.rate.textContent = tarifFormate;
  if (champs.billableCount) {
    champs.billableCount.textContent = String(Number(stats.seances_facturables) || 0);
  }
  if (champs.trialCount) {
    champs.trialCount.textContent = String(Number(stats.seances_essai_faites) || 0);
  }
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
    ["Tarifs appliqués", formaterTarifsAppliquesMonetisation(stats)],
    ["Séances facturables", String(Number(stats.seances_facturables) || 0)],
    ["Séances d'essai faites", String(Number(stats.seances_essai_faites) || 0)],
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

function appliquerIdentiteMonetisationPrincipale(index, nomCompte) {
  const premier = index === 0;
  const carte = premier
    ? elements.monetisationPrimaryOneCard
    : elements.monetisationPrimaryTwoCard;
  const details = premier
    ? elements.monetisationPrimaryOneDetails
    : elements.monetisationPrimaryTwoDetails;
  const label = premier
    ? elements.monetisationPrimaryOneLabel
    : elements.monetisationPrimaryTwoLabel;
  const titre = premier
    ? elements.monetisationPrimaryOneTitle
    : elements.monetisationPrimaryTwoTitle;
  const visible = Boolean(nomCompte);

  carte?.classList.toggle("hidden", !visible);
  details?.classList.toggle("hidden", !visible);
  if (visible) {
    if (label) label.textContent = nomCompte;
    if (titre) titre.textContent = nomCompte;
  }
}

function creerCarteTotalIntervenantMonetisation(intervenant) {
  const carte = document.createElement("article");
  carte.className = "account-stats-card monetisation-account-card";
  const enTete = document.createElement("div");
  enTete.className = "account-stats-header";
  const titre = document.createElement("h3");
  titre.textContent = String(intervenant?.nom || "Réalisateur");
  const total = document.createElement("strong");
  total.className = "account-stats-total";
  total.textContent = formaterMontantDh(intervenant?.montant_du);
  enTete.append(titre, total);

  const liste = document.createElement("div");
  liste.className = "account-stats-list";
  [
    ["Tarifs appliqués", formaterTarifsAppliquesMonetisation(intervenant)],
    ["Séances payantes", String(Number(intervenant?.seances_facturables) || 0)],
    ["Séances gratuites", String(Number(intervenant?.seances_essai_faites) || 0)],
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

function afficherTotauxIntervenantsMonetisation() {
  if (!elements.monetisationTotalsByIntervenant) {
    return;
  }

  const intervenants = Array.isArray(etat.monetisation?.intervenants)
    ? etat.monetisation.intervenants
    : [];
  elements.monetisationTotalsByIntervenant.replaceChildren();

  if (intervenants.length === 0) {
    elements.monetisationTotalsByIntervenant.appendChild(
      creerEmptyState("Aucune donnée de monétisation pour cette sélection.")
    );
    return;
  }

  intervenants.forEach((intervenant) => {
    elements.monetisationTotalsByIntervenant.appendChild(
      creerCarteTotalIntervenantMonetisation(intervenant)
    );
  });
}

function afficherDetailsMonetisation() {
  if (!elements.monetisationDetails) {
    return;
  }

  const lignes = Array.isArray(etat.monetisation?.lignes) ? etat.monetisation.lignes : [];
  elements.monetisationDetails.replaceChildren();

  if (lignes.length === 0) {
    elements.monetisationDetails.appendChild(
      creerEmptyState("Aucune séance réalisée pour cette période.")
    );
    return;
  }

  const enTetes = [
    "Date",
    "Réalisateur",
    "Étudiant",
    "Matière",
    "Durée",
    "Tarif horaire",
    "Type",
    "Montant",
  ];
  const table = document.createElement("table");
  table.className = "stats-comparison-table";
  const thead = document.createElement("thead");
  const enTete = document.createElement("tr");
  enTetes.forEach((libelle) => {
    const cellule = document.createElement("th");
    cellule.textContent = libelle;
    enTete.appendChild(cellule);
  });
  thead.appendChild(enTete);
  const tbody = document.createElement("tbody");

  lignes.forEach((ligne) => {
    const ligneTableau = document.createElement("tr");
    [
      formatDate(ligne?.date),
      ligne?.intervenant || ligne?.compte || "-",
      ligne?.etudiant || "-",
      ligne?.matiere || "-",
      ligne?.duree_label || "-",
      ligne?.est_gratuite ? "—" : formaterMontantDh(ligne?.tarif_horaire),
      ligne?.est_gratuite ? "Gratuite" : "Payante",
      formaterMontantDh(ligne?.montant),
    ].forEach((valeur, index) => {
      const cellule = document.createElement("td");
      cellule.dataset.label = enTetes[index];
      cellule.textContent = String(valeur);
      ligneTableau.appendChild(cellule);
    });
    tbody.appendChild(ligneTableau);
  });

  table.append(thead, tbody);
  elements.monetisationDetails.appendChild(table);
}

function viderMonetisation() {
  etat.monetisationResultatsVisibles = false;

  if (!etat.monetisation) {
    etat.monetisationComptesSelectionnes = [];
    etat.monetisationSelectionInitialisee = false;
    etat.monetisationIntervenantsSelectionnes = [];
  }

  if (elements.monetisationTotalAmount) {
    elements.monetisationTotalAmount.textContent = formaterMontantDh(0);
  }
  mettreAJourFormulaireMonetisation();
  elements.monetisationTotalsByIntervenant?.replaceChildren();
  elements.monetisationDetails?.replaceChildren();
  elements.monetisationReportAccounts?.replaceChildren();
  mettreAJourEtatExportMonetisationPersonnalise();
  mettreAJourVisibiliteResultatsMonetisation();
}

function mettreAJourMonetisation() {
  const montantTotal = Number(etat.monetisation?.montant_total);
  const totalCalcule = (Array.isArray(etat.monetisation?.intervenants)
    ? etat.monetisation.intervenants
    : []
  ).reduce((total, intervenant) => total + Number(intervenant?.montant_du || 0), 0);
  const totalVisible = Number.isFinite(montantTotal)
    ? montantTotal
    : totalCalcule;

  if (elements.monetisationTotalAmount) {
    elements.monetisationTotalAmount.textContent = formaterMontantDh(totalVisible);
  }

  mettreAJourFormulaireMonetisation();
  afficherSelectionIntervenantsMonetisation();
  afficherTotauxIntervenantsMonetisation();
  afficherDetailsMonetisation();
  mettreAJourVisibiliteResultatsMonetisation();
}

function estDateIsoStatistiquesValide(valeur) {
  const texte = String(valeur || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texte) && !Number.isNaN(new Date(`${texte}T12:00:00`).getTime());
}

function normaliserPeriodeStatistiques() {
  const aujourdHui = obtenirDateLocaleIso();
  const debutParDefaut = `${obtenirMoisCourantIso()}-01`;

  if (!estDateIsoStatistiquesValide(etat.statistiquesDateDebut)) {
    etat.statistiquesDateDebut = debutParDefaut;
  }

  if (!estDateIsoStatistiquesValide(etat.statistiquesDateFin)) {
    etat.statistiquesDateFin = aujourdHui;
  }

  if (etat.statistiquesDateDebut > aujourdHui) {
    etat.statistiquesDateDebut = aujourdHui;
  }

  if (etat.statistiquesDateFin > aujourdHui) {
    etat.statistiquesDateFin = aujourdHui;
  }
}

function synchroniserModeGlobalStatistiques() {
  const modeGlobal = etat.statistiquesGlobales === true;

  if (elements.statsGlobalToggle) {
    elements.statsGlobalToggle.checked = modeGlobal;
  }

  [elements.statsDateStart, elements.statsDateEnd].forEach((champ) => {
    if (!champ) {
      return;
    }

    champ.disabled = modeGlobal;
    champ.required = !modeGlobal;
  });
}

function mettreAJourFormulaireStatistiques() {
  normaliserPeriodeStatistiques();
  const aujourdHui = obtenirDateLocaleIso();

  if (elements.statsDateStart) {
    elements.statsDateStart.value = etat.statistiquesDateDebut;
    elements.statsDateStart.max = aujourdHui;
  }

  if (elements.statsDateEnd) {
    elements.statsDateEnd.value = etat.statistiquesDateFin;
    elements.statsDateEnd.max = aujourdHui;
  }

  synchroniserModeGlobalStatistiques();
}

function restaurerBoutonCalculStatistiques() {
  if (!elements.statsCalculateButton) {
    return;
  }

  elements.statsCalculateButton.disabled = false;
  elements.statsCalculateButton.textContent = "Calculer";
  delete elements.statsCalculateButton.dataset.loading;
}

function mettreAJourVisibiliteResultatsStatistiques() {
  const resultatsVisibles =
    etat.statistiquesResultatsVisibles === true && Boolean(etat.statistiques?.statistiques);

  if (!elements.statsResults) {
    return;
  }

  elements.statsResults.classList.toggle("hidden", !resultatsVisibles);
  elements.statsResults.hidden = !resultatsVisibles;
  elements.statsResults.toggleAttribute("inert", !resultatsVisibles);
}

function viderAffichageStatistiques() {
  if (elements.totalCount) {
    elements.totalCount.textContent = "0";
  }

  elements.statsAccountsOverview?.replaceChildren();
  elements.statsAccountsTable?.replaceChildren();
}

function masquerResultatsStatistiques({ viderDonnees = true } = {}) {
  etat.statistiquesRequeteVersion += 1;
  etat.statistiquesResultatsVisibles = false;

  if (viderDonnees) {
    etat.statistiques = null;
    viderAffichageStatistiques();
  }

  mettreAJourVisibiliteResultatsStatistiques();
}

function valeurStatistique(ligne, cle) {
  const valeur = Number(ligne?.[cle]);
  return Number.isFinite(valeur) && valeur >= 0 ? valeur : 0;
}

function obtenirNomIntervenantStatistiques(intervenant) {
  const nom = String(intervenant?.intervenant_nom || intervenant?.nom || "").trim();
  if (nom) {
    return nom;
  }

  // Le serveur conserve un libellé historique avec un identifiant public.
  // L'interface métier affiche uniquement le nom, jamais cet identifiant.
  const libelle = String(intervenant?.libelle || "").trim();
  const separateur = libelle.lastIndexOf("—");
  return separateur >= 0 ? libelle.slice(separateur + 1).trim() || "Réalisateur" : "Réalisateur";
}

function creerCarteStatistique({
  libelle,
  valeur,
  note = "",
  principale = false,
  identifiantValeur = "",
}) {
  const carte = document.createElement("article");
  carte.className = "panel stat-overview-card";
  if (principale) {
    carte.classList.add("stat-overview-card-primary");
  }

  const titre = document.createElement("span");
  titre.className = "stat-overview-label";
  titre.textContent = libelle;
  const valeurElement = document.createElement("strong");
  valeurElement.className = "stat-overview-value";
  if (identifiantValeur) {
    valeurElement.id = identifiantValeur;
  }
  valeurElement.textContent = String(valeur);
  carte.append(titre, valeurElement);

  if (note) {
    const noteElement = document.createElement("span");
    noteElement.className = "stat-overview-note";
    noteElement.textContent = note;
    carte.appendChild(noteElement);
  }

  return carte;
}

function mettreAJourStatistiques() {
  const statistiques = etat.statistiques?.statistiques;
  if (!statistiques) {
    viderAffichageStatistiques();
    mettreAJourVisibiliteResultatsStatistiques();
    return;
  }

  const intervenants = Array.isArray(statistiques.intervenants)
    ? statistiques.intervenants
    : [];
  const total = valeurStatistique(statistiques, "total_seances");

  if (elements.totalCount) {
    elements.totalCount.textContent = String(total);
  }

  if (elements.statsAccountsOverview) {
    const carteTotale = creerCarteStatistique({
      libelle: "Total général",
      valeur: total,
      principale: true,
      identifiantValeur: "total-count",
    });
    elements.statsAccountsOverview.replaceChildren(carteTotale);
    elements.totalCount = carteTotale.querySelector("#total-count");

    intervenants.forEach((intervenant) => {
      const totalIntervenant = valeurStatistique(intervenant, "total_seances");
      const faites = valeurStatistique(intervenant, "seances_faites");
      const payantes = valeurStatistique(intervenant, "seances_payantes");
      const gratuites = valeurStatistique(intervenant, "seances_gratuites");
      elements.statsAccountsOverview.appendChild(
        creerCarteStatistique({
          libelle: obtenirNomIntervenantStatistiques(intervenant),
          valeur: faites,
          note: `${totalIntervenant} total · ${payantes} payantes · ${gratuites} gratuites`,
        })
      );
    });
  }

  if (elements.statsAccountsTable) {
    elements.statsAccountsTable.replaceChildren();

    if (intervenants.length === 0) {
      elements.statsAccountsTable.appendChild(
        creerEmptyState("Aucune donnée statistique disponible pour cette période.")
      );
    } else {
      const enTetes = [
        "Réalisateur",
        "Total",
        "Planifiées",
        "Faites",
        "Payantes",
        "Gratuites",
        "Non faites",
      ];
      const table = document.createElement("table");
      table.className = "stats-comparison-table";
      const thead = document.createElement("thead");
      const ligneEntete = document.createElement("tr");
      enTetes.forEach((libelle) => {
        const cellule = document.createElement("th");
        cellule.textContent = libelle;
        ligneEntete.appendChild(cellule);
      });
      thead.appendChild(ligneEntete);

      const tbody = document.createElement("tbody");
      intervenants.forEach((intervenant) => {
        const ligne = document.createElement("tr");
        const valeurs = [
          obtenirNomIntervenantStatistiques(intervenant),
          valeurStatistique(intervenant, "total_seances"),
          valeurStatistique(intervenant, "seances_planifiees"),
          valeurStatistique(intervenant, "seances_faites"),
          valeurStatistique(intervenant, "seances_payantes"),
          valeurStatistique(intervenant, "seances_gratuites"),
          valeurStatistique(intervenant, "seances_non_faites"),
        ];

        valeurs.forEach((valeur, index) => {
          const cellule = document.createElement("td");
          cellule.dataset.label = enTetes[index];
          if (index === 0) {
            const nom = document.createElement("strong");
            nom.textContent = String(valeur);
            cellule.appendChild(nom);
          } else if (index === 3) {
            const badge = document.createElement("span");
            badge.className = "badge-faite";
            badge.textContent = String(valeur);
            cellule.appendChild(badge);
          } else {
            cellule.textContent = String(valeur);
          }
          ligne.appendChild(cellule);
        });

        tbody.appendChild(ligne);
      });

      table.append(thead, tbody);
      elements.statsAccountsTable.appendChild(table);
    }
  }

  mettreAJourVisibiliteResultatsStatistiques();
}

function gererChangementFiltreStatistiques() {
  etat.statistiquesDateDebut = String(elements.statsDateStart?.value || "").trim();
  etat.statistiquesDateFin = String(elements.statsDateEnd?.value || "").trim();
  masquerErreur(elements.statsFilterError);
  masquerResultatsStatistiques();
  restaurerBoutonCalculStatistiques();
}

function gererChangementModeStatistiquesGlobales() {
  etat.statistiquesGlobales = Boolean(elements.statsGlobalToggle?.checked);
  masquerErreur(elements.statsFilterError);
  synchroniserModeGlobalStatistiques();
  masquerResultatsStatistiques();
  restaurerBoutonCalculStatistiques();
}

async function gererCalculStatistiques(event) {
  event.preventDefault();
  masquerErreur(elements.statsFilterError);

  const globale = Boolean(elements.statsGlobalToggle?.checked);
  const dateDebut = String(elements.statsDateStart?.value || "").trim();
  const dateFin = String(elements.statsDateEnd?.value || "").trim();
  const aujourdHui = obtenirDateLocaleIso();

  if (!globale) {
    if (!estDateIsoStatistiquesValide(dateDebut) || !estDateIsoStatistiquesValide(dateFin)) {
      afficherErreur(elements.statsFilterError, "Saisissez une date de début et une date de fin valides.");
      return;
    }

    if (dateDebut > dateFin) {
      afficherErreur(elements.statsFilterError, "La date de début doit précéder la date de fin.");
      return;
    }

    if (dateDebut > aujourdHui || dateFin > aujourdHui) {
      afficherErreur(elements.statsFilterError, "La période ne peut pas inclure de date future.");
      return;
    }
  }

  etat.statistiquesGlobales = globale;
  if (!globale) {
    etat.statistiquesDateDebut = dateDebut;
    etat.statistiquesDateFin = dateFin;
  }

  masquerResultatsStatistiques();
  const versionRequete = etat.statistiquesRequeteVersion;

  if (elements.statsCalculateButton) {
    elements.statsCalculateButton.disabled = true;
    elements.statsCalculateButton.dataset.loading = "true";
    elements.statsCalculateButton.textContent = "Calcul...";
  }

  try {
    const resultat = await recupererStatistiques(
      globale
        ? { globale: true }
        : {
            du: dateDebut,
            au: dateFin,
          }
    );

    if (versionRequete !== etat.statistiquesRequeteVersion) {
      return;
    }

    etat.statistiques = resultat;
    etat.statistiquesResultatsVisibles = true;
    mettreAJourStatistiques();
  } catch (erreur) {
    if (versionRequete !== etat.statistiquesRequeteVersion) {
      return;
    }

    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherErreur(
      elements.statsFilterError,
      erreur.message || "Le calcul des statistiques est impossible pour le moment."
    );
  } finally {
    if (versionRequete === etat.statistiquesRequeteVersion) {
      restaurerBoutonCalculStatistiques();
    }
  }
}

function mettreAJourResume() {
  // Aujourd'hui reste vivant au fil des mises à jour de séances. Les
  // statistiques, elles, doivent toujours être recalculées explicitement.
  mettreAJourVueAujourdhui();
  masquerResultatsStatistiques();
}

function obtenirComptesAdministration() {
  return Array.isArray(etat.administration?.comptes) ? etat.administration.comptes : [];
}

function obtenirAppareilsAutoLoginAdministration() {
  return Array.isArray(etat.administration?.trusted_devices)
    ? etat.administration.trusted_devices
    : [];
}

function obtenirCompteAdministrationParId(utilisateurId) {
  return (
    obtenirComptesAdministration().find(
      (compte) => Number(compte.id) === Number(utilisateurId)
    ) || null
  );
}

// The API exposes the canonical `utilisateur_roles` list. `est_admin` is
// retained solely for old data/client compatibility and must never decide who
// is presented as a SuperAdmin in the administration UI.
function compteEstSuperAdminAdministration(compte) {
  return Array.isArray(compte?.roles) && compte.roles.includes("super_admin");
}

function comptePeutGererIndisponibilitesAdministration(compte) {
  const roles = Array.isArray(compte?.roles) ? compte.roles : [];
  return roles.includes("professeur") && !roles.includes("handler");
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

    if (exclureAdministrateurs && compteEstSuperAdminAdministration(compte)) {
      return false;
    }

    return true;
  });
}

function formaterEtatAccesCompte(compte) {
  return Number(compte?.acces_active) === 1 ? "Actif" : "Suspendu";
}

function formaterEtatMotDePasseCompte(compte) {
  return Number(compte?.doit_changer_mot_de_passe) === 1 ? "À changer" : "À jour";
}

function formaterEtatLectureSeuleCompte(compte) {
  return Number(compte?.mode_lecture_seule) === 1 ? "Lecture seule" : "Modification autorisée";
}

function formaterEtatMonetisationCompte(compte) {
  return Number(compte?.peut_voir_monetisation) === 1 ? "Visible" : "Masquée";
}

function formaterEtatAujourdhuiCompte(compte) {
  return Number(compte?.peut_voir_aujourdhui) === 1 ? "Visible" : "Masqué";
}

function formaterEtatIndisponibilitesCompte(compte) {
  return Number(compte?.peut_voir_indisponibilites) === 1 ? "Visible" : "Masqué";
}

function creerBadgeAdministration(texte, type) {
  const badge = document.createElement("span");
  definirBadgeAdmin(badge, texte, type);
  return badge;
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

  if (utilisateurPeutVoirAdministration()) {
    afficherVueAdministration(etat.adminVueActive);
  } else {
    mettreAJourDispositionAdministration(false);
    elements.userPasswordForm?.classList.remove("hidden");
    elements.pushSettingsCard?.classList.remove("hidden");
  }
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
  const estSuperAdmin = compteEstSuperAdminAdministration(compte);
  badges.append(
    creerBadgeAdministration(estSuperAdmin ? "Admin" : "Utilisateur", estSuperAdmin ? "admin" : "user"),
    creerBadgeAdministration(formaterEtatAccesCompte(compte), Number(compte.acces_active) === 1 ? "active" : "suspended"),
    creerBadgeAdministration(formaterEtatMotDePasseCompte(compte), Number(compte.doit_changer_mot_de_passe) === 1 ? "warning" : "user")
  );

  if (!estSuperAdmin) {
    badges.append(
      creerBadgeAdministration(
        Number(compte.mode_lecture_seule) === 1 ? "Lecture seule" : "Accès complet",
        Number(compte.mode_lecture_seule) === 1 ? "warning" : "user"
      )
    );
  }

  entete.append(informations, badges);

  const meta = document.createElement("div");
  meta.className = "admin-user-meta";
  meta.textContent = compte.dernier_login_at
    ? `Dernière connexion : ${formatDateHeureSecondes(compte.dernier_login_at)}`
    : "Dernière connexion : jamais";

  const hint = document.createElement("div");
  hint.className = "admin-user-hint";
  hint.textContent =
    estSuperAdmin
      ? "Compte administrateur principal."
      : `Mot de passe : ${formaterEtatMotDePasseCompte(compte)}. ${formaterEtatLectureSeuleCompte(
          compte
        )}. Monétisation ${formaterEtatMonetisationCompte(compte).toLowerCase()}.`;

  contenu.append(entete, meta, hint);

  const actions = document.createElement("div");
  actions.className = "admin-user-actions";

  const boutonSelection = document.createElement("button");
  boutonSelection.type = "button";
  boutonSelection.className = "button secondary";
  boutonSelection.textContent = "Sélectionner";
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
  details.textContent = `IP : ${session.adresse_ip || "-"} | Dernière activité : ${
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
  details.textContent = `IP : ${appareil.adresse_ip || "-"} | Dernière utilisation : ${
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

  const identifiant = normaliserTexteAudit(log.identifiant, "Activité");
  const utilisateur =
    normaliserTexteAudit(log.utilisateur_nom, "") ||
    normaliserTexteAudit(log.utilisateur_email, "") ||
    normaliserTexteAudit(log.identifiant, "-");
  const details = lireDetailsJournalAudit(log);

  elements.auditLogModalResult.textContent =
    log.resultat === "success" ? "Succès" : "Échec";
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
    titre.textContent = "Aucun détail supplémentaire";
    const texte = document.createElement("p");
    texte.textContent = "Cette entrée ne contient pas d'information supplémentaire.";
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
    titre.textContent = normaliserTexteAudit(log.identifiant, "Activité");

    const resultat = document.createElement("span");
    resultat.className = `admin-audit-result ${
      log.resultat === "success" ? "success" : "failed"
    }`;
    resultat.textContent = log.resultat === "success" ? "Succès" : "Échec";
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
    elements.adminBlockedIpsList.innerHTML = '<div class="admin-session-empty">Aucune IP bloquée.</div>';
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

function comparerIndisponibilitesLifo(a, b) {
  const idB = Number(b?.id || 0);
  const idA = Number(a?.id || 0);

  if (idB !== idA) {
    return idB - idA;
  }

  const dateB = Date.parse(b?.created_at || b?.updated_at || b?.date || "");
  const dateA = Date.parse(a?.created_at || a?.updated_at || a?.date || "");
  return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
}

function mettreAJourControlesAdministration() {
  const compteAcces = obtenirCompteAdministrationParId(elements.adminAccessUserId.value);
  const compteLectureSeule = obtenirCompteAdministrationParId(elements.adminReadonlyUserId.value);
  const compteAujourdhui = obtenirCompteAdministrationParId(elements.adminTodayUserId.value);
  const compteIndisponibilitesSelectionne = obtenirCompteAdministrationParId(
    elements.adminUnavailabilityAccessUserId.value
  );
  const compteIndisponibilites = comptePeutGererIndisponibilitesAdministration(
    compteIndisponibilitesSelectionne
  )
    ? compteIndisponibilitesSelectionne
    : null;
  const compteMonetisation = obtenirCompteAdministrationParId(
    elements.adminMonetisationUserId.value
  );
  const compteLogout = obtenirCompteAdministrationParId(elements.adminLogoutUserId.value);

  elements.adminToggleAccessStatus.textContent = compteAcces
    ? formaterEtatAccesCompte(compteAcces)
    : "-";
  elements.adminToggleAccessButton.disabled = !compteAcces;
  elements.adminToggleAccessButton.textContent = compteAcces
    ? Number(compteAcces.acces_active) === 1
      ? `Suspendre ${compteAcces.nom}`
      : `Reactiver ${compteAcces.nom}`
    : "Mettre à jour l'accès";
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
    : "Mettre à jour le mode";

  elements.adminTodayStatus.textContent = compteAujourdhui
    ? formaterEtatAujourdhuiCompte(compteAujourdhui)
    : "-";
  elements.adminTodayButton.disabled = !compteAujourdhui;
  elements.adminTodayButton.textContent = compteAujourdhui
    ? Number(compteAujourdhui.peut_voir_aujourdhui) === 1
      ? `Masquer Aujourd'hui`
      : `Afficher Aujourd'hui`
    : "Mettre à jour Aujourd'hui";

  elements.adminUnavailabilityAccessStatus.textContent = compteIndisponibilites
    ? formaterEtatIndisponibilitesCompte(compteIndisponibilites)
    : "-";
  elements.adminUnavailabilityAccessButton.disabled = !compteIndisponibilites;
  elements.adminUnavailabilityAccessButton.textContent = compteIndisponibilites
    ? Number(compteIndisponibilites.peut_voir_indisponibilites) === 1
      ? `Masquer Indisponibilités`
      : `Afficher Indisponibilités`
    : "Mettre à jour Indisponibilités";

  elements.adminMonetisationStatus.textContent = compteMonetisation
    ? formaterEtatMonetisationCompte(compteMonetisation)
    : "-";
  elements.adminMonetisationButton.disabled = !compteMonetisation;
  elements.adminMonetisationButton.textContent = compteMonetisation
    ? Number(compteMonetisation.peut_voir_monetisation) === 1
      ? `Masquer Monétisation`
      : `Afficher Monétisation`
    : "Mettre à jour Monétisation";

  elements.adminLogoutUserButton.disabled = !compteLogout;
  elements.adminLogoutUserButton.textContent = compteLogout
    ? `Couper les sessions de ${compteLogout.nom}`
    : "Couper les sessions";
}

function mettreAJourPanneauAdministration() {
  const comptes = obtenirComptesAdministration();
  const sessions = Array.isArray(etat.administration?.sessions) ? etat.administration.sessions : [];
  const comptesActifs = comptes.filter((compte) => Number(compte.acces_active) === 1);
  const comptesLectureSeule = comptes.filter(
    (compte) => Number(compte.mode_lecture_seule) === 1
  );

  elements.adminTotalUsers.textContent = String(comptes.length);
  elements.adminActiveUsers.textContent = String(comptesActifs.length);
  elements.adminReadonlyUsers.textContent = String(comptesLectureSeule.length);
  elements.adminActiveSessions.textContent = String(sessions.length);
  elements.adminUnavailabilityForm?.classList.toggle(
    "hidden",
    !utilisateurPeutGererIndisponibilites()
  );

  afficherListeUtilisateursAdministration();
  afficherSessionsAdministration();
  afficherAppareilsAutoLoginAdministration();
  afficherJournalAuthAdministration();
  afficherIpsBloqueesAdministration();
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
    obtenirComptesCiblables({ exclureAdministrateurs: true }).filter(
      comptePeutGererIndisponibilitesAdministration
    ),
    "Aucun professeur"
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
  remplirSelectComptes(
    elements.adminDeleteUserId,
    obtenirComptesCiblables({ exclureAdministrateurs: true }),
    "Aucun compte supprimable"
  );

  mettreAJourControlesAdministration();
}

function mettreAJourCarteCompte(cibles, statistiques) {
  cibles.total.textContent = String(statistiques.total);
  cibles.planned.textContent = String(statistiques.planifiees);
  cibles.completed.textContent = String(statistiques.faites);
  if (cibles.completedTrial) cibles.completedTrial.textContent = String(statistiques.faitesGratuites);
  if (cibles.completedRegular) cibles.completedRegular.textContent = String(statistiques.faitesPayantes);
  if (cibles.cancelled) cibles.cancelled.textContent = String(statistiques.nonFaites);
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
      '<div class="empty-state">Aucun détail supplémentaire pour cette action.</div>';
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
  elements.historyDetailModalChangesTitle.textContent = "Détails";
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
      label: "Création d'un créneau indisponible",
      badgeLabel: "Indispo",
      tone: "blocked",
    };
  }

  if (entree?.action_type === "indisponibilite_supprimee") {
    return {
      label: "Suppression d'un créneau indisponible",
      badgeLabel: "Indispo",
      tone: "blocked",
    };
  }

  if (entree?.action_type === "indisponibilite_modifiee") {
    return {
      label: "Modification d'un créneau indisponible",
      badgeLabel: "Indispo",
      tone: "update",
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

  if (entree?.action_type === "demande_compte_approuvee") {
    return {
      label: "Approbation d'une demande de compte",
      badgeLabel: "Compte",
      tone: "create",
    };
  }

  if (entree?.action_type === "demande_compte_refusee") {
    return {
      label: "Refus d'une demande de compte",
      badgeLabel: "Compte",
      tone: "delete",
    };
  }

  if (entree?.action_type === "activation_compte_renvoyee") {
    return {
      label: "Renvoi du lien d'activation",
      badgeLabel: "Compte",
      tone: "update",
    };
  }

  const actionStatut = obtenirActionStatutHistorique(entree);

  if (actionStatut) {
    return actionStatut;
  }

  if (["seance_modifiee", "statut_modifie"].includes(entree?.action_type)) {
    return obtenirNatureModificationHistorique(entree);
  }

  if (entree?.action_type === "reglages_calendrier_modifies") {
    return {
      label: "Modification du calendrier central",
      badgeLabel: "Calendrier",
      tone: "update",
    };
  }

  if (entree?.action_type === "fuseau_calendrier_public_modifie") {
    return {
      label: "Modification du fuseau du calendrier public",
      badgeLabel: "Public",
      tone: "update",
    };
  }

  if (entree?.action_type === "timezone_modifiee") {
    return {
      label: "Modification d’un fuseau horaire historique",
      badgeLabel: "Calendrier",
      tone: "update",
    };
  }

  if (entree?.action_type === "calendrier_public_modifie") {
    return {
      label: "Modification de l'accès au calendrier public",
      badgeLabel: "Public",
      tone: "update",
    };
  }

  if (entree?.action_type === "lien_calendrier_public_regenere") {
    return {
      label: "Régénération du lien de calendrier public",
      badgeLabel: "Public",
      tone: "update",
    };
  }

  return {
    label: entree?.action_label || "Action",
    badgeLabel: "Action",
    tone: "update",
  };
}

function normaliserDetailsHistorique(entree) {
  const details = entree?.details || {};

  const detailsReglageCalendrier = construireDetailsReglageCalendrierHistorique(entree, details);
  if (detailsReglageCalendrier) {
    return detailsReglageCalendrier;
  }

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

function construireDetailsReglageCalendrierHistorique(entree, details) {
  const action = entree?.action_type;

  if (action === "reglages_calendrier_modifies") {
    const avant = details?.avant && typeof details.avant === "object" ? details.avant : {};
    const apres = details?.apres && typeof details.apres === "object" ? details.apres : {};
    const lignes = [
      {
        label: "Début de journée",
        avant: formaterValeurReglageCalendrierHistorique(avant.calendar_start_time),
        apres: formaterValeurReglageCalendrierHistorique(apres.calendar_start_time),
      },
      {
        label: "Fin de journée",
        avant: formaterValeurReglageCalendrierHistorique(avant.calendar_end_time),
        apres: formaterValeurReglageCalendrierHistorique(apres.calendar_end_time),
      },
    ];

    if (avant.timezone !== undefined || apres.timezone !== undefined) {
      lignes.push({
        label: "Fuseau horaire (historique)",
        avant: formaterValeurReglageCalendrierHistorique(avant.timezone),
        apres: formaterValeurReglageCalendrierHistorique(apres.timezone),
      });
    }

    return {
      mode: "changement",
      titre: "Calendrier central",
      lignes,
    };
  }

  if (action === "fuseau_calendrier_public_modifie") {
    return {
      mode: "changement",
      titre: "Décalage du calendrier public",
      lignes: [
        {
          label: "Décalage public",
          avant: formaterValeurReglageCalendrierHistorique(details.avant),
          apres: formaterValeurReglageCalendrierHistorique(details.apres),
        },
      ],
    };
  }

  if (action === "timezone_modifiee") {
    return {
      mode: "changement",
      titre: "Fuseau horaire historique",
      lignes: [
        {
          label: "Fuseau horaire",
          avant: formaterValeurReglageCalendrierHistorique(details.avant),
          apres: formaterValeurReglageCalendrierHistorique(details.apres),
        },
      ],
    };
  }

  if (action === "calendrier_public_modifie") {
    return {
      mode: "changement",
      titre: "Accès au calendrier public",
      lignes: [
        {
          label: "Calendrier public",
          avant: formaterValeurReglageCalendrierHistorique(details.avant, { booleen: true }),
          apres: formaterValeurReglageCalendrierHistorique(details.apres, { booleen: true }),
        },
      ],
    };
  }

  if (action === "lien_calendrier_public_regenere") {
    return {
      mode: "information",
      titre: "Lien public",
      lignes: [{ label: "Lien", valeur: "Régénéré" }],
    };
  }

  return null;
}

function formaterValeurReglageCalendrierHistorique(valeur, { booleen = false } = {}) {
  if (booleen) {
    return valeur === true || Number(valeur) === 1 ? "Actif" : "Désactivé";
  }

  const texte = String(valeur ?? "").trim();
  return texte || "-";
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

function mettreAJourVisibiliteDescriptionSeance(mode) {
  elements.descriptionSection?.classList.remove("hidden");
}

function mettreAJourVisibiliteStatutSeance(mode) {
  elements.statusSection?.classList.remove("hidden");

  if (!afficherStatut) {
    definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  }
}

function normaliserSelectionCreationSeance(selection = {}) {
  const selectionNormalisee =
    typeof selection === "string" ? { date: selection } : selection && typeof selection === "object" ? selection : {};
  const dateSelectionnee = extraireDateIsoDepuisValeurCalendrier(selectionNormalisee.date);
  const date = dateSelectionnee;
  const heureDebutSelectionnee = String(selectionNormalisee.heure_debut || "").trim();
  const heureFinSelectionnee = String(selectionNormalisee.heure_fin || "").trim();
  const selectionSurUnJour =
    !selectionNormalisee.date_fin ||
    extraireDateIsoDepuisValeurCalendrier(selectionNormalisee.date_fin) === date;
  const dureeSelectionnee = selectionSurUnJour
    ? calculerDureeMinutesDepuisHeures(heureDebutSelectionnee, heureFinSelectionnee)
    : 0;
  const duree = [60, 90, 120].includes(dureeSelectionnee) ? dureeSelectionnee : 60;
  const horaireExplicitementSelectionne = Boolean(
    dateSelectionnee && estHeureDebutSeanceValide(heureDebutSelectionnee)
  );
  const heureDebut =
    estHeureDebutSeanceValide(heureDebutSelectionnee) &&
    calculerHeureFin(heureDebutSelectionnee, duree)
      ? heureDebutSelectionnee
      : recupererHeureDebutParDefaut();

  return {
    date: date || obtenirDateLocaleIso(),
    heureDebut,
    duree,
    dateExplicitementSelectionnee: Boolean(dateSelectionnee),
    horaireExplicitementSelectionne,
  };
}

function ouvrirFormulaireCreation(selection = {}) {
  if (!utilisateurPeutModifierDonnees()) {
    afficherToast("Votre compte est en lecture seule.", "warning");
    return;
  }

  const selectionNormalisee = normaliserSelectionCreationSeance(selection);
  const dateIsoSelectionnee = selectionNormalisee.date;

  const indisponibiliteJourComplet =
    dateIsoSelectionnee && !utilisateurEstHandler()
      ? estJourIntegralementIndisponible(dateIsoSelectionnee, etat.utilisateur?.id)
      : null;

  if (indisponibiliteJourComplet) {
    afficherToast(
      `Le ${formatDate(dateIsoSelectionnee)} est indisponible toute la journée.`,
      "warning"
    );
    return;
  }

  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  definirProgressionCreationSeance({
    dateConfirmee: selectionNormalisee.dateExplicitementSelectionnee,
    horaireConfirme: selectionNormalisee.horaireExplicitementSelectionne,
  });
  mettreAJourVisibiliteDescriptionSeance("creation");
  mettreAJourVisibiliteStatutSeance("creation");
  rendreOptionsCatalogueSeance();
  configurerOptionsStatut("creation");
  definirSousTitreModalSeance("");
  elements.seanceModalTitle.textContent = "Nouvelle séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  elements.saveSeanceButton.dataset.defaultLabel = "Enregistrer";
  elements.seanceId.value = "";
  definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  definirValeurSelectionnee(elements.matiereCheckboxes, "");
  definirValeurSelectionnee(elements.essaiCheckboxes, "0");
  definirDureeSelectionnee(selectionNormalisee.duree);
  definirHeureDebutSelectionnee(selectionNormalisee.heureDebut);
  elements.date.value = dateIsoSelectionnee;

  mettreAJourHeureFinCalculee();
  mettreAJourEtapesFormulaireSeance();
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
  definirProgressionCreationSeance({ dateConfirmee: true, horaireConfirme: true });
  mettreAJourVisibiliteDescriptionSeance("modification");
  mettreAJourVisibiliteStatutSeance("modification");
  rendreOptionsCatalogueSeance();
  configurerOptionsStatut("modification");
  definirSousTitreModalSeance("");
  remplirFormulaire(etat.seanceSelectionnee);
  elements.seanceModalTitle.textContent = "Modifier la séance";
  elements.saveSeanceButton.textContent = "Sauvegarder";
  elements.saveSeanceButton.dataset.defaultLabel = "Sauvegarder";
  mettreAJourEtapesFormulaireSeance();
  ouvrirModal(elements.seanceModal);
}

function ouvrirFormulaireDuplication() {
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

  const seanceSource = etat.seanceSelectionnee;
  const matieres = obtenirMatieresDisponibles();

  fermerModal(elements.detailModal);
  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  definirProgressionCreationSeance();
  mettreAJourVisibiliteDescriptionSeance("creation");
  mettreAJourVisibiliteStatutSeance("creation");
  rendreOptionsCatalogueSeance();
  configurerOptionsStatut("creation");
  definirSousTitreModalSeance(
    `Copie de ${seanceSource.libelle || seanceSource.etudiant}. Choisissez la date avant d'enregistrer.`
  );
  elements.seanceModalTitle.textContent = "Dupliquer la séance";
  elements.saveSeanceButton.textContent = "Créer la copie";
  elements.saveSeanceButton.dataset.defaultLabel = "Créer la copie";
  elements.seanceId.value = "";
  elements.etudiant.value = seanceSource.etudiant || "";
  elements.parent.value = seanceSource.parent || "";
  definirValeurSelectionnee(
    elements.matiereCheckboxes,
    obtenirValeurCatalogueActiveOuDefaut(matieres, seanceSource.matiere, obtenirMatiereParDefaut())
  );
  definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  definirValeurSelectionnee(elements.essaiCheckboxes, seanceSource.est_essai ? "1" : "0");
  definirDureeSelectionnee(seanceSource.duree_minutes || 60);
  definirIntervenantSeanceSelectionne(seanceSource.intervenant_id, { obligatoire: true });
  elements.date.value = "";
  definirHeureDebutSelectionnee(seanceSource.heure_debut || recupererHeureDebutParDefaut());
  mettreAJourHeureFinCalculee();
  mettreAJourEtapesFormulaireSeance();
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
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
  definirProgressionCreationSeance({ dateConfirmee: true, horaireConfirme: true });
  mettreAJourVisibiliteDescriptionSeance("modification");
  mettreAJourVisibiliteStatutSeance("modification");
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
  definirProgressionCreationSeance();
  elements.seanceModalTitle.textContent = "Reporter la séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  elements.saveSeanceButton.dataset.defaultLabel = "Enregistrer";
  mettreAJourEtapesFormulaireSeance();
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
}

function remplirFormulaire(seance) {
  elements.seanceId.value = seance.id;
  elements.etudiant.value = seance.etudiant;
  elements.parent.value = seance.parent || "";
  definirValeurSelectionnee(elements.matiereCheckboxes, seance.matiere);
  elements.date.value = seance.date;
  elements.heureDebut.value = seance.heure_debut;
  definirDureeSelectionnee(seance.duree_minutes);
  definirValeurSelectionnee(
    elements.statutCheckboxes,
    seance.statut_manuel || seance.statut_seance
  );
  definirHeureDebutSelectionnee(seance.heure_debut);
  definirValeurSelectionnee(elements.essaiCheckboxes, seance.est_essai ? "1" : "0");
  definirIntervenantSeanceSelectionne(seance.intervenant_id, { obligatoire: true });
  elements.description.value = seance.description || "";
  masquerErreur(elements.seanceFormError);
  mettreAJourHeureFinCalculee();
  mettreAJourEtapesFormulaireSeance();
}

function obtenirIntervenantCibleSeance() {
  if (utilisateurEstHandler()) {
    const id = Number(elements.seanceIntervenant?.value || 0);
    return obtenirIntervenantsEligiblesPourCreneauSeance().some(
      (intervenant) => intervenant.id === id
    )
      ? id
      : null;
  }

  const idUtilisateur = Number(etat.utilisateur?.id || 0);
  return Number.isInteger(idUtilisateur) && idUtilisateur > 0 ? idUtilisateur : null;
}

function erreurIndisponibiliteCollective(erreur) {
  return String(erreur?.code || "").toUpperCase() === "COLLECTIVE_UNAVAILABILITY";
}

async function gererSoumissionSeance(event) {
  event.preventDefault();
  masquerErreur(elements.seanceFormError);

  if (!utilisateurPeutModifierDonnees()) {
    afficherErreur(elements.seanceFormError, "Votre compte est en lecture seule.");
    return;
  }

  const mode = elements.seanceForm.dataset.mode || "creation";
  const dureeMinutes = recupererDureeSelectionnee();
  const intervenantId = obtenirIntervenantCibleSeance();
  const donneesSeance = {
    etudiant: elements.etudiant.value.trim(),
    parent: elements.parent.value.trim(),
    matiere: recupererValeurSelectionnee(elements.matiereCheckboxes),
    est_essai: recupererValeurSelectionnee(elements.essaiCheckboxes),
    date: elements.date.value,
    heure_debut: elements.heureDebut.value,
    duree_minutes: dureeMinutes,
    statut_seance:
      mode === "creation" ? "planifiee" : recupererValeurSelectionnee(elements.statutCheckboxes),
  };

  if (utilisateurEstHandler()) {
    if (!intervenantId) {
      afficherErreur(
        elements.seanceFormError,
        "Sélectionnez le Réalisateur qui assurera la séance."
      );
      return;
    }
    donneesSeance.intervenant_id = intervenantId;
  }

  if (mode === "modification") {
    donneesSeance.description = elements.description.value.trim();
  }
  const heureFinCalculee = calculerHeureFin(donneesSeance.heure_debut, dureeMinutes);

  if (!donneesSeance.etudiant) {
    afficherErreur(elements.seanceFormError, "Le nom de l'étudiant est obligatoire.");
    return;
  }

  if (!donneesSeance.matiere) {
    afficherErreur(elements.seanceFormError, "Sélectionnez une matière.");
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

  if (mode === "modification" && !donneesSeance.statut_seance) {
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

  const seancePersonnelleHandler =
    utilisateurEstHandler() && Number(intervenantId) === Number(etat.utilisateur?.id);

  const conflitSeanceConfidentielle = trouverSeanceConfidentielleChevauchanteLocale({
    date: donneesSeance.date,
    heure_debut: donneesSeance.heure_debut,
    heure_fin: heureFinCalculee,
    ignorerSeanceId: mode === "modification" ? etat.seanceSelectionnee?.id : null,
    intervenantId,
  });

  if (
    conflitSeanceConfidentielle &&
    !(
      mode === "modification" &&
      creneauSeanceEquivalent(
        etat.seanceSelectionnee,
        donneesSeance.date,
        donneesSeance.heure_debut,
        heureFinCalculee,
        intervenantId
      )
    )
  ) {
    afficherErreur(elements.seanceFormError, obtenirMessageSeanceConfidentielle());
    return;
  }

  const conflitSeance = trouverSeanceChevauchanteLocale({
    date: donneesSeance.date,
    heure_debut: donneesSeance.heure_debut,
    heure_fin: heureFinCalculee,
    ignorerSeanceId: mode === "modification" ? etat.seanceSelectionnee?.id : null,
    intervenantId,
  });

  if (
    conflitSeance &&
    !(
      mode === "modification" &&
      creneauSeanceEquivalent(
        etat.seanceSelectionnee,
        donneesSeance.date,
        donneesSeance.heure_debut,
        heureFinCalculee,
        intervenantId
      )
    )
  ) {
    afficherErreur(elements.seanceFormError, construireMessageConflitSeanceClient(conflitSeance));
    return;
  }

  const conflitIndisponibilite = trouverIndisponibiliteChevauchanteLocale({
    date: donneesSeance.date,
    heure_debut: donneesSeance.heure_debut,
    heure_fin: heureFinCalculee,
    intervenantId,
  });

  if (
    conflitIndisponibilite &&
    !seancePersonnelleHandler &&
    !(
      mode === "modification" &&
      creneauSeanceEquivalent(
        etat.seanceSelectionnee,
        donneesSeance.date,
        donneesSeance.heure_debut,
        heureFinCalculee,
        intervenantId
      )
    )
  ) {
    afficherErreur(
      elements.seanceFormError,
      utilisateurEstHandler()
        ? "Ce Réalisateur est indisponible sur ce créneau. Choisissez un autre Réalisateur ou un autre horaire."
        : construireMessageIndisponibiliteClient(conflitIndisponibilite)
    );
    return;
  }

  elements.saveSeanceButton.disabled = true;
  const libelleBoutonFinal =
    elements.saveSeanceButton.dataset.defaultLabel ||
    (mode === "creation" ? "Enregistrer" : "Sauvegarder");
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

    if (erreurIndisponibiliteCollective(erreur)) {
      afficherErreur(
        elements.seanceFormError,
        erreur.message ||
          "Aucun Réalisateur actif n’est disponible sur ce créneau. Choisissez un autre horaire."
      );
      return;
    }

    afficherErreur(elements.seanceFormError, erreur.message);
  } finally {
    elements.saveSeanceButton.disabled = false;
    elements.saveSeanceButton.textContent = libelleBoutonFinal;
  }
}

function gererClicIndisponibilite(indisponibilite) {
  if (indisponibilite?.est_seance_confidentielle) {
    const dateLabel = indisponibilite?.date ? formatDate(indisponibilite.date) : "";
    const messageConfidentiel = estIndisponibiliteJourCompletClient(indisponibilite)
      ? dateLabel
        ? `Jour complet indisponible : ${dateLabel}.`
        : "Jour complet indisponible."
      : `Créneau indisponible${dateLabel ? ` : ${dateLabel}` : ""}${
          indisponibilite?.heure_debut && indisponibilite?.heure_fin
            ? `, ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`
            : ""
        }.`;
    afficherToast(messageConfidentiel, "warning");
    return;
  }

  const messagePlage = estIndisponibiliteJourCompletClient(indisponibilite)
    ? "Jour complet indisponible"
    : `Créneau indisponible : ${indisponibilite.heure_debut}-${indisponibilite.heure_fin}`;

  if (utilisateurPeutGererIndisponibilites()) {
    const progressionTripleClic = enregistrerClicIndisponibilite(indisponibilite);

    if (progressionTripleClic.complete) {
      ouvrirDetailIndisponibilite(indisponibilite);
      return;
    }

    afficherToast(
      `${messagePlage}. ${progressionTripleClic.restants} clic(s) restant(s) pour gérer.`,
      "warning"
    );
    return;
  }

  afficherToast(
    estIndisponibiliteJourCompletClient(indisponibilite)
      ? "Cette journée a été marquée comme indisponible."
      : "Ce créneau a été marqué comme indisponible.",
    "warning"
  );
}

function enregistrerClicIndisponibilite(indisponibilite) {
  const identifiant = String(indisponibilite?.id || "");
  const maintenant = Date.now();
  const memeIndisponibilite = etat.clicIndisponibilite.id === identifiant;
  const clicRecent =
    memeIndisponibilite &&
    maintenant - etat.clicIndisponibilite.lastAt <= delaiTripleClicIndisponibiliteMs;
  const count = clicRecent ? etat.clicIndisponibilite.count + 1 : 1;

  etat.clicIndisponibilite = {
    id: identifiant,
    count,
    lastAt: maintenant,
  };

  if (count >= 3) {
    etat.clicIndisponibilite = {
      id: null,
      count: 0,
      lastAt: 0,
    };

    return {
      complete: true,
      restants: 0,
    };
  }

  return {
    complete: false,
    restants: 3 - count,
  };
}

function gererClicCreneauCalendrierSeance(selection = {}) {
  const dateIsoSelectionnee = extraireDateIsoDepuisValeurCalendrier(selection?.date);
  const indisponibiliteJourComplet = dateIsoSelectionnee && !utilisateurEstHandler()
    ? estJourIntegralementIndisponible(dateIsoSelectionnee, etat.utilisateur?.id)
    : null;

  if (indisponibiliteJourComplet) {
    gererClicIndisponibilite(indisponibiliteJourComplet);
    return;
  }

  ouvrirFormulaireCreation(selection);
}

function gererSelectionCalendrierSeance(selection = {}) {
  gererClicCreneauCalendrierSeance(selection);
}

function gererClicDateCalendrier(dateSelectionnee = "") {
  gererClicCreneauCalendrierSeance({ date: dateSelectionnee });
}

function trouverIndisponibiliteDepuisSelectionCalendrier(selection = {}) {
  const date = extraireDateIsoDepuisValeurCalendrier(selection.date);

  if (!date) {
    return null;
  }

  const indisponibiliteJourComplet = estJourIntegralementIndisponible(date);
  if (indisponibiliteJourComplet) {
    return indisponibiliteJourComplet;
  }

  const heureDebut = selection.heure_debut || "";
  const heureFin = selection.heure_fin || (heureDebut ? calculerHeureFin(heureDebut, 30) : "");

  if (!heureDebut || !heureFin) {
    return null;
  }

  return trouverIndisponibiliteChevauchanteLocale({
    date,
    heure_debut: heureDebut,
    heure_fin: heureFin,
  });
}

function ouvrirIndisponibiliteDepuisSelectionCalendrier(selection = {}) {
  const indisponibilite = trouverIndisponibiliteDepuisSelectionCalendrier(selection);

  if (!indisponibilite) {
    return false;
  }

  if (utilisateurPeutGererIndisponibilites()) {
    ouvrirDetailIndisponibilite(indisponibilite);
  } else {
    gererClicIndisponibilite(indisponibilite);
  }

  return true;
}

function gererClicCreneauCalendrierIndisponibilite(selection = {}) {
  if (ouvrirIndisponibiliteDepuisSelectionCalendrier(selection)) {
    return;
  }

  ouvrirFormulaireCreationIndisponibiliteDepuisCalendrier(selection);
}

function gererSelectionCalendrierIndisponibilite(selection = {}) {
  if (ouvrirIndisponibiliteDepuisSelectionCalendrier(selection)) {
    return;
  }

  ouvrirFormulaireCreationIndisponibiliteDepuisCalendrier(selection);
}

function seancesSeChevauchent(premiereSeance, secondeSeance) {
  if (
    !premiereSeance ||
    !secondeSeance ||
    String(premiereSeance.date || "") !== String(secondeSeance.date || "")
  ) {
    return false;
  }

  return (
    calculerDureeMinutesDepuisHeures(
      premiereSeance.heure_debut,
      secondeSeance.heure_fin
    ) > 0 &&
    calculerDureeMinutesDepuisHeures(
      secondeSeance.heure_debut,
      premiereSeance.heure_fin
    ) > 0
  );
}

function obtenirSeancesChevauchantesVisibles(seance) {
  const idSeanceCliquee = Number(seance?.id || 0);
  const seances = (Array.isArray(etat.seances) ? etat.seances : []).filter(
    (candidate) =>
      !seanceEstMasqueePourConfidentialite(candidate) &&
      seancesSeChevauchent(candidate, seance)
  );

  return seances.sort((premiere, seconde) => {
    const premiereCliquee = Number(premiere.id) === idSeanceCliquee;
    const secondeCliquee = Number(seconde.id) === idSeanceCliquee;
    if (premiereCliquee !== secondeCliquee) {
      return premiereCliquee ? -1 : 1;
    }

    return (
      String(premiere.heure_debut || "").localeCompare(String(seconde.heure_debut || "")) ||
      Number(premiere.id || 0) - Number(seconde.id || 0)
    );
  });
}

function ouvrirChoixSeancesChevauchantes(seances = []) {
  if (!elements.seanceChoiceModal || !elements.seanceChoiceList) {
    return;
  }

  elements.seanceChoiceList.replaceChildren();
  seances.forEach((seance) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "seance-choice-item";

    const titre = document.createElement("span");
    titre.className = "seance-choice-item-title";
    titre.textContent = `${seance.etudiant || "Sans étudiant"} · ${seance.matiere || "Sans matière"}`;

    const meta = document.createElement("span");
    meta.className = "seance-choice-item-meta";
    meta.textContent = [
      construirePlageHoraire(seance),
      seance.intervenant_nom || seance.compte || "Réalisateur",
    ]
      .filter(Boolean)
      .join(" · ");

    bouton.append(titre, meta);
    bouton.addEventListener("click", () => {
      fermerModal(elements.seanceChoiceModal);
      ouvrirDetailSeance(seance);
    });
    elements.seanceChoiceList.appendChild(bouton);
  });

  ouvrirModal(elements.seanceChoiceModal);
}

function ouvrirDetailsOuChoixSeance(seance) {
  if (!seance) {
    return;
  }

  if (seanceEstMasqueePourConfidentialite(seance)) {
    ouvrirDetailSeance(seance);
    return;
  }

  const seancesChevauchantes = obtenirSeancesChevauchantesVisibles(seance);
  if (seancesChevauchantes.length <= 1) {
    ouvrirDetailSeance(seance);
    return;
  }

  ouvrirChoixSeancesChevauchantes(seancesChevauchantes);
}

async function ouvrirDetailSeance(seance) {
  if (seanceEstMasqueePourConfidentialite(seance)) {
    afficherToast(obtenirMessageSeanceConfidentielle(), "warning");
    return;
  }

  etat.seanceSelectionnee = seance;
  elements.detailTitle.textContent = seance.libelle;
  elements.detailStudent.textContent = seance.etudiant;
  elements.detailParent.textContent = seance.parent || "Non renseigné";
  elements.detailSubject.textContent = seance.matiere;
  elements.detailAccount.textContent = seance.intervenant_nom || seance.compte || "-";
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
  elements.duplicateSeanceButton.disabled = actionsBloquees;
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
    initialiserChoixHeureDebut();
    elements.heureDebutHourSelect.value = heuresDebutDisponibles[0];
    elements.heureDebutMinuteSelect.value = elements.heureDebutMinuteSelect.options[0]?.value || "";
    elements.heureDebut.value = "";
    mettreAJourHeureFinCalculee();
    return;
  }

  const [heure, minute] = heureDebut.split(":");
  initialiserChoixHeureDebut(heureDebut);
  if (!selectContientValeur(elements.heureDebutHourSelect, heure)) {
    elements.heureDebutHourSelect.add(new Option(heure, heure));
  }
  elements.heureDebutHourSelect.value = heure;
  remplirMinutesDebutPourHeure(heure, minute);
  if (!selectContientValeur(elements.heureDebutMinuteSelect, minute)) {
    elements.heureDebutMinuteSelect.add(new Option(minute, minute));
  }
  elements.heureDebutMinuteSelect.value = minute;
  elements.heureDebut.value = `${heure}:${minute}`;
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureDebutSelectionnee() {
  const heure = elements.heureDebutHourSelect.value;
  const minuteActuelle = elements.heureDebutMinuteSelect.value;
  remplirMinutesDebutPourHeure(heure, minuteActuelle);
  const minute = elements.heureDebutMinuteSelect.value;

  elements.heureDebut.value = heure && minute ? `${heure}:${minute}` : "";
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureFinCalculee() {
  const heureDebut = elements.heureDebut.value;
  const dureeMinutes = recupererDureeSelectionnee();

  if (!heureDebut || !dureeMinutes) {
    elements.heureFinCalculee.value = "";
    mettreAJourEtapesFormulaireSeance();
    return;
  }

  elements.heureFinCalculee.value = calculerHeureFin(heureDebut, dureeMinutes);
  mettreAJourEtapesFormulaireSeance();
}

function calculerHeureFin(heureDebut, dureeMinutes) {
  if (!estHeureValide(heureDebut)) {
    return "";
  }

  const [heures, minutes] = heureDebut.split(":").map(Number);
  const totalMinutes = heures * 60 + minutes + Number(dureeMinutes);
  const { fin } = obtenirBornesCalendrierClient();

  if (totalMinutes > fin) {
    return "";
  }

  if (totalMinutes === 24 * 60) {
    return "24:00";
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
  const totalFin =
    heureFin === "24:00" || (heureFin === "00:00" && totalDebut > 0)
      ? 24 * 60
      : heuresFin * 60 + minutesFin;
  const difference = totalFin - totalDebut;

  return difference > 0 ? difference : 0;
}

function creneauSeanceEquivalent(seance, date, heureDebut, heureFin, intervenantId = null) {
  if (!seance) {
    return false;
  }

  return (
    seance.date === date &&
    seance.heure_debut === heureDebut &&
    seance.heure_fin === heureFin &&
    (!intervenantId || Number(seance.intervenant_id) === Number(intervenantId))
  );
}

function trouverSeanceConfidentielleChevauchanteLocale({
  date,
  heure_debut: heureDebut,
  heure_fin: heureFin,
  ignorerSeanceId = null,
  intervenantId = null,
}) {
  if (utilisateurEstAdministrateur()) {
    return null;
  }

  return (
    etat.seances.find((seance) => {
      if (!seanceEstMasqueePourConfidentialite(seance) || seance.date !== date) {
        return false;
      }

      if (intervenantId && Number(seance.intervenant_id) !== Number(intervenantId)) {
        return false;
      }

      if (String(seance.statut_seance || "").toLowerCase() === "annulee") {
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

function trouverSeanceChevauchanteLocale({
  date,
  heure_debut: heureDebut,
  heure_fin: heureFin,
  ignorerSeanceId = null,
  intervenantId = null,
}) {
  return (
    etat.seances.find((seance) => {
      if (seanceEstMasqueePourConfidentialite(seance) || seance.date !== date) {
        return false;
      }

      if (intervenantId && Number(seance.intervenant_id) !== Number(intervenantId)) {
        return false;
      }

      if (String(seance.statut_seance || "").toLowerCase() === "annulee") {
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

function construireMessageConflitSeanceClient(seance) {
  const etudiant = String(seance?.etudiant || "").trim();
  const matiere = String(seance?.matiere || "").trim();
  const details = [etudiant, matiere].filter(Boolean).join(" - ");

  return details
    ? `Ce créneau chevauche déjà une séance (${details}).`
    : "Ce créneau chevauche déjà une séance.";
}

function trouverIndisponibiliteChevauchanteLocale({
  date,
  heure_debut: heureDebut,
  heure_fin: heureFin,
  ignorerIndisponibiliteId = null,
  intervenantId = null,
}) {
  return etat.indisponibilites.find((indisponibilite) => {
    if (indisponibilite.date !== date) {
      return false;
    }

    if (
      intervenantId &&
      Number(indisponibilite.intervenant_id) !== Number(intervenantId)
    ) {
      return false;
    }

    if (
      ignorerIndisponibiliteId &&
      Number(indisponibilite.id) === Number(ignorerIndisponibiliteId)
    ) {
      return false;
    }

    return (
      calculerDureeMinutesDepuisHeures(indisponibilite.heure_debut, heureFin) > 0 &&
      calculerDureeMinutesDepuisHeures(heureDebut, indisponibilite.heure_fin) > 0
    );
  }) || null;
}

function estJourIntegralementIndisponible(date, intervenantId = null) {
  return (
    etat.indisponibilites.find(
      (indisponibilite) =>
        indisponibilite.date === date &&
        estIndisponibiliteJourCompletClient(indisponibilite) &&
        (!intervenantId || Number(indisponibilite.intervenant_id) === Number(intervenantId))
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
  return estIndisponibiliteJourCompletClient(indisponibilite)
    ? `Cette journée est indisponible le ${indisponibilite.date}.`
    : `Ce créneau est indisponible le ${indisponibilite.date} de ${indisponibilite.heure_debut} à ${indisponibilite.heure_fin}.`;
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
  const maintenant = extrairePartiesHorlogeCalendrier(new Date());
  let heures = Number(maintenant.hour);
  let minutes = Number(maintenant.minute) <= 30 ? 30 : 0;

  if (!Number.isFinite(heures)) {
    heures = new Date().getHours();
  }

  if (minutes === 0) {
    heures += 1;
  }

  const { debut, fin } = obtenirBornesCalendrierClient();
  const minuteCandidate = heures * 60 + minutes;
  const derniereHeurePossible = Math.max(debut, fin - 60);
  return formaterMinutesCalendrierClient(
    Math.min(Math.max(minuteCandidate, debut), derniereHeurePossible)
  );
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

function obtenirModalesOuvertes() {
  return Array.from(document.querySelectorAll(".modal:not(.hidden)")).filter(
    (modal) => modal.getAttribute("aria-hidden") !== "true"
  );
}

function obtenirModalOuverteAuPremierPlan() {
  const modales = obtenirModalesOuvertes();
  return modales[modales.length - 1] || null;
}

function elementEstVisibleDansModal(element) {
  return (
    element instanceof HTMLElement &&
    !element.closest(".hidden, [aria-hidden='true']") &&
    element.getClientRects().length > 0
  );
}

function obtenirElementsFocusablesModal(modal) {
  if (!modal) {
    return [];
  }

  return Array.from(modal.querySelectorAll(selecteurElementsFocusablesModal)).filter(
    (element) =>
      elementEstVisibleDansModal(element) &&
      !element.hasAttribute("disabled") &&
      element.tabIndex >= 0
  );
}

function focaliserElementModal(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.hasAttribute("disabled")) {
    return false;
  }

  try {
    element.focus({ preventScroll: true });
  } catch (_erreur) {
    element.focus();
  }

  return document.activeElement === element;
}

function focaliserPremierElementModal(modal) {
  if (!modal) {
    return false;
  }

  return focaliserElementModal(obtenirElementsFocusablesModal(modal)[0] || modal);
}

function gererNavigationClavierModales(event) {
  const modal = obtenirModalOuverteAuPremierPlan();
  if (!modal) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    fermerModal(modal);
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusables = obtenirElementsFocusablesModal(modal);
  if (focusables.length === 0) {
    event.preventDefault();
    focaliserElementModal(modal);
    return;
  }

  const premierElement = focusables[0];
  const dernierElement = focusables[focusables.length - 1];
  const elementActif = document.activeElement;
  const elementActifFocusable = focusables.includes(elementActif);

  if (event.shiftKey && (elementActif === premierElement || !elementActifFocusable)) {
    event.preventDefault();
    focaliserElementModal(dernierElement);
    return;
  }

  if (!event.shiftKey && (elementActif === dernierElement || !elementActifFocusable)) {
    event.preventDefault();
    focaliserElementModal(premierElement);
  }
}

function ouvrirModal(modal) {
  if (!modal) {
    return;
  }

  const etaitFermee = modal.classList.contains("hidden");
  if (etaitFermee) {
    const elementActif = document.activeElement;
    retoursFocusDesModales.set(
      modal,
      elementActif instanceof HTMLElement && !modal.contains(elementActif) ? elementActif : null
    );
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  if (etaitFermee) {
    focaliserPremierElementModal(modal);
  }
}

function fermerModal(modal) {
  if (!modal) {
    return;
  }

  const etaitOuverte = !modal.classList.contains("hidden");
  const elementRetour = retoursFocusDesModales.get(modal);
  retoursFocusDesModales.delete(modal);

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

  if (modal === elements.unavailabilityDetailModal) {
    etat.indisponibiliteSelectionnee = null;
    masquerFormulaireIndisponibiliteModal();
  }

  const modalRestante = obtenirModalOuverteAuPremierPlan();
  if (modalRestante) {
    focaliserPremierElementModal(modalRestante);
    return;
  }

  document.body.classList.remove("modal-open");

  if (etaitOuverte && elementEstVisibleDansModal(elementRetour)) {
    focaliserElementModal(elementRetour);
  }
}

function afficherErreur(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("hidden");
}

function masquerErreur(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.classList.add("hidden");
}

function afficherInfo(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("hidden");
}

function masquerInfo(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.classList.add("hidden");
}

function definirBadge(element, type, texte) {
  element.className = "status-badge";
  element.classList.add(`badge-${type}`);
  element.textContent = texte;
}

function afficherToast(message, type = "success", options = {}) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  if (options.title) {
    const titre = document.createElement("strong");
    titre.className = "toast-title";
    titre.textContent = options.title;

    const detail = document.createElement("span");
    detail.className = "toast-message";
    detail.textContent = message;

    toast.append(titre, detail);
  } else {
    toast.textContent = message;
  }

  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, Number(options.dureeMs) || 3600);
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
