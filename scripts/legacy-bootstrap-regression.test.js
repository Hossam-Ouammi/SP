/*
 * Exercises two compatibility paths against an old database shape:
 * - `seances.compte` must exist before its index is created;
 * - a disabled Professor omitted by the first multi-Handler migration must
 *   regain a role and a single attachment when eventually reactivated.
 */
const assert = require("node:assert/strict");

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolee.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

const {
  all,
  fermerBaseDeDonnees,
  get,
  initialiserBaseDeDonnees,
  run,
} = require("../models/db");
const migrationRattrapage = require("../models/migrations/2026090802-legacy-suspended-professor-access");

const VERSION_RATTRAPAGE = "2026090802_legacy_suspended_professor_access";

async function creerUtilisateur({ nom, email, estAdmin = 0, accesActive = 1, statut = "active" }) {
  const resultat = await run(
    `
      INSERT INTO utilisateurs (
        nom,
        email,
        mot_de_passe,
        est_admin,
        acces_active,
        statut_compte
      )
      VALUES (?, ?, 'hash-regression', ?, ?, ?)
    `,
    [nom, email, estAdmin, accesActive, statut]
  );

  return resultat.id;
}

async function remplacerSeancesParSchemaLegacySansCompte() {
  await run("PRAGMA foreign_keys = OFF");
  try {
    await run("DROP TABLE seances");
    await run(`
      CREATE TABLE seances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT,
        etudiant TEXT NOT NULL,
        parent TEXT DEFAULT '',
        matiere TEXT NOT NULL,
        est_essai INTEGER DEFAULT 0,
        date TEXT NOT NULL,
        heure_debut TEXT NOT NULL,
        heure_fin TEXT NOT NULL,
        duree_minutes INTEGER,
        statut_seance TEXT NOT NULL DEFAULT 'planifiee',
        prix REAL DEFAULT 0,
        statut_paiement TEXT DEFAULT 'non_payee',
        description TEXT,
        cree_par INTEGER REFERENCES utilisateurs(id),
        modifie_par INTEGER REFERENCES utilisateurs(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        revision INTEGER DEFAULT 1,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES utilisateurs(id),
        utilisateur_id INTEGER REFERENCES utilisateurs(id),
        public_reservation_device_id INTEGER REFERENCES public_reservation_devices(id),
        handler_id INTEGER REFERENCES utilisateurs(id),
        intervenant_id INTEGER REFERENCES utilisateurs(id),
        tarif_horaire_applique INTEGER
      )
    `);
    await run(`
      INSERT INTO seances (
        etudiant,
        matiere,
        date,
        heure_debut,
        heure_fin
      )
      VALUES ('Eleve legacy', 'Maths', '2031-04-01', '08:00', '09:00')
    `);
  } finally {
    await run("PRAGMA foreign_keys = ON");
  }
}

async function main() {
  try {
    // Establish the full current schema once, then deliberately reintroduce a
    // pre-`compte` table. This retains all other tables that a real legacy
    // deployment accumulated over time.
    await initialiserBaseDeDonnees();

    const handlerLegacy = await creerUtilisateur({
      nom: "Handler legacy",
      email: "handler-legacy@example.test",
      estAdmin: 1,
    });
    const autreHandler = await creerUtilisateur({
      nom: "Autre Handler",
      email: "autre-handler@example.test",
    });
    const professeurSuspendu = await creerUtilisateur({
      nom: "Professeur legacy suspendu",
      email: "professeur-suspendu@example.test",
      accesActive: 0,
      statut: "suspendu",
    });
    const professeurDejaReactive = await creerUtilisateur({
      nom: "Professeur legacy deja reactive",
      email: "professeur-reactive@example.test",
    });
    const professeurAvecRoleSansRattachement = await creerUtilisateur({
      nom: "Professeur legacy role sans rattachement",
      email: "professeur-role-sans-rattachement@example.test",
      accesActive: 0,
      statut: "suspendu",
    });
    const professeurDejaRattache = await creerUtilisateur({
      nom: "Professeur rattache ailleurs",
      email: "professeur-rattache@example.test",
      accesActive: 0,
      statut: "suspendu",
    });
    const compteInscription = await creerUtilisateur({
      nom: "Compte inscription moderne",
      email: "inscription-moderne@example.test",
      accesActive: 0,
      statut: "suspendu",
    });

    await run(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'handler', ?)",
      [handlerLegacy, handlerLegacy]
    );
    await run(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'handler', ?)",
      [autreHandler, autreHandler]
    );
    await run(
      "INSERT INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'professeur', ?)",
      [professeurAvecRoleSansRattachement, handlerLegacy]
    );
    await run(
      `
        INSERT INTO rattachements_professeurs (
          handler_id,
          professeur_id,
          actif,
          cree_par
        )
        VALUES (?, ?, 1, ?)
      `,
      [autreHandler, professeurDejaRattache, autreHandler]
    );
    await run(
      `
        INSERT INTO demandes_inscription (
          nom,
          email,
          role_demande,
          utilisateur_id,
          statut
        )
        VALUES (?, ?, 'professeur', ?, 'pending')
      `,
      ["Compte inscription moderne", "inscription-moderne@example.test", compteInscription]
    );

    // The migration was applied before these deliberately constructed legacy
    // records existed. Remove only its marker so the next bootstrap executes
    // it like an upgraded production database would.
    await run("DELETE FROM schema_migrations WHERE version = ?", [VERSION_RATTRAPAGE]);
    await remplacerSeancesParSchemaLegacySansCompte();

    await initialiserBaseDeDonnees();

    const colonneCompte = await get(`
      SELECT name
      FROM pragma_table_info('seances')
      WHERE name = 'compte'
    `);
    assert.equal(colonneCompte?.name, "compte");
    const indexCompte = await get(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_seances_compte_date'
    `);
    assert.equal(indexCompte?.name, "idx_seances_compte_date");
    const seanceLegacy = await get("SELECT compte FROM seances WHERE id = 1");
    assert.ok(
      String(seanceLegacy?.compte || "").trim().length > 0,
      "La valeur de compte legacy doit etre normalisee pendant le bootstrap."
    );

    const rolesProfesseurSuspendu = await all(
      "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
      [professeurSuspendu]
    );
    assert.deepEqual(rolesProfesseurSuspendu, [{ role: "professeur" }]);
    const rattachementsProfesseurSuspendu = await all(
      `
        SELECT handler_id, actif
        FROM rattachements_professeurs
        WHERE professeur_id = ?
        ORDER BY id ASC
      `,
      [professeurSuspendu]
    );
    assert.deepEqual(rattachementsProfesseurSuspendu, [
      { handler_id: handlerLegacy, actif: 1 },
    ]);

    assert.deepEqual(
      await all(
        "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
        [professeurDejaReactive]
      ),
      [{ role: "professeur" }],
      "Un professeur legacy reactive avant la mise a jour doit aussi recuperer son role."
    );
    assert.deepEqual(
      await all(
        `
          SELECT handler_id, actif
          FROM rattachements_professeurs
          WHERE professeur_id = ?
          ORDER BY id ASC
        `,
        [professeurDejaReactive]
      ),
      [{ handler_id: handlerLegacy, actif: 1 }]
    );

    assert.deepEqual(
      await all(
        `
          SELECT handler_id, actif
          FROM rattachements_professeurs
          WHERE professeur_id = ?
          ORDER BY id ASC
        `,
        [professeurAvecRoleSansRattachement]
      ),
      [{ handler_id: handlerLegacy, actif: 1 }],
      "Un role professeur legacy deja present doit recevoir son rattachement manquant."
    );

    const rattachementConserve = await all(
      `
        SELECT handler_id, actif
        FROM rattachements_professeurs
        WHERE professeur_id = ?
        ORDER BY id ASC
      `,
      [professeurDejaRattache]
    );
    assert.deepEqual(rattachementConserve, [{ handler_id: autreHandler, actif: 1 }]);
    assert.deepEqual(
      await all(
        "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
        [professeurDejaRattache]
      ),
      [{ role: "professeur" }],
      "Un rattachement actif existant conserve son Handler, mais recoit le role manquant."
    );
    assert.deepEqual(
      await all(
        "SELECT role FROM utilisateur_roles WHERE utilisateur_id = ? ORDER BY role ASC",
        [compteInscription]
      ),
      [],
      "Un compte lie a une inscription moderne ne doit jamais etre rattache automatiquement."
    );

    // Directly re-run the body to prove its SQL remains safe when an upgrade
    // is resumed after an interruption before the migration marker is saved.
    const contexte = { run, get, all };
    await migrationRattrapage.up(contexte);
    await migrationRattrapage.up(contexte);
    assert.equal(
      Number(
        (
          await get(
            "SELECT COUNT(*) AS total FROM utilisateur_roles WHERE utilisateur_id = ? AND role = 'professeur'",
            [professeurSuspendu]
          )
        )?.total
      ),
      1
    );
    assert.equal(
      Number(
        (
          await get(
            "SELECT COUNT(*) AS total FROM rattachements_professeurs WHERE professeur_id = ? AND actif = 1",
            [professeurSuspendu]
          )
        )?.total
      ),
      1
    );

    console.log("legacy bootstrap regression test: PASS");
  } finally {
    await fermerBaseDeDonnees().catch(() => {});
  }
}

main().catch((error) => {
  console.error("legacy bootstrap regression test: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
