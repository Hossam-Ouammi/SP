const { all, get, run, executerTransactionImmediate } = require("./db");
const {
  creerJetonCalendrierPublicStable,
  hacherJetonCalendrierPublic,
} = require("./public-calendar.model");
const {
  convertirHeureCalendrierEnMinutes,
  intervalleEstDansPlageCalendrier,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function trouverReglagesEspace(utilisateurId) {
  const id = normaliserIdentifiant(utilisateurId);
  if (!id) {
    return null;
  }

  return get(
    `
      SELECT
        id,
        public_id,
        nom,
        public_calendar_timezone,
        calendar_start_time,
        calendar_end_time,
        calendrier_public_actif,
        token_calendrier_public_hash
      FROM utilisateurs
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
}

async function mettreAJourReglagesCalendrier(
  utilisateurId,
  { calendarStartTime, calendarEndTime }
) {
  const id = normaliserIdentifiant(utilisateurId);
  if (!id) {
    return null;
  }

  await run(
    `
      UPDATE utilisateurs
      SET
        calendar_start_time = ?,
        calendar_end_time = ?
      WHERE id = ?
    `,
    [calendarStartTime, calendarEndTime, id]
  );

  return trouverReglagesEspace(id);
}

async function mettreAJourReglagesCalendrierPublic(
  utilisateurId,
  { actif, publicCalendarTimezone } = {}
) {
  const id = normaliserIdentifiant(utilisateurId);
  if (!id) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const existant = await trouverReglagesEspace(id);
    if (!existant) {
      return null;
    }

    const champs = [];
    const parametres = [];
    if (publicCalendarTimezone !== undefined) {
      champs.push("public_calendar_timezone = ?");
      parametres.push(publicCalendarTimezone);
    }
    if (actif !== undefined) {
      champs.push("calendrier_public_actif = ?");
      parametres.push(actif ? 1 : 0);
    }

    if (champs.length > 0) {
      parametres.push(id);
      await run(
        `UPDATE utilisateurs SET ${champs.join(", ")} WHERE id = ?`,
        parametres
      );
    }

    return trouverReglagesEspace(id);
  });
}

function estActuelOuFuturOuRecurrent(ligne, { dateReference, heureReference } = {}) {
  if (String(ligne?.type || "").toLowerCase() === "recurrente") {
    return true;
  }

  const date = String(ligne?.date || "");
  const dateReferenceNormalisee = String(dateReference || "");

  if (!dateReferenceNormalisee || date > dateReferenceNormalisee) {
    return true;
  }

  if (date < dateReferenceNormalisee) {
    return false;
  }

  // Pour aujourd'hui, on ne remonte que les creneaux qui n'ont pas encore
  // entierement expire dans l'horloge locale du Handler. Cela evite qu'un
  // changement de plage soit bloque par une seance deja terminee ce matin,
  // tout en conservant les creneaux en cours ou a venir.
  const minutesReference = convertirHeureCalendrierEnMinutes(heureReference);
  const heureFin = Number(ligne?.jour_complet) === 1 ? "24:00" : ligne?.heure_fin;
  const minutesFin = convertirHeureCalendrierEnMinutes(heureFin, {
    fin: true,
    accepterMinuit24: true,
  });

  return (
    !Number.isFinite(minutesReference) ||
    !Number.isFinite(minutesFin) ||
    minutesFin > minutesReference
  );
}

function serialiserAvertissementElements(elements = []) {
  const exemples = elements.slice(0, 5).map((element) => ({
    id: Number(element?.id) || null,
    date: String(element?.date || ""),
    heure_debut: String(element?.heure_debut || ""),
    heure_fin: String(element?.heure_fin || ""),
    type: element?.type ? String(element.type) : undefined,
  }));

  return {
    total: elements.length,
    exemples,
  };
}

/**
 * Les données déjà existantes ne sont jamais réécrites lorsque le Handler
 * resserre sa fenêtre. Cette lecture est donc volontairement séparée de la
 * mutation : le contrôleur peut demander une confirmation explicite, puis
 * refaire le contrôle dans la même transaction que l'écriture.
 */
async function listerAvertissementsPlageCalendrierFuture({
  handlerId,
  plageCalendrierAvant = null,
  plageCalendrier,
  dateReference,
  heureReference,
}) {
  const id = normaliserIdentifiant(handlerId);
  if (!id) {
    return {
      seances_futures: serialiserAvertissementElements(),
      disponibilites_futures: serialiserAvertissementElements(),
      exceptions_futures: serialiserAvertissementElements(),
      indisponibilites_futures: serialiserAvertissementElements(),
      total: 0,
    };
  }

  const plage = normaliserPlageDepuisReglages(plageCalendrier);
  const reglagesActuels = plageCalendrierAvant ? null : await trouverReglagesEspace(id);
  const plageAvant = normaliserPlageDepuisReglages(plageCalendrierAvant || reglagesActuels || {});
  const reference = String(dateReference || "0000-01-01");
  const [seances, disponibilites, exceptions, indisponibilites] = await Promise.all([
    all(
      `
        SELECT id, date, heure_debut, heure_fin, statut_seance
        FROM seances
        WHERE handler_id = ?
          AND date >= ?
          AND lower(COALESCE(statut_seance, 'planifiee')) <> 'annulee'
      `,
      [id, reference]
    ),
    all(
      `
        SELECT id, type, date, jour_semaine, heure_debut, heure_fin
        FROM disponibilites
        WHERE handler_id = ?
          AND actif = 1
          AND (type = 'recurrente' OR date >= ?)
      `,
      [id, reference]
    ),
    all(
      `
        SELECT id, type, date, heure_debut, heure_fin
        FROM exceptions_disponibilites
        WHERE handler_id = ?
          AND date >= ?
          AND heure_debut IS NOT NULL
          AND heure_fin IS NOT NULL
      `,
      [id, reference]
    ),
    all(
      `
        SELECT id, date, heure_debut, heure_fin, jour_complet
        FROM indisponibilites
        WHERE handler_id = ?
          AND date >= ?
          AND COALESCE(jour_complet, 0) = 0
      `,
      [id, reference]
    ),
  ]);

  const devientHorsPlage = (ligne) =>
    intervalleEstDansPlageCalendrier({
      heureDebut: ligne?.heure_debut,
      heureFin: ligne?.heure_fin,
      plage: plageAvant,
    }) &&
    !intervalleEstDansPlageCalendrier({
      heureDebut: ligne?.heure_debut,
      heureFin: ligne?.heure_fin,
      plage,
    });
  const elementAVenir = (ligne) =>
    estActuelOuFuturOuRecurrent(ligne, {
      dateReference: reference,
      heureReference,
    });
  const seancesHorsPlage = seances.filter(elementAVenir).filter(devientHorsPlage);
  const disponibilitesHorsPlage = disponibilites
    .filter(elementAVenir)
    .filter(devientHorsPlage);
  const exceptionsHorsPlage = exceptions.filter(elementAVenir).filter(devientHorsPlage);
  const indisponibilitesHorsPlage = indisponibilites
    .filter(elementAVenir)
    .filter(devientHorsPlage);
  const avertissement = {
    seances_futures: serialiserAvertissementElements(seancesHorsPlage),
    disponibilites_futures: serialiserAvertissementElements(disponibilitesHorsPlage),
    exceptions_futures: serialiserAvertissementElements(exceptionsHorsPlage),
    indisponibilites_futures: serialiserAvertissementElements(indisponibilitesHorsPlage),
  };

  avertissement.total = Object.values(avertissement).reduce(
    (total, entree) => total + (Number(entree?.total) || 0),
    0
  );
  return avertissement;
}

async function definirEtatCalendrierPublic(handlerId, actif) {
  return mettreAJourReglagesCalendrierPublic(handlerId, { actif });
}

/**
 * Creates (or migrates) the one stable opaque URL owned by a Handler. Only its
 * SHA-256 hash is persisted. Repeating this call never changes the URL, which
 * lets the authenticated settings screen safely offer Copy after a reload.
 */
async function assurerJetonCalendrierPublicStable(handlerId) {
  const id = normaliserIdentifiant(handlerId);
  if (!id) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const existant = await trouverReglagesEspace(id);
    if (!existant) {
      return null;
    }

    const token = creerJetonCalendrierPublicStable(id);
    const tokenHash = hacherJetonCalendrierPublic(token);
    if (!token || !tokenHash) {
      return null;
    }

    if (String(existant.token_calendrier_public_hash || "") !== tokenHash) {
      await run(
        "UPDATE utilisateurs SET token_calendrier_public_hash = ? WHERE id = ?",
        [tokenHash, id]
      );
    }

    return trouverReglagesEspace(id);
  });
}

async function regenererJetonCalendrierPublic(handlerId) {
  const id = normaliserIdentifiant(handlerId);
  if (!id) {
    return null;
  }

  const token = creerJetonCalendrierPublicStable(id);
  const tokenHash = hacherJetonCalendrierPublic(token);
  if (!token || !tokenHash) {
    return null;
  }

  const reglages = await executerTransactionImmediate(async () => {
    const existant = await trouverReglagesEspace(id);
    if (!existant) {
      return null;
    }

    await run(
      `
        UPDATE utilisateurs
        SET
          token_calendrier_public_hash = ?,
          calendrier_public_actif = 1
        WHERE id = ?
      `,
      [tokenHash, id]
    );

    return trouverReglagesEspace(id);
  });

  // Historical route compatibility: its old "regenerate" name must never
  // rotate the unique Handler URL.
  return reglages ? { reglages, token } : null;
}

module.exports = {
  trouverReglagesEspace,
  mettreAJourReglagesCalendrier,
  mettreAJourReglagesCalendrierPublic,
  listerAvertissementsPlageCalendrierFuture,
  definirEtatCalendrierPublic,
  assurerJetonCalendrierPublicStable,
  regenererJetonCalendrierPublic,
};
