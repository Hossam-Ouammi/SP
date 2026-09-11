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

/**
 * Construit le filtre SQL commun aux lectures de séances privées.
 *
 * Les anciens helpers sans scope sont volontairement conservés pour les
 * opérations globales de l'administration. Les routes du quotidien doivent
 * utiliser les helpers `...Scopee` ci-dessous : cela évite de charger un jeu
 * global puis de le masquer dans le navigateur.
 */
function construireFiltreSeancesScopees(scope = {}) {
  const handlerIds = normaliserListeIdentifiants(scope.handlerIds);
  const handlerOwnIds = normaliserListeIdentifiants(scope.handlerOwnIds);
  const handlerProfesseurIds = normaliserListeIdentifiants(scope.handlerProfesseurIds)
    .filter((handlerId) => !handlerOwnIds.includes(handlerId));
  const intervenantId = normaliserIdentifiant(scope.intervenantId);

  if (handlerIds.length === 0) {
    return { clause: "1 = 0", parametres: [] };
  }

  if (handlerOwnIds.length > 0 && handlerProfesseurIds.length > 0 && intervenantId) {
    return {
      clause: `(
        seances.handler_id IN (${handlerOwnIds.map(() => "?").join(", ")})
        OR (
          seances.handler_id IN (${handlerProfesseurIds.map(() => "?").join(", ")})
          AND seances.intervenant_id = ?
        )
      )`,
      parametres: [...handlerOwnIds, ...handlerProfesseurIds, intervenantId],
    };
  }

  const clauses = [
    `seances.handler_id IN (${handlerIds.map(() => "?").join(", ")})`,
  ];
  const parametres = [...handlerIds];

  if (intervenantId) {
    clauses.push("seances.intervenant_id = ?");
    parametres.push(intervenantId);
  }

  return {
    clause: clauses.join(" AND "),
    parametres,
  };
}

const requeteSeanceComplete = `
  SELECT
    seances.*,
    createur.nom AS cree_par_nom,
    modificateur.nom AS modifie_par_nom,
    intervenant.nom AS intervenant_nom,
    intervenant.public_id AS intervenant_public_id,
    intervenant.couleur_calendrier AS intervenant_couleur_calendrier,
    handler.public_id AS handler_public_id,
    (
      SELECT COUNT(*)
      FROM photos
      WHERE photos.seance_id = seances.id
    ) AS nombre_photos
  FROM seances
  LEFT JOIN utilisateurs AS createur ON createur.id = seances.cree_par
  LEFT JOIN utilisateurs AS modificateur ON modificateur.id = seances.modifie_par
  LEFT JOIN utilisateurs AS intervenant ON intervenant.id = seances.intervenant_id
  LEFT JOIN utilisateurs AS handler ON handler.id = seances.handler_id
`;

async function listerToutesLesSeances(utilisateurId = null) {
  const clauseWhere = utilisateurId ? "WHERE seances.utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [utilisateurId] : [];

  return all(
    `
      ${requeteSeanceComplete}
      ${clauseWhere}
      ORDER BY seances.date ASC, seances.heure_debut ASC
    `,
    parametres
  );
}

async function listerSeancesScopees(scope = {}) {
  const filtre = construireFiltreSeancesScopees(scope);

  return all(
    `
      ${requeteSeanceComplete}
      WHERE ${filtre.clause}
      ORDER BY seances.date ASC, seances.heure_debut ASC, seances.id ASC
    `,
    filtre.parametres
  );
}

/**
 * Lecture globale volontairement explicite, reservee aux analyses de la
 * plateforme. Les ecrans operationnels ne doivent jamais appeler ce helper :
 * ils utilisent `listerSeancesPourMonetisationScopees` avec leur Handler.
 */
async function listerToutesLesSeancesPourMonetisation() {
  return all(`
    SELECT
      seances.id,
      seances.handler_id,
      seances.intervenant_id,
      seances.tarif_horaire_applique,
      intervenant.nom AS intervenant_nom,
      intervenant.public_id AS intervenant_public_id,
      intervenant.tarif_horaire AS intervenant_tarif_horaire,
      seances.etudiant,
      seances.matiere,
      seances.compte,
      seances.est_essai,
      seances.date,
      seances.heure_debut,
      seances.heure_fin,
      seances.duree_minutes,
      seances.statut_seance
    FROM seances
    LEFT JOIN utilisateurs AS intervenant ON intervenant.id = seances.intervenant_id
    ORDER BY seances.date ASC, seances.heure_debut ASC, seances.id ASC
  `);
}

async function listerSeancesPourMonetisationScopees(scope = {}) {
  const filtre = construireFiltreSeancesScopees(scope);

  return all(
    `
      SELECT
        seances.id,
        seances.handler_id,
        seances.intervenant_id,
        seances.tarif_horaire_applique,
        intervenant.nom AS intervenant_nom,
        intervenant.public_id AS intervenant_public_id,
        intervenant.tarif_horaire AS intervenant_tarif_horaire,
        seances.etudiant,
        seances.matiere,
        seances.compte,
        seances.est_essai,
        seances.date,
        seances.heure_debut,
        seances.heure_fin,
        seances.duree_minutes,
        seances.statut_seance
      FROM seances
      LEFT JOIN utilisateurs AS intervenant ON intervenant.id = seances.intervenant_id
      WHERE ${filtre.clause}
      ORDER BY seances.date ASC, seances.heure_debut ASC, seances.id ASC
    `,
    filtre.parametres
  );
}

async function trouverSeanceParId(id, utilisateurId = null) {
  const clauseWhereExtra = utilisateurId ? "AND seances.utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [id, utilisateurId] : [id];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.id = ? ${clauseWhereExtra}
    `,
    parametres
  );
}

async function trouverSeanceParIdScopee(id, scope = {}) {
  const seanceId = normaliserIdentifiant(id);

  if (!seanceId) {
    return null;
  }

  const filtre = construireFiltreSeancesScopees(scope);

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.id = ?
        AND ${filtre.clause}
    `,
    [seanceId, ...filtre.parametres]
  );
}

async function trouverSeanceCompteChevauchante({
  date,
  heureDebut,
  heureFin,
  compte,
  exclureSeanceId = null,
}) {
  const clauseExclusion = exclureSeanceId ? "AND seances.id <> ?" : "";
  const parametres = exclureSeanceId
    ? [date, compte, heureFin, heureDebut, exclureSeanceId]
    : [date, compte, heureFin, heureDebut];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.date = ?
        AND lower(seances.compte) = lower(?)
        AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'
        AND seances.heure_debut < ?
        AND seances.heure_fin > ?
        ${clauseExclusion}
      ORDER BY seances.heure_debut ASC
      LIMIT 1
    `,
    parametres
  );
}

async function trouverSeanceChevauchante({
  date,
  heureDebut,
  heureFin,
  exclureSeanceId = null,
}) {
  const clauseExclusion = exclureSeanceId ? "AND seances.id <> ?" : "";
  const parametres = exclureSeanceId
    ? [date, heureFin, heureDebut, exclureSeanceId]
    : [date, heureFin, heureDebut];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.date = ?
        AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'
        AND seances.heure_debut < ?
        AND seances.heure_fin > ?
        ${clauseExclusion}
      ORDER BY seances.heure_debut ASC, seances.id ASC
      LIMIT 1
    `,
    parametres
  );
}

async function trouverSeanceIntervenantChevauchante({
  handlerId,
  intervenantId,
  date,
  heureDebut,
  heureFin,
  exclureSeanceId = null,
}) {
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (!handler || !intervenant) {
    return null;
  }

  const clauseExclusion = exclureSeanceId ? "AND seances.id <> ?" : "";
  const parametres = exclureSeanceId
    ? [handler, intervenant, date, heureFin, heureDebut, exclureSeanceId]
    : [handler, intervenant, date, heureFin, heureDebut];

  return get(
    `
      ${requeteSeanceComplete}
      WHERE seances.handler_id = ?
        AND seances.intervenant_id = ?
        AND seances.date = ?
        AND COALESCE(seances.statut_seance, 'planifiee') <> 'annulee'
        AND seances.heure_debut < ?
        AND seances.heure_fin > ?
        ${clauseExclusion}
      ORDER BY seances.heure_debut ASC, seances.id ASC
      LIMIT 1
    `,
    parametres
  );
}

async function creerSeance(donneesSeance) {
  const tarifSnapshotBrut = donneesSeance.tarif_horaire_applique;
  const tarifSnapshot =
    tarifSnapshotBrut === null || tarifSnapshotBrut === undefined
      ? null
      : Number(tarifSnapshotBrut);

  const resultat = await run(
    `
      INSERT INTO seances (
        titre,
        etudiant,
        parent,
        matiere,
        compte,
        est_essai,
        date,
        heure_debut,
        heure_fin,
        duree_minutes,
        statut_seance,
        prix,
        statut_paiement,
        description,
        cree_par,
        modifie_par,
        utilisateur_id,
        handler_id,
        intervenant_id,
        tarif_horaire_applique
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      donneesSeance.titre,
      donneesSeance.etudiant,
      donneesSeance.parent,
      donneesSeance.matiere,
      donneesSeance.compte,
      donneesSeance.est_essai,
      donneesSeance.date,
      donneesSeance.heure_debut,
      donneesSeance.heure_fin,
      donneesSeance.duree_minutes,
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.cree_par,
      donneesSeance.modifie_par,
      donneesSeance.utilisateur_id,
      normaliserIdentifiant(donneesSeance.handler_id),
      normaliserIdentifiant(donneesSeance.intervenant_id),
      Number.isFinite(tarifSnapshot) ? tarifSnapshot : null,
    ]
  );

  return trouverSeanceParId(resultat.id);
}

async function mettreAJourSeance(id, donneesSeance, utilisateurId = null) {
  const tarifSnapshotBrut = donneesSeance.tarif_horaire_applique;
  const tarifSnapshot =
    tarifSnapshotBrut === null || tarifSnapshotBrut === undefined
      ? null
      : Number(tarifSnapshotBrut);

  await run(
    `
      UPDATE seances
      SET
        titre = ?,
        etudiant = ?,
        parent = ?,
        matiere = ?,
        compte = ?,
        est_essai = ?,
        date = ?,
        heure_debut = ?,
        heure_fin = ?,
        duree_minutes = ?,
        statut_seance = ?,
        prix = ?,
        statut_paiement = ?,
        description = ?,
        modifie_par = ?,
        handler_id = COALESCE(?, handler_id),
        intervenant_id = COALESCE(?, intervenant_id),
        tarif_horaire_applique = COALESCE(?, tarif_horaire_applique),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? ${utilisateurId ? "AND utilisateur_id = ?" : ""}
    `,
    [
      donneesSeance.titre,
      donneesSeance.etudiant,
      donneesSeance.parent,
      donneesSeance.matiere,
      donneesSeance.compte,
      donneesSeance.est_essai,
      donneesSeance.date,
      donneesSeance.heure_debut,
      donneesSeance.heure_fin,
      donneesSeance.duree_minutes,
      donneesSeance.statut_seance,
      donneesSeance.prix,
      donneesSeance.statut_paiement,
      donneesSeance.description,
      donneesSeance.modifie_par,
      normaliserIdentifiant(donneesSeance.handler_id),
      normaliserIdentifiant(donneesSeance.intervenant_id),
      Number.isFinite(tarifSnapshot) ? tarifSnapshot : null,
      id,
      ...(utilisateurId ? [utilisateurId] : []),
    ]
  );

  return trouverSeanceParId(id, utilisateurId);
}

async function mettreAJourStatutSeance(id, statutSeance, acteurId, utilisateurId = null) {
  const clauseWhere = utilisateurId ? "AND utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [statutSeance, acteurId, id, utilisateurId] : [statutSeance, acteurId, id];

  await run(
    `
      UPDATE seances
      SET
        statut_seance = ?,
        modifie_par = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? ${clauseWhere}
    `,
    parametres
  );

  return trouverSeanceParId(id, utilisateurId);
}

async function supprimerSeance(id, utilisateurId = null) {
  const clauseWhere = utilisateurId ? "AND utilisateur_id = ?" : "";
  const parametres = utilisateurId ? [id, utilisateurId] : [id];

  return run(`DELETE FROM seances WHERE id = ? ${clauseWhere}`, parametres);
}

module.exports = {
  construireFiltreSeancesScopees,
  listerToutesLesSeances,
  listerSeancesScopees,
  listerToutesLesSeancesPourMonetisation,
  listerSeancesPourMonetisationScopees,
  trouverSeanceParId,
  trouverSeanceParIdScopee,
  trouverSeanceCompteChevauchante,
  trouverSeanceChevauchante,
  trouverSeanceIntervenantChevauchante,
  creerSeance,
  mettreAJourSeance,
  mettreAJourStatutSeance,
  supprimerSeance,
};
