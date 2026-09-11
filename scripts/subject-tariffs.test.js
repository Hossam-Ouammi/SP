/*
 * Regression coverage for Handler-scoped, versioned subject tariffs.
 *
 * This test owns its temporary SQLite database and exercises models directly:
 * no HTTP server, browser state, or deployment database is involved.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "gestion-seances-subject-tariffs-")
);
const databasePath = path.join(temporaryDirectory, "subject-tariffs.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.SEED_DEMO_DATA = "";
process.env.CENTRAL_CALENDAR_TIMEZONE = "Africa/Casablanca";
delete process.env.INITIAL_SUPERADMIN_NAME;
delete process.env.INITIAL_SUPERADMIN_EMAIL;
delete process.env.INITIAL_SUPERADMIN_PASSWORD;

const {
  initialiserBaseDeDonnees,
  executerTransactionImmediate,
  fermerBaseDeDonnees,
  all,
  get,
  run,
} = require("../models/db");
const { creerSeance } = require("../models/seance.model");
const {
  ajouterMatiereHandler,
  archiverMatiereHandler,
  listerMatieresHandler,
  listerGrilleTarificationHandler,
  mettreAJourTarifsMatieresHandler,
  obtenirTarifHorairePourSeance,
  trouverMatiereHandlerParId,
} = require("../models/tarification-matieres.model");
const migrationNormalisationMatieres = require("../models/migrations/2026090902-normalize-handler-subject-keys");

async function creerUtilisateur({ nom, email, publicId, role }) {
  const resultat = await run(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, statut_compte, acces_active,
        session_version, doit_changer_mot_de_passe, tarif_horaire
      )
      VALUES (?, ?, 'test-password-hash', ?, 'active', 1, 1, 0, 0)
    `,
    [nom, email, publicId]
  );

  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, ?, ?)",
    [resultat.id, role, resultat.id]
  );

  return Number(resultat.id);
}

async function rattacherProfesseur(handlerId, professeurId) {
  await run(
    `
      INSERT INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par)
      VALUES (?, ?, 1, ?)
    `,
    [handlerId, professeurId, handlerId]
  );
}

async function creerSeanceAvecSnapshot({
  handlerId,
  intervenantId,
  matiere,
  date,
  statut,
  tarifHoraire,
  etudiant,
}) {
  return creerSeance({
    titre: `Tarif - ${etudiant}`,
    etudiant,
    parent: "",
    matiere,
    compte: "Réalisation test",
    est_essai: 0,
    date,
    heure_debut: "10:00",
    heure_fin: "11:00",
    duree_minutes: 60,
    statut_seance: statut,
    prix: 0,
    statut_paiement: "non_payee",
    description: "Regression tariff snapshot",
    cree_par: handlerId,
    modifie_par: handlerId,
    utilisateur_id: handlerId,
    handler_id: handlerId,
    intervenant_id: intervenantId,
    tarif_horaire_applique: tarifHoraire,
  });
}

async function verifierMigrationNormalisationAccents({ handlerId }) {
  const libelleAccentue = "\u00C9conomie avanc\u00E9e";
  const cleAttendue = "\u00E9conomie avanc\u00E9e";
  const matiereLegacy = await run(
    `
      INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
      VALUES (?, ?, ?, 1)
    `,
    [handlerId, libelleAccentue, libelleAccentue]
  );
  await run(
    `
      INSERT INTO tarifs_realisateur_matiere (
        handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
      )
      VALUES (?, ?, ?, 71, '1970-01-01T00:00:00.000Z')
    `,
    [handlerId, handlerId, matiereLegacy.id]
  );

  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId,
      intervenantId: handlerId,
      matiere: libelleAccentue,
      effectifAu: "2026-09-09T10:00:00.000Z",
    }),
    null,
    "Le fixture legacy doit reproduire la cle Unicode non resoluble de 0901."
  );

  await executerTransactionImmediate(() =>
    migrationNormalisationMatieres.up({ run, all })
  );

  const matiereReparee = await get(
    "SELECT libelle_normalise FROM matieres_handler WHERE id = ?",
    [matiereLegacy.id]
  );
  assert.equal(matiereReparee?.libelle_normalise, cleAttendue);
  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId,
      intervenantId: handlerId,
      matiere: libelleAccentue,
      effectifAu: "2026-09-09T10:00:00.000Z",
    }),
    71,
    "La migration doit rendre resoluble un tarif migre pour une matiere accentuee."
  );
}

async function verifierCollisionNormalisationProtegee({ handlerId }) {
  const libelleMajuscule = "\u00C9conomie collision";
  const libelleMinuscule = "\u00E9conomie collision";
  const premiere = await run(
    `
      INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
      VALUES (?, ?, ?, 1)
    `,
    [handlerId, libelleMajuscule, libelleMajuscule]
  );
  const seconde = await run(
    `
      INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
      VALUES (?, ?, ?, 1)
    `,
    [handlerId, libelleMinuscule, libelleMinuscule]
  );
  await run(
    `
      INSERT INTO tarifs_realisateur_matiere (
        handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
      )
      VALUES (?, ?, ?, ?, '1970-01-01T00:00:00.000Z')
    `,
    [handlerId, handlerId, premiere.id, 80]
  );
  await run(
    `
      INSERT INTO tarifs_realisateur_matiere (
        handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
      )
      VALUES (?, ?, ?, ?, '1970-01-01T00:00:00.000Z')
    `,
    [handlerId, handlerId, seconde.id, 90]
  );

  await assert.rejects(
    () =>
      executerTransactionImmediate(() =>
        migrationNormalisationMatieres.up({ run, all })
      ),
    (error) => error?.code === "HANDLER_SUBJECT_NORMALIZATION_COLLISION",
    "La migration doit signaler une collision de tarifs sans choisir un tarif arbitraire."
  );

  const matieresApresEchec = await all(
    "SELECT id, libelle_normalise FROM matieres_handler WHERE id IN (?, ?) ORDER BY id ASC",
    [premiere.id, seconde.id]
  );
  assert.deepEqual(matieresApresEchec, [
    { id: Number(premiere.id), libelle_normalise: libelleMajuscule },
    { id: Number(seconde.id), libelle_normalise: libelleMinuscule },
  ]);
}

async function verifierFusionCollisionSansTarifsConcurrents({ handlerId }) {
  const libelleMajuscule = "\u00C9conomie fusion";
  const libelleMinuscule = "\u00E9conomie fusion";
  const premiere = await run(
    `
      INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
      VALUES (?, ?, ?, 1)
    `,
    [handlerId, libelleMajuscule, libelleMajuscule]
  );
  const seconde = await run(
    `
      INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
      VALUES (?, ?, ?, 1)
    `,
    [handlerId, libelleMinuscule, libelleMinuscule]
  );
  await run(
    `
      INSERT INTO tarifs_realisateur_matiere (
        handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
      )
      VALUES (?, ?, ?, 66, '1970-01-01T00:00:00.000Z')
    `,
    [handlerId, handlerId, premiere.id]
  );

  await executerTransactionImmediate(() =>
    migrationNormalisationMatieres.up({ run, all })
  );

  const matieresFusionnees = await all(
    "SELECT id, libelle_normalise FROM matieres_handler WHERE id IN (?, ?) ORDER BY id ASC",
    [premiere.id, seconde.id]
  );
  assert.deepEqual(matieresFusionnees, [
    { id: Number(premiere.id), libelle_normalise: libelleMinuscule },
  ]);
  const tarifFusionne = await get(
    "SELECT matiere_id, tarif_horaire FROM tarifs_realisateur_matiere WHERE tarif_horaire = 66",
  );
  assert.deepEqual(tarifFusionne, {
    matiere_id: Number(premiere.id),
    tarif_horaire: 66,
  });
}

async function main() {
  await initialiserBaseDeDonnees();

  const handlerAId = await creerUtilisateur({
    nom: "Handler Tarifs A",
    email: "handler-tarifs-a@example.test",
    publicId: "HD-TAR-A",
    role: "handler",
  });
  const handlerBId = await creerUtilisateur({
    nom: "Handler Tarifs B",
    email: "handler-tarifs-b@example.test",
    publicId: "HD-TAR-B",
    role: "handler",
  });
  const professeurAId = await creerUtilisateur({
    nom: "Professeur Tarifs A",
    email: "professeur-tarifs-a@example.test",
    publicId: "PR-TAR-A",
    role: "professeur",
  });
  const professeurBId = await creerUtilisateur({
    nom: "Professeur Tarifs B",
    email: "professeur-tarifs-b@example.test",
    publicId: "PR-TAR-B",
    role: "professeur",
  });
  await rattacherProfesseur(handlerAId, professeurAId);
  await rattacherProfesseur(handlerBId, professeurBId);

  // A bootstrap SuperAdmin can also carry the professor role and be attached
  // to its own Handler workspace. It must still occur only once in the grid.
  await run(
    "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'professeur', ?)",
    [handlerAId, handlerAId]
  );
  await rattacherProfesseur(handlerAId, handlerAId);
  const grilleSansDoublon = await listerGrilleTarificationHandler(handlerAId);
  assert.equal(
    grilleSansDoublon.realisateurs.filter(
      (realisateur) => Number(realisateur.id) === handlerAId
    ).length,
    1,
    "Le Handler multi-role ne doit apparaitre qu'une fois dans la grille."
  );
  await verifierMigrationNormalisationAccents({ handlerId: handlerAId });

  // The same display label is valid in separate workspaces but must produce
  // separate subject identifiers and rate histories.
  const libelleMatiere = "Matière versionnée";
  const matiereA = await ajouterMatiereHandler(handlerAId, libelleMatiere);
  const matiereB = await ajouterMatiereHandler(handlerBId, libelleMatiere);
  assert.notEqual(Number(matiereA.id), Number(matiereB.id));
  assert.ok(
    (await listerMatieresHandler(handlerAId)).some(
      (matiere) => Number(matiere.id) === Number(matiereA.id)
    ),
    "Le Handler A doit voir sa propre matière."
  );
  assert.ok(
    !(await listerMatieresHandler(handlerAId)).some(
      (matiere) => Number(matiere.id) === Number(matiereB.id)
    ),
    "Le Handler A ne doit jamais voir la matière du Handler B."
  );
  assert.ok(
    !(await trouverMatiereHandlerParId(handlerAId, matiereB.id)),
    "Une matière d'un autre Handler ne doit pas être résolue dans ce scope."
  );

  const debutTarif90 = new Date("2025-01-01T00:00:00.000Z");
  const changementInitial = await mettreAJourTarifsMatieresHandler(
    handlerAId,
    [
      {
        intervenant_id: professeurAId,
        matiere_id: matiereA.id,
        tarif_horaire: 90,
      },
    ],
    debutTarif90
  );
  assert.deepEqual(changementInitial.changements, [
    {
      intervenant_id: professeurAId,
      intervenant_nom: "Professeur Tarifs A",
      matiere_id: Number(matiereA.id),
      matiere: libelleMatiere,
      tarif_avant: null,
      tarif_apres: 90,
      seances_futures_mises_a_jour: 0,
    },
  ]);

  const seanceHistorique = await creerSeanceAvecSnapshot({
    handlerId: handlerAId,
    intervenantId: professeurAId,
    matiere: libelleMatiere,
    date: "2025-06-15",
    statut: "faite",
    tarifHoraire: 90,
    etudiant: "Historique",
  });
  const seanceFuture = await creerSeanceAvecSnapshot({
    handlerId: handlerAId,
    intervenantId: professeurAId,
    matiere: libelleMatiere,
    date: "2027-06-15",
    statut: "planifiee",
    tarifHoraire: 90,
    etudiant: "Future",
  });

  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId: handlerAId,
      intervenantId: professeurAId,
      matiere: libelleMatiere,
      effectifAu: "2025-06-15T10:00:00.000Z",
    }),
    90,
    "Le résolveur doit retrouver le tarif historique actif."
  );

  const debutTarif100 = new Date("2026-01-01T00:00:00.000Z");
  const changement100 = await mettreAJourTarifsMatieresHandler(
    handlerAId,
    [
      {
        intervenant_id: professeurAId,
        matiere_id: matiereA.id,
        tarif_horaire: 100,
      },
    ],
    debutTarif100
  );
  assert.deepEqual(changement100.changements, [
    {
      intervenant_id: professeurAId,
      intervenant_nom: "Professeur Tarifs A",
      matiere_id: Number(matiereA.id),
      matiere: libelleMatiere,
      tarif_avant: 90,
      tarif_apres: 100,
      seances_futures_mises_a_jour: 1,
    },
  ]);

  const snapshots = await all(
    `
      SELECT id, statut_seance, tarif_horaire_applique
      FROM seances
      WHERE id IN (?, ?)
      ORDER BY id ASC
    `,
    [seanceHistorique.id, seanceFuture.id]
  );
  assert.deepEqual(snapshots, [
    {
      id: Number(seanceHistorique.id),
      statut_seance: "faite",
      tarif_horaire_applique: 90,
    },
    {
      id: Number(seanceFuture.id),
      statut_seance: "planifiee",
      tarif_horaire_applique: 100,
    },
  ]);

  const versionsA = await all(
    `
      SELECT tarif_horaire, effectif_depuis, effectif_jusqua
      FROM tarifs_realisateur_matiere
      WHERE handler_id = ? AND intervenant_id = ? AND matiere_id = ?
      ORDER BY effectif_depuis ASC, id ASC
    `,
    [handlerAId, professeurAId, matiereA.id]
  );
  assert.deepEqual(versionsA, [
    {
      tarif_horaire: 90,
      effectif_depuis: debutTarif90.toISOString(),
      effectif_jusqua: debutTarif100.toISOString(),
    },
    {
      tarif_horaire: 100,
      effectif_depuis: debutTarif100.toISOString(),
      effectif_jusqua: null,
    },
  ]);
  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId: handlerAId,
      intervenantId: professeurAId,
      matiere: libelleMatiere,
      effectifAu: "2026-06-15T10:00:00.000Z",
    }),
    100,
    "Le résolveur doit retrouver le tarif courant après la nouvelle version."
  );

  // Handler B receives an independent rate for a subject with the exact same
  // label, proving that the lookup is scoped by handler rather than name alone.
  await mettreAJourTarifsMatieresHandler(
    handlerBId,
    [
      {
        intervenant_id: professeurBId,
        matiere_id: matiereB.id,
        tarif_horaire: 70,
      },
    ],
    debutTarif90
  );
  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId: handlerBId,
      intervenantId: professeurBId,
      matiere: libelleMatiere,
      effectifAu: "2026-06-15T10:00:00.000Z",
    }),
    70,
    "Le tarif du Handler B doit rester indépendant de celui du Handler A."
  );
  await assert.rejects(
    () =>
      mettreAJourTarifsMatieresHandler(handlerAId, [
        {
          intervenant_id: professeurAId,
          matiere_id: matiereB.id,
          tarif_horaire: 101,
        },
      ]),
    (error) => error?.status === 404,
    "Le Handler A ne doit pas modifier la matière du Handler B."
  );

  const matiereArchivee = await archiverMatiereHandler(handlerAId, matiereA.id);
  assert.equal(Number(matiereArchivee.actif), 0);
  assert.ok(
    !(await listerMatieresHandler(handlerAId)).some(
      (matiere) => Number(matiere.id) === Number(matiereA.id)
    ),
    "Une matière archivée doit disparaître du catalogue actif."
  );
  assert.ok(
    (await listerMatieresHandler(handlerAId, { inclureArchivees: true })).some(
      (matiere) => Number(matiere.id) === Number(matiereA.id) && Number(matiere.actif) === 0
    ),
    "La matière archivée doit rester consultable pour l'historique."
  );
  const seanceHistoriqueApresArchive = await get(
    "SELECT matiere, tarif_horaire_applique FROM seances WHERE id = ?",
    [seanceHistorique.id]
  );
  assert.deepEqual(
    seanceHistoriqueApresArchive,
    { matiere: libelleMatiere, tarif_horaire_applique: 90 },
    "L'archive ne doit ni réécrire la matière ni le snapshot d'une séance passée."
  );
  assert.equal(
    await obtenirTarifHorairePourSeance({
      handlerId: handlerAId,
      intervenantId: professeurAId,
      matiere: libelleMatiere,
      effectifAu: "2025-06-15T10:00:00.000Z",
    }),
    90,
    "L'archive ne doit pas casser la résolution historique d'un tarif."
  );

  await verifierFusionCollisionSansTarifsConcurrents({ handlerId: handlerAId });
  await verifierCollisionNormalisationProtegee({ handlerId: handlerAId });

  console.log("subject tariffs test: PASS");
}

main()
  .catch((error) => {
    console.error("subject tariffs test: FAIL");
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
