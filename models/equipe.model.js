const { all, get, run, executerTransactionImmediate } = require("./db");

const STATUTS_COMPTE_GERABLES_HANDLER = new Set(["active", "suspendu"]);

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserStatutCompte(valeur) {
  if (valeur === undefined) {
    return undefined;
  }

  const statut = String(valeur || "").trim().toLowerCase();
  if (!STATUTS_COMPTE_GERABLES_HANDLER.has(statut)) {
    const erreur = new Error("Statut de compte invalide.");
    erreur.status = 400;
    throw erreur;
  }

  return statut;
}

const selectionProfesseurEquipe = `
  utilisateurs.id,
  utilisateurs.public_id,
  utilisateurs.nom,
  utilisateurs.email,
  utilisateurs.statut_compte,
  utilisateurs.acces_active,
  utilisateurs.couleur_calendrier,
  utilisateurs.timezone,
  utilisateurs.created_at,
  rattachements_professeurs.id AS rattachement_id,
  rattachements_professeurs.debut_at AS rattachement_debut_at
`;

async function listerProfesseursEquipe(handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  if (!handler) {
    return [];
  }

  return all(
    `
      SELECT ${selectionProfesseurEquipe}
      FROM rattachements_professeurs
      INNER JOIN utilisateurs ON utilisateurs.id = rattachements_professeurs.professeur_id
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'professeur'
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.actif = 1
      ORDER BY lower(utilisateurs.public_id) ASC, utilisateurs.id ASC
    `,
    [handler]
  );
}

async function trouverProfesseurEquipe(handlerId, professeurId) {
  const handler = normaliserIdentifiant(handlerId);
  const professeur = normaliserIdentifiant(professeurId);
  if (!handler || !professeur) {
    return null;
  }

  return get(
    `
      SELECT ${selectionProfesseurEquipe}
      FROM rattachements_professeurs
      INNER JOIN utilisateurs ON utilisateurs.id = rattachements_professeurs.professeur_id
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
        AND utilisateur_roles.role = 'professeur'
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.professeur_id = ?
        AND rattachements_professeurs.actif = 1
      LIMIT 1
    `,
    [handler, professeur]
  );
}

function construireMiseAJourProfesseur(donnees = {}) {
  // La couleur est attribuee automatiquement par le serveur au niveau de
  // l'equipe. Un ancien client peut encore envoyer ce champ : il est ignore
  // afin qu'aucune requete API ne puisse le personnaliser.
  const couleurCalendrier = undefined;
  const statutCompte = normaliserStatutCompte(donnees.statut_compte ?? donnees.statutCompte);

  return {
    couleurCalendrier,
    statutCompte,
  };
}

async function mettreAJourProfesseurEquipe(handlerId, professeurId, donnees = {}) {
  const handler = normaliserIdentifiant(handlerId);
  const professeur = normaliserIdentifiant(professeurId);
  const miseAJour = construireMiseAJourProfesseur(donnees);

  if (!handler || !professeur) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const existant = await trouverProfesseurEquipe(handler, professeur);
    if (!existant) {
      return null;
    }

    const champs = [];
    const parametres = [];

    if (miseAJour.couleurCalendrier !== undefined) {
      champs.push("couleur_calendrier = ?");
      parametres.push(miseAJour.couleurCalendrier);
    }
    if (miseAJour.statutCompte !== undefined) {
      champs.push("statut_compte = ?");
      parametres.push(miseAJour.statutCompte);
      champs.push("acces_active = ?");
      parametres.push(miseAJour.statutCompte === "active" ? 1 : 0);

      if (miseAJour.statutCompte !== "active") {
        champs.push("session_version = session_version + 1");
      }
    }

    if (champs.length === 0) {
      return existant;
    }

    await run(
      `
        UPDATE utilisateurs
        SET ${champs.join(", ")}
        WHERE id = ?
      `,
      [...parametres, professeur]
    );

    return trouverProfesseurEquipe(handler, professeur);
  });
}

async function retirerProfesseurEquipe(handlerId, professeurId) {
  const handler = normaliserIdentifiant(handlerId);
  const professeur = normaliserIdentifiant(professeurId);
  if (!handler || !professeur || handler === professeur) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const existant = await trouverProfesseurEquipe(handler, professeur);
    if (!existant) {
      return null;
    }

    const resultat = await run(
      `
        UPDATE rattachements_professeurs
        SET actif = 0,
            fin_at = COALESCE(fin_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE handler_id = ?
          AND professeur_id = ?
          AND actif = 1
      `,
      [handler, professeur]
    );

    return Number(resultat?.changes || 0) === 1 ? existant : null;
  });
}

module.exports = {
  STATUTS_COMPTE_GERABLES_HANDLER,
  listerProfesseursEquipe,
  trouverProfesseurEquipe,
  mettreAJourProfesseurEquipe,
  retirerProfesseurEquipe,
};
