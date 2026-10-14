const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("public/js/ui.js", "utf8");
function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  const start = match.index;
  const next = /\n(?:async )?function /g;
  next.lastIndex = start + match[0].length;
  return source.slice(start, next.exec(source)?.index ?? source.length);
}
(async () => {
  const session = { id: 9, handler_id: 2, intervenant_id: 4, etudiant: "Élève", parent: "Parent",
    matiere: "Maths", est_essai: 1, duree_minutes: 90, date: "2034-06-05", heure_debut: "10:00" };
  let desktop = true, mobileForm = 0, requests = [], options;
  const context = {
    etat: { sectionActive: "dashboard", seanceSelectionnee: session, seances: [session],
      calendrier: { getEvents: () => [], }, copieFantomeEnregistrementEnCours: false },
    elements: { calendar: {}, detailModal: {} },
    window: { matchMedia: () => ({ matches: desktop }) }, performance: { now: () => 100 },
    commencerDuplicationFantome: value => { options = value; return { annuler() { options.terminer(); } }; },
    peutDeplacerSeanceCalendrier: () => true,
    fermerMenusCalendrier() {}, fermerModal() {}, ouvrirFormulaireDuplication: () => mobileForm++,
    convertirHeureCalendrierClientEnMinutes: h => { const [hours, minutes] = h.split(":").map(Number); return hours * 60 + minutes; },
    obtenirBornesCalendrierClient: () => ({ debut: 480, fin: 1410 }),
    trouverSeanceConfidentielleChevauchanteLocale: () => false,
    trouverSeanceChevauchanteLocale: () => false,
    estJourIntegralementIndisponible: () => false,
    trouverIndisponibiliteChevauchanteLocale: () => false,
    ajouterSeance: async payload => { requests.push(payload); return { ...payload, id: 10 }; },
    rafraichirEvenementsCalendrier() {}, mettreAJourResume() {}, afficherToast() {},
    chargerSeances: async () => {}, chargerHistorique: async () => {}, chargerMonetisationSiAutorise: async () => {},
    gererDeconnexion: async () => {},
  };
  vm.createContext(context);
  vm.runInContext(["dupliquerSeanceDepuisDashboard", "verifierDestinationCopieFantome", "enregistrerCopieFantome"].map(extract).join("\n"), context);
  context.dupliquerSeanceDepuisDashboard();
  assert.equal(requests.length, 0, "Aucune écriture avant de poser");
  assert.equal(mobileForm, 0);
  assert.equal(options.verifier({ date: "2034-06-06", heure_debut: "12:30", heure_fin: "14:00" }), "");
  assert.match(options.verifier({ date: "2034-06-06", heure_debut: "23:00", heure_fin: "24:30" }), /dépasse/);
  context.trouverSeanceChevauchanteLocale = () => true;
  assert.match(options.verifier({ date: "2034-06-06", heure_debut: "12:30", heure_fin: "14:00" }), /déjà une séance/);
  context.trouverSeanceChevauchanteLocale = () => false;
  context.trouverIndisponibiliteChevauchanteLocale = () => true;
  assert.match(options.verifier({ date: "2034-06-06", heure_debut: "12:30", heure_fin: "14:00" }), /indisponible/);
  context.trouverIndisponibiliteChevauchanteLocale = () => false;
  const ghost = context.etat.duplicationFantome;
  ghost.annuler();
  assert.equal(requests.length, 0);
  assert.equal(context.etat.duplicationFantome, null);
  context.dupliquerSeanceDepuisDashboard();
  options.terminer();
  await options.confirmer({ date: "2034-06-06", heure_debut: "12:30" });
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ handler_id: 2, intervenant_id: 4,
    etudiant: "Élève", parent: "Parent", matiere: "Maths", est_essai: "1", duree_minutes: 90,
    date: "2034-06-06", heure_debut: "12:30", statut_seance: "planifiee", nombre_semaines: 1 }]);
  assert.equal(context.etat.copieFantomeEnregistrementEnCours, false);
  context.ajouterSeance = async () => { throw Object.assign(new Error("Conflit serveur"), { status: 400 }); };
  await context.enregistrerCopieFantome(session, { date: "2034-06-07", heure_debut: "12:30" });
  assert.equal(context.etat.seances.length, 2, "Un refus serveur n'ajoute aucune copie locale");
  assert.equal(context.etat.copieFantomeEnregistrementEnCours, false);
  desktop = false;
  context.dupliquerSeanceDepuisDashboard();
  assert.equal(mobileForm, 1, "Le téléphone conserve la duplication par formulaire");
  context.peutDeplacerSeanceCalendrier = () => false;
  desktop = true;
  context.dupliquerSeanceDepuisDashboard();
  assert.equal(requests.length, 1, "Pas de copie non autorisée");
  console.log("session duplicate ghost flow: PASS (scope, identity, duration, availability, no early write, mobile fallback)");
})().catch(error => { console.error(error); process.exitCode = 1; });
