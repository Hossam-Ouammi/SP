const assert = require("node:assert/strict");
const { initialiserBaseDeDonnees, fermerBaseDeDonnees, run, get } = require("../models/db");
const { supprimerUtilisateurAdministration } = require("../models/admin.model");

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
    console.log("account deletion test: PASS");
  } finally {
    await fermerBaseDeDonnees();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
