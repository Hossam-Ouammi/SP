const assert = require("node:assert/strict");
const { initialiserBaseDeDonnees, fermerBaseDeDonnees, run, get } = require("../models/db");
const {
  supprimerUtilisateurAdministration,
  listerComptesAdministration,
} = require("../models/admin.model");

(async () => {
  try {
    await initialiserBaseDeDonnees();
    const admin = await run(`INSERT INTO utilisateurs
      (nom,email,mot_de_passe,statut_compte,acces_active)
      VALUES ('Admin','admin-delete@example.test','hash','active',1)`);
    const cible = await run(`INSERT INTO utilisateurs
      (nom,email,mot_de_passe,statut_compte,acces_active)
      VALUES ('Cible','target-delete@example.test','hash','active',1)`);
    await run("INSERT INTO utilisateur_roles (utilisateur_id,role) VALUES (?,'handler')", [cible.id]);
    await run(`INSERT INTO indisponibilites
      (date, heure_debut, heure_fin, handler_id, intervenant_id, cree_par)
      VALUES ('2026-09-11','10:00','11:00',?,?,?)`, [cible.id, cible.id, cible.id]);

    await supprimerUtilisateurAdministration(cible.id, admin.id);

    assert.equal(await get("SELECT id FROM utilisateurs WHERE id = ?", [cible.id]), undefined);
    assert.equal(Number((await get(
      "SELECT COUNT(*) AS total FROM indisponibilites WHERE handler_id = ? OR intervenant_id = ?",
      [cible.id, cible.id]
    )).total), 0);

    const cibleAvecHistorique = await run(`INSERT INTO utilisateurs
      (nom,email,mot_de_passe,statut_compte,acces_active)
      VALUES ('Historique','history-delete@example.test','hash','active',1)`);
    await run("INSERT INTO utilisateur_roles (utilisateur_id,role) VALUES (?,'professeur')", [cibleAvecHistorique.id]);
    await run(`INSERT INTO seances
      (etudiant,matiere,date,heure_debut,heure_fin,statut_seance,handler_id,intervenant_id,compte)
      VALUES ('Eleve fait','Maths','2026-09-10','10:00','11:00','faite',?,?, 'Historique')`,
      [admin.id, cibleAvecHistorique.id]);
    await run(`INSERT INTO seances
      (etudiant,matiere,date,heure_debut,heure_fin,statut_seance,handler_id,intervenant_id,compte)
      VALUES ('Eleve prevu','Maths','2026-09-30','10:00','11:00','planifiee',?,?, 'Historique')`,
      [admin.id, cibleAvecHistorique.id]);

    const resultatAvecConservation = await supprimerUtilisateurAdministration(
      cibleAvecHistorique.id,
      admin.id,
      { preserverSeancesFaites: true }
    );
    assert.equal(resultatAvecConservation.totalSeancesFaitesConservees, 1);
    assert.equal(resultatAvecConservation.totalSeancesSupprimees, 1);
    assert.equal((await get(
      "SELECT COUNT(*) AS total FROM seances WHERE intervenant_id = ? AND statut_seance = 'faite'",
      [cibleAvecHistorique.id]
    )).total, 1);
    assert.equal((await get(
      "SELECT COUNT(*) AS total FROM seances WHERE intervenant_id = ? AND statut_seance <> 'faite'",
      [cibleAvecHistorique.id]
    )).total, 0);
    const identiteArchivee = await get(
      "SELECT statut_compte, acces_active, calendrier_public_actif FROM utilisateurs WHERE id = ?",
      [cibleAvecHistorique.id]
    );
    assert.equal(identiteArchivee.statut_compte, "supprime");
    assert.equal(Number(identiteArchivee.acces_active), 0);
    assert.equal(Number(identiteArchivee.calendrier_public_actif), 0);
    assert.equal(
      (await listerComptesAdministration()).some(
        (compte) => Number(compte.id) === Number(cibleAvecHistorique.id)
      ),
      false
    );

    const cibleSansConservation = await run(`INSERT INTO utilisateurs
      (nom,email,mot_de_passe,statut_compte,acces_active)
      VALUES ('Sans historique','no-history-delete@example.test','hash','active',1)`);
    await run(`INSERT INTO seances
      (etudiant,matiere,date,heure_debut,heure_fin,statut_seance,handler_id,intervenant_id,compte)
      VALUES ('Eleve','Maths','2026-09-10','10:00','11:00','faite',?,?, 'Sans historique')`,
      [admin.id, cibleSansConservation.id]);
    await supprimerUtilisateurAdministration(cibleSansConservation.id, admin.id, {
      preserverSeancesFaites: false,
    });
    assert.equal(await get("SELECT id FROM utilisateurs WHERE id = ?", [cibleSansConservation.id]), undefined);
    assert.equal((await get(
      "SELECT COUNT(*) AS total FROM seances WHERE intervenant_id = ?",
      [cibleSansConservation.id]
    )).total, 0);
    console.log("account deletion test: PASS");
  } finally {
    await fermerBaseDeDonnees();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
