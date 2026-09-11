const { all, get, run, executerTransactionImmediate } = require("./db");
const { listerValeursCatalogueParType } = require("./catalogue.model");
const { convertirInstantEnDateHeureZonnee } = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");

const TARIF_MINIMUM = 0;
const TARIF_MAXIMUM = 100000;
const BASELINE_EFFECTIVE_AT = "1970-01-01T00:00:00.000Z";

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function creerErreur(message, status = 400) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

function normaliserLibelleMatiere(valeur) {
  const libelle = String(valeur || "")
    .replace(/\s+/g, " ")
    .trim();

  if (libelle.length < 2 || libelle.length > 80) {
    throw creerErreur("Le nom de la matière doit contenir entre 2 et 80 caractères.");
  }

  return libelle;
}

function normaliserCleMatiere(valeur) {
  return String(valeur || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function normaliserTarifHoraire(valeur, { autoriserVide = true } = {}) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === "") {
    if (autoriserVide) {
      return null;
    }
    throw creerErreur("Le tarif horaire est obligatoire.");
  }

  const tarif = Number(valeur);
  if (!Number.isInteger(tarif) || tarif < TARIF_MINIMUM || tarif > TARIF_MAXIMUM) {
    throw creerErreur(`Le tarif horaire doit être un entier entre ${TARIF_MINIMUM} et ${TARIF_MAXIMUM} dh.`);
  }

  return tarif;
}

async function handlerExiste(handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler) {
    return false;
  }

  const ligne = await get(
    `
      SELECT 1
      FROM utilisateur_roles
      WHERE utilisateur_id = ? AND role = 'handler'
      LIMIT 1
    `,
    [handler]
  );
  return Boolean(ligne);
}

async function assurerMatieresHandlerParDefaut(handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler || !(await handlerExiste(handler))) {
    return;
  }

  const existante = await get(
    "SELECT id FROM matieres_handler WHERE handler_id = ? LIMIT 1",
    [handler]
  );
  // An archived row means the Handler intentionally removed every subject;
  // never silently restore their catalogue.
  if (existante) {
    return;
  }

  const catalogue = await listerValeursCatalogueParType("matiere");
  for (const element of catalogue) {
    const libelle = String(element?.valeur || "").trim();
    const cle = normaliserCleMatiere(libelle);
    if (!libelle || !cle) {
      continue;
    }

    await run(
      `
        INSERT OR IGNORE INTO matieres_handler (
          handler_id, libelle, libelle_normalise, actif
        )
        VALUES (?, ?, ?, 1)
      `,
      [handler, libelle, cle]
    );
  }
}

async function listerMatieresHandler(handlerId, { inclureArchivees = false } = {}) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler) {
    return [];
  }

  await assurerMatieresHandlerParDefaut(handler);
  const filtreActives = inclureArchivees ? "" : "AND actif = 1";
  return all(
    `
      SELECT id, handler_id, libelle, libelle_normalise, actif, created_at, updated_at, archived_at
      FROM matieres_handler
      WHERE handler_id = ? ${filtreActives}
      ORDER BY lower(libelle) ASC, id ASC
    `,
    [handler]
  );
}

async function trouverMatiereHandlerParId(handlerId, matiereId, { inclureArchivees = false } = {}) {
  const handler = normaliserIdentifiant(handlerId);
  const matiere = normaliserIdentifiant(matiereId);
  if (!handler || !matiere) {
    return null;
  }

  const filtreActives = inclureArchivees ? "" : "AND actif = 1";
  return get(
    `
      SELECT id, handler_id, libelle, libelle_normalise, actif, created_at, updated_at, archived_at
      FROM matieres_handler
      WHERE handler_id = ? AND id = ? ${filtreActives}
      LIMIT 1
    `,
    [handler, matiere]
  );
}

async function trouverMatiereHandlerParLibelle(handlerId, libelle, { inclureArchivees = true } = {}) {
  const handler = normaliserIdentifiant(handlerId);
  const cle = normaliserCleMatiere(libelle);
  if (!handler || !cle) {
    return null;
  }

  const filtreActives = inclureArchivees ? "" : "AND actif = 1";
  return get(
    `
      SELECT id, handler_id, libelle, libelle_normalise, actif, created_at, updated_at, archived_at
      FROM matieres_handler
      WHERE handler_id = ? AND libelle_normalise = ? ${filtreActives}
      LIMIT 1
    `,
    [handler, cle]
  );
}

async function ajouterMatiereHandler(handlerId, libelleBrut) {
  const handler = normaliserIdentifiant(handlerId);
  const libelle = normaliserLibelleMatiere(libelleBrut);
  const cle = normaliserCleMatiere(libelle);

  if (!handler || !(await handlerExiste(handler))) {
    throw creerErreur("Handler introuvable.", 404);
  }

  return executerTransactionImmediate(async () => {
    const existante = await trouverMatiereHandlerParLibelle(handler, libelle, {
      inclureArchivees: true,
    });

    if (existante?.actif) {
      throw creerErreur("Cette matière existe déjà.", 409);
    }

    if (existante) {
      await run(
        `
          UPDATE matieres_handler
          SET libelle = ?, actif = 1, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND handler_id = ?
        `,
        [libelle, existante.id, handler]
      );
      return trouverMatiereHandlerParId(handler, existante.id);
    }

    const resultat = await run(
      `
        INSERT INTO matieres_handler (handler_id, libelle, libelle_normalise, actif)
        VALUES (?, ?, ?, 1)
      `,
      [handler, libelle, cle]
    );
    return trouverMatiereHandlerParId(handler, resultat.id);
  });
}

function borneTempsFutur(instant = new Date()) {
  const locale = convertirInstantEnDateHeureZonnee(instant, CENTRAL_CALENDAR_TIMEZONE);
  return {
    date: locale?.date || new Date().toISOString().slice(0, 10),
    heure: locale?.heure || "00:00",
  };
}

async function renommerMatiereHandler(handlerId, matiereId, libelleBrut, instant = new Date()) {
  const handler = normaliserIdentifiant(handlerId);
  const libelle = normaliserLibelleMatiere(libelleBrut);
  const cle = normaliserCleMatiere(libelle);
  const matiere = await trouverMatiereHandlerParId(handler, matiereId);

  if (!matiere) {
    throw creerErreur("Matière introuvable.", 404);
  }

  if (matiere.libelle_normalise === cle) {
    return { matiere, seancesFuturesRenommees: 0 };
  }

  return executerTransactionImmediate(async () => {
    const doublon = await get(
      `
        SELECT id
        FROM matieres_handler
        WHERE handler_id = ? AND libelle_normalise = ? AND id <> ?
        LIMIT 1
      `,
      [handler, cle, matiere.id]
    );
    if (doublon) {
      throw creerErreur("Une autre matière porte déjà ce nom.", 409);
    }

    const limite = borneTempsFutur(instant);
    const resultatSeances = await run(
      `
        UPDATE seances
        SET matiere = ?, updated_at = CURRENT_TIMESTAMP
        WHERE handler_id = ?
          AND trim(matiere) = ?
          AND COALESCE(statut_seance, 'planifiee') <> 'faite'
          AND (
            date > ?
            OR (date = ? AND COALESCE(heure_debut, '00:00') > ?)
          )
      `,
      [libelle, handler, matiere.libelle, limite.date, limite.date, limite.heure]
    );

    await run(
      `
        UPDATE matieres_handler
        SET libelle = ?, libelle_normalise = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND handler_id = ?
      `,
      [libelle, cle, matiere.id, handler]
    );

    return {
      matiere: await trouverMatiereHandlerParId(handler, matiere.id),
      seancesFuturesRenommees: Number(resultatSeances.changes || 0),
    };
  });
}

async function archiverMatiereHandler(handlerId, matiereId) {
  const handler = normaliserIdentifiant(handlerId);
  const matiere = await trouverMatiereHandlerParId(handler, matiereId);
  if (!matiere) {
    throw creerErreur("Matière introuvable.", 404);
  }

  await run(
    `
      UPDATE matieres_handler
      SET actif = 0, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND handler_id = ?
    `,
    [matiere.id, handler]
  );

  return { ...matiere, actif: 0 };
}

async function listerRealisateursTarification(handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler) {
    return [];
  }

  return all(
    `
      SELECT utilisateurs.id, utilisateurs.nom, utilisateurs.statut_compte,
        utilisateurs.acces_active, 1 AS est_handler
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'handler'
      WHERE utilisateurs.id = ?

      UNION ALL

      SELECT utilisateurs.id, utilisateurs.nom, utilisateurs.statut_compte,
        utilisateurs.acces_active, 0 AS est_handler
      FROM rattachements_professeurs
      INNER JOIN utilisateurs
        ON utilisateurs.id = rattachements_professeurs.professeur_id
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'professeur'
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.professeur_id <> ?
        AND rattachements_professeurs.actif = 1

      ORDER BY est_handler DESC, nom COLLATE NOCASE ASC, id ASC
    `,
    [handler, handler, handler]
  );
}

async function listerGrilleTarificationHandler(handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler) {
    return { matieres: [], realisateurs: [] };
  }

  const [matieres, realisateurs] = await Promise.all([
    listerMatieresHandler(handler),
    listerRealisateursTarification(handler),
  ]);
  const tarifs = await all(
    `
      SELECT matiere_id, intervenant_id, tarif_horaire
      FROM tarifs_realisateur_matiere
      WHERE handler_id = ? AND effectif_jusqua IS NULL
      ORDER BY id ASC
    `,
    [handler]
  );
  const tarifsParCle = new Map(
    tarifs.map((tarif) => [
      `${Number(tarif.intervenant_id)}:${Number(tarif.matiere_id)}`,
      Number(tarif.tarif_horaire),
    ])
  );

  return {
    matieres: matieres.map((matiere) => ({
      id: Number(matiere.id),
      libelle: matiere.libelle,
    })),
    realisateurs: realisateurs.map((realisateur) => ({
      id: Number(realisateur.id),
      nom: realisateur.nom,
      est_handler: Number(realisateur.est_handler) === 1,
      actif:
        Number(realisateur.acces_active) === 1 &&
        String(realisateur.statut_compte || "active").toLowerCase() === "active",
      tarifs_matieres: matieres.map((matiere) => {
        const tarif = tarifsParCle.get(`${Number(realisateur.id)}:${Number(matiere.id)}`);
        return {
          matiere_id: Number(matiere.id),
          tarif_horaire: Number.isFinite(tarif) ? tarif : 90,
        };
      }),
    })),
  };
}

async function obtenirTarifHorairePourSeance({
  handlerId,
  intervenantId,
  matiere,
  effectifAu,
}) {
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);
  const cleMatiere = normaliserCleMatiere(matiere);
  const instant = String(effectifAu || "").trim();

  if (!handler || !intervenant || !cleMatiere || !instant) {
    return null;
  }

  await assurerMatieresHandlerParDefaut(handler);
  const tarif = await get(
    `
      SELECT tarifs.tarif_horaire
      FROM tarifs_realisateur_matiere AS tarifs
      INNER JOIN matieres_handler AS matieres
        ON matieres.id = tarifs.matiere_id
        AND matieres.handler_id = tarifs.handler_id
      WHERE tarifs.handler_id = ?
        AND tarifs.intervenant_id = ?
        AND matieres.libelle_normalise = ?
        AND tarifs.effectif_depuis <= ?
        AND (tarifs.effectif_jusqua IS NULL OR tarifs.effectif_jusqua > ?)
      ORDER BY tarifs.effectif_depuis DESC, tarifs.id DESC
      LIMIT 1
    `,
    [handler, intervenant, cleMatiere, instant, instant]
  );

  return Number.isFinite(Number(tarif?.tarif_horaire))
    ? Number(tarif.tarif_horaire)
    : null;
}

function normaliserDemandesTarifs(demandes = []) {
  if (!Array.isArray(demandes) || demandes.length > 1000) {
    throw creerErreur("La liste des tarifs est invalide.");
  }

  const cles = new Set();
  return demandes.map((demande) => {
    const intervenantId = normaliserIdentifiant(
      demande?.intervenant_id ?? demande?.intervenantId
    );
    const matiereId = normaliserIdentifiant(demande?.matiere_id ?? demande?.matiereId);
    if (!intervenantId || !matiereId) {
      throw creerErreur("Un réalisateur ou une matière est invalide.");
    }

    const cle = `${intervenantId}:${matiereId}`;
    if (cles.has(cle)) {
      throw creerErreur("Un tarif est présent plusieurs fois dans la même demande.");
    }
    cles.add(cle);

    return {
      intervenantId,
      matiereId,
      tarifHoraire: normaliserTarifHoraire(
        demande?.tarif_horaire ?? demande?.tarifHoraire,
        { autoriserVide: true }
      ),
    };
  });
}

async function compterSeancesFuturesPourTarif({
  handlerId,
  intervenantId,
  libelle,
  limite,
}) {
  const resultat = await get(
    `
      SELECT COUNT(*) AS total
      FROM seances
      WHERE handler_id = ?
        AND intervenant_id = ?
        AND trim(matiere) = ?
        AND COALESCE(statut_seance, 'planifiee') <> 'faite'
        AND COALESCE(statut_seance, 'planifiee') <> 'annulee'
        AND (
          date > ?
          OR (date = ? AND COALESCE(heure_debut, '00:00') > ?)
        )
    `,
    [handlerId, intervenantId, libelle, limite.date, limite.date, limite.heure]
  );
  return Number(resultat?.total || 0);
}

async function mettreAJourTarifsMatieresHandler(handlerId, demandesBrutes = [], instant = new Date()) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler || !(await handlerExiste(handler))) {
    throw creerErreur("Handler introuvable.", 404);
  }

  const demandes = normaliserDemandesTarifs(demandesBrutes);
  if (demandes.length === 0) {
    return { changements: [] };
  }

  const [matieres, realisateurs] = await Promise.all([
    listerMatieresHandler(handler),
    listerRealisateursTarification(handler),
  ]);
  const matieresParId = new Map(matieres.map((matiere) => [Number(matiere.id), matiere]));
  const realisateursParId = new Map(
    realisateurs.map((realisateur) => [Number(realisateur.id), realisateur])
  );

  demandes.forEach((demande) => {
    if (!matieresParId.has(demande.matiereId)) {
      throw creerErreur("La matière choisie n'est plus disponible.", 404);
    }
    if (!realisateursParId.has(demande.intervenantId)) {
      throw creerErreur("Le réalisateur choisi n'appartient pas à cette équipe.", 404);
    }
  });

  const maintenant = instant instanceof Date && !Number.isNaN(instant.getTime()) ? instant : new Date();
  const maintenantIso = maintenant.toISOString();
  const limite = borneTempsFutur(maintenant);

  return executerTransactionImmediate(async () => {
    const lignesActuelles = await all(
      `
        SELECT id, intervenant_id, matiere_id, tarif_horaire
        FROM tarifs_realisateur_matiere
        WHERE handler_id = ? AND effectif_jusqua IS NULL
      `,
      [handler]
    );
    const actuelsParCle = new Map(
      lignesActuelles.map((ligne) => [
        `${Number(ligne.intervenant_id)}:${Number(ligne.matiere_id)}`,
        ligne,
      ])
    );
    const changements = [];

    for (const demande of demandes) {
      const cle = `${demande.intervenantId}:${demande.matiereId}`;
      const actuel = actuelsParCle.get(cle) || null;
      const tarifAvant = actuel ? Number(actuel.tarif_horaire) : null;
      if (tarifAvant === demande.tarifHoraire) {
        continue;
      }

      const matiere = matieresParId.get(demande.matiereId);
      if (demande.tarifHoraire === null) {
        const totalFutur = await compterSeancesFuturesPourTarif({
          handlerId: handler,
          intervenantId: demande.intervenantId,
          libelle: matiere.libelle,
          limite,
        });
        if (totalFutur > 0) {
          throw creerErreur(
            "Impossible de retirer ce tarif tant que des séances futures utilisent cette matière. Définissez d'abord un autre tarif.",
            409
          );
        }
      }

      if (actuel) {
        await run(
          `
            UPDATE tarifs_realisateur_matiere
            SET effectif_jusqua = ?
            WHERE id = ? AND effectif_jusqua IS NULL
          `,
          [maintenantIso, actuel.id]
        );
      }

      let seancesFuturesMisesAJour = 0;
      if (demande.tarifHoraire !== null) {
        await run(
          `
            INSERT INTO tarifs_realisateur_matiere (
              handler_id, intervenant_id, matiere_id, tarif_horaire, effectif_depuis
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            handler,
            demande.intervenantId,
            demande.matiereId,
            demande.tarifHoraire,
            maintenantIso,
          ]
        );
        const resultatSeances = await run(
          `
            UPDATE seances
            SET tarif_horaire_applique = ?, updated_at = CURRENT_TIMESTAMP
            WHERE handler_id = ?
              AND intervenant_id = ?
              AND trim(matiere) = ?
              AND COALESCE(statut_seance, 'planifiee') <> 'faite'
              AND COALESCE(statut_seance, 'planifiee') <> 'annulee'
              AND (
                date > ?
                OR (date = ? AND COALESCE(heure_debut, '00:00') > ?)
              )
          `,
          [
            demande.tarifHoraire,
            handler,
            demande.intervenantId,
            matiere.libelle,
            limite.date,
            limite.date,
            limite.heure,
          ]
        );
        seancesFuturesMisesAJour = Number(resultatSeances.changes || 0);
      }

      changements.push({
        intervenant_id: demande.intervenantId,
        intervenant_nom: realisateursParId.get(demande.intervenantId)?.nom || "Réaliseur",
        matiere_id: demande.matiereId,
        matiere: matiere.libelle,
        tarif_avant: tarifAvant,
        tarif_apres: demande.tarifHoraire,
        seances_futures_mises_a_jour: seancesFuturesMisesAJour,
      });
    }

    return { changements };
  });
}

module.exports = {
  BASELINE_EFFECTIVE_AT,
  normaliserLibelleMatiere,
  normaliserCleMatiere,
  normaliserTarifHoraire,
  assurerMatieresHandlerParDefaut,
  listerMatieresHandler,
  trouverMatiereHandlerParId,
  trouverMatiereHandlerParLibelle,
  ajouterMatiereHandler,
  renommerMatiereHandler,
  archiverMatiereHandler,
  listerRealisateursTarification,
  listerGrilleTarificationHandler,
  obtenirTarifHorairePourSeance,
  mettreAJourTarifsMatieresHandler,
};
