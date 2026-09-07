const assert = require("node:assert/strict");

function chargerConversionAvecFuseauCentral(fuseauCentral) {
  process.env.CENTRAL_CALENDAR_TIMEZONE = fuseauCentral;
  delete require.cache[require.resolve("../config/public-reservation.config")];
  delete require.cache[require.resolve("../utils/public-calendar-timezone")];
  return require("../utils/public-calendar-timezone");
}

function verifierContratOffsetFixe(fuseauCentral) {
  const {
    convertirDateHeureCentraleVersPublique,
    convertirDateHeurePubliqueVersCentrale,
    convertirIntervalleCentralVersPublic,
    validerOffsetCalendrierPublic,
  } = chargerConversionAvecFuseauCentral(fuseauCentral);

  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "08:00", "GMT"),
    { date: "2026-09-07", heure: "08:00" },
    `${fuseauCentral}: GMT doit conserver l'horloge centrale.`
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "08:00", "GMT+1"),
    { date: "2026-09-07", heure: "09:00" },
    `${fuseauCentral}: GMT+1 doit ajouter une heure civile.`
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "08:00", "GMT+2"),
    { date: "2026-09-07", heure: "10:00" },
    `${fuseauCentral}: GMT+2 doit ajouter deux heures civiles.`
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "15:30", "GMT+2"),
    { date: "2026-09-07", heure: "17:30" }
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "23:30", "GMT+1"),
    { date: "2026-09-08", heure: "00:30" }
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-09-07", "23:30", "GMT+2"),
    { date: "2026-09-08", heure: "01:30" }
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-01-31", "23:30", "GMT+1"),
    { date: "2026-02-01", heure: "00:30" },
    "Le passage de mois doit rester un décalage civil fixe."
  );
  assert.deepEqual(
    convertirDateHeureCentraleVersPublique("2026-12-31", "23:30", "GMT+2"),
    { date: "2027-01-01", heure: "01:30" },
    "Le passage d'année doit rester un décalage civil fixe."
  );
  assert.deepEqual(
    convertirDateHeurePubliqueVersCentrale("2026-09-07", "10:00", "GMT+2"),
    { date: "2026-09-07", heure: "08:00" },
    "Le chemin inverse doit soustraire le même offset fixe."
  );
  assert.deepEqual(
    convertirIntervalleCentralVersPublic(
      { date: "2026-12-31", heureDebut: "23:30", heureFin: "24:00" },
      "GMT+2"
    ),
    {
      date: "2027-01-01",
      date_fin: "2027-01-01",
      heure_debut: "01:30",
      heure_fin: "02:00",
    }
  );
  assert.equal(validerOffsetCalendrierPublic("Europe/Paris"), null);
}

try {
  // Ces valeurs très différentes garantissent que CENTRAL_CALENDAR_TIMEZONE
  // n'influence pas l'offset des créneaux enregistrés.
  verifierContratOffsetFixe("Africa/Casablanca");
  verifierContratOffsetFixe("Pacific/Auckland");
  verifierContratOffsetFixe("UTC");
  console.log("public-calendar-timezone test: PASS");
} catch (error) {
  console.error("public-calendar-timezone test: FAIL");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
