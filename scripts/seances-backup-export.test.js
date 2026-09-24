const assert = require("node:assert/strict");

process.env.BACKUP_SEANCES_EMAIL_DRY_RUN = "false";

const {
  convertirSeancesEnCsv,
  creerExportBackupHandler,
  creerExportBackupAdmin,
} = require("../utils/seances-backup-email");
const { fermerBaseDeDonnees } = require("../models/db");

async function main() {
  const seance = {
    date: "2026-09-09", heure_debut: "10:00", heure_fin: "11:00",
    duree_minutes: 60, statut_seance: "faite", etudiant: "  =FORMULE()",
    parent: "Parent A", matiere: "Maths", titre: "Cours",
    intervenant_nom: "Professeur A", intervenant_public_id: "PR-TEST",
    handler_nom: "Handler A", handler_public_id: "HD-TEST", est_essai: 0,
    prix: 120, statut_paiement: "paye", tarif_horaire_applique: 90,
    seance_id: 42, handler_id: 7, intervenant_id: 8, utilisateur_id: 7,
    cree_par: 7, createur_nom: "Handler A", createur_public_id: "HD-TEST",
    modifie_par: 8, modificateur_nom: "Professeur A", modificateur_public_id: "PR-TEST",
    created_at: "2026-09-01 10:00:00", updated_at: "2026-09-09 12:00:00", revision: 3,
    deleted_at: null, deleted_by: null,
    description: "SECRET-INTERNE", public_reservation_device_id: "DEVICE-SECRET",
  };

  const csvHandler = convertirSeancesEnCsv([seance]);
  const csvAdmin = convertirSeancesEnCsv([seance], { inclureHandler: true });
  assert.ok(csvHandler.startsWith("\uFEFFdate,"));
  assert.ok(csvHandler.includes("'  =FORMULE()"));
  for (const interdit of ["description",
    "public_reservation_device_id", "SECRET-INTERNE", "DEVICE-SECRET"]) {
    assert.equal(csvHandler.includes(interdit), false, `${interdit} ne doit pas sortir.`);
    assert.equal(csvAdmin.includes(interdit), false, `${interdit} ne doit pas sortir.`);
  }
  assert.equal(csvHandler.includes("handler_public"), false);
  assert.ok(csvAdmin.includes("seance_id,handler_id,handler,handler_public,intervenant_id"));
  assert.ok(csvAdmin.includes("42,7,Handler A,HD-TEST,8,Professeur A,PR-TEST"));
  assert.ok(csvAdmin.includes("tarif_horaire_applique"));
  assert.ok(csvAdmin.includes("cree_par_public"));
  assert.ok(csvAdmin.includes("revision"));

  const date = new Date("2026-09-09T11:00:00Z");
  const exportHandler = creerExportBackupHandler({ public_id: "HD-TEST" }, [seance], date);
  const exportAdmin = creerExportBackupAdmin([seance], date);
  assert.equal(exportHandler.nomFichier, "backup-seances-HD-TEST-2026-09-09.csv");
  assert.equal(exportAdmin.nomFichier, "backup-seances-global-2026-09-09-1200.csv");
  assert.equal(exportHandler.nombreSeances, 1);
  assert.equal(exportAdmin.nombreSeances, 1);
  console.log("seances backup export test: PASS");
}

main().catch((error) => {
  console.error("seances backup export test: FAIL", error);
  process.exitCode = 1;
}).finally(async () => fermerBaseDeDonnees().catch(() => {}));
