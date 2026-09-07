const assert = require("node:assert/strict");

const {
  convertirDateHeureZonneeEnInstant,
  convertirInstantEnDateHeureZonnee,
  estDateHeureZonneeCivileExistante,
} = require("../utils/timezone");

const FUSEAU_PARIS = "Europe/Paris";

function verifier() {
  // Le spring-forward de Paris 2026 saute 02:00--02:59.
  assert.equal(estDateHeureZonneeCivileExistante("2026-03-29", "01:30", FUSEAU_PARIS), true);
  assert.equal(estDateHeureZonneeCivileExistante("2026-03-29", "02:00", FUSEAU_PARIS), false);
  assert.equal(estDateHeureZonneeCivileExistante("2026-03-29", "02:30", FUSEAU_PARIS), false);
  assert.equal(estDateHeureZonneeCivileExistante("2026-03-29", "03:00", FUSEAU_PARIS), true);
  assert.equal(estDateHeureZonneeCivileExistante("2026-03-28", "24:00", FUSEAU_PARIS), true);

  // A l'automne 02:30 est repetee, mais demeure une heure civile utilisable.
  // Le convertisseur conserve sa convention existante : deux conversions de
  // la meme valeur murale produisent le meme instant et un aller-retour
  // restitue cette valeur murale.
  assert.equal(estDateHeureZonneeCivileExistante("2026-10-25", "02:30", FUSEAU_PARIS), true);
  const premierInstant = convertirDateHeureZonneeEnInstant(
    "2026-10-25",
    "02:30",
    FUSEAU_PARIS
  );
  const secondInstant = convertirDateHeureZonneeEnInstant(
    "2026-10-25",
    "02:30",
    FUSEAU_PARIS
  );
  assert.ok(premierInstant instanceof Date && !Number.isNaN(premierInstant.getTime()));
  assert.equal(premierInstant.toISOString(), secondInstant.toISOString());
  assert.deepEqual(
    convertirInstantEnDateHeureZonnee(premierInstant, FUSEAU_PARIS),
    {
      date: "2026-10-25",
      heure: "02:30",
      secondes: "02:30:00",
    }
  );
}

verifier();
console.log("timezone-dst test: PASS");
