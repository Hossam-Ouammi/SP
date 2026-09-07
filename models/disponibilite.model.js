const { all, get, run } = require("./db");
const { trouverReglagesEspace } = require("./workspace-settings.model");
const { estDateHeureZonneeCivileExistante } = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");
const {
  convertirHeureCalendrierEnMinutes,
  intervalleEstDansPlageCalendrier,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");

const TYPES_DISPONIBILITE = Object.freeze({
  RECURRENTE: "recurrente",
  PONCTUELLE: "ponctuelle",
});

const TYPES_EXCEPTION_DISPONIBILITE = Object.freeze({
  INDISPONIBLE: "indisponible",
  DISPONIBLE: "disponible",
});

// 0 = Monday, ... 6 = Sunday. Keeping this explicit avoids depending on the
// browser locale or JavaScript Date#getDay when serialising a recurring rule.
const JOURS_SEMAINE = Object.freeze({
  LUNDI: 0,
  MARDI: 1,
  MERCREDI: 2,
  JEUDI: 3,
  VENDREDI: 4,
  SAMEDI: 5,
  DIMANCHE: 6,
});

function creerErreurDisponibilite(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserIdentifiantObligatoire(valeur, libelle) {
  const id = normaliserIdentifiant(valeur);

  if (!id) {
    throw creerErreurDisponibilite("INVALID_SCOPE", `${libelle} invalide.`);
  }

  return id;
}

function normaliserIdentifiantOptionnel(valeur, libelle) {
  if (valeur === undefined || valeur === null || valeur === "") {
    return null;
  }

  const id = normaliserIdentifiant(valeur);

  if (!id) {
    throw creerErreurDisponibilite("INVALID_ID", `${libelle} invalide.`);
  }

  return id;
}

function normaliserTexte(valeur, longueurMax = 500) {
  const texte = String(valeur || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return texte.slice(0, longueurMax);
}

function normaliserTypeDisponibilite(valeur) {
  const type = String(valeur || "").trim().toLowerCase();

  if (!Object.values(TYPES_DISPONIBILITE).includes(type)) {
    throw creerErreurDisponibilite("INVALID_RULE_TYPE", "Type de disponibilité invalide.");
  }

  return type;
}

function normaliserTypeExceptionDisponibilite(valeur) {
  const type = String(valeur || "").trim().toLowerCase();

  if (!Object.values(TYPES_EXCEPTION_DISPONIBILITE).includes(type)) {
    throw creerErreurDisponibilite("INVALID_EXCEPTION_TYPE", "Type d'exception invalide.");
  }

  return type;
}

function estDateIsoValide(valeur) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valeur || ""))) {
    return false;
  }

  const [annee, mois, jour] = String(valeur).split("-").map(Number);

  if (annee < 1000 || annee > 9999 || mois < 1 || mois > 12 || jour < 1 || jour > 31) {
    return false;
  }

  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === jour
  );
}

function normaliserDateIso(valeur, libelle = "Date") {
  const date = String(valeur || "").trim();

  if (!estDateIsoValide(date)) {
    throw creerErreurDisponibilite("INVALID_DATE", `${libelle} invalide.`);
  }

  return date;
}

function estHeureValide(valeur) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valeur || ""));
}

function estHeureSurCreneau(valeur) {
  return /^([01]\d|2[0-3]):(00|30)$/.test(String(valeur || ""));
}

function normaliserHeure(valeur, libelle, { fin = false } = {}) {
  const heure = String(valeur || "").trim();

  // `00:00` est une convention de fin de journée pour les APIs. SQLite
  // conserve `24:00` exclusivement en borne de fin afin que les comparaisons
  // et les contraintes restent non ambiguës.
  if (fin && (heure === "00:00" || heure === "24:00")) {
    return "24:00";
  }

  if (!estHeureValide(heure) || !estHeureSurCreneau(heure)) {
    throw creerErreurDisponibilite(
      "INVALID_TIME",
      `${libelle} doit être choisie par tranches de 30 minutes.`
    );
  }

  return heure;
}

function minutesHeure(heure, { fin = false } = {}) {
  return convertirHeureCalendrierEnMinutes(heure, {
    fin,
    accepterMinuit24: fin,
  });
}

function intervalleHoraireEstValide(heureDebut, heureFin) {
  const debut = minutesHeure(heureDebut);
  const fin = minutesHeure(heureFin, { fin: true });
  return Number.isFinite(debut) && Number.isFinite(fin) && fin > debut;
}

function normaliserJourSemaine(valeur) {
  const jour = Number(valeur);

  if (!Number.isInteger(jour) || jour < 0 || jour > 6) {
    throw creerErreurDisponibilite("INVALID_WEEKDAY", "Jour de semaine invalide.");
  }

  return jour;
}

function normaliserActif(valeur, valeurParDefaut = true) {
  if (valeur === undefined) {
    return valeurParDefaut ? 1 : 0;
  }

  if ([true, 1, "1", "true", "on"].includes(valeur)) {
    return 1;
  }

  if ([false, 0, "0", "false", "off"].includes(valeur)) {
    return 0;
  }

  throw creerErreurDisponibilite("INVALID_ACTIVE_STATE", "État actif invalide.");
}

function valeurAvecAlias(donnees, aliases, valeurParDefaut = undefined) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(donnees || {}, alias)) {
      return donnees[alias];
    }
  }

  return valeurParDefaut;
}

function estAliasFourni(donnees, aliases) {
  return aliases.some((alias) => Object.prototype.hasOwnProperty.call(donnees || {}, alias));
}

function normaliserPortee({ handlerId, intervenantId }) {
  return {
    handlerId: normaliserIdentifiantObligatoire(handlerId, "Handler"),
    intervenantId: normaliserIdentifiantObligatoire(intervenantId, "Intervenant"),
  };
}

function preparerDonneesRegle(donnees = {}, regleExistante = null) {
  const type = normaliserTypeDisponibilite(
    valeurAvecAlias(donnees, ["type"], regleExistante?.type)
  );
  const heureDebut = normaliserHeure(
    valeurAvecAlias(donnees, ["heureDebut", "heure_debut"], regleExistante?.heure_debut),
    "Heure de début"
  );
  const heureFin = normaliserHeure(
    valeurAvecAlias(donnees, ["heureFin", "heure_fin"], regleExistante?.heure_fin),
    "Heure de fin",
    { fin: true }
  );

  if (!intervalleHoraireEstValide(heureDebut, heureFin)) {
    throw creerErreurDisponibilite(
      "INVALID_TIME_RANGE",
      "L'heure de fin doit être postérieure à l'heure de début."
    );
  }

  const actif = normaliserActif(
    valeurAvecAlias(donnees, ["actif"], regleExistante?.actif),
    regleExistante ? Number(regleExistante.actif) === 1 : true
  );

  if (type === TYPES_DISPONIBILITE.RECURRENTE) {
    const jourSemaine = normaliserJourSemaine(
      valeurAvecAlias(donnees, ["jourSemaine", "jour_semaine"], regleExistante?.jour_semaine)
    );

    return {
      type,
      jourSemaine,
      date: null,
      heureDebut,
      heureFin,
      actif,
    };
  }

  const date = normaliserDateIso(
    valeurAvecAlias(donnees, ["date"], regleExistante?.date),
    "Date ponctuelle"
  );

  return {
    type,
    jourSemaine: null,
    date,
    heureDebut,
    heureFin,
    actif,
  };
}

function preparerDonneesException(donnees = {}, exceptionExistante = null) {
  const type = normaliserTypeExceptionDisponibilite(
    valeurAvecAlias(donnees, ["type"], exceptionExistante?.type)
  );
  const date = normaliserDateIso(
    valeurAvecAlias(donnees, ["date"], exceptionExistante?.date),
    "Date d'exception"
  );
  const debutBrut = valeurAvecAlias(
    donnees,
    ["heureDebut", "heure_debut"],
    exceptionExistante?.heure_debut
  );
  const finBrut = valeurAvecAlias(
    donnees,
    ["heureFin", "heure_fin"],
    exceptionExistante?.heure_fin
  );
  const debutVide = debutBrut === undefined || debutBrut === null || debutBrut === "";
  const finVide = finBrut === undefined || finBrut === null || finBrut === "";

  if (debutVide !== finVide) {
    throw creerErreurDisponibilite(
      "INVALID_EXCEPTION_TIME_RANGE",
      "Une exception horaire doit contenir une heure de début et une heure de fin."
    );
  }

  let heureDebut = null;
  let heureFin = null;

  if (!debutVide) {
    heureDebut = normaliserHeure(debutBrut, "Heure de début");
    heureFin = normaliserHeure(finBrut, "Heure de fin", { fin: true });

    if (!intervalleHoraireEstValide(heureDebut, heureFin)) {
      throw creerErreurDisponibilite(
        "INVALID_EXCEPTION_TIME_RANGE",
        "L'heure de fin doit être postérieure à l'heure de début."
      );
    }
  }

  return {
    type,
    date,
    heureDebut,
    heureFin,
    raison: normaliserTexte(
      valeurAvecAlias(donnees, ["raison"], exceptionExistante?.raison),
      500
    ) || null,
  };
}

async function verifierPlageCalendrierPortee(portee, { date, heureDebut, heureFin } = {}) {
  if (!heureDebut || !heureFin) {
    return;
  }

  const reglages = await trouverReglagesEspace(portee.handlerId);

  // Une regle recurrente n'a pas de date civile precise : elle reste valide
  // et le calendrier public masque les creneaux sautes le jour du DST. Les
  // regles ponctuelles et les exceptions datees, elles, ne peuvent pas
  // enregistrer une heure murale inexistante.
  if (
    date &&
    (!estDateHeureZonneeCivileExistante(date, heureDebut, CENTRAL_CALENDAR_TIMEZONE) ||
      !estDateHeureZonneeCivileExistante(date, heureFin, CENTRAL_CALENDAR_TIMEZONE))
  ) {
    throw creerErreurDisponibilite(
      "INVALID_CIVIL_TIME",
      "Cette heure civile n'existe pas dans le fuseau horaire central à cette date."
    );
  }

  const plage = normaliserPlageDepuisReglages(reglages || {});
  if (
    !intervalleEstDansPlageCalendrier({
      heureDebut,
      heureFin,
      plage,
    })
  ) {
    throw creerErreurDisponibilite(
      "CALENDAR_RANGE_VIOLATION",
      `Cette disponibilité doit rester dans la plage du calendrier Handler (${plage.calendar_start_time}–${plage.calendar_end_time}).`
    );
  }
}

const requeteRegleComplete = `
  SELECT
    disponibilites.*,
    createur.nom AS cree_par_nom
  FROM disponibilites
  LEFT JOIN utilisateurs AS createur ON createur.id = disponibilites.cree_par
`;

const requeteExceptionComplete = `
  SELECT
    exceptions_disponibilites.*,
    createur.nom AS cree_par_nom,
    disponibilites.type AS disponibilite_type,
    disponibilites.jour_semaine AS disponibilite_jour_semaine,
    disponibilites.date AS disponibilite_date,
    disponibilites.heure_debut AS disponibilite_heure_debut,
    disponibilites.heure_fin AS disponibilite_heure_fin,
    disponibilites.actif AS disponibilite_active
  FROM exceptions_disponibilites
  LEFT JOIN utilisateurs AS createur ON createur.id = exceptions_disponibilites.cree_par
  LEFT JOIN disponibilites ON disponibilites.id = exceptions_disponibilites.disponibilite_id
`;

function construireFiltrePortee(alias, { handlerId, intervenantId }) {
  const portee = normaliserPortee({ handlerId, intervenantId });

  return {
    portee,
    clause: `${alias}.handler_id = ? AND ${alias}.intervenant_id = ?`,
    parametres: [portee.handlerId, portee.intervenantId],
  };
}

function normaliserBornesDate(options = {}) {
  const dateDebutBrute = valeurAvecAlias(options, ["dateDebut", "date_debut", "du"]);
  const dateFinBrute = valeurAvecAlias(options, ["dateFin", "date_fin", "au"]);
  const dateDebut = dateDebutBrute ? normaliserDateIso(dateDebutBrute, "Date de début") : null;
  const dateFin = dateFinBrute ? normaliserDateIso(dateFinBrute, "Date de fin") : null;

  if (dateDebut && dateFin && dateDebut > dateFin) {
    throw creerErreurDisponibilite("INVALID_DATE_RANGE", "La période demandée est invalide.");
  }

  return { dateDebut, dateFin };
}

async function listerReglesDisponibiliteIntervenant(handlerId, intervenantId, options = {}) {
  const filtre = construireFiltrePortee("disponibilites", { handlerId, intervenantId });
  const activesSeulement =
    options.activesSeulement === true || options.actives_seulement === true;
  const { dateDebut, dateFin } = normaliserBornesDate(options);
  const clauses = [filtre.clause];
  const parametres = [...filtre.parametres];

  if (activesSeulement) {
    clauses.push("disponibilites.actif = 1");
  }

  if (dateDebut || dateFin) {
    const conditionsPonctuelles = ["disponibilites.type = 'ponctuelle'"];

    if (dateDebut) {
      conditionsPonctuelles.push("disponibilites.date >= ?");
      parametres.push(dateDebut);
    }

    if (dateFin) {
      conditionsPonctuelles.push("disponibilites.date <= ?");
      parametres.push(dateFin);
    }

    clauses.push(
      `(disponibilites.type = 'recurrente' OR (${conditionsPonctuelles.join(" AND ")}))`
    );
  }

  return all(
    `
      ${requeteRegleComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE disponibilites.type WHEN 'recurrente' THEN 0 ELSE 1 END ASC,
        disponibilites.jour_semaine ASC,
        disponibilites.date ASC,
        disponibilites.heure_debut ASC,
        disponibilites.id ASC
    `,
    parametres
  );
}

async function listerReglesDisponibiliteActivesIntervenant(
  handlerId,
  intervenantId,
  options = {}
) {
  return listerReglesDisponibiliteIntervenant(handlerId, intervenantId, {
    ...options,
    activesSeulement: true,
  });
}

async function trouverRegleDisponibiliteParIdIntervenant(id, handlerId, intervenantId) {
  const regleId = normaliserIdentifiant(id);

  if (!regleId) {
    return null;
  }

  const filtre = construireFiltrePortee("disponibilites", { handlerId, intervenantId });

  const regle = await get(
    `
      ${requeteRegleComplete}
      WHERE disponibilites.id = ?
        AND ${filtre.clause}
    `,
    [regleId, ...filtre.parametres]
  );

  return regle || null;
}

async function creerRegleDisponibilite({
  handlerId,
  intervenantId,
  creePar = null,
  ...donnees
}) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const regle = preparerDonneesRegle(donnees);
  await verifierPlageCalendrierPortee(portee, regle);
  const createurId = normaliserIdentifiantOptionnel(creePar, "Créateur");
  const resultat = await run(
    `
      INSERT INTO disponibilites (
        handler_id,
        intervenant_id,
        type,
        jour_semaine,
        date,
        heure_debut,
        heure_fin,
        actif,
        cree_par,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      portee.handlerId,
      portee.intervenantId,
      regle.type,
      regle.jourSemaine,
      regle.date,
      regle.heureDebut,
      regle.heureFin,
      regle.actif,
      createurId,
    ]
  );

  return trouverRegleDisponibiliteParIdIntervenant(
    resultat.id,
    portee.handlerId,
    portee.intervenantId
  );
}

async function modifierRegleDisponibilite(id, { handlerId, intervenantId, ...donnees }) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const regleExistante = await trouverRegleDisponibiliteParIdIntervenant(
    id,
    portee.handlerId,
    portee.intervenantId
  );

  if (!regleExistante) {
    return null;
  }

  const regle = preparerDonneesRegle(donnees, regleExistante);
  await verifierPlageCalendrierPortee(portee, regle);
  await run(
    `
      UPDATE disponibilites
      SET
        type = ?,
        jour_semaine = ?,
        date = ?,
        heure_debut = ?,
        heure_fin = ?,
        actif = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND handler_id = ?
        AND intervenant_id = ?
    `,
    [
      regle.type,
      regle.jourSemaine,
      regle.date,
      regle.heureDebut,
      regle.heureFin,
      regle.actif,
      regleExistante.id,
      portee.handlerId,
      portee.intervenantId,
    ]
  );

  return trouverRegleDisponibiliteParIdIntervenant(
    regleExistante.id,
    portee.handlerId,
    portee.intervenantId
  );
}

async function supprimerRegleDisponibilite(id, { handlerId, intervenantId }) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const regleId = normaliserIdentifiant(id);

  if (!regleId) {
    return { changes: 0 };
  }

  return run(
    `
      DELETE FROM disponibilites
      WHERE id = ?
        AND handler_id = ?
        AND intervenant_id = ?
    `,
    [regleId, portee.handlerId, portee.intervenantId]
  );
}

async function verifierRegleAssociee(disponibiliteId, portee) {
  if (!disponibiliteId) {
    return null;
  }

  const regle = await trouverRegleDisponibiliteParIdIntervenant(
    disponibiliteId,
    portee.handlerId,
    portee.intervenantId
  );

  if (!regle) {
    throw creerErreurDisponibilite(
      "RULE_OUT_OF_SCOPE",
      "La règle de disponibilité associée est introuvable dans ce périmètre."
    );
  }

  return regle;
}

async function listerExceptionsDisponibiliteIntervenant(handlerId, intervenantId, options = {}) {
  const filtre = construireFiltrePortee("exceptions_disponibilites", { handlerId, intervenantId });
  const { dateDebut, dateFin } = normaliserBornesDate(options);
  const clauses = [filtre.clause];
  const parametres = [...filtre.parametres];

  if (dateDebut) {
    clauses.push("exceptions_disponibilites.date >= ?");
    parametres.push(dateDebut);
  }

  if (dateFin) {
    clauses.push("exceptions_disponibilites.date <= ?");
    parametres.push(dateFin);
  }

  return all(
    `
      ${requeteExceptionComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        exceptions_disponibilites.date ASC,
        COALESCE(exceptions_disponibilites.heure_debut, '00:00') ASC,
        exceptions_disponibilites.id ASC
    `,
    parametres
  );
}

async function trouverExceptionDisponibiliteParIdIntervenant(id, handlerId, intervenantId) {
  const exceptionId = normaliserIdentifiant(id);

  if (!exceptionId) {
    return null;
  }

  const filtre = construireFiltrePortee("exceptions_disponibilites", {
    handlerId,
    intervenantId,
  });

  const exception = await get(
    `
      ${requeteExceptionComplete}
      WHERE exceptions_disponibilites.id = ?
        AND ${filtre.clause}
    `,
    [exceptionId, ...filtre.parametres]
  );

  return exception || null;
}

async function creerExceptionDisponibilite({
  handlerId,
  intervenantId,
  disponibiliteId = null,
  disponibilite_id: disponibiliteIdSnakeCase,
  creePar = null,
  cree_par: creeParSnakeCase,
  ...donnees
}) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const exception = preparerDonneesException(donnees);
  await verifierPlageCalendrierPortee(portee, exception);
  const regleId = normaliserIdentifiantOptionnel(
    disponibiliteIdSnakeCase ?? disponibiliteId,
    "Règle de disponibilité"
  );
  const createurId = normaliserIdentifiantOptionnel(creeParSnakeCase ?? creePar, "Créateur");

  await verifierRegleAssociee(regleId, portee);

  const resultat = await run(
    `
      INSERT INTO exceptions_disponibilites (
        disponibilite_id,
        handler_id,
        intervenant_id,
        date,
        type,
        heure_debut,
        heure_fin,
        raison,
        cree_par,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      regleId,
      portee.handlerId,
      portee.intervenantId,
      exception.date,
      exception.type,
      exception.heureDebut,
      exception.heureFin,
      exception.raison,
      createurId,
    ]
  );

  return trouverExceptionDisponibiliteParIdIntervenant(
    resultat.id,
    portee.handlerId,
    portee.intervenantId
  );
}

async function modifierExceptionDisponibilite(id, {
  handlerId,
  intervenantId,
  disponibiliteId,
  disponibilite_id: disponibiliteIdSnakeCase,
  ...donnees
}) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const exceptionExistante = await trouverExceptionDisponibiliteParIdIntervenant(
    id,
    portee.handlerId,
    portee.intervenantId
  );

  if (!exceptionExistante) {
    return null;
  }

  const exception = preparerDonneesException(donnees, exceptionExistante);
  await verifierPlageCalendrierPortee(portee, exception);
  const liaisonFournie =
    disponibiliteIdSnakeCase !== undefined || disponibiliteId !== undefined;
  const regleId = liaisonFournie
    ? normaliserIdentifiantOptionnel(
        disponibiliteIdSnakeCase ?? disponibiliteId,
        "Règle de disponibilité"
      )
    : normaliserIdentifiant(exceptionExistante.disponibilite_id);

  await verifierRegleAssociee(regleId, portee);

  await run(
    `
      UPDATE exceptions_disponibilites
      SET
        disponibilite_id = ?,
        date = ?,
        type = ?,
        heure_debut = ?,
        heure_fin = ?,
        raison = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND handler_id = ?
        AND intervenant_id = ?
    `,
    [
      regleId,
      exception.date,
      exception.type,
      exception.heureDebut,
      exception.heureFin,
      exception.raison,
      exceptionExistante.id,
      portee.handlerId,
      portee.intervenantId,
    ]
  );

  return trouverExceptionDisponibiliteParIdIntervenant(
    exceptionExistante.id,
    portee.handlerId,
    portee.intervenantId
  );
}

async function supprimerExceptionDisponibilite(id, { handlerId, intervenantId }) {
  const portee = normaliserPortee({ handlerId, intervenantId });
  const exceptionId = normaliserIdentifiant(id);

  if (!exceptionId) {
    return { changes: 0 };
  }

  return run(
    `
      DELETE FROM exceptions_disponibilites
      WHERE id = ?
        AND handler_id = ?
        AND intervenant_id = ?
    `,
    [exceptionId, portee.handlerId, portee.intervenantId]
  );
}

module.exports = {
  TYPES_DISPONIBILITE,
  TYPES_EXCEPTION_DISPONIBILITE,
  JOURS_SEMAINE,
  normaliserIdentifiant,
  normaliserPortee,
  normaliserTypeDisponibilite,
  normaliserTypeExceptionDisponibilite,
  normaliserDateIso,
  normaliserHeure,
  verifierPlageCalendrierPortee,
  normaliserJourSemaine,
  preparerDonneesRegle,
  preparerDonneesException,
  listerReglesDisponibiliteIntervenant,
  listerReglesDisponibiliteActivesIntervenant,
  trouverRegleDisponibiliteParIdIntervenant,
  creerRegleDisponibilite,
  modifierRegleDisponibilite,
  supprimerRegleDisponibilite,
  listerExceptionsDisponibiliteIntervenant,
  trouverExceptionDisponibiliteParIdIntervenant,
  creerExceptionDisponibilite,
  modifierExceptionDisponibilite,
  supprimerExceptionDisponibilite,
};
