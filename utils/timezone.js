function obtenirFormateur(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function extraireParties(dateObjet, timeZone) {
  const parties = obtenirFormateur(timeZone).formatToParts(dateObjet);
  const resultat = {};

  parties.forEach((partie) => {
    if (partie.type !== "literal") {
      resultat[partie.type] = partie.value;
    }
  });

  return {
    year: Number(resultat.year),
    month: Number(resultat.month),
    day: Number(resultat.day),
    hour: Number(resultat.hour),
    minute: Number(resultat.minute),
    second: Number(resultat.second),
  };
}

function convertirDateHeureZonneeEnInstant(dateIso, heure, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ""))) {
    return null;
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""))) {
    return null;
  }

  const [annee, mois, jour] = String(dateIso).split("-").map(Number);
  const [heures, minutes] = String(heure).split(":").map(Number);
  const horodatageLocalCible = Date.UTC(annee, mois - 1, jour, heures, minutes, 0);
  let horodatageUtc = horodatageLocalCible;

  for (let index = 0; index < 4; index += 1) {
    const parties = extraireParties(new Date(horodatageUtc), timeZone);
    const horodatageLocalObserve = Date.UTC(
      parties.year,
      parties.month - 1,
      parties.day,
      parties.hour,
      parties.minute,
      parties.second
    );
    const difference = horodatageLocalCible - horodatageLocalObserve;

    horodatageUtc += difference;

    if (difference === 0) {
      break;
    }
  }

  return new Date(horodatageUtc);
}

function convertirInstantEnDateHeureZonnee(dateObjet, timeZone) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return null;
  }

  const parties = extraireParties(dateObjet, timeZone);
  return {
    date: `${String(parties.year).padStart(4, "0")}-${String(parties.month).padStart(
      2,
      "0"
    )}-${String(parties.day).padStart(2, "0")}`,
    heure: `${String(parties.hour).padStart(2, "0")}:${String(parties.minute).padStart(
      2,
      "0"
    )}`,
    secondes: `${String(parties.hour).padStart(2, "0")}:${String(parties.minute).padStart(
      2,
      "0"
    )}:${String(parties.second).padStart(2, "0")}`,
  };
}

function convertirDateHeureEntreFuseaux(dateIso, heure, fuseauSource, fuseauCible) {
  const instant = convertirDateHeureZonneeEnInstant(dateIso, heure, fuseauSource);

  if (!instant) {
    return null;
  }

  return convertirInstantEnDateHeureZonnee(instant, fuseauCible);
}

module.exports = {
  convertirDateHeureZonneeEnInstant,
  convertirInstantEnDateHeureZonnee,
  convertirDateHeureEntreFuseaux,
};
