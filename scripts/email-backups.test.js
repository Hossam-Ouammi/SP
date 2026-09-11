const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_PATH || process.env.NODE_ENV !== "test") {
  throw new Error("Ce test exige une base isolee et NODE_ENV=test.");
}
process.env.BACKUP_SEANCES_EMAIL_DRY_RUN = "false";

const { initialiserBaseDeDonnees, fermerBaseDeDonnees, run, all } = require("../models/db");
const {
  executerBackupsHandlersEmail,
  executerBackupAdminEmail,
  executerBackupsPlanifies,
  calculerProchaineExecutionBackup,
} = require("../utils/seances-backup-email");

async function utilisateur({ nom, email, publicId, roles, actif = true }) {
  const hash = await bcrypt.hash("BackupTest!2026", 4);
  const resultat = await run(`INSERT INTO utilisateurs
    (nom,email,mot_de_passe,public_id,est_admin,acces_active,statut_compte,doit_changer_mot_de_passe)
    VALUES (?,?,?,?,?,?,?,0)`, [nom, email, hash, publicId,
      roles.includes("super_admin") ? 1 : 0, actif ? 1 : 0, actif ? "active" : "suspended"]);
  for (const role of roles) {
    await run("INSERT INTO utilisateur_roles (utilisateur_id,role,accorde_par) VALUES (?,?,?)",
      [resultat.id, role, resultat.id]);
  }
  return resultat.id;
}

async function seance(handlerId, intervenantId, marqueur) {
  await run(`INSERT INTO seances
    (titre,etudiant,parent,matiere,compte,est_essai,date,heure_debut,heure_fin,
     duree_minutes,statut_seance,prix,statut_paiement,description,cree_par,modifie_par,
     utilisateur_id,handler_id,intervenant_id,tarif_horaire_applique)
    VALUES (?,?,'Parent','Maths','Cours',0,'2026-09-09','09:00','10:00',60,'faite',120,
      'payee','NE-JAMAIS-EXPORTER',?,?,?,?,?,90)`,
    [`Cours ${marqueur}`, marqueur, handlerId, handlerId, handlerId, handlerId, intervenantId]);
}

async function main() {
  await initialiserBaseDeDonnees();
  const a = await utilisateur({ nom: "Handler A", email: "a@example.test", publicId: "HD-A", roles: ["handler"] });
  const b = await utilisateur({ nom: "Handler B", email: "b@example.test", publicId: "HD-B", roles: ["handler"] });
  await utilisateur({ nom: "Suspendu", email: "off@example.test", publicId: "HD-OFF", roles: ["handler"], actif: false });
  await utilisateur({ nom: "Admin", email: "admin@example.test", publicId: "AD-ONE", roles: ["super_admin"] });
  await seance(a, a, "MARQUEUR-A");
  await seance(b, b, "MARQUEUR-B");

  const messages = [];
  const sendMail = async (message) => { messages.push(message); return { messageId: `m-${messages.length}` }; };
  const date = new Date("2026-09-09T11:00:00Z");
  const handlers = await executerBackupsHandlersEmail({
    sansVerrou: true, date, occurrenceKey: "test:handlers:20260909", sendMail,
  });
  assert.equal(handlers.destinataires, 2);
  assert.deepEqual(messages.map((m) => m.to).sort(), ["a@example.test", "b@example.test"]);
  const contenuA = messages.find((m) => m.to === "a@example.test").attachments[0].content.toString("utf8");
  assert.ok(contenuA.includes("MARQUEUR-A"));
  assert.equal(contenuA.includes("MARQUEUR-B"), false, "Un Handler ne doit jamais recevoir l'autre espace.");
  assert.equal(contenuA.includes("NE-JAMAIS-EXPORTER"), false);

  await executerBackupsHandlersEmail({
    sansVerrou: true, date, occurrenceKey: "test:handlers:20260909", sendMail,
  });
  assert.equal(messages.length, 2, "Une occurrence confirmee doit etre idempotente.");

  const admin = await executerBackupAdminEmail({
    sansVerrou: true, date, occurrenceKey: "test:admin:20260909-1200", sendMail,
  });
  assert.equal(admin.destinataires, 1);
  const global = messages.at(-1).attachments[0].content.toString("utf8");
  assert.ok(global.includes("MARQUEUR-A") && global.includes("MARQUEUR-B"));
  assert.ok(global.includes("handler,handler_public,date"));

  const echec = await executerBackupAdminEmail({ sansVerrou: true, date,
    occurrenceKey: "test:admin:retry", sendMail: async () => { throw new Error("SMTP down"); } });
  assert.equal(echec.livraisons[0].envoye, false);
  await executerBackupAdminEmail({ sansVerrou: true, date,
    occurrenceKey: "test:admin:retry", sendMail });
  const registre = await all("SELECT status, attempt_count FROM backup_email_deliveries WHERE occurrence_key = 'test:admin:retry'");
  assert.deepEqual(registre, [{ status: "sent", attempt_count: 2 }]);
  assert.equal((await all("SELECT COUNT(*) AS total FROM seances"))[0].total, 2);

  assert.equal(
    calculerProchaineExecutionBackup(new Date("2026-09-09T10:59:00Z")).toISOString(),
    "2026-09-09T11:00:00.000Z"
  );
  let appelsHandlers = 0; let appelsAdmin = 0;
  await executerBackupsPlanifies({ sansVerrou: true, date: new Date("2026-09-09T11:00:00Z"),
    listerHandlers: async () => { appelsHandlers += 1; return []; },
    listerAdministrateurs: async () => { appelsAdmin += 1; return []; },
    listerSeancesGlobal: async () => [] });
  assert.deepEqual([appelsHandlers, appelsAdmin], [0, 1], "Midi est reserve au global Admin.");
  await executerBackupsPlanifies({ sansVerrou: true, date: new Date("2026-09-09T23:00:00Z"),
    listerHandlers: async () => { appelsHandlers += 1; return []; },
    listerAdministrateurs: async () => { appelsAdmin += 1; return []; },
    listerSeancesGlobal: async () => [] });
  assert.deepEqual([appelsHandlers, appelsAdmin], [1, 2], "Minuit lance Handler et Admin.");
  console.log("email backups isolation/idempotence test: PASS");
}

main().catch((error) => { console.error("email backups test: FAIL", error); process.exitCode = 1; })
  .finally(async () => fermerBaseDeDonnees().catch(() => {}));
