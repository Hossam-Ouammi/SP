/*
 * Verifies two audit-chain guarantees against an isolated database:
 * - a legacy HMAC v1 row stays verifiable after the v2 migration;
 * - concurrent v2 appends serialize their tail read, HMAC and insert.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sqlite3 = require("sqlite3").verbose();

if (!process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH doit pointer vers une base de test isolee.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV=test est obligatoire pour ce test.");
}

if (!process.env.AUDIT_SECRET) {
  throw new Error("AUDIT_SECRET est obligatoire pour ce test.");
}

const {
  all,
  executerTransactionImmediate,
  fermerBaseDeDonnees,
  initialiserBaseDeDonnees,
  run,
} = require("../models/db");
const {
  creerEntreeHistorique,
  detacherUtilisateurHistorique,
  listerEntreesHistorique,
} = require("../models/historique.model");
const migrationHmacV2 = require("../models/migrations/2026090709-historique-hmac-v2-scope");

function trierObjetRecursivement(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map(trierObjetRecursivement);
  }

  if (valeur && typeof valeur === "object") {
    return Object.keys(valeur)
      .sort()
      .reduce((objetTrie, cle) => {
        objetTrie[cle] = trierObjetRecursivement(valeur[cle]);
        return objetTrie;
      }, {});
  }

  return valeur;
}

function calculerHashV1(entree) {
  const chargeUtile = JSON.stringify(
    trierObjetRecursivement({
      action_label: entree.action_label,
      action_type: entree.action_type,
      acteur_id: entree.acteur_id,
      acteur_nom: entree.acteur_nom,
      created_at: entree.created_at,
      details_json: entree.details_json,
      previous_hash: entree.previous_hash,
      seance_id: entree.seance_id,
      seance_libelle: entree.seance_libelle,
    })
  );

  return crypto
    .createHmac("sha256", process.env.AUDIT_SECRET)
    .update(chargeUtile)
    .digest("hex");
}

function ouvrirBaseMemoire() {
  const base = new sqlite3.Database(":memory:");

  return {
    run(sql, parametres = []) {
      return new Promise((resolve, reject) => {
        base.run(sql, parametres, function surExecution(erreur) {
          if (erreur) {
            reject(erreur);
            return;
          }
          resolve({ id: this.lastID, changes: this.changes });
        });
      });
    },
    all(sql, parametres = []) {
      return new Promise((resolve, reject) => {
        base.all(sql, parametres, (erreur, lignes) => (erreur ? reject(erreur) : resolve(lignes)));
      });
    },
    fermer() {
      return new Promise((resolve, reject) => base.close((erreur) => (erreur ? reject(erreur) : resolve())));
    },
  };
}

async function verifierMigrationSurSchemaLegacy() {
  const baseLegacy = ouvrirBaseMemoire();

  try {
    await baseLegacy.run(`
      CREATE TABLE historique_actions (
        id INTEGER PRIMARY KEY,
        action_type TEXT NOT NULL,
        entry_hash TEXT NOT NULL
      )
    `);
    await baseLegacy.run(
      "INSERT INTO historique_actions (id, action_type, entry_hash) VALUES (1, 'legacy', 'abc')"
    );
    await migrationHmacV2.up({ run: baseLegacy.run, all: baseLegacy.all });

    const colonnes = await baseLegacy.all("PRAGMA table_info(historique_actions)");
    assert.ok(
      colonnes.some((colonne) => colonne.name === "signature_version"),
      "La migration doit s'appliquer a une table historique deja existante."
    );
    const lignes = await baseLegacy.all("SELECT signature_version FROM historique_actions");
    assert.equal(Number(lignes[0]?.signature_version), 1, "Les lignes existantes restent en v1.");
  } finally {
    await baseLegacy.fermer();
  }
}

async function creerUtilisateur({ nom, email, publicId }) {
  const resultat = await run(
    `
      INSERT INTO utilisateurs (
        nom, email, mot_de_passe, public_id, statut_compte, acces_active,
        session_version, doit_changer_mot_de_passe, tarif_horaire
      )
      VALUES (?, ?, 'hash-test', ?, 'active', 1, 1, 0, 0)
    `,
    [nom, email, publicId]
  );

  return resultat.id;
}

async function integriteParId() {
  const entrees = await listerEntreesHistorique(500);
  return new Map(entrees.map((entree) => [Number(entree.id), entree]));
}

async function verifierChaineValide() {
  const entrees = await listerEntreesHistorique(500);
  assert.ok(entrees.length > 0, "La chaine d'audit doit contenir des entrees.");
  assert.ok(
    entrees.every((entree) => entree.integrite_valide === true),
    "Toute la chaine HMAC doit etre valide."
  );
}

async function main() {
  await verifierMigrationSurSchemaLegacy();
  await initialiserBaseDeDonnees();

  const handlerA = await creerUtilisateur({
    nom: "Handler audit A",
    email: "handler-audit-a@example.test",
    publicId: "HD-AUDIT-A",
  });
  const professeurA = await creerUtilisateur({
    nom: "Professeur audit A",
    email: "professeur-audit-a@example.test",
    publicId: "PR-AUDIT-A",
  });
  const handlerB = await creerUtilisateur({
    nom: "Handler audit B",
    email: "handler-audit-b@example.test",
    publicId: "HD-AUDIT-B",
  });
  const professeurB = await creerUtilisateur({
    nom: "Professeur audit B",
    email: "professeur-audit-b@example.test",
    publicId: "PR-AUDIT-B",
  });

  const colonnes = await all("PRAGMA table_info(historique_actions)");
  assert.ok(
    colonnes.some((colonne) => colonne.name === "signature_version"),
    "La migration doit ajouter la version de signature."
  );

  const entreeV1 = {
    seance_id: null,
    handler_id: handlerA,
    intervenant_id: professeurA,
    seance_libelle: "Trace legacy",
    action_type: "legacy_test",
    action_label: "Trace HMAC v1",
    acteur_id: handlerA,
    acteur_nom: "Handler audit A",
    details_json: '{"legacy":true}',
    previous_hash: "",
    created_at: "2026-09-07T00:00:00.000Z",
  };
  const hashV1 = calculerHashV1(entreeV1);
  const insertionV1 = await run(
    `
      INSERT INTO historique_actions (
        seance_id, handler_id, intervenant_id, seance_libelle, action_type,
        action_label, acteur_id, acteur_nom, details_json, previous_hash,
        entry_hash, signature_version, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `,
    [
      entreeV1.seance_id,
      entreeV1.handler_id,
      entreeV1.intervenant_id,
      entreeV1.seance_libelle,
      entreeV1.action_type,
      entreeV1.action_label,
      entreeV1.acteur_id,
      entreeV1.acteur_nom,
      entreeV1.details_json,
      entreeV1.previous_hash,
      hashV1,
      entreeV1.created_at,
    ]
  );

  const entreeV2 = await creerEntreeHistorique({
    seanceId: null,
    handlerId: handlerA,
    intervenantId: professeurA,
    seanceLibelle: "Trace scopee",
    actionType: "scope_test",
    actionLabel: "Trace HMAC v2",
    acteurId: handlerA,
    acteurNom: "Handler audit A",
    details: { test: "scope-v2" },
  });
  assert.equal(Number(entreeV2.signature_version), 2, "Les nouvelles traces doivent etre v2.");
  await verifierChaineValide();

  // Legacy scope columns existed before v2 and were not part of its payload.
  // This explicit v1 row must still verify exactly as it was historically signed.
  let integrite = await integriteParId();
  assert.equal(
    integrite.get(Number(insertionV1.id))?.signature_version,
    1,
    "La trace legacy doit rester identifiee comme v1."
  );
  assert.equal(integrite.get(Number(insertionV1.id))?.integrite_valide, true);

  // v2 binds both scope dimensions. Restoring the original value proves the
  // test does not leave a broken chain before the concurrent append scenario.
  await run("UPDATE historique_actions SET handler_id = ? WHERE id = ?", [
    handlerB,
    entreeV2.id,
  ]);
  integrite = await integriteParId();
  assert.equal(
    integrite.get(Number(entreeV2.id))?.integrite_valide,
    false,
    "Modifier handler_id doit invalider une signature v2."
  );
  await run("UPDATE historique_actions SET handler_id = ? WHERE id = ?", [
    handlerA,
    entreeV2.id,
  ]);
  await verifierChaineValide();

  await run("UPDATE historique_actions SET intervenant_id = ? WHERE id = ?", [
    professeurB,
    entreeV2.id,
  ]);
  integrite = await integriteParId();
  assert.equal(
    integrite.get(Number(entreeV2.id))?.integrite_valide,
    false,
    "Modifier intervenant_id doit invalider une signature v2."
  );
  await run("UPDATE historique_actions SET intervenant_id = ? WHERE id = ?", [
    professeurA,
    entreeV2.id,
  ]);
  await verifierChaineValide();

  await run("UPDATE historique_actions SET signature_version = 1 WHERE id = ?", [
    entreeV2.id,
  ]);
  integrite = await integriteParId();
  assert.equal(
    integrite.get(Number(entreeV2.id))?.integrite_valide,
    false,
    "Retrograder la version ne doit pas permettre de contourner la signature v2."
  );
  await run("UPDATE historique_actions SET signature_version = 2 WHERE id = ?", [
    entreeV2.id,
  ]);
  await verifierChaineValide();

  const nombreAppendsParalleles = 32;
  await Promise.all(
    Array.from({ length: nombreAppendsParalleles }, (_, index) =>
      creerEntreeHistorique({
        seanceId: null,
        handlerId: handlerA,
        intervenantId: professeurA,
        seanceLibelle: `Append concurrent ${index + 1}`,
        actionType: "append_concurrent_test",
        actionLabel: `Append concurrent ${index + 1}`,
        acteurId: handlerA,
        acteurNom: "Handler audit A",
        details: { index },
      })
    )
  );

  // This nested call mirrors current mutations which already own a business
  // transaction when they append their audit line.
  await executerTransactionImmediate(async () => {
    await creerEntreeHistorique({
      seanceId: null,
      handlerId: handlerA,
      intervenantId: professeurA,
      seanceLibelle: "Append transaction parent",
      actionType: "append_transaction_parent_test",
      actionLabel: "Append dans transaction parent",
      acteurId: handlerA,
      acteurNom: "Handler audit A",
      details: { reentrant: true },
    });
  });

  const chaine = await all(`
    SELECT id, previous_hash, entry_hash, signature_version
    FROM historique_actions
    ORDER BY id ASC
  `);
  assert.equal(
    chaine.length,
    1 + 1 + nombreAppendsParalleles + 1,
    "Aucune ecriture d'audit concurrente ne doit etre perdue."
  );
  assert.equal(Number(chaine[0].signature_version), 1);
  assert.ok(
    chaine.slice(1).every((entree) => Number(entree.signature_version) === 2),
    "Toutes les nouvelles ecritures doivent employer la signature v2."
  );
  assert.equal(
    new Set(chaine.map((entree) => entree.entry_hash)).size,
    chaine.length,
    "Chaque entree doit disposer de son propre hash de chaine."
  );
  for (let index = 1; index < chaine.length; index += 1) {
    assert.equal(
      chaine[index].previous_hash,
      chaine[index - 1].entry_hash,
      `La trace ${chaine[index].id} doit pointer sur le hash immediatement precedent.`
    );
  }
  await verifierChaineValide();

  // v2 also remains valid through the account deletion flow. The model
  // neutralises signed foreign keys before SQLite's ON DELETE SET NULL runs.
  const handlerASupprimer = await creerUtilisateur({
    nom: "Handler audit a supprimer",
    email: "handler-audit-suppression@example.test",
    publicId: "HD-AUDIT-DELETE",
  });
  const professeurASupprimer = await creerUtilisateur({
    nom: "Professeur audit a supprimer",
    email: "professeur-audit-suppression@example.test",
    publicId: "PR-AUDIT-DELETE",
  });
  const entreeSuppression = await creerEntreeHistorique({
    seanceId: null,
    handlerId: handlerASupprimer,
    intervenantId: professeurASupprimer,
    seanceLibelle: "Trace avant suppression compte",
    actionType: "suppression_compte_test",
    actionLabel: "Trace scopee avant suppression compte",
    acteurId: handlerASupprimer,
    acteurNom: "Handler audit a supprimer",
    details: { suppression_compte: true },
  });
  await detacherUtilisateurHistorique(handlerASupprimer);
  await detacherUtilisateurHistorique(professeurASupprimer);
  await run("DELETE FROM utilisateurs WHERE id IN (?, ?)", [
    handlerASupprimer,
    professeurASupprimer,
  ]);
  const scopeApresSuppression = await all(
    `
      SELECT handler_id, intervenant_id, acteur_id
      FROM historique_actions
      WHERE id = ?
    `,
    [entreeSuppression.id]
  );
  assert.deepEqual(scopeApresSuppression[0], {
    handler_id: null,
    intervenant_id: null,
    acteur_id: null,
  });
  await verifierChaineValide();

  console.log("historique audit chain test: PASS");
}

main()
  .catch((error) => {
    console.error("historique audit chain test: FAIL");
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
