const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const uiPath = path.join(__dirname, "..", "public", "js", "ui.js");
const source = fs.readFileSync(uiPath, "utf8");
const stateStart = source.indexOf("const etat = {");
const stateEnd = source.indexOf("\n};", stateStart);

assert.notEqual(stateStart, -1, "L'état global de l'interface est introuvable.");
assert.notEqual(stateEnd, -1, "La fin de l'état global de l'interface est introuvable.");

const initialisationEtat = source.slice(stateStart, stateEnd);

// Les helpers de date utilisent le fuseau du calendrier lu dans `etat`. Les
// appeler pendant la construction de ce même objet crée une erreur TDZ et
// empêche tous les écouteurs du front d'être enregistrés après connexion.
assert.doesNotMatch(
  initialisationEtat,
  /obtenir(?:AnneeCourante|MoisCourant|DateLocale)Iso\s*\(/,
  "L'état ne doit pas appeler un helper qui dépend de `etat` pendant son initialisation."
);

for (const nom of ["afficherErreur", "masquerErreur", "afficherInfo", "masquerInfo"]) {
  const expression = new RegExp(
    `function ${nom}\\(element[^)]*\\) \\{\\s*if \\(!element\\) \\{\\s*return;`,
    "s"
  );
  assert.match(source, expression, `${nom} doit tolérer un élément optionnel.`);
}

const debutFiltreAujourdhui = source.indexOf("function seanceDoitEtreMasqueeDansAujourdhui");
const finFiltreAujourdhui = source.indexOf(
  "function utilisateurEstEnLectureSeule",
  debutFiltreAujourdhui
);

assert.notEqual(
  debutFiltreAujourdhui,
  -1,
  "Le filtre de confidentialité de la vue Aujourd'hui est introuvable."
);
assert.notEqual(
  finFiltreAujourdhui,
  -1,
  "La fin du filtre de confidentialité de la vue Aujourd'hui est introuvable."
);

const filtreAujourdhui = source.slice(debutFiltreAujourdhui, finFiltreAujourdhui);

// Les indisponibilités empêchent les nouvelles réservations ; elles ne doivent
// jamais effacer une séance existante de la liste Aujourd'hui. Un Handler
// charge les indisponibilités de toute son équipe, pas seulement celles de
// l'intervenant de chaque séance.
assert.doesNotMatch(
  filtreAujourdhui,
  /(?:estJourIntegralementIndisponible|trouverIndisponibiliteChevauchanteLocale)\s*\(/,
  "La vue Aujourd'hui ne doit pas masquer une séance à cause d'une indisponibilité."
);
assert.match(
  filtreAujourdhui,
  /return\s+seanceEstMasqueePourConfidentialite\(seance\);/,
  "La vue Aujourd'hui doit conserver uniquement la protection des séances explicitement confidentielles."
);

const debutAccesAujourdhui = source.indexOf("function utilisateurPeutVoirAujourdhui()");
const finAccesAujourdhui = source.indexOf(
  "function utilisateurPeutVoirIndisponibilites()",
  debutAccesAujourdhui
);
assert.notEqual(
  debutAccesAujourdhui,
  -1,
  "La règle d'accès à Aujourd'hui est introuvable."
);
assert.notEqual(
  finAccesAujourdhui,
  -1,
  "La fin de la règle d'accès à Aujourd'hui est introuvable."
);

const accesAujourdhui = source.slice(debutAccesAujourdhui, finAccesAujourdhui);
assert.match(
  accesAujourdhui,
  /utilisateurEstHandler\(\)\s*\|\|\s*utilisateurEstProfesseur\(\)/,
  "Un professeur authentifié doit toujours accéder à Aujourd'hui."
);
assert.doesNotMatch(
  accesAujourdhui,
  /peut_voir_aujourdhui/,
  "L'ancien drapeau peut_voir_aujourdhui ne doit plus masquer Aujourd'hui à un professeur."
);
assert.doesNotMatch(
  source,
  /const aujourdhui\s*=\s*creerCaseEquipe\(/,
  "La permission d'équipe Aujourd'hui ne doit plus être modifiable pour un professeur."
);

const debutSoumissionSeance = source.indexOf("async function gererSoumissionSeance(event)");
const finSoumissionSeance = source.indexOf(
  "function gererClicIndisponibilite",
  debutSoumissionSeance
);
assert.notEqual(debutSoumissionSeance, -1, "La soumission de séance est introuvable.");
assert.notEqual(finSoumissionSeance, -1, "La fin de la soumission de séance est introuvable.");

const soumissionSeance = source.slice(debutSoumissionSeance, finSoumissionSeance);
assert.match(
  soumissionSeance,
  /const intervenantId\s*=\s*obtenirIntervenantCibleSeance\(\);/,
  "La soumission doit résoudre l'intervenant réellement choisi."
);
assert.match(
  soumissionSeance,
  /donneesSeance\.intervenant_id\s*=\s*intervenantId;/,
  "Un Handler doit transmettre l'intervenant choisi au serveur."
);
assert.doesNotMatch(
  soumissionSeance,
  /compte:\s*recupererValeurSelectionnee\(elements\.compteCheckboxes\)/,
  "Le formulaire ne doit plus exposer ni transmettre le choix de compte historique."
);
assert.match(
  soumissionSeance,
  /trouverSeanceChevauchanteLocale\(\{[\s\S]*?intervenantId,/,
  "Le contrôle local de chevauchement doit être limité à l'intervenant choisi."
);
assert.match(
  soumissionSeance,
  /trouverIndisponibiliteChevauchanteLocale\(\{[\s\S]*?intervenantId,/,
  "Le contrôle local d'indisponibilité doit être limité à l'intervenant choisi."
);

const debutSelectionCreationSeance = source.indexOf(
  "function normaliserSelectionCreationSeance(selection = {})"
);
const debutCreationSeance = source.indexOf("function ouvrirFormulaireCreation(selection = {})");
const finCreationSeance = source.indexOf("function ouvrirFormulaireModification", debutCreationSeance);
assert.notEqual(
  debutSelectionCreationSeance,
  -1,
  "La normalisation de la sélection du calendrier est introuvable."
);
assert.notEqual(debutCreationSeance, -1, "L'ouverture du formulaire de séance est introuvable.");
assert.notEqual(finCreationSeance, -1, "La fin de l'ouverture du formulaire de séance est introuvable.");
const selectionCreationSeance = source.slice(debutSelectionCreationSeance, debutCreationSeance);
const creationSeance = source.slice(debutCreationSeance, finCreationSeance);
assert.match(
  selectionCreationSeance,
  /date:\s*date\s*\|\|\s*obtenirDateLocaleIso\(\)/,
  "Une nouvelle séance sans sélection doit utiliser la date du jour du calendrier central."
);
assert.match(
  selectionCreationSeance,
  /\[60,\s*90,\s*120\]\.includes\(dureeSelectionnee\)/,
  "Une sélection glissée doit reprendre les durées métier autorisées."
);
assert.match(
  creationSeance,
  /definirDureeSelectionnee\(selectionNormalisee\.duree\);[\s\S]*?definirHeureDebutSelectionnee\(selectionNormalisee\.heureDebut\);/,
  "Le formulaire doit préremplir durée et heure depuis le créneau sélectionné."
);
assert.match(
  creationSeance,
  /!utilisateurEstHandler\(\)/,
  "Une indisponibilité journée complète d'un professeur ne doit pas bloquer le Handler avant son choix d'intervenant."
);

const calendrierPath = path.join(__dirname, "..", "public", "js", "calendrier.js");
const calendrierSource = fs.readFileSync(calendrierPath, "utf8");
const seancesPath = path.join(__dirname, "..", "public", "js", "seances.js");
const seancesSource = fs.readFileSync(seancesPath, "utf8");
const vuePath = path.join(__dirname, "..", "views", "index.ejs");
const vueSource = fs.readFileSync(vuePath, "utf8");
const stylesPath = path.join(__dirname, "..", "public", "css", "style.css");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

// calendrier.js est servi comme module navigateur. Pour valider la règle de
// calcul sans DOM, on retire uniquement son marqueur d'export avant d'exposer
// les helpers de test déjà déclarés par le module.
const calendrierTestable = new Function(
  `${calendrierSource.replace(/^export /gm, "")}\nreturn __test__;`
)();
const calendrierSemaine = {
  view: {
    activeStart: new Date(2034, 5, 3),
    activeEnd: new Date(2034, 5, 4),
  },
};
const professeursDisponibilite = [
  { id: 71, nom: "Professeur A", public_id: "PR-A", acces_active: 1, statut_compte: "active" },
  { id: 72, nom: "Professeur B", public_id: "PR-B", acces_active: 1, statut_compte: "active" },
];
const indisponibilitesPartielles = calendrierTestable.creerEvenementsIndisponibiliteCollective(
  calendrierSemaine,
  {
    handlerId: 70,
    professeurs: professeursDisponibilite,
    indisponibilites: [
      {
        intervenant_id: 71,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "08:30",
        jour_complet: 0,
      },
    ],
    plageHoraire: { calendar_start_time: "08:00", calendar_end_time: "09:00" },
  }
);
assert.deepEqual(
  indisponibilitesPartielles,
  [],
  "Un créneau où un Professeur reste disponible doit demeurer vide dans le calendrier central."
);

const indisponibilitesCollectives = calendrierTestable.creerEvenementsIndisponibiliteCollective(
  calendrierSemaine,
  {
    handlerId: 70,
    professeurs: professeursDisponibilite,
    indisponibilites: [
      {
        intervenant_id: 71,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "09:00",
        jour_complet: 0,
      },
      {
        intervenant_id: 72,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "09:00",
        jour_complet: 0,
      },
    ],
    plageHoraire: { calendar_start_time: "08:00", calendar_end_time: "09:00" },
  }
);
assert.equal(
  indisponibilitesCollectives.length,
  1,
  "Les créneaux collectivement indisponibles consécutifs doivent former un seul fond continu."
);
assert.deepEqual(
  {
    start: indisponibilitesCollectives[0]?.start,
    end: indisponibilitesCollectives[0]?.end,
    display: indisponibilitesCollectives[0]?.display,
    type: indisponibilitesCollectives[0]?.extendedProps?.type,
  },
  {
    start: "2034-06-03T08:00",
    end: "2034-06-03T09:00",
    display: "background",
    type: "availability-unavailable",
  },
  "Le Dashboard doit marquer en fond uniquement les créneaux déclarés indisponibles par tous les Professeurs."
);

const indisponibilitesAvecSeanceHandler = calendrierTestable.creerEvenementsIndisponibiliteCollective(
  calendrierSemaine,
  {
    handlerId: 70,
    professeurs: professeursDisponibilite,
    indisponibilites: [
      {
        intervenant_id: 71,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "09:00",
        jour_complet: 0,
      },
      {
        intervenant_id: 72,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "09:00",
        jour_complet: 0,
      },
    ],
    seances: [
      {
        intervenant_id: 70,
        date: "2034-06-03",
        heure_debut: "08:00",
        heure_fin: "08:30",
        statut_seance: "planifiee",
      },
    ],
    plageHoraire: { calendar_start_time: "08:00", calendar_end_time: "09:00" },
  }
);
assert.deepEqual(
  indisponibilitesAvecSeanceHandler.map((evenement) => [evenement.start, evenement.end]),
  [["2034-06-03T08:30", "2034-06-03T09:00"]],
  "Une séance personnelle du Handler doit remplacer le fond indisponible seulement sur sa propre durée."
);
assert.deepEqual(
  calendrierTestable.creerEvenementsIndisponibiliteCollective(calendrierSemaine, {
    handlerId: 70,
    professeurs: [],
    indisponibilites: [],
    plageHoraire: { calendar_start_time: "08:00", calendar_end_time: "09:00" },
  }),
  [],
  "Sans Professeur rattaché, le calendrier central ne doit pas afficher une fausse indisponibilité collective."
);

const debutSectionDashboard = vueSource.indexOf('<section id="dashboard-section"');
const finSectionDashboard = vueSource.indexOf('<section id="indisponibilites-section"', debutSectionDashboard);
assert.notEqual(debutSectionDashboard, -1, "La section Dashboard est introuvable.");
assert.notEqual(finSectionDashboard, -1, "La fin de la section Dashboard est introuvable.");
const sectionDashboard = vueSource.slice(debutSectionDashboard, finSectionDashboard);
assert.match(sectionDashboard, /id="calendar"/, "Le Dashboard doit contenir son calendrier central unique.");
assert.doesNotMatch(
  sectionDashboard,
  /(?:central-calendar-filter|data-central-calendar-view|central-calendar-availability-legend)/,
  "Le Dashboard unifié ne doit plus proposer de filtre ou de seconde vue de disponibilités."
);
assert.match(
  vueSource,
  /id="seance-intervenant"/,
  "Le formulaire de séance doit permettre au Handler de choisir le Réalisateur."
);
assert.match(
  vueSource,
  /id="seance-intervenant-field"[\s\S]*?<span>Réalisateur<\/span>/,
  "Le sélecteur Handler doit porter le libellé Réalisateur."
);
assert.doesNotMatch(
  vueSource,
  /id="compte-options"/,
  "Le formulaire de séance ne doit plus afficher le choix Compte hérité."
);
assert.match(
  source,
  /onSlotClick:\s*gererClicCreneauCalendrierSeance,[\s\S]*?onSelect:\s*gererSelectionCalendrierSeance,[\s\S]*?onEventClick:\s*ouvrirDetailsOuChoixSeance/,
  "Le Dashboard doit créer au clic/glissement et résoudre les séances qui se chevauchent au clic."
);
assert.match(
  calendrierSource,
  /export function creerEvenementsIndisponibiliteCollective\([\s\S]*?if \(professeurs\.length === 0\) \{\s*return \[\];/,
  "Sans Professeur actif, le calendrier central ne doit pas afficher une fausse indisponibilité collective."
);
assert.match(
  calendrierSource,
  /tousProfesseursIndisponibles = professeurs\.every\([\s\S]*?indisponibiliteChevaucheCreneauProfesseur/,
  "Un fond indisponible doit exiger une indisponibilité déclarée pour chaque Professeur."
);
assert.match(
  calendrierSource,
  /seanceHandlerCouvreCreneau[\s\S]*?tousProfesseursIndisponibles && !seanceHandlerCouvreCreneau/,
  "Une séance du Handler doit remplacer le fond collectif indisponible sur le créneau concerné."
);
assert.match(
  source,
  /function construireDonneesDisponibiliteCalendrierCentral\(\)[\s\S]*?professeurs: obtenirProfesseursCalendrierCentral\(\)[\s\S]*?handlerId: Number\(etat\.utilisateur\?\.id \|\| 0\) \|\| null/,
  "Le rendu central doit transmettre les Professeurs, les indisponibilités et le Handler au calcul de fond."
);
assert.match(
  calendrierSource,
  /(?:if|else if) \(vue === "central"\) \{[\s\S]*?creerEvenementsIndisponibiliteCollective[\s\S]*?\.\.\.seances\.map\(transformerSeanceEnEvenement\)/,
  "Le calendrier central doit afficher, dans la même grille, les fonds indisponibles et les séances."
);
assert.match(
  calendrierSource,
  /slotEventOverlap:\s*true/,
  "Les séances qui se chevauchent doivent partager la largeur du même créneau."
);
assert.match(
  source,
  /function obtenirPasCreneauCalendrierCentral\(\)\s*\{\s*return 30;/,
  "Le calendrier central unifié doit conserver ses créneaux de trente minutes."
);
assert.match(
  source,
  /vue: "central",[\s\S]*?disponibilites: construireDonneesDisponibiliteCalendrierCentral\(\)/,
  "Le rafraîchissement Handler doit employer la vue centrale unifiée."
);
assert.match(
  calendrierSource,
  /classNames: \["calendar-availability-unavailable"\]/,
  "Une indisponibilité collective doit disposer de sa présentation dédiée."
);
assert.match(
  source,
  /function appliquerCouleursEquipeAuxSeancesCalendrier\(seances = \[\]\)[\s\S]*?intervenant_couleur_calendrier: couleur/,
  "Les séances du Handler doivent reprendre la couleur attribuée à leur Réalisateur."
);
assert.match(
  stylesSource,
  /calendar-availability-unavailable/,
  "Les créneaux collectivement indisponibles doivent être stylés dans le calendrier central."
);
assert.match(
  source,
  /function ouvrirDetailsOuChoixSeance\(seance\)[\s\S]*?obtenirSeancesChevauchantesVisibles\(seance\)[\s\S]*?seancesChevauchantes\.length <= 1[\s\S]*?ouvrirChoixSeancesChevauchantes\(seancesChevauchantes\)/,
  "Un clic sur plusieurs séances qui se chevauchent doit ouvrir un choix avant le détail."
);
assert.match(
  vueSource,
  /id="seance-choice-modal"[\s\S]*?id="seance-choice-list"/,
  "Le choix entre les séances concurrentes doit disposer de sa propre modale."
);

const debutEtapesFormulaireSeance = source.indexOf("function mettreAJourEtapesFormulaireSeance()");
const finEtapesFormulaireSeance = source.indexOf(
  "function masquerFormulairesCycleCompte",
  debutEtapesFormulaireSeance
);
assert.notEqual(
  debutEtapesFormulaireSeance,
  -1,
  "La progression guidée du formulaire de séance est introuvable."
);
assert.notEqual(
  finEtapesFormulaireSeance,
  -1,
  "La fin de la progression guidée du formulaire de séance est introuvable."
);
const etapesFormulaireSeance = source.slice(
  debutEtapesFormulaireSeance,
  finEtapesFormulaireSeance
);
assert.match(
  etapesFormulaireSeance,
  /const autoriserDate = modifiable;[\s\S]*?const autoriserHoraire = modifiable;/,
  "La date doit rester bloquée tant que l'étudiant et la matière ne sont pas renseignés."
);
assert.match(
  etapesFormulaireSeance,
  /autoriserRealisateur = modifiable && creneauValide && horaireConfirme/,
  "Le formulaire doit activer successivement date, horaire puis Réalisateur."
);
assert.match(
  etapesFormulaireSeance,
  /definirChampsSeanceDesactives\(\[elements\.date\], !autoriserDate\)[\s\S]*?\[elements\.heureDebutHourSelect, elements\.heureDebutMinuteSelect\],[\s\S]*?!autoriserHoraire[\s\S]*?elements\.seanceIntervenant\.disabled = !autoriserRealisateur/,
  "Les contrôles du formulaire doivent réellement suivre les étapes de saisie."
);
assert.match(
  source,
  /function obtenirIntervenantsEligiblesPourCreneauSeance\(\)[\s\S]*?const creneau = obtenirCreneauSelectionnePourIntervenants\(\)[\s\S]*?return intervenants\.filter\([\s\S]*?intervenantEstDisponiblePourCreneau/,
  "La liste Réalisateur doit être filtrée selon le créneau choisi."
);
assert.match(
  source,
  /function intervenantEstDisponiblePourCreneau\([\s\S]*?const conflitSeance = trouverSeanceChevauchanteLocale[\s\S]*?if \(id === idHandler\) \{\s*return true;/,
  "Le Handler doit pouvoir se choisir sur un créneau collectif indisponible, sans contourner un conflit avec sa propre séance."
);
assert.match(
  source,
  /function rendreOptionsIntervenantsSeance\(\)[\s\S]*?const intervenants = obtenirIntervenantsEligiblesPourCreneauSeance\(\)/,
  "Le sélecteur Réalisateur ne doit afficher que les intervenants éligibles."
);

const debutAccesIndisponibilites = source.indexOf(
  "function utilisateurPeutVoirIndisponibilites()"
);
const finAccesIndisponibilites = source.indexOf(
  "function mettreAJourEspaceIndisponibilites()",
  debutAccesIndisponibilites
);
assert.notEqual(debutAccesIndisponibilites, -1, "The unavailability access rule is missing.");
assert.notEqual(finAccesIndisponibilites, -1, "The unavailability access rule is incomplete.");
const accesIndisponibilites = source.slice(
  debutAccesIndisponibilites,
  finAccesIndisponibilites
);
assert.match(
  accesIndisponibilites,
  /utilisateurEstProfesseur\(\)\s*&&\s*!utilisateurEstHandler\(\)\s*&&\s*!utilisateurDoitChangerMotDePasse\(\)/,
  "Only a Professor without the Handler role may open or manage personal unavailability."
);
assert.match(
  source,
  /section === "indisponibilites" && !utilisateurPeutVoirIndisponibilites\(\)/,
  "A direct request for the unavailability section must be redirected when access is denied."
);
assert.match(
  source,
  /function comptePeutGererIndisponibilitesAdministration\(compte\)[\s\S]*?roles\.includes\("professeur"\) && !roles\.includes\("handler"\)/,
  "The administration selector must never offer the unavailability toggle to a Handler."
);
assert.match(
  source,
  /elements\.adminUnavailabilityAccessUserId,[\s\S]*?\.filter\(\s*comptePeutGererIndisponibilitesAdministration\s*\)/,
  "The administration unavailability selector must contain only eligible Professors."
);
assert.match(
  source,
  /async function chargerIndisponibilites\(\)[\s\S]*?utilisateurEstHandler\(\)\s*\?\s*await recupererIndisponibilitesCalendrierCentral\(\)\s*:\s*await recupererIndisponibilites\(\)/,
  "The Handler dashboard must use the read-only team projection instead of the personal unavailability API."
);
assert.match(
  soumissionSeance,
  /erreurIndisponibiliteCollective\(erreur\)[\s\S]*?afficherErreur\(\s*elements\.seanceFormError/,
  "Le refus collectif du serveur doit rester une erreur de formulaire."
);
assert.match(
  soumissionSeance,
  /conflitIndisponibilite[\s\S]*?afficherErreur\([\s\S]*?construireMessageIndisponibiliteClient\(conflitIndisponibilite\)/,
  "Une indisponibilite de Professeur doit produire une erreur normale, sans creer de proposition."
);
assert.doesNotMatch(
  source,
  /PropositionSeance|propositionsSeances|propositionEditionId|onPropositionClick|\/api\/propositions-seances/,
  "L'interface ne doit plus conserver de workflow de propositions retire."
);
assert.doesNotMatch(
  seancesSource,
  /\/api\/propositions-seances/,
  "Le client API ne doit plus appeler le flux de propositions retire."
);
assert.doesNotMatch(
  calendrierSource,
  /transformerPropositionEnEvenement|onPropositionClick|typeEvenement === "proposition"/,
  "Le calendrier ne doit plus rendre ou traiter des propositions retirees."
);
assert.doesNotMatch(
  stylesSource,
  /proposition-event|proposal-item|proposal-inline|toast\.proposal|calendar-mobile-(?:month|week)-proposition/,
  "Les styles du workflow de propositions retire doivent etre supprimes."
);
const debutStatistiques = source.indexOf("function mettreAJourStatistiques()");
const finStatistiques = source.indexOf("function obtenirComptesAdministration", debutStatistiques);
assert.notEqual(debutStatistiques, -1, "Le rendu des statistiques est introuvable.");
assert.notEqual(finStatistiques, -1, "La fin du rendu statistiques est introuvable.");
const statistiquesSource = source.slice(debutStatistiques, finStatistiques);
assert.match(
  statistiquesSource,
  /seances_payantes[\s\S]*?seances_gratuites[\s\S]*?seances_non_faites/,
  "Les statistiques doivent distinguer les séances payantes, gratuites et non faites."
);
assert.doesNotMatch(
  statistiquesSource,
  /seances_reportees|seances_annulees/,
  "Le tableau Statistiques ne doit plus présenter Reportées et Annulées séparément."
);
assert.match(
  statistiquesSource,
  /"Payantes"[\s\S]*?"Gratuites"[\s\S]*?"Non faites"/,
  "Les colonnes statistiques doivent porter les libellés métier demandés."
);

const debutSectionStatistiques = vueSource.indexOf('<section id="statistiques-section"');
const finSectionStatistiques = vueSource.indexOf('<section id="calendrier-section"', debutSectionStatistiques);
assert.notEqual(debutSectionStatistiques, -1, "La section Statistiques est introuvable.");
assert.notEqual(finSectionStatistiques, -1, "La fin de la section Statistiques est introuvable.");
const sectionStatistiques = vueSource.slice(debutSectionStatistiques, finSectionStatistiques);
assert.match(
  sectionStatistiques,
  /id="stats-filter-form"[\s\S]*?id="stats-date-start"[\s\S]*?id="stats-date-end"[\s\S]*?id="stats-global-toggle"[\s\S]*?Statistiques globales[\s\S]*?id="stats-calculate-button"[\s\S]*?Calculer/,
  "Les Statistiques doivent demander une période ou le mode global avant le calcul."
);
assert.match(
  sectionStatistiques,
  /id="stats-results"[\s\S]*?class="stats-results hidden"[\s\S]*?hidden[\s\S]*?inert/,
  "Les résultats Statistiques doivent être masqués avant le premier calcul."
);
assert.doesNotMatch(sectionStatistiques, /Reportées|Annulées/);
assert.match(
  source,
  /async function gererCalculStatistiques\(event\)[\s\S]*?recupererStatistiques\([\s\S]*?globale[\s\S]*?\{ globale: true \}/,
  "Le calcul Statistiques doit appeler l'API opérationnelle avec le mode global scoped."
);
assert.match(
  source,
  /function mettreAJourResume\(\)[\s\S]*?mettreAJourVueAujourdhui\(\);[\s\S]*?masquerResultatsStatistiques\(\);/,
  "Les mises à jour automatiques doivent conserver Aujourd'hui sans recalculer les Statistiques."
);
assert.match(
  source,
  /function synchroniserModeGlobalStatistiques\(\)[\s\S]*?champ\.disabled = modeGlobal/,
  "La case Statistiques globales doit désactiver les deux champs de période."
);

const debutSectionMonetisation = vueSource.indexOf('<section id="monetisation-section"');
const finSectionMonetisation = vueSource.indexOf('<section id="historique-section"', debutSectionMonetisation);
assert.notEqual(debutSectionMonetisation, -1, "La section Monétisation est introuvable.");
assert.notEqual(finSectionMonetisation, -1, "La fin de la section Monétisation est introuvable.");
const sectionMonetisation = vueSource.slice(debutSectionMonetisation, finSectionMonetisation);
assert.match(
  sectionMonetisation,
  /id="monetisation-filter-form"[\s\S]*?Date de début[\s\S]*?Date de fin[\s\S]*?id="monetisation-global-toggle"[\s\S]*?Monétisation globale[\s\S]*?Réalisateurs/,
  "La Monétisation doit fournir une période ou le mode global, avec une sélection multiple de réalisateurs."
);
assert.match(
  sectionMonetisation,
  /<details[\s\S]*?id="monetisation-report-accounts-dropdown"[\s\S]*?<div[\s\S]*?id="monetisation-report-accounts"[\s\S]*?role="group"/,
  "Les réalisateurs doivent être choisis dans une liste déroulante accessible."
);
assert.doesNotMatch(
  sectionMonetisation,
  /<select[\s\S]*?id="monetisation-report-accounts"/,
  "La liste déroulante ne doit pas imposer le raccourci Ctrl/⌘ d'un select multiple natif."
);
assert.match(sectionMonetisation, /id="monetisation-calculate-button"[\s\S]*?Calculer/);
assert.match(sectionMonetisation, /id="monetisation-details"/);
assert.match(
  sectionMonetisation,
  /id="monetisation-results"[\s\S]*?class="monetisation-results hidden"[\s\S]*?hidden[\s\S]*?inert/,
  "Les résultats et le relevé doivent être masqués avant le premier calcul."
);
assert.match(
  sectionMonetisation,
  /id="monetisation-download-statement-button"[\s\S]*?hidden[\s\S]*?disabled/,
  "Le bouton de téléchargement doit être masqué et désactivé avant le calcul."
);
assert(
  sectionMonetisation.indexOf('id="monetisation-download-statement-button"') >
    sectionMonetisation.indexOf('id="monetisation-details"'),
  "Le bouton de téléchargement doit rester après les détails de monétisation."
);
assert.match(
  source,
  /function afficherSelectionIntervenantsMonetisation\(\)[\s\S]*?document\.createElement\("input"\)[\s\S]*?caseACocher\.type = "checkbox"[\s\S]*?caseACocher\.addEventListener\("change"[\s\S]*?texte\.textContent = intervenant\.nom/,
  "La liste déroulante doit permettre la sélection multiple par clic et n'afficher que les noms des réalisateurs."
);
assert.match(
  source,
  /function mettreAJourLibellesSelectionIntervenantsMonetisation\([\s\S]*?monetisationReportAccountsSummary\.textContent/,
  "Le compteur de réalisateurs doit se mettre à jour après chaque sélection."
);
assert.match(
  source,
  /function mettreAJourVisibiliteResultatsMonetisation\(\)[\s\S]*?monetisationResultatsVisibles[\s\S]*?monetisationResults.*classList\.toggle\("hidden"[\s\S]*?monetisationResults\.hidden[\s\S]*?monetisationDownloadStatementButton\.hidden/,
  "La visibilité des résultats de monétisation doit être pilotée par un état explicite."
);
assert.match(
  source,
  /async function gererCalculMonetisation\(event\)[\s\S]*?const calculEffectue = await chargerMonetisationSiAutorise\(\{ calculExplicite: true \}\);[\s\S]*?monetisationResultatsVisibles = true/,
  "Les résultats ne doivent devenir visibles qu'après un calcul réussi."
);
assert.match(
  source,
  /async function chargerMonetisationSiAutorise\(\{ calculExplicite = false \} = \{\}\)[\s\S]*?if \(!calculExplicite\) \{[\s\S]*?masquerResultatsMonetisation\(\);/,
  "Un chargement automatique de monétisation doit masquer les résultats précédents."
);
assert.match(
  source,
  /function synchroniserModeGlobalMonetisation\(\)[\s\S]*?champ\.disabled = modeGlobal[\s\S]*?champ\.required = !modeGlobal/,
  "La case Monétisation globale doit désactiver les deux dates."
);
assert.match(
  source,
  /async function gererCalculMonetisation\(event\)[\s\S]*?const globale = Boolean\(elements\.monetisationGlobalToggle\?\.checked\)[\s\S]*?if \(!globale\)[\s\S]*?etat\.monetisationGlobales = globale/,
  "Le calcul global ne doit pas valider ni transmettre une période personnalisée."
);
assert.match(
  source,
  /async function chargerMonetisationSiAutorise\(\{ calculExplicite = false \} = \{\}\)[\s\S]*?etat\.monetisationGlobales[\s\S]*?mode: "global"[\s\S]*?intervenant_ids: etat\.monetisationIntervenantsSelectionnes[\s\S]*?: \{[\s\S]*?du: etat\.monetisationDateDebut[\s\S]*?au: etat\.monetisationDateFin/,
  "Le calcul global doit envoyer seulement le mode et les realisateurs, sans dates."
);
assert.match(
  source,
  /async function gererTelechargementReleveMonetisation\(\)[\s\S]*?const globale = etat\.monetisationGlobales === true[\s\S]*?mode: "global"[\s\S]*?intervenant_ids: intervenantsSelectionnes/,
  "Le relevé PDF doit reprendre le mode global et les réalisateurs sélectionnés."
);
assert.match(
  source,
  /caseACocher\.addEventListener\("change", \(\) => \{[\s\S]*?masquerResultatsMonetisation\(\);/,
  "Chaque case du sélecteur de réalisateurs doit masquer les résultats devenus périmés."
);

const modalesAccessibles = [
  ["audit-log-modal", "audit-log-modal-title"],
  ["history-detail-modal", "history-detail-modal-title"],
  ["seance-modal", "seance-modal-title"],
  ["seance-choice-modal", "seance-choice-modal-title"],
  ["detail-modal", "detail-title"],
  ["unavailability-detail-modal", "unavailability-detail-title"],
];

for (const [modalId, titreId] of modalesAccessibles) {
  const indexModal = vueSource.indexOf(`id="${modalId}"`);
  const debutBalise = vueSource.lastIndexOf("<div", indexModal);
  const finBalise = vueSource.indexOf(">", indexModal);
  const baliseModal = vueSource.slice(debutBalise, finBalise + 1);

  assert.notEqual(indexModal, -1, `La modale ${modalId} est introuvable.`);
  assert.match(baliseModal, /role="dialog"/, `${modalId} doit annoncer un dialogue.`);
  assert.match(baliseModal, /aria-modal="true"/, `${modalId} doit être modal.`);
  assert.match(
    baliseModal,
    new RegExp(`aria-labelledby="${titreId}"`),
    `${modalId} doit être reliée à son titre.`
  );
  assert.match(baliseModal, /tabindex="-1"/, `${modalId} doit pouvoir recevoir le focus.`);
  assert.match(
    vueSource,
    new RegExp(`<h3 id="${titreId}">`),
    `Le titre ${titreId} doit exister.`
  );
  const finContenuModal = vueSource.indexOf("\n    <div", finBalise + 1);
  const contenuModal = vueSource.slice(finBalise + 1, finContenuModal === -1 ? undefined : finContenuModal);
  assert.match(
    contenuModal,
    new RegExp(
      `<button[\\s\\S]*?data-close-modal="${modalId}"[\\s\\S]*?aria-label="Fermer"`
    ),
    `${modalId} doit fournir un libellé accessible à son bouton de fermeture.`
  );
}

const debutAccessibiliteModales = source.indexOf("function obtenirModalesOuvertes()");
const finAccessibiliteModales = source.indexOf(
  "function afficherErreur",
  debutAccessibiliteModales
);
assert.notEqual(
  debutAccessibiliteModales,
  -1,
  "Les helpers d'accessibilité des modales sont introuvables."
);
assert.notEqual(
  finAccessibiliteModales,
  -1,
  "La fin des helpers d'accessibilité des modales est introuvable."
);
const accessibiliteModales = source.slice(debutAccessibiliteModales, finAccessibiliteModales);

assert.match(
  source,
  /document\.addEventListener\("keydown", gererNavigationClavierModales\);/,
  "Les raccourcis clavier des modales doivent être enregistrés."
);
assert.match(
  accessibiliteModales,
  /event\.key === "Escape"[\s\S]*?fermerModal\(modal\);/,
  "Échap doit fermer la modale active."
);
assert.match(
  accessibiliteModales,
  /event\.key !== "Tab"[\s\S]*?const focusables = obtenirElementsFocusablesModal\(modal\);/,
  "Tab doit être géré dans la modale active."
);
assert.match(
  accessibiliteModales,
  /focaliserElementModal\(dernierElement\)[\s\S]*?focaliserElementModal\(premierElement\)/,
  "Le focus doit boucler entre le premier et le dernier contrôle de la modale."
);
assert.match(
  accessibiliteModales,
  /retoursFocusDesModales\.set\([\s\S]*?retoursFocusDesModales\.delete\(modal\)[\s\S]*?focaliserElementModal\(elementRetour\)/,
  "La fermeture doit restaurer le focus sur le déclencheur."
);

console.log("Bootstrap UI: l'état ne déclenche pas de TDZ et les retours UI sont sûrs.");
