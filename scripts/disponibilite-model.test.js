/*
 * Run only against an isolated test database, for example:
 *   $env:NODE_ENV = 'test'
 *   $env:DATABASE_PATH = 'C:\Temp\sp-disponibilite-test.db'
 *   node scripts/disponibilite-model.test.js
 */
const assert = require("assert/strict");

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolée.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

// Les validations DST doivent employer la référence centrale déployée, pas
// la préférence legacy ni le fuseau d'affichage du calendrier public.
process.env.CENTRAL_CALENDAR_TIMEZONE = "Europe/Paris";

const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  all,
  get,
  run,
} = require("../models/db");
const {
  TYPES_DISPONIBILITE,
  TYPES_EXCEPTION_DISPONIBILITE,
  JOURS_SEMAINE,
  listerReglesDisponibiliteIntervenant,
  listerReglesDisponibiliteActivesIntervenant,
  trouverRegleDisponibiliteParIdIntervenant,
  creerRegleDisponibilite,
  modifierRegleDisponibilite,
  supprimerRegleDisponibilite,
  listerExceptionsDisponibiliteIntervenant,
  trouverExceptionDisponibiliteParIdIntervenant,
  creerExceptionDisponibilite,
  modifierExceptionDisponibilite,
} = require("../models/disponibilite.model");
const { listerEntreesHistorique } = require("../models/historique.model");

async function assertRejects(action, code) {
  await assert.rejects(action, (error) => error?.code === code);
}

async function main() {
  await initialiserBaseDeDonnees();

  const handlerInsertion = await run(`
    INSERT INTO utilisateurs (
      nom, email, mot_de_passe, public_id, statut_compte, acces_active,
      session_version, doit_changer_mot_de_passe, tarif_horaire
    )
    VALUES ('Handler Disponibilité', 'handler-disponibilite@example.test', 'x',
      'HD-902', 'active', 1, 1, 0, 100)
  `);
  const professeurInsertion = await run(`
    INSERT INTO utilisateurs (
      nom, email, mot_de_passe, public_id, statut_compte, acces_active,
      session_version, doit_changer_mot_de_passe, tarif_horaire
    )
    VALUES ('Professeur Disponibilité', 'professeur-disponibilite@example.test', 'x',
      'PR-902', 'active', 1, 1, 0, 100)
  `);
  const handler = { id: handlerInsertion.id };
  const professeur = { id: professeurInsertion.id };
  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'handler', ?)",
    [handler.id, handler.id]
  );
  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'professeur', ?)",
    [professeur.id, handler.id]
  );
  await run(
    "INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par) VALUES (?, ?, 1, ?)",
    [handler.id, professeur.id, handler.id]
  );

  const colonnesHistorique = await all("PRAGMA table_info(historique_actions)");
  const nomsColonnesHistorique = new Set(colonnesHistorique.map((colonne) => colonne.name));
  assert.ok(nomsColonnesHistorique.has("handler_id"));
  assert.ok(nomsColonnesHistorique.has("intervenant_id"));

  const historiquesSansHandler = await get(
    "SELECT COUNT(*) AS total FROM historique_actions WHERE handler_id IS NULL"
  );
  assert.equal(Number(historiquesSansHandler.total), 0);
  const historique = await listerEntreesHistorique(500);
  assert.ok(
    historique.every((entree) => entree.integrite_valide === true),
    "L'ajout des colonnes de scope ne doit pas altérer la chaîne HMAC historique."
  );

  const recurrente = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.RECURRENTE,
    jourSemaine: JOURS_SEMAINE.LUNDI,
    heureDebut: "08:00",
    heureFin: "12:00",
  });
  assert.equal(recurrente.type, TYPES_DISPONIBILITE.RECURRENTE);
  assert.equal(Number(recurrente.jour_semaine), JOURS_SEMAINE.LUNDI);

  await assertRejects(
    () =>
      creerRegleDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        creePar: handler.id,
        type: TYPES_DISPONIBILITE.RECURRENTE,
        jourSemaine: JOURS_SEMAINE.MARDI,
        heureDebut: "08:15",
        heureFin: "09:15",
      }),
    "INVALID_TIME"
  );

  await assertRejects(
    () =>
      creerRegleDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        creePar: handler.id,
        type: TYPES_DISPONIBILITE.RECURRENTE,
        jourSemaine: JOURS_SEMAINE.MARDI,
        heureDebut: "07:30",
        heureFin: "08:00",
      }),
    "CALENDAR_RANGE_VIOLATION"
  );

  const regleBorneHistorique = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.RECURRENTE,
    jourSemaine: JOURS_SEMAINE.MARDI,
    heureDebut: "23:00",
    heureFin: "23:30",
  });
  assert.equal(
    regleBorneHistorique.heure_fin,
    "23:30",
    "La borne haute historique reste utilisable par defaut."
  );

  await assertRejects(
    () =>
      creerExceptionDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        creePar: handler.id,
        type: TYPES_EXCEPTION_DISPONIBILITE.DISPONIBLE,
        date: "2031-01-15",
        heureDebut: "07:30",
        heureFin: "08:00",
      }),
    "CALENDAR_RANGE_VIOLATION"
  );

  await run(
    "UPDATE utilisateurs SET calendar_start_time = '08:00', calendar_end_time = '00:00' WHERE id = ?",
    [handler.id]
  );
  const regleFinMinuit = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.PONCTUELLE,
    date: "2031-01-16",
    heureDebut: "23:30",
    heureFin: "00:00",
  });
  assert.equal(
    regleFinMinuit.heure_fin,
    "24:00",
    "Le modele stocke et restitue minuit comme borne finale 24:00."
  );

  const ponctuelle = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.PONCTUELLE,
    date: "2031-01-15",
    heureDebut: "13:00",
    heureFin: "16:00",
  });
  assert.equal(ponctuelle.date, "2031-01-15");

  const regles = await listerReglesDisponibiliteIntervenant(handler.id, handler.id, {
    dateDebut: "2031-01-01",
    dateFin: "2031-01-31",
  });
  assert.ok(regles.some((regle) => Number(regle.id) === Number(recurrente.id)));
  assert.ok(regles.some((regle) => Number(regle.id) === Number(ponctuelle.id)));

  const recurrenteDesactivee = await modifierRegleDisponibilite(recurrente.id, {
    handlerId: handler.id,
    intervenantId: handler.id,
    actif: false,
  });
  assert.equal(Number(recurrenteDesactivee.actif), 0);

  const reglesActives = await listerReglesDisponibiliteActivesIntervenant(
    handler.id,
    handler.id
  );
  assert.ok(!reglesActives.some((regle) => Number(regle.id) === Number(recurrente.id)));

  const exceptionLiee = await creerExceptionDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    disponibiliteId: ponctuelle.id,
    creePar: handler.id,
    type: TYPES_EXCEPTION_DISPONIBILITE.INDISPONIBLE,
    date: "2031-01-15",
    raison: "Congé",
  });
  assert.equal(Number(exceptionLiee.disponibilite_id), Number(ponctuelle.id));
  assert.equal(exceptionLiee.heure_debut, null);
  assert.equal(exceptionLiee.heure_fin, null);

  const exceptionModifiee = await modifierExceptionDisponibilite(exceptionLiee.id, {
    handlerId: handler.id,
    intervenantId: handler.id,
    type: TYPES_EXCEPTION_DISPONIBILITE.DISPONIBLE,
    heureDebut: "14:00",
    heureFin: "15:00",
  });
  assert.equal(exceptionModifiee.type, TYPES_EXCEPTION_DISPONIBILITE.DISPONIBLE);
  assert.equal(exceptionModifiee.heure_debut, "14:00");

  const exceptions = await listerExceptionsDisponibiliteIntervenant(handler.id, handler.id, {
    dateDebut: "2031-01-01",
    dateFin: "2031-01-31",
  });
  assert.ok(exceptions.some((exception) => Number(exception.id) === Number(exceptionLiee.id)));

  assert.equal(
    await trouverRegleDisponibiliteParIdIntervenant(ponctuelle.id, handler.id, professeur.id),
    null,
    "Une règle ne doit pas être lisible hors de son intervenant."
  );
  assert.equal(
    Number(
      (
        await supprimerRegleDisponibilite(ponctuelle.id, {
          handlerId: handler.id,
          intervenantId: professeur.id,
        })
      ).changes
    ),
    0,
    "Une règle ne doit pas être supprimable hors de son intervenant."
  );

  await assertRejects(
    () =>
      creerRegleDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        type: TYPES_DISPONIBILITE.RECURRENTE,
        date: "2031-01-15",
        heureDebut: "09:00",
        heureFin: "10:00",
      }),
    "INVALID_WEEKDAY"
  );

  await supprimerRegleDisponibilite(ponctuelle.id, {
    handlerId: handler.id,
    intervenantId: handler.id,
  });
  const exceptionApresSuppression = await trouverExceptionDisponibiliteParIdIntervenant(
    exceptionLiee.id,
    handler.id,
    handler.id
  );
  assert.equal(exceptionApresSuppression.disponibilite_id, null);

  // Les disponibilites datees doivent refuser une heure murale inexistante
  // au passage a l'heure d'ete. Une regle recurrente reste permise car elle
  // s'applique aussi a des dimanches sans transition ; le planning public
  // filtrera alors uniquement les creneaux sautes de cette date.
  await run(
    `
      UPDATE utilisateurs
      SET
        timezone = 'Africa/Casablanca',
        public_calendar_timezone = 'GMT+2',
        calendar_start_time = '01:00',
        calendar_end_time = '04:00'
      WHERE id = ?
    `,
    [handler.id]
  );
  await assertRejects(
    () =>
      creerRegleDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        creePar: handler.id,
        type: TYPES_DISPONIBILITE.PONCTUELLE,
        date: "2026-03-29",
        heureDebut: "02:00",
        heureFin: "02:30",
      }),
    "INVALID_CIVIL_TIME"
  );
  await assertRejects(
    () =>
      creerExceptionDisponibilite({
        handlerId: handler.id,
        intervenantId: handler.id,
        creePar: handler.id,
        type: TYPES_EXCEPTION_DISPONIBILITE.DISPONIBLE,
        date: "2026-03-29",
        heureDebut: "02:00",
        heureFin: "02:30",
      }),
    "INVALID_CIVIL_TIME"
  );
  const recurrenteTraversantDst = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.RECURRENTE,
    jourSemaine: JOURS_SEMAINE.DIMANCHE,
    heureDebut: "02:00",
    heureFin: "02:30",
  });
  assert.equal(recurrenteTraversantDst.heure_debut, "02:00");
  const ponctuelleAutomne = await creerRegleDisponibilite({
    handlerId: handler.id,
    intervenantId: handler.id,
    creePar: handler.id,
    type: TYPES_DISPONIBILITE.PONCTUELLE,
    date: "2026-10-25",
    heureDebut: "02:00",
    heureFin: "02:30",
  });
  assert.equal(
    ponctuelleAutomne.heure_fin,
    "02:30",
    "Une heure civile repetee a l'automne reste une disponibilite valide."
  );

  console.log("disponibilite model test: PASS");
}

main()
  .catch((error) => {
    console.error("disponibilite model test: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
