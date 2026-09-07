const bcrypt = require("bcryptjs");
const {
  initialiserBaseDeDonnees,
  get,
  run,
  fermerBaseDeDonnees,
} = require("../models/db");

async function main() {
  await initialiserBaseDeDonnees();
  const hossam = await get(
    "SELECT id FROM utilisateurs WHERE lower(email) = lower(?) LIMIT 1",
    ["hossam.visual@example.test"]
  );

  if (!hossam?.id) {
    throw new Error("Le bootstrap visuel Hossam est introuvable.");
  }

  await run(
    "UPDATE utilisateurs SET doit_changer_mot_de_passe = 0, mot_de_passe_change_at = CURRENT_TIMESTAMP WHERE id = ?",
    [hossam.id]
  );

  const professeurExistant = await get(
    "SELECT id FROM utilisateurs WHERE lower(email) = lower(?) LIMIT 1",
    ["professeur.visual@example.test"]
  );
  const hash = await bcrypt.hash("VisualAudit!2026", 12);
  const professeurId = professeurExistant?.id || null;

  if (!professeurId) {
    const insertion = await run(
      `
        INSERT INTO utilisateurs (
          nom, email, mot_de_passe, est_admin, acces_active,
          mode_lecture_seule, peut_voir_monetisation, peut_voir_aujourdhui,
          peut_voir_indisponibilites, session_version, doit_changer_mot_de_passe,
          mot_de_passe_change_at, echecs_connexion, tarif_horaire, created_at
        )
        VALUES (?, ?, ?, 0, 1, 0, 1, 1, 1, 1, 0, CURRENT_TIMESTAMP, 0, 100, CURRENT_TIMESTAMP)
      `,
      ["Professeur Visuel", "professeur.visual@example.test", hash]
    );
    await run(
      "INSERT OR IGNORE INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'professeur', ?)",
      [insertion.lastID, hossam.id]
    );
    await run(
      "INSERT OR IGNORE INTO rattachements_professeurs (handler_id, professeur_id, actif, cree_par) VALUES (?, ?, 1, ?)",
      [hossam.id, insertion.lastID, hossam.id]
    );
  }

  await run(
    `
      INSERT INTO seances (
        etudiant, parent, matiere, compte, est_essai, date, heure_debut,
        heure_fin, duree_minutes, statut_seance, prix, statut_paiement,
        description, cree_par, utilisateur_id, handler_id, intervenant_id
      )
      SELECT ?, '', 'Mathématiques', 'Audit visuel', 0, '2026-09-07', '10:00',
        '11:00', 60, 'planifiee', 100, 'non_payee',
        'Séance de recette visuelle', ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM seances
        WHERE handler_id = ? AND intervenant_id = ? AND date = '2026-09-07'
          AND heure_debut = '10:00' AND deleted_at IS NULL
      )
    `,
    [
      "Élève Visuel",
      hossam.id,
      hossam.id,
      hossam.id,
      hossam.id,
      hossam.id,
      hossam.id,
    ]
  );

  console.log("visual-audit-seed: OK");
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
