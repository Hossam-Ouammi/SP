const { all, get, run, executerTransactionImmediate } = require("./db");

const STATUTS_COMPTE_GERABLES_HANDLER = new Set(["active", "suspendu"]);

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserTarifHoraire(valeur) {
  if (valeur === undefined) {
    return undefined;
  }

  const tarif = Number(valeur);
  if (!Number.isInteger(tarif) || tarif < 0 || tarif > 100000) {
    const erreur = new Error("Tarif horaire invalide.");
    erreur.status = 400;
    throw erreur;
  }

  return tarif;
}

function normaliserCouleurCalendrier(valeur) {
  if (valeur === undefined) {
    return undefined;
  }

  const couleur = String(valeur || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(couleur)) {
    const erreur = new Error("Couleur de calendrier invalide.");
    erreur.status = 400;
    throw erreur;
  }

  return couleur.toLowerCase();
}

function normaliserBooleen(valeur, libelle) {
  if (valeur === undefined) {
    return undefined;
  }

  if ([true, 1, "1", "true", "on"].includes(valeur)) {
    return 1;
  }

  if ([false, 0, "0", "false", "off"].includes(valeur)) {
    return 0;
  }

  const erreur = new Error(`${libelle} invalide.`);
  erreur.status = 400;
  throw erreur;
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
  utilisateurs.tarif_horaire,
  utilisateurs.couleur_calendrier,
  utilisateurs.peut_voir_monetisation,
  utilisateurs.peut_voir_aujourdhui,
  utilisateurs.peut_voir_indisponibilites,
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
  const tarifHoraire = normaliserTarifHoraire(donnees.tarif_horaire ?? donnees.tarifHoraire);
  const couleurCalendrier = normaliserCouleurCalendrier(
    donnees.couleur_calendrier ?? donnees.couleurCalendrier
  );
  const peutVoirMonetisation = normaliserBooleen(
    donnees.peut_voir_monetisation ?? donnees.peutVoirMonetisation,
    "Permission monétisation"
  );
  const peutVoirAujourdhui = normaliserBooleen(
    donnees.peut_voir_aujourdhui ?? donnees.peutVoirAujourdhui,
    "Permission aujourd'hui"
  );
  const peutVoirIndisponibilites = normaliserBooleen(
    donnees.peut_voir_indisponibilites ?? donnees.peutVoirIndisponibilites,
    "Permission disponibilités"
  );
  const statutCompte = normaliserStatutCompte(donnees.statut_compte ?? donnees.statutCompte);

  return {
    tarifHoraire,
    couleurCalendrier,
    peutVoirMonetisation,
    peutVoirAujourdhui,
    peutVoirIndisponibilites,
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

    if (miseAJour.tarifHoraire !== undefined) {
      champs.push("tarif_horaire = ?");
      parametres.push(miseAJour.tarifHoraire);
    }
    if (miseAJour.couleurCalendrier !== undefined) {
      champs.push("couleur_calendrier = ?");
      parametres.push(miseAJour.couleurCalendrier);
    }
    if (miseAJour.peutVoirMonetisation !== undefined) {
      champs.push("peut_voir_monetisation = ?");
      parametres.push(miseAJour.peutVoirMonetisation);
    }
    if (miseAJour.peutVoirAujourdhui !== undefined) {
      champs.push("peut_voir_aujourdhui = ?");
      parametres.push(miseAJour.peutVoirAujourdhui);
    }
    if (miseAJour.peutVoirIndisponibilites !== undefined) {
      champs.push("peut_voir_indisponibilites = ?");
      parametres.push(miseAJour.peutVoirIndisponibilites);
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

module.exports = {
  STATUTS_COMPTE_GERABLES_HANDLER,
  listerProfesseursEquipe,
  trouverProfesseurEquipe,
  mettreAJourProfesseurEquipe,
};
