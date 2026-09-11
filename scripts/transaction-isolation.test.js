/*
 * A top-level SQLite statement must never run inside another request's open
 * transaction.  Before the queue in models/db.js, this test lost the outside
 * write on rollback and leaked the uncommitted row to the outside read.
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
  db,
  executerTransactionImmediate,
  fermerBaseDeDonnees,
  run,
} = require("../models/db");

function creerSignal() {
  let resoudre;
  const promesse = new Promise((resolve) => {
    resoudre = resolve;
  });

  return { promesse, resoudre };
}

async function main() {
  let autoriserRollback;
  let resultatTransaction;
  let restaurerMethodesDb = () => {};

  try {
    await run(`
      CREATE TABLE transaction_isolation_regression (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        valeur TEXT NOT NULL
      )
    `);

    const transactionDemarree = creerSignal();
    autoriserRollback = creerSignal();

    const transaction = executerTransactionImmediate(async () => {
      await run(
        "INSERT INTO transaction_isolation_regression (valeur) VALUES ('interne')"
      );
      transactionDemarree.resoudre();
      await autoriserRollback.promesse;
      throw new Error("rollback de test attendu");
    });

    // Attach a rejection handler immediately so an assertion failure below
    // cannot turn the intentional rollback into an unhandled rejection.
    resultatTransaction = transaction.then(
      () => new Error("La transaction de test devait echouer."),
      (error) => error
    );

    await transactionDemarree.promesse;

    // Instrument the native calls rather than waiting an arbitrary duration:
    // the unsafe implementation invokes them immediately, whereas the safe
    // queue must not dispatch either statement before the rollback.
    const runOriginal = db.run;
    const allOriginal = db.all;
    let ecritureExterneEnvoyee = false;
    let lectureExterneEnvoyee = false;
    db.run = function runInstrumente(sql, ...args) {
      if (String(sql).includes("VALUES ('externe')")) {
        ecritureExterneEnvoyee = true;
      }
      return runOriginal.call(this, sql, ...args);
    };
    db.all = function allInstrumente(sql, ...args) {
      if (String(sql).includes("valeur = 'interne'")) {
        lectureExterneEnvoyee = true;
      }
      return allOriginal.call(this, sql, ...args);
    };
    restaurerMethodesDb = () => {
      db.run = runOriginal;
      db.all = allOriginal;
    };

    let ecritureExterneTerminee = false;
    let lectureExterneTerminee = false;
    const ecritureExterne = run(
      "INSERT INTO transaction_isolation_regression (valeur) VALUES ('externe')"
    ).then((resultat) => {
      ecritureExterneTerminee = true;
      return resultat;
    });
    const lectureExterne = all(
      "SELECT valeur FROM transaction_isolation_regression WHERE valeur = 'interne'"
    ).then((lignes) => {
      lectureExterneTerminee = true;
      return lignes;
    });

    assert.equal(
      ecritureExterneEnvoyee,
      false,
      "Une ecriture externe ne doit pas etre envoyee a SQLite avant le rollback."
    );
    assert.equal(
      lectureExterneEnvoyee,
      false,
      "Une lecture externe ne doit pas etre envoyee a SQLite avant le rollback."
    );
    assert.equal(
      ecritureExterneTerminee,
      false,
      "Une ecriture externe doit attendre le commit ou rollback de la transaction en cours."
    );
    assert.equal(
      lectureExterneTerminee,
      false,
      "Une lecture externe ne doit pas observer les donnees non validees."
    );

    autoriserRollback.resoudre();
    const erreurTransaction = await resultatTransaction;
    assert.match(String(erreurTransaction?.message), /rollback de test attendu/);

    await ecritureExterne;
    assert.deepEqual(
      await lectureExterne,
      [],
      "La lecture externe executee apres rollback ne doit pas voir la ligne annulee."
    );
    assert.deepEqual(
      await all(
        "SELECT valeur FROM transaction_isolation_regression ORDER BY id ASC"
      ),
      [{ valeur: "externe" }],
      "Le rollback ne doit pas annuler l'ecriture d'une autre requete."
    );

    console.log("transaction isolation test: PASS");
  } finally {
    autoriserRollback?.resoudre();
    await resultatTransaction?.catch(() => {});
    restaurerMethodesDb();
    await fermerBaseDeDonnees().catch(() => {});
  }
}

main().catch((error) => {
  console.error("transaction isolation test: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
