const {
  listerReglesDisponibiliteIntervenant,
  trouverRegleDisponibiliteParIdIntervenant,
  creerRegleDisponibilite,
  modifierRegleDisponibilite,
  supprimerRegleDisponibilite,
  listerExceptionsDisponibiliteIntervenant,
  trouverExceptionDisponibiliteParIdIntervenant,
  creerExceptionDisponibilite,
  modifierExceptionDisponibilite,
  supprimerExceptionDisponibilite,
} = require("../models/disponibilite.model");
const {
  listerIntervenantsAutorisesHandler,
  scopePeutGererIntervenant,
} = require("../models/access-scope.model");
const { trouverUtilisateurParId } = require("../models/utilisateur.model");
const { creerEntreeHistorique } = require("../models/historique.model");
const {
  attribuerCouleursCalendrierProfesseurs,
} = require("../utils/professor-calendar-colors");

function creerErreurHttp(status, message, code = null) {
  const erreur = new Error(message);
  erreur.status = status;

  if (code) {
    erreur.code = code;
  }

  return erreur;
}

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extraireIdentifiantPortee(source = {}) {
  return {
    handlerId: normaliserIdentifiant(source.handler_id ?? source.handlerId),
    intervenantId: normaliserIdentifiant(
      source.intervenant_id ?? source.intervenantId ?? source.professeur_id ?? source.professeurId
    ),
  };
}

function lireErreurDisponibilite(erreur) {
  if (erreur?.status) {
    throw erreur;
  }

  const code = String(erreur?.code || "");
  if (
    code.startsWith("INVALID_") ||
    code === "RULE_OUT_OF_SCOPE" ||
    code === "CALENDAR_RANGE_VIOLATION"
  ) {
    throw creerErreurHttp(400, erreur.message || "Données de disponibilité invalides.", code);
  }

  throw erreur;
}

function serialiserDisponibilitePourClient(entree) {
  if (!entree) {
    return entree;
  }

  return {
    ...entree,
    // La convention publique est `00:00` pour la fin de journée ; `24:00`
    // reste uniquement une représentation SQLite interne.
    heure_fin: entree.heure_fin === "24:00" ? "00:00" : entree.heure_fin,
    disponibilite_heure_fin:
      entree.disponibilite_heure_fin === "24:00"
        ? "00:00"
        : entree.disponibilite_heure_fin,
  };
}

async function journaliserDisponibilite(req, portee, actionType, actionLabel, details) {
  await creerEntreeHistorique({
    handlerId: portee.handlerId,
    intervenantId: portee.intervenantId,
    seanceId: null,
    seanceLibelle: "Disponibilité",
    actionType,
    actionLabel,
    acteurId: req.utilisateur.id,
    acteurNom: req.utilisateur.nom,
    details,
  });
}

async function resoudrePorteeDisponibilite(req, source = {}) {
  const scope = req.scope || {};
  const utilisateurId = normaliserIdentifiant(scope.utilisateurId ?? req.utilisateur?.id);
  const demande = extraireIdentifiantPortee(source);

  if (!utilisateurId) {
    throw creerErreurHttp(403, "Aucun espace Handler actif n'est associé à ce compte.");
  }

  if (scope.estHandler) {
    const handlerId = utilisateurId;

    if (demande.handlerId && demande.handlerId !== handlerId) {
      throw creerErreurHttp(404, "Intervenant introuvable.");
    }

    const intervenantId = demande.intervenantId || utilisateurId;
    if (!(await scopePeutGererIntervenant(scope, { handlerId, intervenantId }))) {
      throw creerErreurHttp(404, "Intervenant introuvable.");
    }

    return { handlerId, intervenantId };
  }

  const handlerIds = Array.isArray(scope.handlerProfesseurIds)
    ? scope.handlerProfesseurIds.map(normaliserIdentifiant).filter(Boolean)
    : [];
  const handlerId = demande.handlerId || handlerIds[0] || null;

  if (!scope.estProfesseur || !handlerId || !handlerIds.includes(handlerId)) {
    throw creerErreurHttp(403, "Aucun espace Professeur actif n'est associé à ce compte.");
  }

  if (demande.intervenantId && demande.intervenantId !== utilisateurId) {
    throw creerErreurHttp(404, "Intervenant introuvable.");
  }

  if (!(await scopePeutGererIntervenant(scope, { handlerId, intervenantId: utilisateurId }))) {
    throw creerErreurHttp(404, "Intervenant introuvable.");
  }

  return { handlerId, intervenantId: utilisateurId };
}

async function listerPorteesDisponibilite(req, source = {}) {
  const scope = req.scope || {};
  const demande = extraireIdentifiantPortee(source);

  if (!scope.estHandler || demande.intervenantId) {
    return [await resoudrePorteeDisponibilite(req, source)];
  }

  const handlerId = normaliserIdentifiant(scope.utilisateurId);
  if (!handlerId || (demande.handlerId && demande.handlerId !== handlerId)) {
    throw creerErreurHttp(404, "Intervenant introuvable.");
  }

  const intervenantIds = await listerIntervenantsAutorisesHandler(handlerId);
  return intervenantIds.map((intervenantId) => ({ handlerId, intervenantId }));
}

async function trouverRegleAccessible(req, id, source = {}) {
  const regleId = normaliserIdentifiant(id);
  if (!regleId) {
    throw creerErreurHttp(400, "Identifiant de règle de disponibilité invalide.");
  }

  const portees = await listerPorteesDisponibilite(req, source);
  for (const portee of portees) {
    const regle = await trouverRegleDisponibiliteParIdIntervenant(
      regleId,
      portee.handlerId,
      portee.intervenantId
    );

    if (regle) {
      return { regle, portee };
    }
  }

  throw creerErreurHttp(404, "Règle de disponibilité introuvable.");
}

async function trouverExceptionAccessible(req, id, source = {}) {
  const exceptionId = normaliserIdentifiant(id);
  if (!exceptionId) {
    throw creerErreurHttp(400, "Identifiant d'exception de disponibilité invalide.");
  }

  const portees = await listerPorteesDisponibilite(req, source);
  for (const portee of portees) {
    const exception = await trouverExceptionDisponibiliteParIdIntervenant(
      exceptionId,
      portee.handlerId,
      portee.intervenantId
    );

    if (exception) {
      return { exception, portee };
    }
  }

  throw creerErreurHttp(404, "Exception de disponibilité introuvable.");
}

async function listerIntervenantsDisponibilite(req, portees) {
  const ids = Array.from(new Set(portees.map((portee) => portee.intervenantId)));
  const utilisateurs = await Promise.all(ids.map((id) => trouverUtilisateurParId(id)));
  const intervenants = utilisateurs.filter(Boolean);
  const couleurs = attribuerCouleursCalendrierProfesseurs(intervenants);

  return intervenants.map((utilisateur) => ({
    id: utilisateur.id,
    public_id: utilisateur.public_id || null,
    nom: utilisateur.nom,
    couleur_calendrier:
      couleurs.get(Number(utilisateur.id)) || utilisateur.couleur_calendrier || null,
  }));
}

async function recupererDisponibilites(req, res) {
  try {
    const portees = await listerPorteesDisponibilite(req, req.query);
    const [reglesParPortee, exceptionsParPortee, intervenants] = await Promise.all([
      Promise.all(
        portees.map((portee) =>
          listerReglesDisponibiliteIntervenant(portee.handlerId, portee.intervenantId, req.query)
        )
      ),
      Promise.all(
        portees.map((portee) =>
          listerExceptionsDisponibiliteIntervenant(
            portee.handlerId,
            portee.intervenantId,
            req.query
          )
        )
      ),
      listerIntervenantsDisponibilite(req, portees),
    ]);

    return res.json({
      regles: reglesParPortee.flat().map(serialiserDisponibilitePourClient),
      exceptions: exceptionsParPortee.flat().map(serialiserDisponibilitePourClient),
      intervenants,
    });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function recupererReglesDisponibilite(req, res) {
  try {
    const portees = await listerPorteesDisponibilite(req, req.query);
    const regles = (
      await Promise.all(
        portees.map((portee) =>
          listerReglesDisponibiliteIntervenant(portee.handlerId, portee.intervenantId, req.query)
        )
      )
    ).flat();

    return res.json({ regles: regles.map(serialiserDisponibilitePourClient) });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function recupererExceptionsDisponibilite(req, res) {
  try {
    const portees = await listerPorteesDisponibilite(req, req.query);
    const exceptions = (
      await Promise.all(
        portees.map((portee) =>
          listerExceptionsDisponibiliteIntervenant(
            portee.handlerId,
            portee.intervenantId,
            req.query
          )
        )
      )
    ).flat();

    return res.json({ exceptions: exceptions.map(serialiserDisponibilitePourClient) });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function ajouterRegleDisponibilite(req, res) {
  try {
    const portee = await resoudrePorteeDisponibilite(req, req.body);
    const regle = await creerRegleDisponibilite({
      ...req.body,
      ...portee,
      creePar: req.utilisateur.id,
    });
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_regle_creee",
      "Création d'une règle de disponibilité",
      { regle }
    );
    res.locals.realtimeScope = portee;

    return res.status(201).json({
      message: "Règle de disponibilité ajoutée.",
      regle: serialiserDisponibilitePourClient(regle),
    });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function modifierRegleDisponibiliteController(req, res) {
  try {
    const { regle, portee } = await trouverRegleAccessible(req, req.params.id, req.body);
    const demande = extraireIdentifiantPortee(req.body);

    if (
      (demande.handlerId && demande.handlerId !== portee.handlerId) ||
      (demande.intervenantId && demande.intervenantId !== portee.intervenantId)
    ) {
      throw creerErreurHttp(404, "Règle de disponibilité introuvable.");
    }

    const regleMiseAJour = await modifierRegleDisponibilite(regle.id, {
      ...req.body,
      ...portee,
    });
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_regle_modifiee",
      "Modification d'une règle de disponibilité",
      { avant: regle, apres: regleMiseAJour }
    );
    res.locals.realtimeScope = portee;

    return res.json({
      message: "Règle de disponibilité modifiée.",
      regle: serialiserDisponibilitePourClient(regleMiseAJour),
    });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function supprimerRegleDisponibiliteController(req, res) {
  try {
    const { regle, portee } = await trouverRegleAccessible(req, req.params.id, req.query);
    await supprimerRegleDisponibilite(regle.id, portee);
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_regle_supprimee",
      "Suppression d'une règle de disponibilité",
      { regle }
    );
    res.locals.realtimeScope = portee;

    return res.json({ message: "Règle de disponibilité supprimée." });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function ajouterExceptionDisponibilite(req, res) {
  try {
    const portee = await resoudrePorteeDisponibilite(req, req.body);
    const exception = await creerExceptionDisponibilite({
      ...req.body,
      ...portee,
      creePar: req.utilisateur.id,
    });
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_exception_creee",
      "Création d'une exception de disponibilité",
      { exception }
    );
    res.locals.realtimeScope = portee;

    return res.status(201).json({
      message: "Exception de disponibilité ajoutée.",
      exception: serialiserDisponibilitePourClient(exception),
    });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function modifierExceptionDisponibiliteController(req, res) {
  try {
    const { exception, portee } = await trouverExceptionAccessible(req, req.params.id, req.body);
    const demande = extraireIdentifiantPortee(req.body);

    if (
      (demande.handlerId && demande.handlerId !== portee.handlerId) ||
      (demande.intervenantId && demande.intervenantId !== portee.intervenantId)
    ) {
      throw creerErreurHttp(404, "Exception de disponibilité introuvable.");
    }

    const exceptionMiseAJour = await modifierExceptionDisponibilite(exception.id, {
      ...req.body,
      ...portee,
    });
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_exception_modifiee",
      "Modification d'une exception de disponibilité",
      { avant: exception, apres: exceptionMiseAJour }
    );
    res.locals.realtimeScope = portee;

    return res.json({
      message: "Exception de disponibilité modifiée.",
      exception: serialiserDisponibilitePourClient(exceptionMiseAJour),
    });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

async function supprimerExceptionDisponibiliteController(req, res) {
  try {
    const { exception, portee } = await trouverExceptionAccessible(req, req.params.id, req.query);
    await supprimerExceptionDisponibilite(exception.id, portee);
    await journaliserDisponibilite(
      req,
      portee,
      "disponibilite_exception_supprimee",
      "Suppression d'une exception de disponibilité",
      { exception }
    );
    res.locals.realtimeScope = portee;

    return res.json({ message: "Exception de disponibilité supprimée." });
  } catch (erreur) {
    return lireErreurDisponibilite(erreur);
  }
}

module.exports = {
  recupererDisponibilites,
  recupererReglesDisponibilite,
  recupererExceptionsDisponibilite,
  ajouterRegleDisponibilite,
  modifierRegleDisponibiliteController,
  supprimerRegleDisponibiliteController,
  ajouterExceptionDisponibilite,
  modifierExceptionDisponibiliteController,
  supprimerExceptionDisponibiliteController,
  resoudrePorteeDisponibilite,
  listerPorteesDisponibilite,
};
