const {
  listerSeancesScopees,
  listerToutesLesSeances,
} = require("../models/seance.model");
const {
  construireFiltreLectureSeances,
  scopePeutGererIntervenant,
} = require("../models/access-scope.model");
const { convertirInstantEnDateHeureZonnee } = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");

function obtenirDateAujourdhui() {
  return convertirInstantEnDateHeureZonnee(new Date(), CENTRAL_CALENDAR_TIMEZONE).date;
}

function creerErreurHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function lireDateIso(valeur) {
  const texte = String(valeur || "").trim();

  if (!texte) {
    return { valeur: null, invalide: false };
  }

  const date = new Date(`${texte}T12:00:00`);
  return {
    valeur: /^\d{4}-\d{2}-\d{2}$/.test(texte) && !Number.isNaN(date.getTime()) ? texte : null,
    invalide: !/^\d{4}-\d{2}-\d{2}$/.test(texte) || Number.isNaN(date.getTime()),
  };
}

// `globale=1` demande toutes les dates que le compte courant peut déjà lire.
// Cela ne donne jamais accès au périmètre cross-Handler SuperAdmin, qui reste
// réservé à sa route d'administration explicite.
function lirePeriodeGlobale(valeur) {
  const texte = String(valeur ?? "").trim();

  if (!texte || texte === "0") {
    return { valeur: false, invalide: false };
  }

  if (texte === "1") {
    return { valeur: true, invalide: false };
  }

  return { valeur: false, invalide: true };
}

function premierJourDuMois(date = new Date()) {
  return `${date.toISOString().slice(0, 7)}-01`;
}

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function libelleIntervenant(seance) {
  const publicId = String(seance?.intervenant_public_id || "").trim();
  const nom = String(seance?.intervenant_nom || "").trim();
  return publicId && nom ? `${publicId} — ${nom}` : publicId || nom || "Intervenant à réconcilier";
}

function initialiserCompteurs() {
  return {
    total_seances: 0,
    seances_faites: 0,
    seances_planifiees: 0,
    seances_payantes: 0,
    seances_gratuites: 0,
    // Une séance reportée n'est pas une séance réalisée. Elle est regroupée
    // avec les annulations dans l'indicateur métier "non faite", au lieu de
    // disparaître du bilan quand la colonne Reportée est retirée de l'UI.
    seances_non_faites: 0,
    duree_minutes: 0,
    matieres: {},
  };
}

function ajouterSeanceAuxCompteurs(compteurs, seance) {
  compteurs.total_seances += 1;
  const statut = String(seance?.statut_seance || "planifiee").toLowerCase();
  const duree = Number(seance?.duree_minutes) || 0;
  const matiere = String(seance?.matiere || "Sans matière").trim() || "Sans matière";

  compteurs.duree_minutes += Math.max(duree, 0);
  compteurs.matieres[matiere] = (compteurs.matieres[matiere] || 0) + 1;

  if (statut === "faite") {
    compteurs.seances_faites += 1;
    if (Number(seance?.est_essai) === 1 || seance?.est_essai === true) {
      compteurs.seances_gratuites += 1;
    } else {
      compteurs.seances_payantes += 1;
    }
  } else if (statut === "reportee" || statut === "annulee") {
    compteurs.seances_non_faites += 1;
  } else {
    compteurs.seances_planifiees += 1;
  }
}

function serialiserCompteurs(compteurs) {
  return {
    ...compteurs,
    heures_totales: Number((compteurs.duree_minutes / 60).toFixed(2)),
    matieres: Object.entries(compteurs.matieres)
      .map(([matiere, seances]) => ({ matiere, seances }))
      .sort((premiere, seconde) => seconde.seances - premiere.seances || premiere.matiere.localeCompare(seconde.matiere)),
  };
}

async function resoudreScopeStatistiques(req) {
  const scopeLecture = construireFiltreLectureSeances(req.scope);
  const intervenantId = normaliserIdentifiant(
    req.query?.intervenant_id ?? req.query?.professeur_id
  );

  if (!intervenantId) {
    return scopeLecture;
  }

  if (req.scope?.estHandler) {
    const handlerId = normaliserIdentifiant(req.scope.utilisateurId);
    if (intervenantId === handlerId) {
      return { handlerIds: req.scope.handlerIds, intervenantId };
    }
    const autorise = await scopePeutGererIntervenant(req.scope, { handlerId, intervenantId });

    if (!autorise) {
      throw creerErreurHttp(404, "Intervenant introuvable.");
    }

    return { handlerIds: [handlerId], intervenantId };
  }

  if (Number(req.scope?.utilisateurId) !== intervenantId) {
    throw creerErreurHttp(404, "Intervenant introuvable.");
  }

  return scopeLecture;
}

function verifierContexteAnalyseGlobaleSuperAdmin(req) {
  if (
    req.scope?.estSuperAdmin !== true ||
    req.scope?.modeAnalyseGlobaleSuperAdmin !== true
  ) {
    throw creerErreurHttp(403, "Une analyse globale SuperAdmin est requise.");
  }
}

function lireFiltreIntervenantAnalyseGlobale(req) {
  const valeur = req.query?.intervenant_id ?? req.query?.professeur_id;

  if (valeur === undefined || valeur === null || String(valeur).trim() === "") {
    return null;
  }

  const intervenantId = normaliserIdentifiant(valeur);

  if (!intervenantId) {
    throw creerErreurHttp(400, "L'identifiant d'intervenant est invalide.");
  }

  return intervenantId;
}

function construireReponseStatistiques(
  seances,
  { du, au, intervenantId = null, globale = false, periodeGlobale = false }
) {
  const global = initialiserCompteurs();
  const parIntervenant = new Map();
  const parEquipe = new Map();

  for (const seance of seances) {
    ajouterSeanceAuxCompteurs(global, seance);
    const handlerId = normaliserIdentifiant(seance.handler_id) || 0;
    const equipe = parEquipe.get(handlerId) || {
      handler_id: handlerId || null,
      handler_public_id: seance.handler_public_id || null,
      handler_nom: seance.handler_nom || null,
      compteurs: initialiserCompteurs(),
    };
    ajouterSeanceAuxCompteurs(equipe.compteurs, seance);
    parEquipe.set(handlerId, equipe);
    const id = normaliserIdentifiant(seance.intervenant_id) || 0;
    const ligne = parIntervenant.get(id) || {
      intervenant_id: id || null,
      intervenant_public_id: seance.intervenant_public_id || null,
      intervenant_nom: seance.intervenant_nom || null,
      libelle: libelleIntervenant(seance),
      compteurs: initialiserCompteurs(),
    };
    ajouterSeanceAuxCompteurs(ligne.compteurs, seance);
    parIntervenant.set(id, ligne);
  }

  const intervenants = Array.from(parIntervenant.values())
    .map((ligne) => ({
      intervenant_id: ligne.intervenant_id,
      intervenant_public_id: ligne.intervenant_public_id,
      intervenant_nom: ligne.intervenant_nom,
      libelle: ligne.libelle,
      ...serialiserCompteurs(ligne.compteurs),
    }))
    .sort((premier, second) => premier.libelle.localeCompare(second.libelle));

  const reponse = {
    periode: periodeGlobale ? { du: null, au: null, globale: true } : { du, au },
    statistiques: {
      ...serialiserCompteurs(global),
      professeurs_actifs: intervenants.length,
      intervenants,
      equipes: Array.from(parEquipe.values()).map((equipe) => ({
        handler_id: equipe.handler_id,
        handler_public_id: equipe.handler_public_id,
        handler_nom: equipe.handler_nom,
        ...serialiserCompteurs(equipe.compteurs),
      })).sort((a, b) => String(a.handler_nom || a.handler_public_id || "")
        .localeCompare(String(b.handler_nom || b.handler_public_id || ""), "fr")),
    },
  };

  if (globale) {
    reponse.portee = {
      type: "super_admin_globale",
      intervenant_id: intervenantId,
    };
  }

  return reponse;
}

async function recupererStatistiquesPourPortee(req, res, { globaleSuperAdmin = false } = {}) {
  const filtreDu = lireDateIso(req.query?.du);
  const filtreAu = lireDateIso(req.query?.au);

  if (filtreDu.invalide || filtreAu.invalide) {
    return res.status(400).json({ message: "Les dates Du et Au doivent etre au format YYYY-MM-DD." });
  }

  const au = filtreAu.valeur || obtenirDateAujourdhui();
  const du = filtreDu.valeur || premierJourDuMois();
  const aujourdHui = obtenirDateAujourdhui();

  if (au > aujourdHui) {
    return res.status(400).json({ message: "La date Au ne peut pas etre future." });
  }

  if (du > au) {
    return res.status(400).json({ message: "La date Du doit etre anterieure ou egale a la date Au." });
  }

  const intervenantId = globaleSuperAdmin
    ? lireFiltreIntervenantAnalyseGlobale(req)
    : null;
  const scope = globaleSuperAdmin ? null : await resoudreScopeStatistiques(req);
  const seancesBrutes = globaleSuperAdmin
    ? await listerToutesLesSeances()
    : await listerSeancesScopees(scope);
  const seances = seancesBrutes.filter((seance) => {
    const date = String(seance?.date || "");
    return (
      date >= du &&
      date <= au &&
      (!intervenantId || Number(seance?.intervenant_id) === intervenantId)
    );
  });

  return res.json(
    construireReponseStatistiques(seances, {
      du,
      au,
      intervenantId,
      globale: globaleSuperAdmin,
    })
  );
}

async function recupererStatistiques(req, res, next) {
  try {
    const periodeGlobale = lirePeriodeGlobale(req.query?.globale);
    const filtreDu = lireDateIso(req.query?.du);
    const filtreAu = lireDateIso(req.query?.au);

    if (periodeGlobale.invalide) {
      return res.status(400).json({
        message: "Le paramètre globale doit être égal à 1.",
      });
    }

    if (filtreDu.invalide || filtreAu.invalide) {
      return res.status(400).json({ message: "Les dates Du et Au doivent être au format YYYY-MM-DD." });
    }

    const bornesDateDemandees = req.query?.du !== undefined || req.query?.au !== undefined;

    if (periodeGlobale.valeur && bornesDateDemandees) {
      return res.status(400).json({
        message: "Les dates Du et Au ne peuvent pas être utilisées avec une période globale.",
      });
    }

    const au = periodeGlobale.valeur
      ? null
      : filtreAu.valeur || obtenirDateAujourdhui();
    const du = periodeGlobale.valeur ? null : filtreDu.valeur || premierJourDuMois();
    const aujourdHui = obtenirDateAujourdhui();

    if (!periodeGlobale.valeur && au > aujourdHui) {
      return res.status(400).json({ message: "La date Au ne peut pas être future." });
    }

    if (!periodeGlobale.valeur && du > au) {
      return res.status(400).json({ message: "La date Du doit être antérieure ou égale à la date Au." });
    }

    const scope = await resoudreScopeStatistiques(req);
    const seancesBrutes = await listerSeancesScopees(scope);
    const seances = periodeGlobale.valeur
      ? seancesBrutes
      : seancesBrutes.filter((seance) => {
          const date = String(seance?.date || "");
          return date >= du && date <= au;
        });
    return res.json(
      construireReponseStatistiques(seances, {
        du,
        au,
        periodeGlobale: periodeGlobale.valeur,
      })
    );
  } catch (error) {
    return next(error);
  }
}

async function recupererStatistiquesGlobalesAdministration(req, res, next) {
  try {
    verifierContexteAnalyseGlobaleSuperAdmin(req);
    return await recupererStatistiquesPourPortee(req, res, {
      globaleSuperAdmin: true,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  recupererStatistiques,
  recupererStatistiquesGlobalesAdministration,
};
