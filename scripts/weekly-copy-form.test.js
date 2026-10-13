const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/ui.js', 'utf8');
const extract = name => source.slice(source.indexOf(`function ${name}(`), source.indexOf('\nfunction ', source.indexOf(`function ${name}(`) + 1));
const element = () => ({ value: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, focus() {}, reset() {}, querySelector() { return element(); } });
const elements = new Proxy({}, { get: (target, key) => target[key] ||= element() });
const fields = { 'duplicate-weeks': element(), 'duplicate-weeks-field': element(), 'duplicate-summary': element() };
const context = {
  elements, document: { getElementById: id => fields[id] },
  etat: { sectionActive: 'dashboard', seanceSelectionnee: { date: '2026-12-29', heure_debut: '16:00', etudiant: 'Test', duree_minutes: 60, intervenant_id: 1 } },
  seanceEstMasqueePourConfidentialite: () => false, utilisateurPeutModifierDonnees: () => true,
  obtenirMatieresDisponibles: () => [], obtenirValeurCatalogueActiveOuDefaut: () => 'Maths', obtenirMatiereParDefaut: () => 'Maths',
  definirHeureDebutSelectionnee: value => { elements.heureDebut.value = value; },
};
for (const name of ['fermerModal', 'masquerErreur', 'definirProgressionCreationSeance', 'rendreOptionsCatalogueSeance', 'rendreOptionsEquipesSeance', 'rendreOptionsIntervenantsSeance', 'configurerOptionsStatut', 'definirSousTitreModalSeance', 'definirValeurSelectionnee', 'definirDureeSelectionnee', 'definirIntervenantSeanceSelectionne', 'mettreAJourHeureFinCalculee', 'mettreAJourEtapesFormulaireSeance', 'ouvrirModal', 'rendreRecapitulatifDuplicationSeance']) context[name] = () => {};
vm.createContext(context);
vm.runInContext(extract('mettreAJourVisibiliteStatutSeance') + '\n' + extract('ouvrirFormulaireDuplication'), context);
context.ouvrirFormulaireDuplication();
assert.equal(elements.date.value, '2027-01-05');
assert.equal(elements.heureDebut.value, '16:00');
assert.equal(fields['duplicate-weeks'].value, '1');
assert.equal(elements.seanceForm.dataset.duplication, 'true');
assert.equal(context.etat.seanceSourceDuplication.etudiant, 'Test');
fields['duplicate-weeks'].value = '3';
context.mettreAJourVisibiliteStatutSeance('creation');
assert.equal(elements.seanceForm.dataset.duplication, 'false');
assert.equal(context.etat.seanceSourceDuplication, null);
assert.equal(fields['duplicate-weeks'].value, '1');
console.log('weekly copy form test: PASS');
