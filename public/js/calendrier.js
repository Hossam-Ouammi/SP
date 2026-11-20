const palettesStatut = {
  planifiee: {
    backgroundColor: "#e3eefb",
    borderColor: "#a4bfd9",
    textColor: "#244866",
    className: "status-planifiee",
  },
  faite: {
    backgroundColor: "#e2f4eb",
    borderColor: "#9ec9b3",
    textColor: "#245a3f",
    className: "status-faite",
  },
  annulee: {
    backgroundColor: "#f7e4e5",
    borderColor: "#ddb6b8",
    textColor: "#844244",
    className: "status-annulee",
  },
  reportee: {
    backgroundColor: "#fff2de",
    borderColor: "#e5c790",
    textColor: "#80551f",
    className: "status-reportee",
  },
};

function estDateIsoValide(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const dateObjet = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(date);
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);
}

function estHeureFinValide(heure) {
  return estHeureValide(heure) || heure === "24:00";
}

function estIndisponibiliteJourComplet(indisponibilite) {
  return Number(indisponibilite?.jour_complet) === 1;
}

function couleurIntervenantValide(couleur) {
  return /^#[0-9a-f]{6}$/i.test(String(couleur || ""));
}

function melangerCouleurHex(couleur, cible, proportion) {
  const source = String(couleur || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(source)) return couleur;

  const cibleRgb = cible === "black" ? [15, 23, 42] : [255, 255, 255];
  const composantes = [0, 2, 4].map((index) => parseInt(source.slice(index, index + 2), 16));
  const resultat = composantes.map((composante, index) =>
    Math.round(composante + (cibleRgb[index] - composante) * proportion)
      .toString(16)
      .padStart(2, "0")
  );
  return `#${resultat.join("")}`;
}

function creerPaletteDouceIntervenant(couleur) {
  if (!couleurIntervenantValide(couleur)) return null;

  return {
    backgroundColor: melangerCouleurHex(couleur, "white", 0.68),
    borderColor: melangerCouleurHex(couleur, "white", 0.28),
    textColor: melangerCouleurHex(couleur, "black", 0.5),
  };
}

export function creerPaletteMembrePlateforme(identifiant) {
  const id = normaliserIdentifiantCalendrier(identifiant);
  if (!id) return null;

  const teinte = Math.round((id * 137.508) % 360);
  const saturation = 52 + (id % 3) * 4;
  return {
    backgroundColor: `hsl(${teinte} ${saturation}% 87%)`,
    borderColor: `hsl(${teinte} ${Math.max(saturation - 12, 36)}% 62%)`,
    textColor: `hsl(${teinte} 38% 27%)`,
  };
}

function obtenirPaletteIntervenant(seance) {
  const paletteDeclaree = seance?.intervenant_palette_calendrier;
  if (
    paletteDeclaree?.backgroundColor &&
    paletteDeclaree?.borderColor &&
    paletteDeclaree?.textColor
  ) {
    return paletteDeclaree;
  }

  const couleur = String(seance?.intervenant_couleur_calendrier || "").trim();
  return creerPaletteDouceIntervenant(couleur);
}

function creerClasseIntervenant(seance) {
  const intervenantId = Number(seance?.intervenant_id);
  return Number.isInteger(intervenantId) && intervenantId > 0
    ? `intervenant-${intervenantId}`
    : "";
}

function recupererPluginsCalendrier() {
  return [
    globalThis.FullCalendar?.DayGrid?.default,
    globalThis.FullCalendar?.TimeGrid?.default,
    globalThis.FullCalendar?.Interaction?.default,
  ].filter(Boolean);
}

function estCalendrierMobile() {
  return globalThis.matchMedia?.("(max-width: 560px)")?.matches ?? false;
}

function estCalendrierCompact() {
  return globalThis.matchMedia?.("(max-width: 720px)")?.matches ?? false;
}

// Le calendrier de séances garde sa précision métier de trente minutes. La
// vue Disponibilités est volontairement plus aérée : ses pastilles résument
// une heure complète sans modifier la granularité des séances.
const CALENDRIER_PAS_CRENEAU_MINUTES = 30;
const MINUTES_PAR_JOUR = 24 * 60;
const PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT = Object.freeze({
  calendar_start_time: "08:00",
  calendar_end_time: "23:30",
});

// Les couleurs de disponibilité ne sont pas une préférence utilisateur. Elles
// sont volontairement dérivées de l'identifiant stable du Professeur, afin
// qu'un même Professeur garde toujours sa pastille sans qu'un Handler puisse
// l'éditer. La sonde évite les couleurs identiques dans une même équipe.
const PAS_COULEUR_DISPONIBILITE = 137;

function normaliserIdentifiantCalendrier(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function hacherIdentifiantCalendrier(valeur) {
  const texte = String(valeur || "");
  let hash = 2166136261;

  for (let index = 0; index < texte.length; index += 1) {
    hash ^= texte.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function professeurActifPourDisponibilite(professeur) {
  if (!normaliserIdentifiantCalendrier(professeur?.id)) {
    return false;
  }

  if (professeur?.acces_active === false || Number(professeur?.acces_active) === 0) {
    return false;
  }

  return String(professeur?.statut_compte || "active").toLowerCase() === "active";
}

function libelleProfesseurDisponibilite(professeur) {
  const nom = String(professeur?.nom || "").trim();
  const identifiant = String(professeur?.public_id || "").trim();
  return nom || identifiant || "Réalisateur";
}

/**
 * Retourne une palette douce, stable et non configurable pour les pastilles
 * de disponibilité. C'est aussi utilisé par la légende au-dessus du
 * calendrier central.
 */
export function creerPalettesDisponibiliteProfesseurs(intervenants = []) {
  const professeurs = (Array.isArray(intervenants) ? intervenants : [])
    .filter(professeurActifPourDisponibilite)
    .map((professeur) => ({ ...professeur, id: normaliserIdentifiantCalendrier(professeur.id) }))
    .sort(
      (premier, second) =>
        premier.id - second.id ||
        libelleProfesseurDisponibilite(premier).localeCompare(
          libelleProfesseurDisponibilite(second),
          "fr"
        )
    );
  const teintesUtilisees = new Set();
  const couleursServeurUtilisees = new Set();
  const palettes = new Map();

  professeurs.forEach((professeur) => {
    const couleurServeur = String(professeur?.couleur_calendrier || "").trim().toLowerCase();

    // Le serveur choisit la couleur unique de l'équipe. La vue Disponibilités
    // la consomme directement afin que légende, pastilles et séances du
    // calendrier central parlent le même langage visuel. Le calcul HSL reste
    // un repli sûr pour les anciennes réponses qui ne la fournissent pas.
    if (couleurIntervenantValide(couleurServeur) && !couleursServeurUtilisees.has(couleurServeur)) {
      couleursServeurUtilisees.add(couleurServeur);
      palettes.set(professeur.id, creerPaletteDouceIntervenant(couleurServeur));
      return;
    }

    let teinte = hacherIdentifiantCalendrier(professeur.id) % 360;
    let essais = 0;

    while (teintesUtilisees.has(teinte) && essais < 360) {
      teinte = (teinte + PAS_COULEUR_DISPONIBILITE) % 360;
      essais += 1;
    }

    teintesUtilisees.add(teinte);
    palettes.set(professeur.id, {
      backgroundColor: `hsl(${teinte} 48% 62%)`,
      borderColor: `hsl(${teinte} 34% 45%)`,
      textColor: `hsl(${teinte} 28% 24%)`,
    });
  });

  return palettes;
}

function extrairePartiesHorlogeCalendrier(dateObjet, fuseauHoraire = "") {
  const date = dateObjet instanceof Date ? dateObjet : new Date();
  const fuseau = String(fuseauHoraire || "").trim();

  if (fuseau) {
    try {
      const parties = new Intl.DateTimeFormat("en-CA", {
        timeZone: fuseau,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date);
      const valeurs = parties.reduce((resultat, partie) => {
        if (partie.type !== "literal") {
          resultat[partie.type] = Number(partie.value);
        }
        return resultat;
      }, {});

      if (
        Number.isFinite(valeurs.year) &&
        Number.isFinite(valeurs.month) &&
        Number.isFinite(valeurs.day) &&
        Number.isFinite(valeurs.hour) &&
        Number.isFinite(valeurs.minute) &&
        Number.isFinite(valeurs.second)
      ) {
        return {
          year: valeurs.year,
          month: valeurs.month,
          day: valeurs.day,
          hour: valeurs.hour === 24 ? 0 : valeurs.hour,
          minute: valeurs.minute,
          second: valeurs.second,
        };
      }
    } catch (_erreur) {
      // Le serveur valide les fuseaux IANA. Le repli local conserve le
      // calendrier utilisable si le navigateur ne connaît pas ce fuseau.
    }
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

// FullCalendar v6 représente les heures civiles d'un fuseau nommé par des
// dates UTC lorsqu'aucun plugin de fuseau n'est chargé. Le texte sans offset
// est interprété dans le fuseau de la grille, quel que soit celui du navigateur.
function construireMaintenantCalendrier(fuseauHoraire = "", dateObjet = new Date()) {
  const parties = extrairePartiesHorlogeCalendrier(dateObjet, fuseauHoraire);
  const date = `${parties.year}-${String(parties.month).padStart(2, "0")}-${String(parties.day).padStart(2, "0")}`;
  const heure = [parties.hour, parties.minute, parties.second]
    .map((valeur) => String(valeur).padStart(2, "0"))
    .join(":");
  return `${date}T${heure}`;
}

function convertirHeureOptionEnMinutes(heure, { finDeJour = false } = {}) {
  const correspondance = String(heure || "")
    .trim()
    .match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);
  const secondes = Number(correspondance[3] || 0);

  if (
    !Number.isFinite(heures) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(secondes) ||
    minutes < 0 ||
    minutes > 59 ||
    secondes !== 0
  ) {
    return null;
  }

  if (
    finDeJour &&
    ((heures === 0 && minutes === 0) || (heures === 24 && minutes === 0))
  ) {
    return MINUTES_PAR_JOUR;
  }

  if (heures < 0 || heures > 23) {
    return null;
  }

  return heures * 60 + minutes;
}

function convertirMinutesEnHeureOption(totalMinutes) {
  const minutesNormalisees = Math.max(0, Math.min(MINUTES_PAR_JOUR, Number(totalMinutes) || 0));
  const heures = String(Math.floor(minutesNormalisees / 60)).padStart(2, "0");
  const minutes = String(minutesNormalisees % 60).padStart(2, "0");
  return `${heures}:${minutes}:00`;
}

function normaliserPasCreneauCalendrier(
  valeur,
  valeurParDefaut = CALENDRIER_PAS_CRENEAU_MINUTES
) {
  const pas = Number(valeur);

  return Number.isInteger(pas) && pas >= CALENDRIER_PAS_CRENEAU_MINUTES
    ? pas
    : valeurParDefaut;
}

function convertirPasCreneauEnDuree(pasCreneauMinutes) {
  return convertirMinutesEnHeureOption(
    normaliserPasCreneauCalendrier(pasCreneauMinutes)
  );
}

function creerPlageHoraireCalendrier(calendarStartTime, calendarEndTime) {
  const startMinutes = convertirHeureOptionEnMinutes(calendarStartTime);
  const endMinutes = convertirHeureOptionEnMinutes(calendarEndTime, {
    finDeJour: true,
  });

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    startMinutes % CALENDRIER_PAS_CRENEAU_MINUTES !== 0 ||
    endMinutes % CALENDRIER_PAS_CRENEAU_MINUTES !== 0 ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return {
    calendar_start_time: convertirMinutesEnHeureOption(startMinutes).slice(0, 5),
    calendar_end_time:
      endMinutes === MINUTES_PAR_JOUR
        ? "00:00"
        : convertirMinutesEnHeureOption(endMinutes).slice(0, 5),
    startMinutes,
    endMinutes,
    slotMinTime: convertirMinutesEnHeureOption(startMinutes),
    slotMaxTime: convertirMinutesEnHeureOption(endMinutes),
  };
}

function normaliserPlageHoraireCalendrier(plageHoraire = {}) {
  const source = plageHoraire && typeof plageHoraire === "object" ? plageHoraire : {};
  const plage = creerPlageHoraireCalendrier(
    source.calendar_start_time ?? PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_start_time,
    source.calendar_end_time ?? PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_end_time
  );

  return (
    plage ||
    creerPlageHoraireCalendrier(
      PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_start_time,
      PLAGE_HORAIRE_CALENDRIER_PAR_DEFAUT.calendar_end_time
    )
  );
}

function formaterDateIsoCalendrier(dateObjet) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return "";
  }

  const annee = dateObjet.getUTCFullYear();
  const mois = String(dateObjet.getUTCMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getUTCDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function ajouterJoursDateIsoCalendrier(dateIso, nombreJours = 1) {
  const date = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }

  date.setUTCDate(date.getUTCDate() + Number(nombreJours || 0));
  return formaterDateIsoCalendrier(date);
}

function plagesDatesVisiblesCalendrier(calendrier) {
  const debut = calendrier?.view?.activeStart;
  const finExclusive = calendrier?.view?.activeEnd;
  const debutIso = formaterDateIsoCalendrier(debut);
  const finExclusiveIso = formaterDateIsoCalendrier(finExclusive);

  if (!debutIso || !finExclusiveIso || debutIso >= finExclusiveIso) {
    return [];
  }

  const dates = [];
  for (let dateIso = debutIso; dateIso < finExclusiveIso; dateIso = ajouterJoursDateIsoCalendrier(dateIso)) {
    dates.push(dateIso);
  }
  return dates;
}

function indisponibiliteChevaucheCreneauProfesseur(
  indisponibilite,
  professeurId,
  dateIso,
  debut,
  fin
) {
  if (String(indisponibilite?.date || "") !== dateIso) {
    return false;
  }

  // Une indisponibilité sans intervenant était possible dans les anciennes
  // données. Elle ne doit jamais rendre toute l'équipe indisponible : la vue
  // centrale ne prend en compte que les blocages explicitement attribués à un
  // Professeur.
  if (normaliserIdentifiantCalendrier(indisponibilite?.intervenant_id) !== professeurId) {
    return false;
  }

  if (estIndisponibiliteJourComplet(indisponibilite)) {
    return true;
  }

  const debutIndisponibilite = convertirHeureOptionEnMinutes(indisponibilite?.heure_debut);
  const finIndisponibilite = convertirHeureOptionEnMinutes(indisponibilite?.heure_fin, {
    finDeJour: true,
  });

  return (
    Number.isFinite(debutIndisponibilite) &&
    Number.isFinite(finIndisponibilite) &&
    debutIndisponibilite < fin &&
    finIndisponibilite > debut
  );
}

// La vue Disponibilités ne rend pas les séances elles-mêmes, mais elles
// retirent bien leur Réalisateur du créneau. C'est la même règle que le
// calendrier public : un intervenant déjà en séance n'est pas disponible.
function creerEvenementCreneauIndisponibleCollectif({ dateIso, debut, fin, professeurs }) {
  const heureDebut = convertirMinutesEnHeureOption(debut).slice(0, 5);
  const heureFin = convertirMinutesEnHeureOption(fin).slice(0, 5);

  return {
    id: `availability-unavailable-${dateIso}-${heureDebut}`,
    title: "",
    start: `${dateIso}T${heureDebut}`,
    end: construireDateHeureFinCalendrier(dateIso, heureFin),
    display: "background",
    classNames: ["calendar-availability-unavailable"],
    typeOrder: 0,
    extendedProps: {
      type: "availability-unavailable",
      professeurs,
    },
  };
}

function seanceIntervenantChevaucheCreneau(seance, intervenantId, dateIso, debut, fin) {
  if (
    normaliserIdentifiantCalendrier(seance?.intervenant_id) !== intervenantId ||
    String(seance?.date || "") !== dateIso ||
    String(seance?.statut_seance || "").toLowerCase() === "annulee"
  ) {
    return false;
  }

  const debutSeance = convertirHeureOptionEnMinutes(seance?.heure_debut);
  const finSeance = convertirHeureOptionEnMinutes(seance?.heure_fin, {
    finDeJour: true,
  });

  return (
    Number.isFinite(debutSeance) &&
    Number.isFinite(finSeance) &&
    debutSeance < finSeance &&
    debutSeance < fin &&
    finSeance > debut
  );
}

function fusionnerCreneauxIndisponiblesCollectifs(creneaux = []) {
  const fusionnes = [];

  creneaux.forEach((creneau) => {
    const precedent = fusionnes.at(-1);
    if (
      precedent &&
      precedent.dateIso === creneau.dateIso &&
      precedent.fin === creneau.debut
    ) {
      precedent.fin = creneau.fin;
      return;
    }

    fusionnes.push({ ...creneau });
  });

  return fusionnes;
}

/**
 * Fonds d'indisponibilité de la vue globale du calendrier Handler.
 *
 * Une case est grisée uniquement si chaque membre actif de l'équipe, Handler
 * compris, est indisponible. Un membre est occupé soit par une indisponibilité
 * personnelle, soit par une séance. Les occupations d'une autre équipe sont
 * déjà transmises comme blocs opaques par l'API et suivent la même règle.
 *
 * Les indisponibilités individuelles ne sont jamais dessinées dans la vue
 * globale : seules les séances de l'équipe et ce fond collectif restent
 * visibles, afin que la grille demeure lisible.
 */
export function creerEvenementsIndisponibiliteCollective(calendrier, disponibilites = {}) {
  const handlerId = normaliserIdentifiantCalendrier(disponibilites?.handlerId);
  const sourceProfesseurs = Array.isArray(disponibilites?.professeurs)
    ? disponibilites.professeurs
    : Array.isArray(disponibilites?.intervenants)
      ? disponibilites.intervenants
      : [];
  const professeurs = sourceProfesseurs
    .filter(professeurActifPourDisponibilite)
    .map((professeur) => ({ ...professeur, id: normaliserIdentifiantCalendrier(professeur.id) }))
    .filter((professeur) => professeur.id);

  // Sans Professeur rattache, il n'existe pas de collectif a declarer
  // indisponible. Une absence d'equipe ne doit jamais griser le calendrier.
  if (professeurs.length === 0) {
    return [];
  }

  const indisponibilites = Array.isArray(disponibilites?.indisponibilites)
    ? disponibilites.indisponibilites
    : [];
  const seances = Array.isArray(disponibilites?.seances) ? disponibilites.seances : [];
  const plageHoraire = normaliserPlageHoraireCalendrier(
    disponibilites?.plageHoraire || calendrier?.__plageHoraire || {}
  );
  const creneauxIndisponibles = [];

  plagesDatesVisiblesCalendrier(calendrier).forEach((dateIso) => {
    for (
      let debut = plageHoraire.startMinutes;
      debut < plageHoraire.endMinutes;
      debut += CALENDRIER_PAS_CRENEAU_MINUTES
    ) {
      const fin = Math.min(debut + CALENDRIER_PAS_CRENEAU_MINUTES, plageHoraire.endMinutes);
      const tousProfesseursIndisponibles = professeurs.every((professeur) =>
        indisponibilites.some((indisponibilite) =>
          indisponibiliteChevaucheCreneauProfesseur(
            indisponibilite,
            professeur.id,
            dateIso,
            debut,
            fin
          )
        ) || seances.some((seance) =>
          seanceIntervenantChevaucheCreneau(seance, professeur.id, dateIso, debut, fin)
        )
      );

      if (tousProfesseursIndisponibles) {
        creneauxIndisponibles.push({ dateIso, debut, fin, professeurs });
      }
    }
  });

  return fusionnerCreneauxIndisponiblesCollectifs(creneauxIndisponibles).map(
    ({ dateIso, debut, fin, professeurs: professeursCreneau }) =>
      creerEvenementCreneauIndisponibleCollectif({
        dateIso,
        debut,
        fin,
        professeurs: professeursCreneau,
      })
  );
}

function creerElementCalendrier(tagName, className, texte) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (typeof texte === "string") {
    element.textContent = texte;
  }

  return element;
}

function formaterLibelleJourCalendrier(date, options) {
  return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(date);
}

function obtenirAbreviationJourMobile(date) {
  return formaterLibelleJourCalendrier(date, { weekday: "narrow" })
    .replace(".", "")
    .trim()
    .slice(0, 1);
}

function extrairePrenomEtudiant(nomComplet) {
  if (typeof nomComplet !== "string") {
    return "";
  }

  return nomComplet
    .trim()
    .split(/\s+/)
    .find(Boolean) || "";
}

function seanceEstMasqueePourConfidentialite(seance) {
  return Boolean(seance?.est_masquee_pour_confidentialite);
}

function extraireDateIsoDepuisValeurCalendrier(valeur) {
  const texte = String(valeur || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return texte;
  }

  const correspondance = texte.match(/^(\d{4}-\d{2}-\d{2})/);
  return correspondance ? correspondance[1] : "";
}

function formaterDateIsoLocale(dateObjet) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return "";
  }

  const annee = dateObjet.getUTCFullYear();
  const mois = String(dateObjet.getUTCMonth() + 1).padStart(2, "0");
  const jour = String(dateObjet.getUTCDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function extraireDateIsoDepuisClicCalendrier(info) {
  return (
    formaterDateIsoLocale(info?.date) ||
    extraireDateIsoDepuisValeurCalendrier(info?.dateStr)
  );
}

function formaterHeureLocale(dateObjet) {
  if (!(dateObjet instanceof Date) || Number.isNaN(dateObjet.getTime())) {
    return "";
  }

  const heures = String(dateObjet.getUTCHours()).padStart(2, "0");
  const minutes = String(dateObjet.getUTCMinutes()).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function extraireHeureDepuisValeurCalendrier(valeur) {
  const correspondance = String(valeur || "").match(/T(\d{2}):(\d{2})/);
  return correspondance ? `${correspondance[1]}:${correspondance[2]}` : "";
}

function extraireCreneauDepuisClicCalendrier(info) {
  const date = extraireDateIsoDepuisClicCalendrier(info);
  const heureDebut = info?.allDay
    ? ""
    : formaterHeureLocale(info?.date) || extraireHeureDepuisValeurCalendrier(info?.dateStr);

  return {
    date,
    date_fin: date,
    heure_debut: heureDebut,
    heure_fin: "",
    toute_la_journee: Boolean(info?.allDay),
  };
}

function extraireSelectionCalendrier(info) {
  const dateDebut =
    formaterDateIsoLocale(info?.start) || extraireDateIsoDepuisValeurCalendrier(info?.startStr);
  const dateFin =
    formaterDateIsoLocale(info?.end) || extraireDateIsoDepuisValeurCalendrier(info?.endStr);
  const heureDebut = info?.allDay
    ? ""
    : formaterHeureLocale(info?.start) || extraireHeureDepuisValeurCalendrier(info?.startStr);
  const heureFin = info?.allDay
    ? ""
    : formaterHeureLocale(info?.end) || extraireHeureDepuisValeurCalendrier(info?.endStr);

  const datesSelectionnees = [];
  if (dateDebut && dateFin) {
    const finExclusive = Boolean(info?.allDay);
    for (
      let dateCourante = dateDebut;
      finExclusive ? dateCourante < dateFin : dateCourante <= dateFin;
      dateCourante = calculerDateSuivante(dateCourante)
    ) {
      datesSelectionnees.push(dateCourante);
    }
  }

  return {
    date: dateDebut,
    date_fin: dateFin,
    dates_selectionnees: datesSelectionnees,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    toute_la_journee: Boolean(info?.allDay),
  };
}

function calculerDateSuivante(dateIso) {
  const dateObjet = new Date(`${dateIso}T12:00:00Z`);

  if (Number.isNaN(dateObjet.getTime())) {
    return dateIso;
  }

  dateObjet.setUTCDate(dateObjet.getUTCDate() + 1);
  return dateObjet.toISOString().slice(0, 10);
}

function construireDateHeureFinCalendrier(dateIso, heureFin) {
  if (heureFin === "24:00") {
    return `${calculerDateSuivante(dateIso)}T00:00`;
  }

  return `${dateIso}T${heureFin}`;
}

function genererContenuEnteteJour(info) {
  if (info.view.type === "dayGridMonth" && estCalendrierMobile()) {
    return {
      domNodes: [
        creerElementCalendrier("span", "calendar-monthday-header", obtenirAbreviationJourMobile(info.date)),
      ],
    };
  }

  if (info.view.type !== "timeGridWeek") {
    return info.text;
  }

  const conteneur = creerElementCalendrier("span", "calendar-weekday-header");
  const formatJour = estCalendrierMobile() ? { weekday: "narrow" } : { weekday: "short" };

  conteneur.append(
    creerElementCalendrier(
      "span",
      "calendar-weekday-label",
      formaterLibelleJourCalendrier(info.date, formatJour)
    ),
    creerElementCalendrier(
      "span",
      "calendar-weekday-date",
      formaterLibelleJourCalendrier(info.date, { day: "numeric" })
    )
  );

  if (!estCalendrierMobile()) {
    conteneur.append(
      creerElementCalendrier(
        "span",
        "calendar-weekday-month",
        formaterLibelleJourCalendrier(info.date, { month: "short" }).replace(".", "")
      )
    );
  }

  return {
    domNodes: [conteneur],
  };
}

function obtenirOptionsResponsiveCalendrier() {
  if (estCalendrierMobile()) {
    return {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "",
      },
      buttonText: {
        prev: "‹",
        next: "›",
        month: "Mois",
        week: "Sem.",
      },
      dayHeaderFormat: {
        weekday: "short",
      },
      dayMaxEvents: 4,
      fixedWeekCount: true,
    };
  }

  if (estCalendrierCompact()) {
    return {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: "",
      },
      buttonText: {
        prev: "‹",
        next: "›",
        month: "Mois",
        week: "Semaine",
      },
      dayHeaderFormat: {
        weekday: "short",
      },
      dayMaxEvents: 1,
    };
  }

  return {
    initialView: "timeGridWeek",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "",
    },
    buttonText: {
      prev: "‹",
      next: "›",
      today: "Aujourd'hui",
      month: "Mois",
      week: "Semaine",
    },
    dayHeaderFormat: {
      weekday: "short",
    },
    dayMaxEvents: 2,
  };
}

function appliquerOptionsResponsive(calendrier) {
  if (!calendrier) {
    return;
  }

  const options = obtenirOptionsResponsiveCalendrier();
  const valeurs = { headerToolbar: options.headerToolbar, buttonText: options.buttonText,
    dayHeaderFormat: options.dayHeaderFormat, dayMaxEvents: options.dayMaxEvents,
    fixedWeekCount: Boolean(options.fixedWeekCount) };
  const appliquer = () => {
    for (const [nom, valeur] of Object.entries(valeurs)) {
      const actuelle = calendrier.getOption(nom);
      const identique = valeur && typeof valeur === 'object'
        ? actuelle && Object.entries(valeur).every(([cle, contenu]) => actuelle[cle] === contenu)
        : actuelle === valeur;
      if (!identique) calendrier.setOption(nom, valeur);
    }
  };
  if (typeof calendrier.batchRendering === 'function') calendrier.batchRendering(appliquer);
  else appliquer();
}

function transformerSeanceEnEvenement(seance) {
  if (
    !estDateIsoValide(seance.date) ||
    !estHeureValide(seance.heure_debut) ||
    !estHeureFinValide(seance.heure_fin)
  ) {
    console.warn("Séance ignorée dans le calendrier car date/heure invalide :", seance.id);
    return null;
  }

  if (seanceEstMasqueePourConfidentialite(seance)) {
    return {
      id: String(seance.id),
      title: "",
      start: `${seance.date}T${seance.heure_debut}`,
      end: construireDateHeureFinCalendrier(seance.date, seance.heure_fin),
      display: estCalendrierMobile() ? "block" : "auto",
      backgroundColor: "#64748b",
      borderColor: "#475569",
      textColor: "#f8fafc",
      classNames: ["indisponibilite-event", "seance-confidentielle-event"],
      typeOrder: 10,
      extendedProps: {
        seance,
        type: "indisponibilite",
        indisponibilite: {
          id: `seance-privee-${seance.id}`,
          date: seance.date,
          heure_debut: seance.heure_debut,
          heure_fin: seance.heure_fin,
          jour_complet: 0,
          raison: "",
          est_seance_confidentielle: true,
        },
      },
    };
  }

  const paletteIntervenant = obtenirPaletteIntervenant(seance);
  const palette =
    paletteIntervenant || palettesStatut[seance.statut_seance] || palettesStatut.planifiee;
  const titreEvenement = extrairePrenomEtudiant(seance.etudiant) || seance.libelle || "Séance";
  const classeIntervenant = creerClasseIntervenant(seance);
  const classesEvenement = [palette.className].filter(Boolean);

  if (classeIntervenant) {
    classesEvenement.push(classeIntervenant);
  }

  return {
    id: String(seance.id),
    title: titreEvenement,
    start: `${seance.date}T${seance.heure_debut}`,
    end: construireDateHeureFinCalendrier(seance.date, seance.heure_fin),
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    classNames: classesEvenement,
    typeOrder: 20,
    extendedProps: {
      seance,
      type: "seance",
    },
  };
}

function transformerIndisponibiliteEnEvenement(indisponibilite) {
  if (
    !estDateIsoValide(indisponibilite.date) ||
    !estHeureValide(indisponibilite.heure_debut) ||
    !estHeureFinValide(indisponibilite.heure_fin)
  ) {
    console.warn(
      "Indisponibilite ignoree dans le calendrier car date/heure invalide :",
      indisponibilite.id
    );
    return null;
  }

  // Une séance d'une autre équipe est fournie par l'API sous forme d'un bloc
  // d'indisponibilité minimal. Son libellé reste volontairement générique :
  // aucun étudiant, matière, équipe ou Handler ne peut être déduit du rendu.
  const estOccupationExterneConfidentielle = Boolean(
    indisponibilite?.est_seance_confidentielle
  );
  const classesEvenement = [
    "indisponibilite-event",
    ...(estOccupationExterneConfidentielle ? ["calendar-external-busy-event"] : []),
  ];

  if (estIndisponibiliteJourComplet(indisponibilite)) {
    return {
      id: `indisponibilite-${indisponibilite.id}`,
      title: "",
      start: indisponibilite.date,
      end: calculerDateSuivante(indisponibilite.date),
      allDay: true,
      display: "background",
      backgroundColor: "rgba(148, 163, 184, 0.22)",
      classNames: [...classesEvenement, "indisponibilite-full-day-event"],
      typeOrder: 0,
      extendedProps: {
        indisponibilite,
        type: "indisponibilite",
      },
    };
  }

  return {
    id: `indisponibilite-${indisponibilite.id}`,
    title: "",
    start: `${indisponibilite.date}T${indisponibilite.heure_debut}`,
    end: construireDateHeureFinCalendrier(
      indisponibilite.date,
      indisponibilite.heure_fin
    ),
    display: estCalendrierMobile() ? "block" : "auto",
    backgroundColor: "rgba(148, 163, 184, 0.16)",
    borderColor: "rgba(148, 163, 184, 0.44)",
    textColor: estOccupationExterneConfidentielle ? "#475569" : "transparent",
    classNames: classesEvenement,
    typeOrder: 10,
    extendedProps: {
      indisponibilite,
      type: "indisponibilite",
    },
  };
}

function masquerPrenomsSeancesChevauchantes(evenements = []) {
  // Only whether a session overlaps matters, not every overlapping pair.
  // Sorting once avoids parsing dates inside a quadratic all-history scan.
  const seances = evenements
    .filter(evenement => evenement?.extendedProps?.type === "seance")
    .map(evenement => ({ evenement, debut: new Date(evenement.start).getTime(), fin: new Date(evenement.end).getTime() }))
    .filter(item => Number.isFinite(item.debut) && Number.isFinite(item.fin) && item.fin > item.debut)
    .sort((a, b) => a.debut - b.debut);
  const seancesChevauchantes = new Set();
  let plusLongue = null;
  for (const seance of seances) {
    if (plusLongue && seance.debut < plusLongue.fin) {
      seancesChevauchantes.add(seance.evenement);
      seancesChevauchantes.add(plusLongue.evenement);
    }
    if (!plusLongue || seance.fin > plusLongue.fin) plusLongue = seance;
  }

  seancesChevauchantes.forEach((evenement) => {
    evenement.title = "";
    evenement.classNames = [
      ...(Array.isArray(evenement.classNames) ? evenement.classNames : []),
      "calendar-overlapping-session",
    ];
  });

  return evenements;
}

function genererContenuLienPlusEvenements(arg) {
  if (!estCalendrierMobile()) {
    return arg.text;
  }

  return {
    domNodes: [creerElementCalendrier("span", "calendar-mobile-more-link", "...")],
  };
}

function synchroniserEtatVisuelCalendrier(element, typeVue) {
  if (!element) {
    return;
  }

  element.dataset.calendarMobile = estCalendrierMobile() ? "true" : "false";
  element.dataset.calendarView = typeVue || "";
}

function adapterPresentationEvenement(info) {
  const typeEvenement = info.event.extendedProps?.type;
  const estVueMoisMobile = info.view.type === "dayGridMonth" && estCalendrierMobile();
  const estVueSemaineMobile = info.view.type === "timeGridWeek" && estCalendrierMobile();
  const conteneurEvenement = info.el.closest(
    ".fc-timegrid-event-harness, .fc-daygrid-event-harness, .fc-daygrid-event-harness-abs"
  );

  info.el.classList.remove(
    "calendar-mobile-month-seance",
    "calendar-mobile-month-indisponibilite",
    "calendar-mobile-week-seance",
    "calendar-mobile-week-indisponibilite"
  );
  info.el.style.removeProperty("--calendar-name-length");
  conteneurEvenement?.style.removeProperty("z-index");

  if (typeEvenement === "availability-unavailable") {
    info.el.classList.add("calendar-availability-unavailable");
    return;
  }

  if (typeEvenement === "seance") {
    const prenom = String(info.event.title || "").trim();
    info.el.style.setProperty("--calendar-name-length", String(Math.max(prenom.length, 1)));

    if (estVueMoisMobile) {
      info.el.classList.add("calendar-mobile-month-seance");
      return;
    }

    if (estVueSemaineMobile) {
      info.el.classList.add("calendar-mobile-week-seance");
    }

    return;
  }

  if (typeEvenement === "indisponibilite" && estIndisponibiliteJourComplet(info.event.extendedProps?.indisponibilite)) {
    return;
  }

  if (typeEvenement === "indisponibilite" && estVueMoisMobile) {
    info.el.classList.add("calendar-mobile-month-indisponibilite");
    return;
  }

  if (typeEvenement === "indisponibilite" && estVueSemaineMobile) {
    info.el.classList.add("calendar-mobile-week-indisponibilite");
  }
}

function creerRepereHeureDeplacement(element) {
  let actif = false;
  let apercu = null;
  let debutApercu = null;
  let repere = null;
  let animation = null;

  function actualiser() {
    if (!actif) return;
    const axe = element.querySelector(".fc-timegrid-slot-label");
    if (apercu?.el?.isConnected && axe && apercu.event.start) {
      const position = apercu.el.getBoundingClientRect();
      const colonne = axe.getBoundingClientRect();
      const grille = element.querySelector(".fc-timegrid-body")?.getBoundingClientRect();
      if (!repere) {
        repere = document.createElement("div");
        repere.className = "calendar-drag-time-indicator";
        repere.setAttribute("aria-hidden", "true");
        element.appendChild(repere);
      }
      const debut = debutApercu || apercu.event.start;
      // FullCalendar utilise l'heure civile UTC-coercée pour Africa/Casablanca.
      repere.textContent = `${String(debut.getUTCHours()).padStart(2, "0")}:${String(debut.getUTCMinutes()).padStart(2, "0")}`;
      repere.style.left = `${colonne.left}px`;
      repere.style.top = `${position.top}px`;
      repere.style.width = `${colonne.width}px`;
      repere.hidden = !grille || position.top < Math.max(0, grille.top) || position.top > Math.min(window.innerHeight, grille.bottom);
    } else if (repere) {
      repere.hidden = true;
    }
    animation = requestAnimationFrame(actualiser);
  }

  function arreter() {
    actif = false;
    apercu = null;
    debutApercu = null;
    cancelAnimationFrame(animation);
    animation = null;
    repere?.remove();
    repere = null;
  }

  return {
    demarrer(info) {
      arreter();
      if (info.view.type !== "timeGridWeek") return;
      actif = true;
      apercu = info;
      actualiser();
    },
    monter(info) {
      if (actif && info.isMirror) apercu = info;
    },
    actualiserEvenement(info) {
      if (actif && info.isMirror) debutApercu = info.event.start;
      return [];
    },
    demonter(info) {
      if (apercu?.el === info.el) apercu = null;
    },
    arreter,
  };
}

function creerNavigationPendantDeplacement(element, obtenirCalendrier) {
  let actif = false;
  let minuterie = null;
  let direction = 0;
  let apresNavigation = null;
  function annulerAttente() {
    clearTimeout(minuterie);
    minuterie = null;
    direction = 0;
    delete element.dataset.dragNavigation;
  }
  function mouvement(event) {
    if (!actif) return;
    const point = event.touches?.[0] || event;
    const grille = element.querySelector('.fc-timegrid-body');
    if (!grille) return;
    // The body may extend behind the fixed hour axis / neighbouring pages.
    // Edge detection must use the visible scrollport, not that hidden geometry.
    const scroller = element.querySelector('.calendar-native-scroller');
    const boite = grille.getBoundingClientRect();
    const vue = scroller?.getBoundingClientRect();
    const axe = grille.querySelector('.fc-timegrid-axis')?.getBoundingClientRect().width || 0;
    const left = Math.max(0, vue?.left ?? boite.left + axe);
    const right = Math.min(innerWidth, vue?.right ?? boite.right);
    const rect = { left, right, width: right - left, top: boite.top, bottom: boite.bottom };
    const bord = Math.min(56, Math.max(30, rect.width * 0.12));
    const dansGrille = point.clientY >= rect.top && point.clientY <= Math.min(rect.bottom, innerHeight);
    const sens = !dansGrille ? 0 : point.clientX <= rect.left + bord && point.clientX >= element.getBoundingClientRect().left - 20 ? -1
      : point.clientX >= rect.right - bord && point.clientX <= rect.right + 20 ? 1 : 0;
    if (sens === direction) return;
    annulerAttente();
    if (!sens) return;
    direction = sens;
    element.dataset.dragNavigation = sens < 0 ? 'previous' : 'next';
    const avancer = () => {
      if (!actif) return;
      const calendrier = obtenirCalendrier();
      const bouton = element.querySelector(sens < 0 ? '.fc-prev-button' : '.fc-next-button');
      if (calendrier?.view.type !== 'timeGridWeek' || bouton?.disabled) { annulerAttente(); return; }
      calendrier[sens < 0 ? 'prev' : 'next']();
      // FullCalendar normally recalculates the drop hit only on pointermove
      // or scroll. A date change under a stationary finger also changes that
      // hit: notify its built-in scroll/layout watcher before the user releases.
      element.dispatchEvent(new Event('scroll'));
      apresNavigation?.();
      // Continue while held at the edge, without requiring another touchmove.
      // The longer repeat delay gives the user time to move into the new week.
      if (actif && direction === sens) minuterie = setTimeout(avancer, 950);
    };
    minuterie = setTimeout(avancer, 400);
  }
  function arreter() {
    actif = false;
    apresNavigation = null;
    annulerAttente();
    document.removeEventListener('mousemove', mouvement);
    document.removeEventListener('touchmove', mouvement);
    document.removeEventListener('mouseup', arreter);
    document.removeEventListener('touchend', arreter);
    document.removeEventListener('touchcancel', arreter);
    window.removeEventListener('blur', arreter);
  }
  return {
    demarrer({ manuel = false, onNavigate = null } = {}) {
      arreter(); actif = true;
      apresNavigation = onNavigate;
      if (manuel) return;
      document.addEventListener('mousemove', mouvement);
      document.addEventListener('touchmove', mouvement, { passive: true });
      document.addEventListener('mouseup', arreter);
      document.addEventListener('touchend', arreter);
      document.addEventListener('touchcancel', arreter);
      window.addEventListener('blur', arreter);
    },
    suivre: mouvement,
    arreter,
  };
}

// Horizontal gestures navigate weeks; vertical scrolling and session gestures
// remain owned by the browser / FullCalendar. Public validRange is respected
// through the same disabled navigation buttons as an ordinary click.
export function attacherNavigationSemaines(element, calendrier, { vueMois = false } = {}) {
  // The real FullCalendar body is the middle page of a native scroll container.
  // Browser scrolling owns the offset, inertia, interruption and snapping.
  // No touchmove, wheel cancellation or per-frame transform drives this pager.
  let detruit = false;
  let montage = null;
  let preparationTimer = null;
  let revision = 0;
  let mutation = 0;
  let commitEnCours = false;
  let contactEnCours = false;
  let clicIgnoreJusqua = 0;
  const cache = new Map();
  const preparations = new Map();
  const methodes = new Map();
  const optionsDifferees = new Map();
  const rendusDifferes = [];
  function appliquerRendusDifferes() {
    if (!rendusDifferes.length) return;
    const travaux = rendusDifferes.splice(0);
    restaurer();
    calendrier.batchRendering(() => travaux.forEach(travail => travail()));
  }
  const edition = cible => cible instanceof Element &&
    cible.closest('input, select, textarea, button, [contenteditable="true"]');
  const interactionActive = () => Boolean(element.querySelector('.fc-event-dragging, .fc-event-resizing, .fc-event-mirror')) ||
    calendrier.__zoomCalendrierEnCours;
  const actif = () => !detruit && element.getClientRects().length > 0 &&
    (calendrier.view?.type === 'timeGridWeek' || vueMois && calendrier.view?.type === 'dayGridMonth');
  const cle = () => [
    calendrier.view.type, calendrier.view.currentStart.toISOString(), element.clientWidth, revision,
    calendrier.getOption('slotMinTime'), calendrier.getOption('slotMaxTime'),
  ].join(':');
  const corps = root => root.querySelector(calendrier.view.type === 'timeGridWeek' ? '.fc-timegrid-body' : '.fc-daygrid-body');
  function datePourDirection(direction) {
    const dateIso = typeof calendrier.formatIso === 'function'
      ? calendrier.formatIso(calendrier.view.currentStart, { omitTime: true })
      : calendrier.view.currentStart.toISOString().slice(0, 10);
    const [annee, mois, jour] = dateIso.split('-').map(Number);
    return calendrier.view.type === 'timeGridWeek'
      ? new Date(Date.UTC(annee, mois - 1, jour + direction * 7))
      : new Date(Date.UTC(annee, mois - 1 + direction, 1));
  }
  const autorise = direction => {
    const bouton = element.querySelector(direction > 0 ? '.fc-next-button' : '.fc-prev-button');
    if (!bouton || bouton.disabled) return false;
    let plage = calendrier.getOption('validRange');
    if (typeof plage === 'function') plage = plage(new Date());
    const iso = valeur => valeur instanceof Date ? valeur.toISOString().slice(0, 10) : valeur ? String(valeur).slice(0, 10) : null;
    const debut = iso(plage?.start), fin = iso(plage?.end);
    return (!fin || datePourDirection(direction).toISOString().slice(0, 10) < fin) &&
      (!debut || datePourDirection(direction + 1).toISOString().slice(0, 10) > debut);
  };
  const directionsDisponibles = () => {
    const rayon = calendrier.view.type === 'timeGridWeek' ? 3 : 1;
    return Array.from({ length: rayon * 2 + 1 }, (_, i) => i - rayon).filter(d => d === 0 || autorise(d));
  };

  function copieAffichage(noeud) {
    const copie = noeud.cloneNode(true);
    copie.inert = true;
    copie.setAttribute('aria-hidden', 'true');
    for (const item of [copie, ...copie.querySelectorAll('[id], [data-seance-id], [data-indisponibilite-id], [tabindex], [href]')]) {
      for (const attribut of ['id', 'data-seance-id', 'data-indisponibilite-id', 'tabindex', 'href']) item.removeAttribute(attribut);
    }
    for (const item of copie.querySelectorAll('.fc-event-draggable, .fc-event-resizable')) item.classList.remove('fc-event-draggable', 'fc-event-resizable');
    for (const item of copie.querySelectorAll('.fc-event-resizer')) item.remove();
    return copie;
  }

  async function preparerVoisin(direction, pendantDefilement = false) {
    if (!actif() || !autorise(direction)) return null;
    const identite = cle();
    if (cache.get(direction)?.cle === identite) return cache.get(direction);
    const requete = identite + ':' + direction;
    if (preparations.has(requete)) return preparations.get(requete);
    const travail = (async () => {
      const date = datePourDirection(direction);
      const host = document.createElement('div');
      host.className = 'calendar-paging-renderer';
      host.inert = true;
      host.setAttribute('aria-hidden', 'true');
      host.style.width = element.clientWidth + 'px';
      const options = {};
      for (const nom of ['locale', 'timeZone', 'firstDay', 'slotMinTime', 'slotMaxTime', 'slotDuration', 'slotLabelInterval', 'slotLabelFormat', 'slotLabelContent', 'allDaySlot', 'expandRows', 'eventMinHeight', 'eventOrder', 'slotEventOverlap', 'dayMaxEvents', 'fixedWeekCount', 'displayEventTime', 'eventTimeFormat', 'eventDataTransform', 'eventContent', 'dayHeaderContent']) {
        const valeur = calendrier.getOption(nom);
        if (valeur !== undefined) options[nom] = valeur;
      }
      const rendu = new FullCalendar.Calendar(host, {
        ...options, plugins: recupererPluginsCalendrier(), initialView: calendrier.view.type,
        initialDate: date, headerToolbar: false, height: 'auto', editable: false,
        selectable: false, handleWindowResize: false, nowIndicator: false, events: [],
        eventDidMount(info) {
          adapterPresentationEvenement(info);
          if (info.event.extendedProps?.type === 'indisponibilite' && info.event.display === 'background') info.el.classList.add('indisponibilite-display-only');
        },
      });
      try {
        const donnees = typeof calendrier.__fournirEvenementsApercu === 'function'
          ? await calendrier.__fournirEvenementsApercu(rendu)
          : calendrier.getEvents().map(e => e.toPlainObject());
        if (!actif() || identite !== cle() || !pendantDefilement && (contactEnCours || montage?.enMouvement || montage?.toucher)) return null;
        element.appendChild(host);
        rendu.addEventSource(donnees || []);
        rendu.render();
        const body = corps(host);
        if (!body) return null;
        const entete = host.querySelector('.fc-col-header');
        const resultat = { cle: identite, body: copieAffichage(body), entete: entete ? copieAffichage(entete) : null, hauteur: body.getBoundingClientRect().height,
          date: date.toISOString().slice(0, 10) };
        cache.set(direction, resultat);
        return resultat;
      } finally {
        rendu.destroy();
        host.remove();
      }
    })().catch(() => null).finally(() => preparations.delete(requete));
    preparations.set(requete, travail);
    return travail;
  }

  function restaurer() {
    const ancien = montage;
    if (!ancien) return;
    montage = null;
    clearTimeout(ancien.finTimer);
    ancien.scroller.removeEventListener('scroll', ancien.scroll);
    ancien.scroller.removeEventListener('scrollend', ancien.fin);
    ancien.scroller.removeEventListener('touchstart', ancien.debut);
    ancien.scroller.removeEventListener('touchend', ancien.finToucher);
    ancien.scroller.removeEventListener('touchcancel', ancien.finToucher);
    ancien.scroller.removeEventListener('pointerdown', ancien.pointer, true);
    ancien.scroller.removeEventListener('keydown', ancien.clavier);
    ancien.body.style.marginLeft = ancien.marge;
    ancien.body.style.height = ancien.hauteurOriginale;
    ancien.body.style.removeProperty('--calendar-native-slots-height');
    for (const [table, hauteur] of ancien.hauteursTables) table.style.height = hauteur;
    if (ancien.shell.parentNode && ancien.body.parentNode === ancien.pageCourante) ancien.shell.before(ancien.body);
    if (ancien.entete) {
      ancien.entete.style.marginLeft = ancien.margeEntete;
      ancien.entete.style.width = ancien.largeurEnteteOriginale;
      ancien.repereEntete?.replaceWith(ancien.entete);
      ancien.ligneEntete.style.display = ancien.affichageEntete;
      if (ancien.boutonZoom && ancien.celluleZoom) ancien.celluleZoom.appendChild(ancien.boutonZoom);
    }
    ancien.shell.remove();
    element.classList.remove('calendar-native-moving');
    calendrier.__navigationTactileEnCours = false;
    delete element.dataset.calendarNativeReady;
  }

  function planifier() {
    clearTimeout(preparationTimer);
    if (detruit || mutation || commitEnCours) return;
    preparationTimer = setTimeout(async () => {
      if (!actif() || contactEnCours || mutation || interactionActive() || montage?.enMouvement || montage?.toucher) return;
      appliquerRendusDifferes();
      // Clock ticks must not dismantle the native scroller under the finger.
      for (const [nom, valeur] of optionsDifferees) {
        optionsDifferees.delete(nom);
        calendrier.setOption(nom, valeur);
      }
      const identite = cle();
      const rayon = calendrier.view.type === 'timeGridWeek' ? 3 : 1;
      for (let distance = 1; distance <= rayon; distance++) {
        await preparerVoisin(-distance);
        await preparerVoisin(distance);
        // Yield between pairs so input can interrupt background preparation.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!actif() || contactEnCours || identite !== cle() || montage?.enMouvement || montage?.toucher) return;
      }
      if (!actif() || contactEnCours || identite !== cle() || mutation || interactionActive() || montage?.enMouvement || montage?.toucher) return;
      installer();
    }, 60);
  }

  function invalider() {
    revision++;
    cache.clear();
    delete element.dataset.calendarPagingReady;
    if (montage && !montage.enMouvement && !montage.toucher) restaurer();
    planifier();
  }

  function installer() {
    if (montage || !actif()) return;
    const body = corps(element);
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const entete = element.querySelector('.fc-col-header');
    const ligneEntete = entete?.closest('.fc-scrollgrid-section-header');
    const hauteurEntete = entete && ligneEntete ? rect.top - entete.getBoundingClientRect().top : 0;
    const largeur = rect.width;
    const axe = calendrier.view.type === 'timeGridWeek'
      ? body.querySelector('.fc-timegrid-axis')?.getBoundingClientRect().width || 0 : 0;
    const largeurPage = largeur - axe;
    if (largeurPage <= 0 || rect.height <= 0) return;
    const directions = directionsDisponibles();
    if (directions.some(d => d !== 0 && cache.get(d)?.cle !== cle())) return;
    let index = directions.indexOf(0);
    const shell = document.createElement('div');
    shell.className = 'calendar-native-shell';
    shell.style.setProperty('--calendar-native-axis', axe + 'px');
    shell.style.width = largeur + 'px';
    const hauteur = Math.max(rect.height, ...directions.map(d => cache.get(d)?.hauteur || 0));
    shell.style.height = (hauteur + hauteurEntete) + 'px';
    const scroller = document.createElement('div');
    scroller.className = 'calendar-native-scroller';
    scroller.style.overflowAnchor = 'none';
    scroller.setAttribute('aria-label', 'Calendrier : glisser horizontalement pour changer de période');
    scroller.tabIndex = 0;
    const piste = document.createElement('div');
    piste.className = 'calendar-native-track';
    scroller.appendChild(piste);
    shell.appendChild(scroller);

    // The hours remain outside the horizontal scrollport at their exact width.
    if (axe) {
      const heures = document.createElement('div');
      heures.className = 'calendar-native-axis';
      heures.style.top = hauteurEntete + 'px';
      heures.setAttribute('aria-hidden', 'true');
      for (const cellule of body.querySelectorAll('.fc-timegrid-slot-label')) {
        const position = cellule.getBoundingClientRect();
        const label = cellule.querySelector('.fc-timegrid-slot-label-cushion');
        const style = getComputedStyle(label || cellule);
        const ligne = document.createElement('div');
        ligne.className = 'calendar-native-hour';
        Object.assign(ligne.style, { top: (position.top - rect.top) + 'px', height: position.height + 'px',
          color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, fontFamily: style.fontFamily });
        if (label) {
          const boite = label.getBoundingClientRect();
          const texte = document.createElement('span');
          texte.className = 'calendar-native-hour-label';
          texte.textContent = label.textContent;
          // Preserve the actual label box and typography, not a re-centred
          // approximation: mounting/unmounting the pager must not shift hours.
          Object.assign(texte.style, { position: 'absolute', boxSizing: 'border-box',
            left: (boite.left - rect.left) + 'px', top: (boite.top - position.top) + 'px',
            width: boite.width + 'px', height: boite.height + 'px', padding: style.padding,
            font: style.font, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight,
            textAlign: style.textAlign, textTransform: style.textTransform, whiteSpace: 'nowrap' });
          ligne.appendChild(texte);
        }
        heures.appendChild(ligne);
      }
      shell.appendChild(heures);
    }
    const etat = {
      body, shell, scroller, piste, directions, index, largeurPage, pageCourante: null,
      entete: hauteurEntete ? entete : null, ligneEntete, hauteurEntete,
      hauteursTables: [...body.querySelectorAll('.fc-timegrid-slots > table, :scope > table')].map(table => [table, table.style.height]),
      margeEntete: entete?.style.marginLeft, affichageEntete: ligneEntete?.style.display,
      largeurEnteteOriginale: entete?.style.width,
      marge: body.style.marginLeft, hauteurOriginale: body.style.height, toucher: false, enMouvement: false, initialisation: true,
      finTimer: null, cle: cle(), suspendu: false,
    };
    if (etat.entete) {
      etat.repereEntete = document.createComment('calendar-native-header');
      entete.before(etat.repereEntete);
      ligneEntete.style.display = 'none';
      if (axe) {
        const coin = document.createElement('div');
        coin.className = 'calendar-native-corner calendar-zoom-cell';
        coin.style.height = hauteurEntete + 'px';
        etat.celluleZoom = entete.querySelector('.fc-timegrid-axis');
        etat.boutonZoom = etat.celluleZoom?.querySelector('.calendar-zoom-toggle');
        if (etat.boutonZoom) coin.appendChild(etat.boutonZoom);
        shell.prepend(coin);
      }
    }
    body.before(shell);
    // Keep the real body first in DOM order for FullCalendar hit-testing and
    // existing calendar/drag selectors; flex order places the previous page left.
    function creerPage(direction) {
      const page = document.createElement('div');
      page.className = 'calendar-native-page';
      page.style.order = direction;
      page.style.width = largeurPage + 'px';
      const contenu = direction === 0 ? body : cache.get(direction).body.cloneNode(true);
      contenu.style.marginLeft = -axe + 'px';
      contenu.style.height = (direction === 0 ? rect.height : cache.get(direction).hauteur) + 'px';
      contenu.style.setProperty('--calendar-native-slots-height', contenu.style.height);
      page.dataset.pagingPeriod = direction === 0
        ? calendrier.view.currentStart.toISOString().slice(0, 10) : cache.get(direction).date;
      if (direction === 0) etat.pageCourante = page;
      else { page.inert = true; page.setAttribute('aria-hidden', 'true'); }
      if (hauteurEntete) {
        const header = direction === 0 ? entete : cache.get(direction).entete?.cloneNode(true);
        const conteneurEntete = document.createElement('div');
        conteneurEntete.className = 'calendar-native-page-header';
        conteneurEntete.style.setProperty('--calendar-native-header-width', largeur + 'px');
        conteneurEntete.style.height = hauteurEntete + 'px';
        if (header) { header.style.marginLeft = -axe + 'px'; conteneurEntete.appendChild(header); }
        page.appendChild(conteneurEntete);
      }
      page.appendChild(contenu);
      piste.appendChild(page);
      return page;
    }
    for (const direction of [0, ...directions.filter(d => d !== 0)]) creerPage(direction);
    montage = etat;
    scroller.scrollLeft = index * largeurPage;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (montage === etat) etat.initialisation = false;
    }));

    function ignorerClics() {
      clicIgnoreJusqua = performance.now() + 250;
      calendrier.__navigationTactileIgnoreJusqua = clicIgnoreJusqua;
    }
    let extensionEnCours = false;
    async function prolongerPiste() {
      if (montage !== etat || extensionEnCours || etat.initialisation || etat.suspendu ||
          calendrier.view.type !== 'timeGridWeek') return;
      const visible = scroller.scrollLeft / largeurPage;
      const sens = directions.length - 1 - visible <= 2 ? 1 : visible <= 2 ? -1 : 0;
      if (!sens || interactionActive()) return;
      const limite = sens > 0 ? directions.at(-1) : directions[0];
      if (!autorise(limite + sens)) return;
      extensionEnCours = true;
      const ajouts = [];
      try {
        // Prepare beyond the visible buffer while the browser keeps scrolling.
        // Never replace the scrollport or the original finger target mid-gesture.
        for (let distance = 1; distance <= 3; distance++) {
          const direction = limite + sens * distance;
          if (!autorise(direction)) break;
          const apercu = await preparerVoisin(direction, true);
          if (montage !== etat || !apercu) return;
          ajouts.push(direction);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (montage !== etat || !ajouts.length || ajouts.some(d => cache.get(d)?.cle !== cle())) return;
        const position = scroller.scrollLeft;
        for (const direction of ajouts) creerPage(direction);
        if (sens > 0) directions.push(...ajouts);
        else {
          directions.unshift(...ajouts.reverse());
          index += ajouts.length;
          etat.index = index;
          // Compensate only for newly prepended widths; the same date stays
          // under the finger. Native scrolling still owns the gesture/inertia.
          scroller.scrollTo({ left: position + ajouts.length * largeurPage, behavior: 'instant' });
        }
      } finally {
        extensionEnCours = false;
      }
    }
    etat.scroll = () => {
      if (montage !== etat || etat.initialisation || etat.suspendu) return;
      if (Math.abs(scroller.scrollLeft - index * largeurPage) < .5 && !etat.enMouvement) return;
      if (!etat.enMouvement) {
        etat.enMouvement = true;
        calendrier.__navigationTactileEnCours = true;
        element.classList.add('calendar-native-moving');
        calendrier.unselect();
      }
      ignorerClics();
      void prolongerPiste();
      // Old browsers without scrollend still use native scrolling and snapping.
      // The timer only observes rest; it never drives position or animation.
      if (!('onscrollend' in scroller)) {
        clearTimeout(etat.finTimer);
        etat.finTimer = setTimeout(etat.fin, 200);
      }
    };
    etat.fin = () => {
      if (montage !== etat || etat.initialisation || etat.toucher || etat.suspendu || interactionActive()) return;
      const cible = Math.round(scroller.scrollLeft / largeurPage);
      if (Math.abs(scroller.scrollLeft - cible * largeurPage) > 1) return;
      const direction = directions[cible] || 0;
      etat.enMouvement = false;
      calendrier.__navigationTactileEnCours = false;
      element.classList.remove('calendar-native-moving');
      if (!direction) {
        if (rendusDifferes.length) { appliquerRendusDifferes(); planifier(); return; }
        if (etat.cle !== cle()) { restaurer(); planifier(); }
        else if (optionsDifferees.size) planifier();
        return;
      }
      ignorerClics();
      // Commit once, only after native momentum and snap have ended.
      commitEnCours = true;
      try {
        const dateCible = datePourDirection(direction).toISOString().slice(0, 10);
        restaurer();
        appliquerRendusDifferes();
        if (autorise(direction)) {
          if (Math.abs(direction) > 1 && dateCible) calendrier.gotoDate(dateCible);
          else direction > 0 ? calendrier.next() : calendrier.prev();
        }
      } finally {
        commitEnCours = false;
        planifier();
      }
    };
    etat.debut = event => {
      etat.toucher = event.touches.length > 0;
      if (event.touches.length > 1) etat.suspendu = true;
    };
    etat.finToucher = event => {
      etat.toucher = event.touches.length > 0;
      if (!etat.toucher) {
        etat.suspendu = false;
        // scrollend may have fired while the finger was still down (especially
        // at either end of the preloaded buffer). Recheck rest after release
        // even on browsers with scrollend, otherwise the buffer stays finite.
        clearTimeout(etat.finTimer);
        etat.finTimer = setTimeout(etat.fin, 200);
      }
    };
    // Native horizontal scrolling is reserved for the grid. Event manipulation
    // keeps its existing FullCalendar drag/resize/long-press behavior.
    etat.pointer = event => {
      const evenement = event.target instanceof Element && event.target.closest('.fc-event-draggable, .fc-event-resizer');
      etat.suspendu = Boolean(evenement || edition(event.target));
      scroller.classList.toggle('calendar-native-editing', etat.suspendu);
    };
    etat.clavier = event => {
      if (event.target !== scroller || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const destination = index + direction;
      if (destination >= 0 && destination < directions.length) scroller.scrollTo({
        left: destination * largeurPage,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    };
    scroller.addEventListener('scroll', etat.scroll, { passive: true });
    scroller.addEventListener('scrollend', etat.fin);
    scroller.addEventListener('touchstart', etat.debut, { passive: true });
    scroller.addEventListener('touchend', etat.finToucher, { passive: true });
    scroller.addEventListener('touchcancel', etat.finToucher, { passive: true });
    scroller.addEventListener('pointerdown', etat.pointer, { passive: true, capture: true });
    scroller.addEventListener('keydown', etat.clavier);
    element.dataset.calendarPagingReady = directions.filter(d => d !== 0).join(',');
    element.dataset.calendarNativeReady = 'true';
  }

  // Restore the original DOM hierarchy before FullCalendar replaces its view
  // or measures/resizes it, including event-source batch refreshes. Otherwise
  // expandRows measures the shell (body + relocated header) as the body alone:
  // every refresh adds the header height to the time slots again.
  // Nested calls are grouped; no new calendar instance.
  for (const nom of ['next', 'prev', 'today', 'gotoDate', 'changeView', 'setOption', 'updateSize', 'render', 'batchRendering', 'destroy']) {
    const originale = calendrier[nom];
    if (typeof originale !== 'function') continue;
    const enveloppe = function (...args) {
      if (nom === 'batchRendering' && montage && !montage.suspendu && (montage.enMouvement || montage.toucher)) {
        // Real-time data may arrive while a finger/trackpad is still scrolling.
        // Do not rerender inside the relocated grid or detach the touch target.
        rendusDifferes.push(args[0]);
        return;
      }
      if (nom === 'setOption' && args[0] === 'now' && (contactEnCours || montage?.enMouvement || montage?.toucher)) {
        optionsDifferees.set(args[0], args[1]);
        return;
      }
      mutation++;
      restaurer();
      try { return originale.apply(this, args); }
      finally { mutation--; if (nom !== 'destroy') planifier(); }
    };
    methodes.set(nom, { originale, enveloppe });
    calendrier[nom] = enveloppe;
  }
  function clic(event) {
    if (performance.now() < clicIgnoreJusqua && element.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function terminerEdition() {
    contactEnCours = false;
    if (!montage) return;
    montage.suspendu = false;
    montage.scroller.classList.remove('calendar-native-editing');
  }
  function debutContact() {
    // Ghost placement consumes touchend in capture phase. It owns that contact
    // completely; tracking it here would leave the native pager stuck busy.
    if (!document.body.classList.contains('is-copying-session')) contactEnCours = true;
  }
  function finContact(event) {
    if (event.touches?.length) return;
    terminerEdition();
    planifier();
  }
  function suspendre() {
    if (document.visibilityState === 'hidden') { restaurer(); clearTimeout(preparationTimer); }
    else planifier();
  }
  calendrier.on('eventsSet', invalider);
  calendrier.on('datesSet', invalider);
  calendrier.on('eventDragStop', terminerEdition);
  calendrier.on('eventResizeStop', terminerEdition);
  calendrier.on('viewWillUnmount', restaurer);
  window.addEventListener('resize', invalider);
  window.addEventListener('pointerup', finContact, { passive: true });
  window.addEventListener('pointercancel', finContact, { passive: true });
  element.addEventListener('pointerdown', debutContact, { passive: true, capture: true });
  element.addEventListener('touchstart', debutContact, { passive: true, capture: true });
  window.addEventListener('touchend', finContact, { passive: true });
  window.addEventListener('touchcancel', finContact, { passive: true });
  document.addEventListener('visibilitychange', suspendre);
  document.addEventListener('click', clic, true);
  planifier();
  return () => {
    detruit = true;
    rendusDifferes.length = 0;
    clearTimeout(preparationTimer);
    restaurer();
    cache.clear();
    for (const [nom, { originale, enveloppe }] of methodes) if (calendrier[nom] === enveloppe) calendrier[nom] = originale;
    calendrier.off('eventsSet', invalider);
    calendrier.off('datesSet', invalider);
    calendrier.off('eventDragStop', terminerEdition);
    calendrier.off('eventResizeStop', terminerEdition);
    calendrier.off('viewWillUnmount', restaurer);
    window.removeEventListener('resize', invalider);
    window.removeEventListener('pointerup', finContact);
    window.removeEventListener('pointercancel', finContact);
    element.removeEventListener('pointerdown', debutContact, true);
    element.removeEventListener('touchstart', debutContact, true);
    window.removeEventListener('touchend', finContact);
    window.removeEventListener('touchcancel', finContact);
    document.removeEventListener('visibilitychange', suspendre);
    document.removeEventListener('click', clic, true);
    delete element.dataset.calendarPagingReady;
  };
}

function attacherEditionTactile(element, calendrier) {
  let contactEdition = false;
  let debutContact = 0;
  let pointContact = null;
  let gesteDeplace = false;
  const cibleEditable = cible => cible instanceof Element &&
    cible.closest('.fc-event-draggable, .fc-event-resizable, .fc-event-resizer');
  function debut(event) {
    if (event.touches.length === 1 && cibleEditable(event.target) &&
        calendrier.view?.type === 'timeGridWeek') {
      contactEdition = true;
      debutContact = performance.now();
      pointContact = event.touches[0];
      gesteDeplace = false;
      calendrier.__editionTactileEnCours = true;
    }
  }
  function bloquer(event) {
    // Keep the original touch target alive: FullCalendar still receives every
    // move/end, but Safari cannot turn the hold/resize into page pan or zoom.
    if (contactEdition && event.cancelable) event.preventDefault();
    const point = event.touches?.[0];
    if (contactEdition && point && pointContact && Math.hypot(point.clientX - pointContact.clientX, point.clientY - pointContact.clientY) > 6) gesteDeplace = true;
  }
  function fin(event) {
    if (event?.touches?.length) return;
    if (contactEdition && (gesteDeplace || performance.now() - debutContact >= Number(calendrier.getOption('eventLongPressDelay') || 360))) {
      calendrier.__clicEditionIgnoreJusqua = performance.now() + 650;
    }
    contactEdition = false;
    calendrier.__editionTactileEnCours = false;
  }
  element.addEventListener('touchstart', debut, { passive: true, capture: true });
  document.addEventListener('touchmove', bloquer, { passive: false, capture: true });
  element.addEventListener('gesturestart', bloquer, { passive: false, capture: true });
  element.addEventListener('gesturechange', bloquer, { passive: false, capture: true });
  window.addEventListener('touchend', fin, true);
  window.addEventListener('touchcancel', fin, true);
  window.addEventListener('blur', fin);
  return () => {
    fin();
    element.removeEventListener('touchstart', debut, true);
    document.removeEventListener('touchmove', bloquer, true);
    element.removeEventListener('gesturestart', bloquer, true);
    element.removeEventListener('gesturechange', bloquer, true);
    window.removeEventListener('touchend', fin, true);
    window.removeEventListener('touchcancel', fin, true);
    window.removeEventListener('blur', fin);
  };
}

function attacherDezoomCalendrier(element, calendrier) {
  let distanceInitiale = 0;
  let dernierWheel = 0;
  let sommeWheel = 0;
  let safariActif = false;
  let moisDemande = false;
  let semaineDemandee = false;
  let changementFrame = null;
  const edition = (cible) => cible instanceof Element && cible.closest("input, select, textarea, button");
  const occupation = () => calendrier.__editionTactileEnCours || document.body.classList.contains("is-copying-session") || element.querySelector(".fc-event-dragging, .fc-event-resizing");
  const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  function ignorerClics(delai = 450) {
    calendrier.__navigationTactileIgnoreJusqua = performance.now() + delai;
    calendrier.unselect();
  }
  function afficherMois() {
    if (calendrier.view?.type !== "timeGridWeek" || occupation()) return;
    ignorerClics();
    calendrier.changeView("dayGridMonth");
  }
  function afficherSemaine() {
    if (calendrier.view?.type !== "dayGridMonth" || occupation()) return;
    ignorerClics();
    calendrier.changeView("timeGridWeek", calendrier.getDate());
  }
  function creerBoutonZoom(mois) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "calendar-zoom-toggle";
    bouton.setAttribute("aria-label", mois ? "Zoomer : vue semaine" : "Dézoomer : vue mois");
    bouton.title = bouton.getAttribute("aria-label");
    const fleches = mois
      ? "M9 9 3 3M3 8V3h5M15 9l6-6M16 3h5v5M9 15l-6 6M3 16v5h5M15 15l6 6M16 21h5v-5"
      : "M3 3l6 6M4 9h5V4M21 3l-6 6M15 4v5h5M3 21l6-6M4 15h5v5M21 21l-6-6M15 20v-5h5";
    if (mois) bouton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${fleches}"/></svg>`;
    else bouton.appendChild(document.createElement('span')).className = 'calendar-corner-month';
    bouton.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); mois ? afficherSemaine() : afficherMois(); });
    return bouton;
  }
  function installerBouton() {
    const mois = calendrier.view?.type === "dayGridMonth";
    let ligne = element.querySelector(".calendar-month-heading");
    if (mois) {
      const grille = element.querySelector(".fc-view-harness");
      if (!grille) return;
      if (!ligne) {
        ligne = document.createElement("div");
        ligne.className = "calendar-month-heading";
        const titre = document.createElement("strong");
        titre.className = "calendar-month-title";
        ligne.append(titre, creerBoutonZoom(true));
        grille.before(ligne);
      }
      const titre = ligne.querySelector(".calendar-month-title");
      const texte = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(calendrier.view.currentStart);
      if (titre.textContent !== texte) titre.textContent = texte;
      return;
    }
    ligne?.remove();
    const cellule = element.querySelector(".fc-col-header .fc-timegrid-axis");
    const existant = element.querySelector('.calendar-native-corner .calendar-zoom-toggle') || cellule?.querySelector('.calendar-zoom-toggle');
    const bouton = existant || creerBoutonZoom(false);
    const libelle = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'][calendrier.view.currentStart.getUTCMonth()];
    const texteMois = bouton.querySelector('.calendar-corner-month');
    if (texteMois && texteMois.textContent !== libelle) texteMois.textContent = libelle;
    if (!cellule || existant) return;
    cellule.classList.add("calendar-zoom-cell");
    cellule.appendChild(bouton);
  }
  const observateur = new MutationObserver(installerBouton);
  observateur.observe(element, { childList: true, subtree: true });
  installerBouton();
  function terminerGeste(event) {
    const ouvrir = moisDemande && event.type !== "touchcancel";
    const zoomer = semaineDemandee && event.type !== "touchcancel";
    moisDemande = false;
    semaineDemandee = false;
    if (ouvrir || zoomer) {
      // Wait for the real touchend before replacing its target grid. Otherwise
      // the detached touch target cannot deliver the final finger release.
      changementFrame = requestAnimationFrame(() => {
        changementFrame = null;
        zoomer ? afficherSemaine() : afficherMois();
      });
    }
  }
  function debut(event) {
    if (event.touches.length !== 2 || edition(event.target) || occupation()) return;
    distanceInitiale = distance(event.touches);
    calendrier.__zoomCalendrierEnCours = true;
    calendrier.unselect();
  }
  function mouvement(event) {
    if (!distanceInitiale || event.touches.length !== 2) return;
    event.stopImmediatePropagation();
    const actuelle = distance(event.touches);
    if (actuelle <= distanceInitiale * .82 && distanceInitiale - actuelle >= 12) moisDemande = true;
    if (actuelle >= distanceInitiale * 1.18 && actuelle - distanceInitiale >= 12) semaineDemandee = true;
  }
  function fin(event) {
    if (!distanceInitiale) return;
    ignorerClics();
    // Let FullCalendar receive touchend to clear its own long-press state.
    if (event.type === "touchcancel" || event.touches.length === 0) {
      distanceInitiale = 0;
      calendrier.__zoomCalendrierEnCours = false;
      terminerGeste(event);
    }
  }
  function wheel(event) {
    if (!event.ctrlKey || edition(event.target) || occupation()) return;
    event.preventDefault();
    const maintenant = performance.now();
    if (maintenant - dernierWheel > 400) sommeWheel = 0;
    dernierWheel = maintenant;
    sommeWheel += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
    if (sommeWheel >= 35 && calendrier.view?.type === "timeGridWeek") { afficherMois(); sommeWheel = 0; }
    else if (sommeWheel <= -35 && calendrier.view?.type === "dayGridMonth") { afficherSemaine(); sommeWheel = 0; }
  }
  function debutSafari(event) {
    if (edition(event.target) || occupation()) return;
    safariActif = true;
    calendrier.__zoomCalendrierEnCours = true;
    calendrier.unselect();
    event.preventDefault();
  }
  function mouvementSafari(event) {
    if (!safariActif) return;
    event.preventDefault();
    if (event.scale <= .82) moisDemande = true;
    if (event.scale >= 1.18) semaineDemandee = true;
  }
  function finSafari(event) {
    if (!safariActif) return;
    event.preventDefault();
    safariActif = false;
    ignorerClics();
    calendrier.__zoomCalendrierEnCours = false;
    terminerGeste(event);
  }
  function clic(event) {
    if (!element.contains(event.target)) return;
    if (event.target.closest?.(".calendar-zoom-toggle")) return;
    if (calendrier.__zoomCalendrierEnCours || performance.now() < (calendrier.__navigationTactileIgnoreJusqua || 0)) {
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (calendrier.view?.type === "dayGridMonth") {
      const jour = event.target instanceof Element && event.target.closest(".fc-daygrid-day[data-date]");
      if (jour && element.contains(jour)) {
        event.preventDefault(); event.stopImmediatePropagation();
        ignorerClics(150);
        calendrier.changeView("timeGridWeek", jour.dataset.date);
      }
    }
  }
  element.addEventListener("touchstart", debut, { passive: true, capture: true });
  element.addEventListener("touchmove", mouvement, { passive: true, capture: true });
  window.addEventListener("touchend", fin, true);
  window.addEventListener("touchcancel", fin, true);
  element.addEventListener("wheel", wheel, { passive: false, capture: true });
  element.addEventListener("gesturestart", debutSafari, { passive: false });
  element.addEventListener("gesturechange", mouvementSafari, { passive: false });
  element.addEventListener("gestureend", finSafari, { passive: false });
  document.addEventListener("click", clic, true);
  return () => {
    observateur.disconnect();
    element.querySelector(".calendar-month-heading")?.remove();
    cancelAnimationFrame(changementFrame);
    calendrier.__zoomCalendrierEnCours = false;
    element.removeEventListener("touchstart", debut, true);
    element.removeEventListener("touchmove", mouvement, true);
    window.removeEventListener("touchend", fin, true);
    window.removeEventListener("touchcancel", fin, true);
    element.removeEventListener("wheel", wheel, true);
    element.removeEventListener("gesturestart", debutSafari);
    element.removeEventListener("gesturechange", mouvementSafari);
    element.removeEventListener("gestureend", finSafari);
    document.removeEventListener("click", clic, true);
  };
}

export function initialiserCalendrier(
  element,
  {
    onDateClick,
    onSlotClick,
    onSelect,
    canSelectRange,
    onEventClick,
    onEventDrop,
    onEventResize,
    onIndisponibiliteResize,
    canResizeIndisponibilite,
    canDragSeance,
    canInteractSeance,
    canInteractIndisponibilite,
    onIndisponibiliteClick,
    onDatesSet,
    selectionMobileRapide = false,
    navigationZoom = false,
    plageHoraire = {},
    pasCreneauMinutes = CALENDRIER_PAS_CRENEAU_MINUTES,
    timezoneCentrale = "",
  } = {}
) {
  const plugins = recupererPluginsCalendrier();

  if (!globalThis.FullCalendar?.Calendar || plugins.length === 0) {
    element.innerHTML =
      '<div class="empty-state">Impossible de charger le calendrier.</div>';
    console.error("FullCalendar n'est pas disponible ou ses plugins sont absents.");
    return null;
  }

  const optionsResponsive = obtenirOptionsResponsiveCalendrier();
  element.dataset.calendarZoom = String(navigationZoom);
  const plageHoraireInitiale = normaliserPlageHoraireCalendrier(plageHoraire);
  const pasCreneauInitial = normaliserPasCreneauCalendrier(pasCreneauMinutes);
  const dureeCreneauInitiale = convertirPasCreneauEnDuree(pasCreneauInitial);
  const repereDeplacement = creerRepereHeureDeplacement(element);
  let redimensionnementEnCours = false;
  let selectionSurIndisponibilite = false;
  const suivreCibleSelection = event => {
    selectionSurIndisponibilite = Boolean(event.target?.closest?.(".indisponibilite-display-only"));
  };
  const navigationDeplacement = creerNavigationPendantDeplacement(element, () => calendrier);
  // Ghost placement owns capture-phase touch events, so it feeds the same
  // edge navigator directly instead of relying on suppressed bubbling events.

  const calendrier = new FullCalendar.Calendar(element, {
    plugins,
    locale: "fr",
    timeZone: timezoneCentrale || "Africa/Casablanca",
    initialView: optionsResponsive.initialView,
    firstDay: 1,
    height: "auto",
    expandRows: true,
    selectable: canSelectRange?.() !== false,
    editable: typeof onEventDrop === "function",
    eventDurationEditable: typeof onEventResize === "function",
    eventResizableFromStart: true,
    eventDataTransform(evenement) {
      if (navigationZoom && calendrier?.view?.type === "dayGridMonth") {
        return { ...evenement, startEditable: false, durationEditable: false };
      }
      if (evenement.extendedProps?.type === "indisponibilite") {
        const modifiable = Boolean(onIndisponibiliteResize && canResizeIndisponibilite?.(evenement.extendedProps.indisponibilite));
        const date = evenement.extendedProps.indisponibilite.date;
        // Read-only shading must not participate in the session-column layout.
        if (canInteractIndisponibilite?.() === false) {
          return { ...evenement, display: "background", startEditable: false, durationEditable: false };
        }
        return { ...evenement, startEditable: false,
          ...(modifiable && evenement.allDay ? { allDay: false, display: "auto", start: `${date}T00:00:00`, end: `${calculerDateSuivante(date)}T00:00:00` } : {}),
          durationEditable: modifiable };
      }
      const modifiable = typeof onEventDrop === "function" &&
        evenement.extendedProps?.type === "seance" &&
        (typeof canDragSeance !== "function" || canDragSeance(evenement.extendedProps.seance));
      return {
        ...evenement,
        startEditable: modifiable,
        ...(!modifiable || evenement.extendedProps?.seance?.statut_seance === "annulee" ? { durationEditable: false } : {}),
      };
    },
    eventAllow(plage, evenement) {
      if (navigationZoom && calendrier.view?.type === "dayGridMonth") return false;
      if (!redimensionnementEnCours) return true;
      const duree = (plage.end - plage.start) / 60000;
      if (evenement?.extendedProps?.type === "indisponibilite") {
        const date = evenement.extendedProps.indisponibilite.date;
        return duree >= 30 && plage.start.toISOString().slice(0, 10) === date &&
          new Date(plage.end.getTime() - 1).toISOString().slice(0, 10) === date;
      }
      return [60, 90, 120].includes(duree);
    },
    selectMirror: true,
    selectAllow: () => canSelectRange?.() !== false && !selectionSurIndisponibilite && !calendrier.__navigationTactileEnCours && !calendrier.__zoomCalendrierEnCours &&
      (!navigationZoom || calendrier.view?.type !== "dayGridMonth") &&
      performance.now() >= (calendrier.__navigationTactileIgnoreJusqua || 0),
    unselectAuto: true,
    selectLongPressDelay: selectionMobileRapide ? 120 : 1000,
    eventLongPressDelay: selectionMobileRapide || onEventDrop ? 360 : 1000,
    longPressDelay: selectionMobileRapide ? 120 : 1000,
    selectMinDistance: selectionMobileRapide ? 0 : 5,
    slotDuration: dureeCreneauInitiale,
    slotLabelInterval: "01:00:00",
    // Les créneaux de séance restent sélectionnables à la demi-heure, même
    // lorsque le filtre Disponibilités regroupe visuellement une heure.
    snapDuration: "00:30:00",
    slotEventOverlap: true,
    eventMinHeight: 34,
    eventOrder: "typeOrder,start,-duration,title",
    fixedWeekCount: Boolean(optionsResponsive.fixedWeekCount),
    allDaySlot: false,
    now: construireMaintenantCalendrier(timezoneCentrale),
    nowIndicator: true,
    slotMinTime: plageHoraireInitiale.slotMinTime,
    slotMaxTime: plageHoraireInitiale.slotMaxTime,
    scrollTime: plageHoraireInitiale.slotMinTime,
    dayMaxEvents: optionsResponsive.dayMaxEvents,
    headerToolbar: optionsResponsive.headerToolbar,
    buttonIcons: false,
    buttonText: optionsResponsive.buttonText,
    dayHeaderFormat: optionsResponsive.dayHeaderFormat,
    dayHeaderContent: genererContenuEnteteJour,
    navLinks: navigationZoom,
    navLinkDayClick(date) {
      if (navigationZoom && !calendrier.__zoomCalendrierEnCours && performance.now() >= (calendrier.__navigationTactileIgnoreJusqua || 0)) {
        calendrier.__navigationTactileIgnoreJusqua = performance.now() + 150;
        calendrier.unselect();
        calendrier.changeView("timeGridWeek", date);
      }
    },
    moreLinkContent: genererContenuLienPlusEvenements,
    moreLinkClick(info) {
      if (navigationZoom && calendrier.view?.type === "dayGridMonth") {
        calendrier.__navigationTactileIgnoreJusqua = performance.now() + 150;
        calendrier.changeView("timeGridWeek", info.date);
        return "none";
      }
      return "popover";
    },
    displayEventTime: false,
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      meridiem: false,
    },
    eventDidMount(info) {
      adapterPresentationEvenement(info);
      const local = info.event.extendedProps?.seance || info.event.extendedProps?.indisponibilite;
      if (local?.offline_pending) {
        info.el.classList.add("offline-calendar-pending");
        if (local.offline_status === "conflict") info.el.classList.add("offline-calendar-conflict");
        info.el.title = local.offline_status === "conflict" ? "Conflit : modification non appliquée au serveur" : "En attente de synchronisation";
      }
      if (info.event.extendedProps?.type === "seance") {
        info.el.dataset.seanceId = String(info.event.extendedProps.seance.id);
      }
      if (info.event.extendedProps?.type === "indisponibilite") {
        info.el.dataset.indisponibiliteId = String(info.event.extendedProps.indisponibilite.id);
        if (typeof onIndisponibiliteClick !== "function" || canInteractIndisponibilite?.() === false) {
          info.el.classList.add("indisponibilite-display-only");
          info.el.removeAttribute("href");
          info.el.setAttribute("tabindex", "-1");
        }
      }
      if (info.event.extendedProps?.type === "seance" && (typeof onEventClick !== "function" || canInteractSeance?.() === false)) {
        info.el.classList.add("seance-display-only");
        info.el.removeAttribute("href");
        info.el.setAttribute("tabindex", "-1");
      }
      repereDeplacement.monter(info);
    },
    eventWillUnmount: repereDeplacement.demonter,
    eventClassNames: repereDeplacement.actualiserEvenement,
    eventDragStart(info) { repereDeplacement.demarrer(info); navigationDeplacement.demarrer(); },
    eventDragStop() { repereDeplacement.arreter(); navigationDeplacement.arreter(); },
    eventResizeStart(info) {
      redimensionnementEnCours = true;
      repereDeplacement.demarrer(info);
    },
    eventResizeStop() {
      redimensionnementEnCours = false;
      repereDeplacement.arreter();
    },
    eventResize(info) {
      if (info.event.extendedProps?.type === "indisponibilite") {
        onIndisponibiliteResize?.(info);
        return;
      }
      onEventResize?.(info);
    },
    viewWillUnmount: repereDeplacement.arreter,
    datesSet(info) {
      synchroniserEtatVisuelCalendrier(element, info.view.type);
      onDatesSet?.(info);
    },
    windowResize() {
      const vueActive = calendrier.view?.type;
      appliquerOptionsResponsive(calendrier);

      if (estCalendrierMobile()) {
        if (vueActive !== "timeGridWeek" && vueActive !== "dayGridMonth") {
          calendrier.changeView("timeGridWeek");
        }
      }

      synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
    },
    dateClick(info) {
      if (info.jsEvent && selectionSurIndisponibilite) return;
      if (info.jsEvent?.target?.closest?.(".calendar-zoom-toggle, .indisponibilite-display-only")) return;
      if (calendrier.__navigationTactileEnCours || calendrier.__zoomCalendrierEnCours ||
        performance.now() < (calendrier.__navigationTactileIgnoreJusqua || 0)) return;
      if (navigationZoom && calendrier.view?.type === "dayGridMonth") {
        calendrier.__navigationTactileIgnoreJusqua = performance.now() + 150;
        calendrier.unselect();
        calendrier.changeView("timeGridWeek", extraireDateIsoDepuisClicCalendrier(info));
        return;
      }
      if (typeof onSlotClick === "function") {
        onSlotClick(extraireCreneauDepuisClicCalendrier(info));
        return;
      }

      onDateClick?.(extraireDateIsoDepuisClicCalendrier(info));
    },
    select(info) {
      if (info.jsEvent?.target?.closest?.(".indisponibilite-display-only")) {
        info.view?.calendar?.unselect?.();
        return;
      }
      if (navigationZoom && info.view?.type === "dayGridMonth") {
        info.view?.calendar?.unselect?.();
        return;
      }
      if (!calendrier.__navigationTactileEnCours &&
        !calendrier.__zoomCalendrierEnCours &&
        performance.now() >= (calendrier.__navigationTactileIgnoreJusqua || 0)) {
        onSelect?.(extraireSelectionCalendrier(info));
      }
      info.view?.calendar?.unselect?.();
    },
    eventClick(info) {
      if (performance.now() < (calendrier.__clicEditionIgnoreJusqua || 0)) return;
      if (navigationZoom && calendrier.view?.type === "dayGridMonth") {
        if (!calendrier.__zoomCalendrierEnCours && performance.now() >= (calendrier.__navigationTactileIgnoreJusqua || 0)) {
          calendrier.__navigationTactileIgnoreJusqua = performance.now() + 150;
          calendrier.changeView("timeGridWeek", info.event.startStr.slice(0, 10));
        }
        return;
      }
      const typeEvenement = info.event.extendedProps?.type;

      if (typeEvenement === "indisponibilite") {
        if (canInteractIndisponibilite?.() === false) return;
        onIndisponibiliteClick?.(info.event.extendedProps.indisponibilite, info);
        return;
      }

      if (typeEvenement === "availability-unavailable") {
        // Un fond gris du Dashboard reste reservable par le Handler. Le clic
        // ouvre donc directement la creation sur le creneau correspondant.
        onSlotClick?.(
          extraireSelectionCalendrier({
            start: info.event.start,
            end: info.event.end,
            allDay: false,
          })
        );
        return;
      }

      if (canInteractSeance?.() !== false) onEventClick?.(info.event.extendedProps.seance, info);
    },
    eventDrop(info) {
      if (info.event.extendedProps?.type !== "seance") {
        info.revert();
        return;
      }
      onEventDrop?.(info);
    },
    events: [],
  });

  calendrier.__navigationPendantDeplacement = navigationDeplacement;
  calendrier.render();
  element.addEventListener("pointerdown", suivreCibleSelection, true);
  element.addEventListener("touchstart", suivreCibleSelection, { passive: true, capture: true });
  const detacherEditionTactile = attacherEditionTactile(element, calendrier);
  const detacherZoom = navigationZoom ? attacherDezoomCalendrier(element, calendrier) : () => {};
  const detacherNavigationSemaines = attacherNavigationSemaines(element, calendrier, { vueMois: navigationZoom });
  const detruireCalendrier = calendrier.destroy.bind(calendrier);
  calendrier.destroy = () => {
    element.removeEventListener("pointerdown", suivreCibleSelection, true);
    element.removeEventListener("touchstart", suivreCibleSelection, true);
    detacherZoom();
    detacherEditionTactile();
    detacherNavigationSemaines();
    navigationDeplacement.arreter();
    repereDeplacement.arreter();
    detruireCalendrier();
  };
  calendrier.__plageHoraire = plageHoraireInitiale;
  calendrier.__pasCreneauMinutes = pasCreneauInitial;
  calendrier.__timezoneCalendrier = timezoneCentrale || "Africa/Casablanca";
  synchroniserEtatVisuelCalendrier(element, calendrier.view?.type);
  return calendrier;
}

/**
 * Applies the Handler's configured calendar window to an already rendered
 * FullCalendar instance. `00:00` as an end time represents the end of the
 * civil day and is therefore sent to FullCalendar as `24:00:00`.
 */
export function mettreAJourPlageHoraireCalendrier(calendrier, plageHoraire = {}) {
  const plageNormalisee = normaliserPlageHoraireCalendrier(plageHoraire);

  if (!calendrier || typeof calendrier.setOption !== "function") {
    return plageNormalisee;
  }

  const appliquerOptions = () => {
    calendrier.setOption("slotMinTime", plageNormalisee.slotMinTime);
    calendrier.setOption("slotMaxTime", plageNormalisee.slotMaxTime);
    calendrier.setOption("scrollTime", plageNormalisee.slotMinTime);
  };

  if (typeof calendrier.batchRendering === "function") {
    calendrier.batchRendering(appliquerOptions);
  } else {
    appliquerOptions();
  }

  calendrier.__plageHoraire = plageNormalisee;
  calendrier.scrollToTime?.(plageNormalisee.slotMinTime);
  return plageNormalisee;
}

export function mettreAJourHorlogeCalendrier(calendrier, timezoneCentrale = "") {
  if (!calendrier || typeof calendrier.setOption !== "function") {
    return null;
  }

  const fuseau = timezoneCentrale || "Africa/Casablanca";
  if (calendrier.__timezoneCalendrier !== fuseau) {
    calendrier.setOption("timeZone", fuseau);
  }
  const maintenant = construireMaintenantCalendrier(fuseau);
  calendrier.setOption("now", maintenant);
  calendrier.__timezoneCalendrier = fuseau;
  return maintenant;
}

export function mettreAJourEvenements(
  calendrier,
  seances = [],
  indisponibilites = [],
  options = {}
) {
  if (!calendrier) {
    return;
  }

  calendrier.__fournirEvenementsApercu = cible => construireEvenementsPourCalendrier(cible, seances, indisponibilites, options);
  const source = construireEvenementsPourCalendrier(calendrier, seances, indisponibilites, options);
  const appliquer = () => {
    calendrier.removeAllEvents();
    calendrier.removeAllEventSources?.();
    calendrier.addEventSource(source);
  };
  if (typeof calendrier.batchRendering === "function") calendrier.batchRendering(appliquer);
  else appliquer();
}

function construireEvenementsPourCalendrier(calendrier, seances, indisponibilites, options) {
  const vue = String(options?.vue || "complete").toLowerCase();
  let evenements = [];

  if (vue === "central") {
    evenements = [
      ...creerEvenementsIndisponibiliteCollective(calendrier, {
        professeurs:
          options?.disponibilites?.intervenants || options?.disponibilites?.professeurs,
        indisponibilites: options?.disponibilites?.indisponibilites,
        seances: options?.disponibilites?.seances,
        handlerId: options?.disponibilites?.handlerId,
        plageHoraire: options?.disponibilites?.plageHoraire,
      }),
      ...seances.map(transformerSeanceEnEvenement).filter(Boolean),
    ];
  } else if (vue === "seances") {
    evenements = seances.map(transformerSeanceEnEvenement).filter(Boolean);
  } else {
    evenements = [
      ...seances.map(transformerSeanceEnEvenement),
      ...indisponibilites.map(transformerIndisponibiliteEnEvenement),
    ].filter(Boolean);
  }

  return masquerPrenomsSeancesChevauchantes(evenements);
}

export const __test__ = {
  convertirHeureOptionEnMinutes,
  normaliserPasCreneauCalendrier,
  normaliserPlageHoraireCalendrier,
  indisponibiliteChevaucheCreneauProfesseur,
  creerPalettesDisponibiliteProfesseurs,
  creerEvenementsIndisponibiliteCollective,
  masquerPrenomsSeancesChevauchantes,
  construireMaintenantCalendrier,
  extraireCreneauDepuisClicCalendrier,
  extraireSelectionCalendrier,
};
