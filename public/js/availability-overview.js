const COULEUR_PAR_DEFAUT = "#64748b";
const PAS_MINUTES = 30;
const MINUTES_PAR_JOUR = 24 * 60;
const PLAGE_HORAIRE_APERCU_PAR_DEFAUT = Object.freeze({
  calendar_start_time: "08:00",
  calendar_end_time: "23:30",
});

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function couleurValide(couleur) {
  return /^#[0-9a-f]{6}$/i.test(String(couleur || "").trim());
}

function minutesDepuisHeure(heure, { finDeJour = false } = {}) {
  const correspondance = String(heure || "").match(/^(\d{2}):(\d{2})$/);

  if (!correspondance) {
    return null;
  }

  const heures = Number(correspondance[1]);
  const minutes = Number(correspondance[2]);

  if (
    finDeJour &&
    ((heures === 0 && minutes === 0) || (heures === 24 && minutes === 0))
  ) {
    return MINUTES_PAR_JOUR;
  }

  return heures >= 0 && heures <= 23 && minutes >= 0 && minutes <= 59
    ? heures * 60 + minutes
    : null;
}

function formaterHeure(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

function creerPlageHoraireApercu(calendarStartTime, calendarEndTime) {
  const startMinutes = minutesDepuisHeure(calendarStartTime);
  const endMinutes = minutesDepuisHeure(calendarEndTime, { finDeJour: true });

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    startMinutes % PAS_MINUTES !== 0 ||
    endMinutes % PAS_MINUTES !== 0 ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return { startMinutes, endMinutes };
}

function normaliserPlageHoraireApercu(plageHoraire = {}) {
  const source = plageHoraire && typeof plageHoraire === "object" ? plageHoraire : {};
  const plage = creerPlageHoraireApercu(
    source.calendar_start_time ?? PLAGE_HORAIRE_APERCU_PAR_DEFAUT.calendar_start_time,
    source.calendar_end_time ?? PLAGE_HORAIRE_APERCU_PAR_DEFAUT.calendar_end_time
  );

  return (
    plage ||
    creerPlageHoraireApercu(
      PLAGE_HORAIRE_APERCU_PAR_DEFAUT.calendar_start_time,
      PLAGE_HORAIRE_APERCU_PAR_DEFAUT.calendar_end_time
    )
  );
}

function jourSemaine(dateIso) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return (date.getUTCDay() + 6) % 7;
}

function intervalleCouvreCreneau(element, debut, fin) {
  const debutElement = minutesDepuisHeure(element?.heure_debut);
  const finElement = minutesDepuisHeure(element?.heure_fin, { finDeJour: true });
  return Number.isFinite(debutElement) && Number.isFinite(finElement)
    ? debutElement <= debut && finElement >= fin
    : false;
}

function intervalleChevaucheCreneau(element, debut, fin) {
  const debutElement = minutesDepuisHeure(element?.heure_debut);
  const finElement = minutesDepuisHeure(element?.heure_fin, { finDeJour: true });

  if (!Number.isFinite(debutElement) || !Number.isFinite(finElement)) {
    return Boolean(element?.jour_complet);
  }

  return debutElement < fin && finElement > debut;
}

function regleSApplique(regle, dateIso) {
  if (Number(regle?.actif) !== 1) {
    return false;
  }

  if (regle?.type === "ponctuelle") {
    return String(regle?.date || "") === dateIso;
  }

  return (
    regle?.type === "recurrente" &&
    Number(regle?.jour_semaine) === jourSemaine(dateIso)
  );
}

function estDisponiblePourCreneau({
  intervenantId,
  dateIso,
  debut,
  fin,
  regles,
  exceptions,
  seances,
  indisponibilites,
}) {
  const id = normaliserIdentifiant(intervenantId);
  if (!id) {
    return false;
  }

  const positif = (regles || []).some(
    (regle) =>
      Number(regle?.intervenant_id) === id &&
      regleSApplique(regle, dateIso) &&
      intervalleCouvreCreneau(regle, debut, fin)
  );
  const ouvertureExceptionnelle = (exceptions || []).some(
    (exception) =>
      Number(exception?.intervenant_id) === id &&
      String(exception?.date || "") === dateIso &&
      String(exception?.type || "").toLowerCase() === "disponible" &&
      intervalleCouvreCreneau(exception, debut, fin)
  );

  if (!positif && !ouvertureExceptionnelle) {
    return false;
  }

  const fermetureExceptionnelle = (exceptions || []).some(
    (exception) =>
      Number(exception?.intervenant_id) === id &&
      String(exception?.date || "") === dateIso &&
      String(exception?.type || "").toLowerCase() === "indisponible" &&
      intervalleChevaucheCreneau(exception, debut, fin)
  );
  if (fermetureExceptionnelle) {
    return false;
  }

  const seanceExistante = (seances || []).some(
    (seance) =>
      Number(seance?.intervenant_id) === id &&
      String(seance?.date || "") === dateIso &&
      String(seance?.statut_seance || "").toLowerCase() !== "annulee" &&
      intervalleChevaucheCreneau(seance, debut, fin)
  );
  if (seanceExistante) {
    return false;
  }

  return !(indisponibilites || []).some((indisponibilite) => {
    const cible = normaliserIdentifiant(indisponibilite?.intervenant_id);
    return (
      String(indisponibilite?.date || "") === dateIso &&
      (!cible || cible === id) &&
      intervalleChevaucheCreneau(indisponibilite, debut, fin)
    );
  });
}

function creerElement(tag, className, texte = "") {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (texte) {
    element.textContent = texte;
  }
  return element;
}

function libelleIntervenant(intervenant, utilisateurCourantId) {
  const identifiant = String(intervenant?.public_id || "").trim();
  const nom = String(intervenant?.nom || "").trim();
  const estMoi = Number(intervenant?.id) === Number(utilisateurCourantId);
  const base = identifiant || nom || "Intervenant";
  return estMoi ? `${base} (moi)` : base;
}

/**
 * Renders an informational, 30-minute availability map from already-scoped
 * API data. It never decides authorization or booking availability: the
 * server remains authoritative for mutations and the public calendar.
 */
export function afficherApercuDisponibilites(
  element,
  {
    dateIso,
    plageHoraire = {},
    calendar_start_time,
    calendar_end_time,
    afficherEquipe = false,
    utilisateurCourantId = null,
    intervenants = [],
    regles = [],
    exceptions = [],
    seances = [],
    indisponibilites = [],
  } = {}
) {
  if (!element) {
    return;
  }

  const plageNormalisee = normaliserPlageHoraireApercu({
    ...(plageHoraire && typeof plageHoraire === "object" ? plageHoraire : {}),
    calendar_start_time:
      calendar_start_time ?? plageHoraire?.calendar_start_time,
    calendar_end_time: calendar_end_time ?? plageHoraire?.calendar_end_time,
  });

  element.replaceChildren();
  const participants = (Array.isArray(intervenants) ? intervenants : [])
    .filter((intervenant) => normaliserIdentifiant(intervenant?.id))
    .filter(
      (intervenant) =>
        afficherEquipe || Number(intervenant.id) === Number(utilisateurCourantId)
    );

  element.classList.toggle("hidden", participants.length === 0 || !dateIso);
  if (participants.length === 0 || !dateIso) {
    return;
  }

  const entete = creerElement("div", "availability-overview-heading");
  entete.append(
    creerElement("h3", "availability-overview-title", "Disponibilités aujourd’hui"),
    creerElement(
      "p",
      "availability-overview-note",
      "Les pastilles indiquent les intervenants disponibles par créneau de 30 minutes."
    )
  );
  element.appendChild(entete);

  const legende = creerElement("div", "availability-overview-legend");
  participants.forEach((intervenant) => {
    const item = creerElement("span", "availability-overview-legend-item");
    const pastille = creerElement("span", "availability-overview-dot");
    pastille.style.setProperty(
      "--availability-color",
      couleurValide(intervenant?.couleur_calendrier)
        ? intervenant.couleur_calendrier
        : COULEUR_PAR_DEFAUT
    );
    item.append(pastille, document.createTextNode(libelleIntervenant(intervenant, utilisateurCourantId)));
    legende.appendChild(item);
  });
  element.appendChild(legende);

  const grille = creerElement("div", "availability-overview-grid");
  for (
    let debut = plageNormalisee.startMinutes;
    debut < plageNormalisee.endMinutes;
    debut += PAS_MINUTES
  ) {
    const fin = debut + PAS_MINUTES;
    const ligne = creerElement("div", "availability-overview-row");
    const heure = creerElement("time", "availability-overview-time", formaterHeure(debut));
    heure.dateTime = `${dateIso}T${formaterHeure(debut)}`;
    const pastilles = creerElement("div", "availability-overview-dots");
    let nombreDisponibles = 0;

    participants.forEach((intervenant) => {
      if (
        !estDisponiblePourCreneau({
          intervenantId: intervenant.id,
          dateIso,
          debut,
          fin,
          regles,
          exceptions,
          seances,
          indisponibilites,
        })
      ) {
        return;
      }

      nombreDisponibles += 1;
      const pastille = creerElement("span", "availability-overview-dot");
      pastille.style.setProperty(
        "--availability-color",
        couleurValide(intervenant?.couleur_calendrier)
          ? intervenant.couleur_calendrier
          : COULEUR_PAR_DEFAUT
      );
      pastille.title = libelleIntervenant(intervenant, utilisateurCourantId);
      pastille.setAttribute("aria-label", pastille.title);
      pastilles.appendChild(pastille);
    });

    if (nombreDisponibles === 0) {
      pastilles.appendChild(
        creerElement("span", "availability-overview-unavailable", "Indisponible")
      );
    }

    ligne.append(heure, pastilles);
    grille.appendChild(ligne);
  }
  element.appendChild(grille);
}

export const __test__ = {
  minutesDepuisHeure,
  normaliserPlageHoraireApercu,
  jourSemaine,
  intervalleCouvreCreneau,
  intervalleChevaucheCreneau,
  estDisponiblePourCreneau,
};
