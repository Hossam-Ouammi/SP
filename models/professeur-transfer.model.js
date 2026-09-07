const { get, run, executerTransactionImmediate } = require("./db");
const { creerEntreeHistorique } = require("./historique.model");

function normaliserIdentifiant(valeur) {
  const identifiant = Number(valeur);
  return Number.isInteger(identifiant) && identifiant > 0 ? identifiant : null;
}

function creerErreurTransfert(status, message, code) {
  const erreur = new Error(message);
  erreur.status = status;
  erreur.code = code;
  return erreur;
}

async function trouverProfesseurActif(professeurId) {
  return get(
    `
      SELECT
        utilisateurs.id,
        utilisateurs.public_id,
        utilisateurs.nom,
        utilisateurs.email,
        utilisateurs.statut_compte,
        utilisateurs.acces_active
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'professeur'
      WHERE utilisateurs.id = ?
      LIMIT 1
    `,
    [professeurId]
  );
}

async function trouverRattachementActif(professeurId) {
  return get(
    `
      SELECT
        rattachements_professeurs.id,
        rattachements_professeurs.handler_id,
        rattachements_professeurs.professeur_id,
        rattachements_professeurs.debut_at,
        rattachements_professeurs.fin_at,
        handlers.public_id AS handler_public_id,
        handlers.nom AS handler_nom
      FROM rattachements_professeurs
      INNER JOIN utilisateurs AS handlers
        ON handlers.id = rattachements_professeurs.handler_id
      INNER JOIN utilisateur_roles AS handler_roles
        ON handler_roles.utilisateur_id = handlers.id
        AND handler_roles.role = 'handler'
      WHERE rattachements_professeurs.professeur_id = ?
        AND rattachements_professeurs.actif = 1
      ORDER BY rattachements_professeurs.id DESC
      LIMIT 1
    `,
    [professeurId]
  );
}

async function trouverHandlerDestinationActif(handlerId) {
  return get(
    `
      SELECT
        utilisateurs.id,
        utilisateurs.public_id,
        utilisateurs.nom,
        utilisateurs.email
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'handler'
      WHERE utilisateurs.id = ?
        AND utilisateurs.acces_active = 1
        AND utilisateurs.statut_compte = 'active'
      LIMIT 1
    `,
    [handlerId]
  );
}

async function trouverRattachementParId(rattachementId) {
  return get(
    `
      SELECT
        id,
        handler_id,
        professeur_id,
        actif,
        debut_at,
        fin_at,
        cree_par,
        created_at,
        updated_at
      FROM rattachements_professeurs
      WHERE id = ?
      LIMIT 1
    `,
    [rattachementId]
  );
}

function construireDetailsAudit({
  professeur,
  rattachementSource,
  handlerDestination,
  rattachementDestination,
  sens,
}) {
  return {
    type: "transfert_professeur",
    sens,
    professeur: {
      id: Number(professeur.id),
      public_id: professeur.public_id || null,
      nom: professeur.nom,
    },
    handler_source: {
      id: Number(rattachementSource.handler_id),
      public_id: rattachementSource.handler_public_id || null,
      nom: rattachementSource.handler_nom,
    },
    handler_destination: {
      id: Number(handlerDestination.id),
      public_id: handlerDestination.public_id || null,
      nom: handlerDestination.nom,
    },
    rattachement_source_id: Number(rattachementSource.id),
    rattachement_destination_id: Number(rattachementDestination.id),
    session_version_invalidee: true,
  };
}

/**
 * Move a currently active Professor to another active Handler without ever
 * rewriting historical sessions or the historical membership row. The caller
 * must already have established the SuperAdmin policy; this model still
 * validates every role and relationship at the database boundary.
 */
async function transfererProfesseurEntreHandlers({
  professeurId,
  handlerDestinationId,
  acteurId,
  acteurNom,
}) {
  const professeur = normaliserIdentifiant(professeurId);
  const handlerDestination = normaliserIdentifiant(handlerDestinationId);
  const acteur = normaliserIdentifiant(acteurId);

  if (!professeur || !handlerDestination) {
    throw creerErreurTransfert(
      400,
      "Professeur et Handler de destination obligatoires.",
      "TRANSFER_IDENTIFIANT_INVALIDE"
    );
  }

  if (!acteur) {
    throw creerErreurTransfert(403, "Acteur de transfert invalide.", "TRANSFER_ACTEUR_INVALIDE");
  }

  return executerTransactionImmediate(async () => {
    const professeurCible = await trouverProfesseurActif(professeur);

    if (!professeurCible) {
      throw creerErreurTransfert(404, "Professeur introuvable.", "TRANSFER_PROFESSEUR_INTROUVABLE");
    }

    if (
      Number(professeurCible.acces_active) !== 1 ||
      String(professeurCible.statut_compte || "").trim().toLowerCase() !== "active"
    ) {
      throw creerErreurTransfert(
        409,
        "Le Professeur doit avoir un compte actif pour etre transfere.",
        "TRANSFER_PROFESSEUR_INACTIF"
      );
    }

    const rattachementSource = await trouverRattachementActif(professeur);

    if (!rattachementSource) {
      throw creerErreurTransfert(
        409,
        "Le Professeur ne possede aucun rattachement actif a transferer.",
        "TRANSFER_RATTACHEMENT_SOURCE_ABSENT"
      );
    }

    if (Number(rattachementSource.handler_id) === Number(professeurCible.id)) {
      throw creerErreurTransfert(
        409,
        "Le rattachement propre d'un Handler ne peut pas etre transfere comme un Professeur d'equipe.",
        "TRANSFER_RATTACHEMENT_PROPRE_INTERDIT"
      );
    }

    if (Number(rattachementSource.handler_id) === handlerDestination) {
      throw creerErreurTransfert(
        409,
        "Le Professeur est deja rattache a ce Handler.",
        "TRANSFER_DESTINATION_IDENTIQUE"
      );
    }

    if (handlerDestination === Number(professeurCible.id)) {
      throw creerErreurTransfert(
        409,
        "Le Handler de destination doit etre distinct du Professeur transfere.",
        "TRANSFER_DESTINATION_PROFESSEUR_INTERDITE"
      );
    }

    const destination = await trouverHandlerDestinationActif(handlerDestination);

    if (!destination) {
      throw creerErreurTransfert(
        404,
        "Handler de destination introuvable ou inactif.",
        "TRANSFER_HANDLER_DESTINATION_INTROUVABLE"
      );
    }

    const fermetureSource = await run(
      `
        UPDATE rattachements_professeurs
        SET
          actif = 0,
          fin_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND actif = 1
      `,
      [rattachementSource.id]
    );

    if (Number(fermetureSource?.changes || 0) !== 1) {
      throw creerErreurTransfert(
        409,
        "Le rattachement source a change pendant le transfert.",
        "TRANSFER_CONCURRENCE_RATTACHEMENT"
      );
    }

    const creationDestination = await run(
      `
        INSERT INTO rattachements_professeurs (
          handler_id,
          professeur_id,
          actif,
          cree_par
        )
        VALUES (?, ?, 1, ?)
      `,
      [destination.id, professeurCible.id, acteur]
    );

    const rattachementDestination = await trouverRattachementParId(creationDestination.id);

    if (!rattachementDestination) {
      throw creerErreurTransfert(
        500,
        "Le nouveau rattachement n'a pas pu etre verifie.",
        "TRANSFER_RATTACHEMENT_DESTINATION_ABSENT"
      );
    }

    // Scope is material access control.  Rotate its version before returning
    // so regular and trusted-device sessions become unusable immediately.
    const invalidationSession = await run(
      `
        UPDATE utilisateurs
        SET session_version = COALESCE(session_version, 0) + 1
        WHERE id = ?
          AND acces_active = 1
          AND statut_compte = 'active'
      `,
      [professeurCible.id]
    );

    if (Number(invalidationSession?.changes || 0) !== 1) {
      throw creerErreurTransfert(
        409,
        "Le compte du Professeur a change pendant le transfert.",
        "TRANSFER_CONCURRENCE_COMPTE"
      );
    }

    // Two signed records make the move visible from both strictly isolated
    // Handler histories.  Historical sessions are intentionally untouched.
    const detailsSortie = construireDetailsAudit({
      professeur: professeurCible,
      rattachementSource,
      handlerDestination: destination,
      rattachementDestination,
      sens: "sortie",
    });
    const detailsEntree = construireDetailsAudit({
      professeur: professeurCible,
      rattachementSource,
      handlerDestination: destination,
      rattachementDestination,
      sens: "entree",
    });
    const libelleProfesseur = `${professeurCible.public_id || "PR"} — ${professeurCible.nom}`;

    const historiqueSortie = await creerEntreeHistorique({
      handlerId: rattachementSource.handler_id,
      intervenantId: professeurCible.id,
      seanceId: null,
      seanceLibelle: libelleProfesseur,
      actionType: "professeur_transfere",
      actionLabel: "Transfert d'un professeur vers un autre Handler",
      acteurId: acteur,
      acteurNom: String(acteurNom || "SuperAdmin"),
      details: detailsSortie,
    });
    const historiqueEntree = await creerEntreeHistorique({
      handlerId: destination.id,
      intervenantId: professeurCible.id,
      seanceId: null,
      seanceLibelle: libelleProfesseur,
      actionType: "professeur_transfere",
      actionLabel: "Rattachement d'un professeur transfere",
      acteurId: acteur,
      acteurNom: String(acteurNom || "SuperAdmin"),
      details: detailsEntree,
    });

    const professeurMisAJour = await get(
      `
        SELECT id, public_id, nom, email, session_version
        FROM utilisateurs
        WHERE id = ?
        LIMIT 1
      `,
      [professeurCible.id]
    );
    const rattachementSourceFerme = await trouverRattachementParId(rattachementSource.id);

    return {
      professeur: professeurMisAJour,
      handlerSource: {
        id: Number(rattachementSource.handler_id),
        public_id: rattachementSource.handler_public_id || null,
        nom: rattachementSource.handler_nom,
      },
      handlerDestination: destination,
      rattachementSource: rattachementSourceFerme,
      rattachementDestination,
      historique: {
        sortie: historiqueSortie,
        entree: historiqueEntree,
      },
    };
  });
}

module.exports = {
  normaliserIdentifiant,
  transfererProfesseurEntreHandlers,
};
