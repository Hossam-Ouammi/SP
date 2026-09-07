const {
  trouverReglagesEspace,
  mettreAJourReglagesCalendrier,
  mettreAJourReglagesCalendrierPublic,
  listerAvertissementsPlageCalendrierFuture,
  regenererJetonCalendrierPublic,
} = require("../models/workspace-settings.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const { executerTransactionImmediate } = require("../models/db");
const {
  normaliserPlageCalendrier,
  normaliserPlageDepuisReglages,
} = require("../utils/calendar-hours");
const { convertirInstantEnDateHeureZonnee } = require("../utils/timezone");
const {
  obtenirDefinitionFuseauCalendrierPublic,
  validerOffsetCalendrierPublic,
} = require("../utils/public-calendar-timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");
const { fermerFluxTempsReelPublicHandler } = require("../utils/realtime");

function creerErreurHttp(status, message) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserFuseauCalendrierPublic(valeur) {
  const fuseau = validerOffsetCalendrierPublic(valeur);
  if (!fuseau) {
    throw creerErreurHttp(
      400,
      "Le décalage du calendrier public doit être GMT, GMT+1 ou GMT+2."
    );
  }

  return fuseau;
}

function normaliserBooleen(valeur, libelle) {
  if (typeof valeur === "boolean") {
    return valeur;
  }

  if ([1, "1", "true", "on"].includes(valeur)) {
    return true;
  }

  if ([0, "0", "false", "off"].includes(valeur)) {
    return false;
  }

  throw creerErreurHttp(400, `${libelle} invalide.`);
}

function handlerIdHistorique(req) {
  const utilisateurId = normaliserIdentifiant(req.utilisateur?.id);
  if (req.scope?.estHandler && utilisateurId) {
    return utilisateurId;
  }

  return Array.isArray(req.scope?.handlerProfesseurIds)
    ? normaliserIdentifiant(req.scope.handlerProfesseurIds[0])
    : null;
}

function resoudreContexteCalendrier(req) {
  const utilisateurId = normaliserIdentifiant(req.utilisateur?.id);
  if (!utilisateurId) {
    throw creerErreurHttp(401, "Utilisateur introuvable.");
  }

  if (req.scope?.estHandler) {
    return { handlerId: utilisateurId, modifiable: true };
  }

  const handlerIds = Array.isArray(req.scope?.handlerProfesseurIds)
    ? req.scope.handlerProfesseurIds.map(normaliserIdentifiant).filter(Boolean)
    : [];

  if (req.scope?.estProfesseur && handlerIds.length > 0) {
    // Les autres APIs de l'espace Professeur utilisent déjà le premier
    // rattachement actif lorsqu'aucun espace n'est sélectionné dans la
    // session. Le client ne peut jamais injecter un handler_id ici.
    return { handlerId: handlerIds[0], modifiable: false };
  }

  throw creerErreurHttp(403, "Aucun espace Handler actif n'est associé à ce compte.");
}

function serialiserReglages(reglages, options = {}) {
  if (!reglages) {
    return null;
  }

  const possedeJeton = Boolean(String(reglages.token_calendrier_public_hash || "").trim());
  const plage = normaliserPlageDepuisReglages(reglages);
  const fuseauPublic = obtenirDefinitionFuseauCalendrierPublic(
    reglages.public_calendar_timezone
  );
  return {
    calendrier: {
      // Référence commune, non modifiable : les horaires métiers restent des
      // heures centrales pour le Handler et ses Professeurs.
      reference_timezone: CENTRAL_CALENDAR_TIMEZONE,
      calendar_start_time: plage.calendar_start_time,
      calendar_end_time: plage.calendar_end_time,
      slot_min_time: plage.slot_min_time,
      slot_max_time: plage.slot_max_time,
      slot_duration_minutes: plage.slot_duration_minutes,
      modifiable: options.modifiable === true,
    },
    calendrier_public: {
      actif: Number(reglages.calendrier_public_actif) === 1,
      jeton_configure: possedeJeton,
      lien_public: options.lienPublic || null,
      public_calendar_timezone: fuseauPublic.identifiant,
      public_calendar_offset_minutes: fuseauPublic.offsetMinutes,
      public_calendar_offset_label: fuseauPublic.libelle,
      offset_type: fuseauPublic.type,
    },
  };
}

function normaliserConfirmation(valeur) {
  return valeur === true || valeur === 1 || valeur === "1" || valeur === "true";
}

function normaliserReglagesCalendrier(donnees = {}) {
  if (
    Object.prototype.hasOwnProperty.call(donnees, "timezone") ||
    Object.prototype.hasOwnProperty.call(donnees, "public_calendar_timezone")
  ) {
    throw creerErreurHttp(
      400,
      "Le fuseau se règle séparément dans le calendrier public ; les heures centrales ne sont pas converties."
    );
  }

  const debut = donnees.calendar_start_time;
  const fin = donnees.calendar_end_time;

  if (debut === undefined || debut === null || String(debut).trim() === "") {
    throw creerErreurHttp(400, "Le début de journée est obligatoire.");
  }

  if (fin === undefined || fin === null || String(fin).trim() === "") {
    throw creerErreurHttp(400, "La fin de journée est obligatoire.");
  }

  try {
    return {
      ...normaliserPlageCalendrier({
        calendar_start_time: debut,
        calendar_end_time: fin,
      }),
    };
  } catch (erreur) {
    throw creerErreurHttp(400, erreur.message || "La plage du calendrier est invalide.");
  }
}

function referenceCalendrier() {
  const locale = convertirInstantEnDateHeureZonnee(new Date(), CENTRAL_CALENDAR_TIMEZONE);

  return {
    date: locale?.date || new Date().toISOString().slice(0, 10),
    heure: locale?.heure || new Date().toISOString().slice(11, 16),
  };
}

function changementPlageCalendrier(avant, apres) {
  return (
    String(avant?.calendar_start_time || "") !== String(apres?.calendar_start_time || "") ||
    String(avant?.calendar_end_time || "") !== String(apres?.calendar_end_time || "")
  );
}

async function journaliserReglage(req, { actionType, actionLabel, details }) {
  await creerEntreeHistorique({
    handlerId: handlerIdHistorique(req),
    intervenantId: normaliserIdentifiant(req.utilisateur?.id),
    seanceId: null,
    seanceLibelle: "Réglages de l'espace",
    actionType,
    actionLabel,
    acteurId: req.utilisateur?.id || null,
    acteurNom: req.utilisateur?.nom || "Utilisateur",
    details,
  });
}

function verifierHandler(req) {
  if (!req.scope?.estHandler) {
    throw creerErreurHttp(
      403,
      "Cette action est réservée au Handler propriétaire de l'espace."
    );
  }

  const id = normaliserIdentifiant(req.utilisateur?.id);
  if (!id) {
    throw creerErreurHttp(401, "Utilisateur introuvable.");
  }

  return id;
}

async function recupererReglagesEspace(req, res, next) {
  try {
    const contexte = resoudreContexteCalendrier(req);
    const reglages = await trouverReglagesEspace(contexte.handlerId);
    if (!reglages) {
      throw creerErreurHttp(404, "Réglages introuvables.");
    }

    const reglagesSerialises = serialiserReglages(reglages, {
      modifiable: contexte.modifiable,
    });
    return res.json({
      reglages: {
        ...reglagesSerialises,
        calendrier_public: {
          ...reglagesSerialises.calendrier_public,
          disponible: contexte.modifiable,
        },
      },
    });
  } catch (erreur) {
    return next(erreur);
  }
}

async function modifierFuseauHoraireEspace(req, res, next) {
  try {
    verifierHandler(req);
    throw creerErreurHttp(
      410,
      "Le décalage du calendrier public se règle désormais dans Calendrier → Calendrier public."
    );
  } catch (erreur) {
    return next(erreur);
  }
}

async function modifierReglagesCalendrierEspace(req, res, next) {
  try {
    const handlerId = verifierHandler(req);
    const demande = normaliserReglagesCalendrier(req.body || {});
    const confirmerHorsPlage = normaliserConfirmation(req.body?.confirm_out_of_range);
    const resultat = await executerTransactionImmediate(async () => {
      const avant = await trouverReglagesEspace(handlerId);
      if (!avant) {
        throw creerErreurHttp(404, "Réglages introuvables.");
      }

      const plageAvant = normaliserPlageDepuisReglages(avant);
      const plageChange = changementPlageCalendrier(plageAvant, demande);
      const reference = referenceCalendrier();
      const avertissement = plageChange
        ? await listerAvertissementsPlageCalendrierFuture({
            handlerId,
            plageCalendrierAvant: plageAvant,
            plageCalendrier: demande,
            dateReference: reference.date,
            heureReference: reference.heure,
          })
        : null;

      if (avertissement?.total > 0 && !confirmerHorsPlage) {
        return { avant, avertissement, bloque: true };
      }

      const reglages = await mettreAJourReglagesCalendrier(handlerId, {
        calendarStartTime: demande.calendar_start_time,
        calendarEndTime: demande.calendar_end_time,
      });

      await journaliserReglage(req, {
        actionType: "reglages_calendrier_modifies",
        actionLabel: "Modification des paramètres du calendrier",
        details: {
          avant: {
            calendar_start_time: plageAvant.calendar_start_time,
            calendar_end_time: plageAvant.calendar_end_time,
          },
          apres: {
            calendar_start_time: demande.calendar_start_time,
            calendar_end_time: demande.calendar_end_time,
          },
          avertissement: avertissement?.total > 0 ? avertissement : null,
        },
      });

      return { reglages, avertissement, bloque: false };
    });

    if (resultat.bloque) {
      return res.status(409).json({
        code: "CALENDAR_RANGE_DATA_WARNING",
        message:
          "Des éléments futurs seraient hors de cette plage. Ils ne seront ni supprimés ni modifiés : confirmez explicitement pour enregistrer le réglage.",
        avertissement: resultat.avertissement,
      });
    }

    res.locals.realtimeScope = { handlerId };
    return res.json({
      message: "Paramètres du calendrier mis à jour.",
      reglages: serialiserReglages(resultat.reglages, { modifiable: true }),
      avertissement: resultat.avertissement,
    });
  } catch (erreur) {
    return next(erreur);
  }
}

async function modifierReglagesCalendrierPublic(req, res, next) {
  try {
    const handlerId = verifierHandler(req);
    const contientEtat = Object.prototype.hasOwnProperty.call(req.body || {}, "actif");
    const contientFuseau = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "public_calendar_timezone"
    );

    if (!contientEtat && !contientFuseau) {
      throw creerErreurHttp(
        400,
        "Indiquez l'état du calendrier public ou son décalage d'affichage."
      );
    }

    const actif = contientEtat
      ? normaliserBooleen(req.body?.actif, "État du calendrier public")
      : undefined;
    const fuseauPublic = contientFuseau
      ? normaliserFuseauCalendrierPublic(req.body?.public_calendar_timezone)
      : undefined;
    const avant = await trouverReglagesEspace(handlerId);
    if (!avant) {
      throw creerErreurHttp(404, "Réglages introuvables.");
    }

    const reglages = await mettreAJourReglagesCalendrierPublic(handlerId, {
      actif,
      publicCalendarTimezone: fuseauPublic,
    });
    if (!reglages) {
      throw creerErreurHttp(404, "Réglages introuvables.");
    }

    if (
      fuseauPublic !== undefined &&
      String(avant.public_calendar_timezone || "") !== fuseauPublic
    ) {
      await journaliserReglage(req, {
        actionType: "fuseau_calendrier_public_modifie",
        actionLabel: "Modification du fuseau du calendrier public",
        details: { avant: avant.public_calendar_timezone || null, apres: fuseauPublic },
      });
    }

    if (
      actif !== undefined &&
      (Number(avant.calendrier_public_actif) === 1) !== actif
    ) {
      await journaliserReglage(req, {
        actionType: "calendrier_public_modifie",
        actionLabel: actif
          ? "Activation du calendrier public"
          : "Désactivation du calendrier public",
        details: {
          avant: Number(avant.calendrier_public_actif) === 1,
          apres: actif,
        },
      });
    }

    const fluxTempsReelFermes = actif === false
      ? fermerFluxTempsReelPublicHandler(handlerId, {
          reason: "public_calendar_disabled",
        })
      : 0;
    res.locals.realtimeScope = { handlerId };

    return res.json({
      message:
        actif !== undefined
          ? actif
            ? "Calendrier public activé."
            : "Calendrier public désactivé."
          : "Fuseau du calendrier public mis à jour.",
      reglages: serialiserReglages(reglages, { modifiable: true }),
      flux_temps_reel_fermes: fluxTempsReelFermes,
    });
  } catch (erreur) {
    return next(erreur);
  }
}

async function regenererLienCalendrierPublic(req, res, next) {
  try {
    const handlerId = verifierHandler(req);
    const resultat = await regenererJetonCalendrierPublic(handlerId);
    if (!resultat) {
      throw creerErreurHttp(404, "Réglages introuvables.");
    }

    const lienPublic = `/reservation/${encodeURIComponent(resultat.token)}`;
    const fluxTempsReelFermes = fermerFluxTempsReelPublicHandler(handlerId, {
      reason: "public_calendar_link_regenerated",
    });
    await journaliserReglage(req, {
      actionType: "lien_calendrier_public_regenere",
      actionLabel: "Régénération du lien de calendrier public",
      details: { calendrier_public_actif: true },
    });
    res.locals.realtimeScope = { handlerId };

    return res.status(201).json({
      message:
        "Nouveau lien public généré. L'ancien lien a été immédiatement révoqué.",
      reglages: serialiserReglages(resultat.reglages, {
        lienPublic,
        modifiable: true,
      }),
      flux_temps_reel_fermes: fluxTempsReelFermes,
    });
  } catch (erreur) {
    return next(erreur);
  }
}

module.exports = {
  recupererReglagesEspace,
  modifierFuseauHoraireEspace,
  modifierReglagesCalendrierEspace,
  modifierReglagesCalendrierPublic,
  regenererLienCalendrierPublic,
  serialiserReglages,
  normaliserFuseauCalendrierPublic,
  normaliserReglagesCalendrier,
  resoudreContexteCalendrier,
};
