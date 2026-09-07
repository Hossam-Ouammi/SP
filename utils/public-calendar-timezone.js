const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");
const { convertirInstantEnDateHeureZonnee } = require("./timezone");

// Contrat métier du calendrier public :
//   horloge publique = horloge centrale + décalage fixe choisi.
//
// Ces valeurs ne désignent volontairement PAS des zones géographiques. En
// particulier, GMT+2 ne signifie pas « convertir Africa/Casablanca vers UTC+2 »
// et ne subit pas de changement saisonnier côté public.
const OFFSETS_CALENDRIER_PUBLIC = Object.freeze({
  GMT: Object.freeze({
    libelle: "GMT",
    offsetMinutes: 0,
  }),
  "GMT+1": Object.freeze({
    libelle: "GMT+1",
    offsetMinutes: 60,
  }),
  "GMT+2": Object.freeze({
    libelle: "GMT+2",
    offsetMinutes: 120,
  }),
});

// Alias conservé pour les consommateurs de code existants. Son contenu décrit
// désormais des offsets de l'horloge centrale, et non des fuseaux IANA.
const FUSEAUX_PUBLICS_FIXES = OFFSETS_CALENDRIER_PUBLIC;
const FUSEAU_PUBLIC_PAR_DEFAUT = "GMT";

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function estDateIsoValide(date) {
  const valeur = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return false;
  }

  const objet = new Date(`${valeur}T12:00:00Z`);
  return !Number.isNaN(objet.getTime()) && objet.toISOString().startsWith(valeur);
}

function ajouterJoursIso(date, nombreJours) {
  if (!estDateIsoValide(date)) {
    return null;
  }

  const objet = new Date(`${date}T12:00:00Z`);
  objet.setUTCDate(objet.getUTCDate() + Number(nombreJours || 0));
  return objet.toISOString().slice(0, 10);
}

function estHeureValide(heure, { accepterFinDeJournee = false } = {}) {
  const valeur = String(heure || "");
  return (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(valeur) ||
    (accepterFinDeJournee && valeur === "24:00")
  );
}

// Cette validation existe uniquement pour que les migrations historiques 0707
// et 0708 gardent exactement leur comportement append-only. Aucun nouveau
// réglage public ne doit l'employer.
function estFuseauIanaValide(fuseau) {
  const valeur = normaliserTexte(fuseau);
  if (!valeur || valeur.length > 100) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: valeur }).format(new Date());
    return true;
  } catch (erreur) {
    return false;
  }
}

function validerFuseauCalendrierPublic(valeur) {
  const fuseau = normaliserTexte(valeur);
  if (Object.prototype.hasOwnProperty.call(OFFSETS_CALENDRIER_PUBLIC, fuseau)) {
    return fuseau;
  }
  return estFuseauIanaValide(fuseau) ? fuseau : null;
}

function validerOffsetCalendrierPublic(valeur) {
  const offset = normaliserTexte(valeur);
  return Object.prototype.hasOwnProperty.call(OFFSETS_CALENDRIER_PUBLIC, offset)
    ? offset
    : null;
}

function normaliserFuseauCalendrierPublic(valeur, valeurParDefaut = FUSEAU_PUBLIC_PAR_DEFAUT) {
  // Le nom public historique est conservé, mais le comportement courant est
  // volontairement strict : seuls les trois offsets métier sont exploitables.
  return (
    validerOffsetCalendrierPublic(valeur) ||
    validerOffsetCalendrierPublic(valeurParDefaut) ||
    FUSEAU_PUBLIC_PAR_DEFAUT
  );
}

function obtenirDefinitionFuseauCalendrierPublic(valeur) {
  const identifiant = normaliserFuseauCalendrierPublic(valeur);
  const definition = OFFSETS_CALENDRIER_PUBLIC[identifiant];

  return {
    identifiant,
    libelle: definition.libelle,
    type: "offset_horloge_centrale_fixe",
    offsetMinutes: definition.offsetMinutes,
  };
}

function decomposerHeure(heure, { fin = false } = {}) {
  const valeur = String(heure || "");
  const finDeJournee = valeur === "24:00" || (fin && valeur === "00:00");

  if (!estHeureValide(valeur, { accepterFinDeJournee: true })) {
    return null;
  }

  if (finDeJournee) {
    return { heures: 0, minutes: 0, decalageJour: 1 };
  }

  const [heures, minutes] = valeur.split(":").map(Number);
  return { heures, minutes, decalageJour: 0 };
}

function deplacerDateHeureCivile(date, heure, decalageMinutes, options = {}) {
  if (!estDateIsoValide(date)) {
    return null;
  }

  const partiesHeure = decomposerHeure(heure, options);
  if (!partiesHeure) {
    return null;
  }

  const [annee, mois, jour] = String(date).split("-").map(Number);
  const instant = Date.UTC(
    annee,
    mois - 1,
    jour + partiesHeure.decalageJour,
    partiesHeure.heures,
    partiesHeure.minutes,
    0
  );
  const resultat = new Date(instant + Number(decalageMinutes || 0) * 60 * 1000);

  return {
    date: resultat.toISOString().slice(0, 10),
    heure: resultat.toISOString().slice(11, 16),
  };
}

function convertirDateHeureCentraleVersPublique(
  date,
  heure,
  offsetPublic,
  { fin = false } = {}
) {
  const definition = obtenirDefinitionFuseauCalendrierPublic(offsetPublic);
  return deplacerDateHeureCivile(date, heure, definition.offsetMinutes, { fin });
}

function convertirDateHeurePubliqueVersCentrale(
  date,
  heure,
  offsetPublic,
  { fin = false } = {}
) {
  const definition = obtenirDefinitionFuseauCalendrierPublic(offsetPublic);
  return deplacerDateHeureCivile(date, heure, -definition.offsetMinutes, { fin });
}

function convertirIntervalleCentralVersPublic(
  { date, heureDebut, heureFin },
  offsetPublic,
  options = {}
) {
  const debut = convertirDateHeureCentraleVersPublique(date, heureDebut, offsetPublic, options);
  const fin = convertirDateHeureCentraleVersPublique(date, heureFin, offsetPublic, {
    ...options,
    fin: true,
  });

  if (!debut || !fin) {
    return null;
  }

  const lendemainDebut = ajouterJoursIso(debut.date, 1);
  const finMinuitDuLendemain = fin.date === lendemainDebut && fin.heure === "00:00";

  return {
    date: debut.date,
    date_fin: fin.date,
    heure_debut: debut.heure,
    // L'API publique représente une fin exacte de journée avec 24:00 afin
    // qu'un évènement ne soit jamais rattaché au mauvais jour de grille.
    heure_fin: finMinuitDuLendemain ? "24:00" : fin.heure,
  };
}

function obtenirDateHeurePubliqueDepuisInstant(
  instant = new Date(),
  offsetPublic,
  { fuseauCentral = CENTRAL_CALENDAR_TIMEZONE } = {}
) {
  // Le fuseau central sert exclusivement à lire l'heure actuelle de
  // référence. Le décalage ensuite appliqué est civil et fixe, pas IANA.
  const centrale = convertirInstantEnDateHeureZonnee(instant, fuseauCentral);
  if (!centrale) {
    return null;
  }

  const definition = obtenirDefinitionFuseauCalendrierPublic(offsetPublic);
  return deplacerDateHeureCivile(
    centrale.date,
    centrale.heure,
    definition.offsetMinutes
  );
}

module.exports = {
  OFFSETS_CALENDRIER_PUBLIC,
  FUSEAUX_PUBLICS_FIXES,
  FUSEAU_PUBLIC_PAR_DEFAUT,
  estFuseauIanaValide,
  validerFuseauCalendrierPublic,
  validerOffsetCalendrierPublic,
  normaliserFuseauCalendrierPublic,
  obtenirDefinitionFuseauCalendrierPublic,
  ajouterJoursIso,
  deplacerDateHeureCivile,
  convertirDateHeureCentraleVersPublique,
  convertirDateHeurePubliqueVersCentrale,
  convertirIntervalleCentralVersPublic,
  obtenirDateHeurePubliqueDepuisInstant,
};
