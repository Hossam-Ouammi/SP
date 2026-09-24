const { all, get, run } = require("./db");

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserListeIdentifiants(valeurs = []) {
  return Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [valeurs])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );
}

function construireFiltreIndisponibilitesScopees(scope = {}) {
  const handlerIds = normaliserListeIdentifiants(scope.handlerIds);
  const intervenantId = normaliserIdentifiant(scope.intervenantId);
  const possedeListeIntervenants = Array.isArray(scope.intervenantIds);
  const intervenantIds = normaliserListeIdentifiants(scope.intervenantIds);

  if (handlerIds.length === 0 && !intervenantId && intervenantIds.length === 0) {
    return { clause: "1 = 0", parametres: [] };
  }

  const clauses = [];
  const parametres = [];

  if (intervenantId) {
    // Une indisponibilite est personnelle et vaut dans toutes les equipes.
    clauses.push("indisponibilites.intervenant_id = ?");
    parametres.push(intervenantId);
  } else if (possedeListeIntervenants) {
    // Une liste vide est intentionnelle : sans professeur actif, un Handler
    // ne recoit pas ses anciennes indisponibilites personnelles par defaut.
    if (intervenantIds.length === 0) {
      return { clause: "1 = 0", parametres: [] };
    }

    clauses.push(
      `indisponibilites.intervenant_id IN (${intervenantIds.map(() => "?").join(", ")})`
    );
    parametres.push(...intervenantIds);
  } else {
    clauses.push(
      `indisponibilites.handler_id IN (${handlerIds.map(() => "?").join(", ")})`
    );
    parametres.push(...handlerIds);
  }

  return { clause: clauses.join(" AND "), parametres };
}

const requeteIndisponibiliteComplete = `
  SELECT
    indisponibilites.*,
    createur.nom AS cree_par_nom
  FROM indisponibilites
  LEFT JOIN utilisateurs AS createur ON createur.id = indisponibilites.cree_par
  LEFT JOIN utilisateurs AS intervenant ON intervenant.id = indisponibilites.intervenant_id
`;

async function listerToutesLesIndisponibilites() {
  return all(
    `
      ${requeteIndisponibiliteComplete}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `
  );
}

async function listerIndisponibilitesScopees(scope = {}) {
  const filtre = construireFiltreIndisponibilitesScopees(scope);

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${filtre.clause}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    filtre.parametres
  );
}

async function trouverIndisponibiliteParId(id) {
  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.id = ?
    `,
    [id]
  );
}

async function trouverIndisponibiliteParIdScopee(id, scope = {}) {
  const indisponibiliteId = normaliserIdentifiant(id);

  if (!indisponibiliteId) {
    return null;
  }

  const filtre = construireFiltreIndisponibilitesScopees(scope);

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE indisponibilites.id = ?
        AND ${filtre.clause}
    `,
    [indisponibiliteId, ...filtre.parametres]
  );
}

async function creerIndisponibilite({
  date,
  heureDebut,
  heureFin,
  jourComplet = 0,
  raison,
  creePar,
  handlerId = null,
  intervenantId = null,
}) {
  const resultat = await run(
    `
      INSERT INTO indisponibilites (
        date,
        heure_debut,
        heure_fin,
        jour_complet,
        raison,
        cree_par,
        handler_id,
        intervenant_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      date,
      heureDebut,
      heureFin,
      jourComplet ? 1 : 0,
      raison,
      creePar,
      normaliserIdentifiant(handlerId),
      normaliserIdentifiant(intervenantId),
    ]
  );

  return trouverIndisponibiliteParId(resultat.id);
}

async function modifierIndisponibilite(
  id,
  {
    date,
    heureDebut,
    heureFin,
    jourComplet = 0,
    raison,
    handlerId = null,
    intervenantId = null,
  }
) {
  await run(
    `
      UPDATE indisponibilites
      SET
        date = ?,
        heure_debut = ?,
        heure_fin = ?,
        jour_complet = ?,
        raison = ?,
        handler_id = COALESCE(?, handler_id),
        intervenant_id = COALESCE(?, intervenant_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      date,
      heureDebut,
      heureFin,
      jourComplet ? 1 : 0,
      raison,
      normaliserIdentifiant(handlerId),
      normaliserIdentifiant(intervenantId),
      id,
    ]
  );

  return trouverIndisponibiliteParId(id);
}

async function supprimerIndisponibilite(id) {
  return run("DELETE FROM indisponibilites WHERE id = ?", [id]);
}

async function trouverIndisponibiliteChevauchante({
  date,
  heureDebut,
  heureFin,
  exclureId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const params = [date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    params.push(Number(exclureId));
  }

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
      LIMIT 1
    `,
    params
  );
}

async function trouverIndisponibiliteIntervenantChevauchante({
  handlerId,
  intervenantId,
  date,
  heureDebut,
  heureFin,
  exclureId = null,
}) {
  const intervenant = normaliserIdentifiant(intervenantId);

  if (!intervenant) {
    return null;
  }

  const clauses = [
    "indisponibilites.intervenant_id = ?",
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const parametres = [intervenant, date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    parametres.push(Number(exclureId));
  }

  return get(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
      LIMIT 1
    `,
    parametres
  );
}

async function listerIndisponibilitesChevauchantes({
  date,
  heureDebut,
  heureFin,
  exclureId = null,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut < ?",
    "indisponibilites.heure_fin > ?",
  ];
  const params = [date, heureFin, heureDebut];

  if (Number.isInteger(Number(exclureId)) && Number(exclureId) > 0) {
    clauses.push("indisponibilites.id <> ?");
    params.push(Number(exclureId));
  }

  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (intervenant) {
    clauses.push("indisponibilites.intervenant_id = ?");
    params.push(intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

async function listerIndisponibilitesTouchantPlage({
  date,
  heureDebut,
  heureFin,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut <= ?",
    "indisponibilites.heure_fin >= ?",
  ];
  const params = [date, heureFin, heureDebut];
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (intervenant) {
    clauses.push("indisponibilites.intervenant_id = ?");
    params.push(intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

async function listerIndisponibilitesInclusesDansPlage({
  date,
  heureDebut,
  heureFin,
  handlerId = null,
  intervenantId = null,
}) {
  const clauses = [
    "indisponibilites.date = ?",
    "indisponibilites.heure_debut >= ?",
    "indisponibilites.heure_fin <= ?",
  ];
  const params = [date, heureDebut, heureFin];
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (intervenant) {
    clauses.push("indisponibilites.intervenant_id = ?");
    params.push(intervenant);
  }

  return all(
    `
      ${requeteIndisponibiliteComplete}
      WHERE ${clauses.join(" AND ")}
      ORDER BY indisponibilites.date ASC, indisponibilites.heure_debut ASC, indisponibilites.id ASC
    `,
    params
  );
}

// Appelée dans la transaction de redimensionnement de la séance.
async function retirerPlageIndisponibilitesPersonnelles({ intervenantId, date, heureDebut, heureFin }) {
  if (!normaliserIdentifiant(intervenantId)) throw new Error("Réalisateur invalide.");
  const indisponibilites = await listerIndisponibilitesChevauchantes({
    intervenantId, date, heureDebut, heureFin,
  });
  const ajustements = [];
  for (const indisponibilite of indisponibilites) {
    const segments = [];
    if (indisponibilite.heure_debut < heureDebut) {
      segments.push([indisponibilite.heure_debut, heureDebut]);
    }
    if (indisponibilite.heure_fin > heureFin) {
      segments.push([heureFin, indisponibilite.heure_fin]);
    }
    const donnees = {
      date, raison: indisponibilite.raison, jourComplet: 0,
      handlerId: indisponibilite.handler_id, intervenantId: indisponibilite.intervenant_id,
    };
    if (!segments.length) {
      await supprimerIndisponibilite(indisponibilite.id);
    } else {
      await modifierIndisponibilite(indisponibilite.id, {
        ...donnees, heureDebut: segments[0][0], heureFin: segments[0][1],
      });
      if (segments.length > 1) {
        await creerIndisponibilite({
          ...donnees, heureDebut: segments[1][0], heureFin: segments[1][1],
          creePar: indisponibilite.cree_par,
        });
      }
    }
    ajustements.push({
      id: indisponibilite.id,
      avant: `${indisponibilite.heure_debut}–${indisponibilite.heure_fin}`,
      apres: segments.map(([debut, fin]) => `${debut}–${fin}`).join(", ") || "Supprimée",
    });
  }
  return ajustements;
}

module.exports = {
  retirerPlageIndisponibilitesPersonnelles,
  construireFiltreIndisponibilitesScopees,
  listerToutesLesIndisponibilites,
  listerIndisponibilitesScopees,
  listerIndisponibilitesChevauchantes,
  listerIndisponibilitesTouchantPlage,
  listerIndisponibilitesInclusesDansPlage,
  trouverIndisponibiliteParId,
  trouverIndisponibiliteParIdScopee,
  creerIndisponibilite,
  modifierIndisponibilite,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
  trouverIndisponibiliteIntervenantChevauchante,
};
