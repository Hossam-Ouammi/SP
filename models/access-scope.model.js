const { all, get } = require("./db");

const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  HANDLER: "handler",
  PROFESSEUR: "professeur",
});

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliserRole(valeur) {
  const role = String(valeur || "").trim().toLowerCase();
  return Object.values(ROLES).includes(role) ? role : "";
}

/**
 * Retourne les rôles canoniques présents sur un objet déjà chargé.
 *
 * `est_admin` est une colonne historique de compatibilité ; elle ne doit
 * jamais intervenir ici. Les décisions d'autorisation SuperAdmin reposent
 * exclusivement sur `utilisateur_roles` et donc sur ce jeu de rôles.
 */
function normaliserRolesCompte(compte) {
  const rolesBruts = Array.isArray(compte?.roles)
    ? compte.roles
    : String(compte?.roles || "").split(",");

  return Array.from(new Set(rolesBruts.map(normaliserRole).filter(Boolean)));
}

function comptePossedeRole(compte, role) {
  const roleNormalise = normaliserRole(role);
  return Boolean(roleNormalise && normaliserRolesCompte(compte).includes(roleNormalise));
}

function normaliserListeIds(valeurs = []) {
  return Array.from(
    new Set(
      (Array.isArray(valeurs) ? valeurs : [valeurs])
        .map(normaliserIdentifiant)
        .filter(Boolean)
    )
  );
}

async function listerRolesUtilisateur(utilisateurId) {
  const id = normaliserIdentifiant(utilisateurId);

  if (!id) {
    return [];
  }

  const lignes = await all(
    `
      SELECT role
      FROM utilisateur_roles
      WHERE utilisateur_id = ?
      ORDER BY role ASC
    `,
    [id]
  );

  return lignes.map((ligne) => normaliserRole(ligne.role)).filter(Boolean);
}

async function listerRattachementsActifsProfesseur(professeurId) {
  const id = normaliserIdentifiant(professeurId);

  if (!id) {
    return [];
  }

  return all(
    `
      SELECT rattachements_professeurs.handler_id, rattachements_professeurs.professeur_id
      FROM rattachements_professeurs
      INNER JOIN utilisateurs AS handlers
        ON handlers.id = rattachements_professeurs.handler_id
      WHERE rattachements_professeurs.professeur_id = ?
        AND rattachements_professeurs.actif = 1
        AND handlers.acces_active = 1
        AND handlers.statut_compte = 'active'
      ORDER BY rattachements_professeurs.handler_id ASC
    `,
    [id]
  );
}

async function listerProfesseursActifsHandler(handlerId) {
  const id = normaliserIdentifiant(handlerId);

  if (!id) {
    return [];
  }

  return all(
    `
      SELECT rattachements_professeurs.professeur_id
      FROM rattachements_professeurs
      INNER JOIN utilisateurs AS professeurs
        ON professeurs.id = rattachements_professeurs.professeur_id
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.actif = 1
        AND professeurs.acces_active = 1
        AND professeurs.statut_compte = 'active'
      ORDER BY rattachements_professeurs.professeur_id ASC
    `,
    [id]
  );
}

async function trouverRattachementActif({ handlerId, professeurId }) {
  const handler = normaliserIdentifiant(handlerId);
  const professeur = normaliserIdentifiant(professeurId);

  if (!handler || !professeur) {
    return null;
  }

  return get(
    `
      SELECT
        rattachements_professeurs.id,
        rattachements_professeurs.handler_id,
        rattachements_professeurs.professeur_id,
        rattachements_professeurs.actif,
        rattachements_professeurs.debut_at,
        rattachements_professeurs.fin_at
      FROM rattachements_professeurs
      INNER JOIN utilisateurs AS professeurs
        ON professeurs.id = rattachements_professeurs.professeur_id
      INNER JOIN utilisateurs AS handlers
        ON handlers.id = rattachements_professeurs.handler_id
      WHERE rattachements_professeurs.handler_id = ?
        AND rattachements_professeurs.professeur_id = ?
        AND rattachements_professeurs.actif = 1
        AND professeurs.acces_active = 1
        AND professeurs.statut_compte = 'active'
        AND handlers.acces_active = 1
        AND handlers.statut_compte = 'active'
      LIMIT 1
    `,
    [handler, professeur]
  );
}

async function construireScopeAcces(utilisateur) {
  const utilisateurId = normaliserIdentifiant(utilisateur?.id);

  if (!utilisateurId) {
    return {
      utilisateurId: null,
      roles: [],
      estSuperAdmin: false,
      estHandler: false,
      estProfesseur: false,
      handlerIds: [],
      handlerOwnIds: [],
      handlerProfesseurIds: [],
      professeurIdsHandlerOwn: [],
      intervenantIds: [],
    };
  }

  const roles = await listerRolesUtilisateur(utilisateurId);
  const ensembleRoles = new Set(roles);
  const estHandler = ensembleRoles.has(ROLES.HANDLER);
  const estProfesseur = ensembleRoles.has(ROLES.PROFESSEUR);
  const [rattachements, professeursHandler] = await Promise.all([
    estProfesseur || estHandler ? listerRattachementsActifsProfesseur(utilisateurId) : [],
    estHandler ? listerProfesseursActifsHandler(utilisateurId) : [],
  ]);
  const handlerIds = normaliserListeIds([
    ...(estHandler ? [utilisateurId] : []),
    ...rattachements.map((rattachement) => rattachement.handler_id),
  ]);
  const handlerOwnIds = normaliserListeIds(estHandler ? [utilisateurId] : []);
  const handlerProfesseurIds = normaliserListeIds(
    rattachements.map((rattachement) => rattachement.handler_id)
  );
  const professeurIdsHandlerOwn = normaliserListeIds(
    professeursHandler
      .map((rattachement) => rattachement.professeur_id)
      // Une ancienne liaison Handler -> lui-meme ne doit jamais le faire
      // participer a l'agregation de disponibilite de son equipe.
      .filter((professeurId) => Number(professeurId) !== utilisateurId)
  );

  return {
    utilisateurId,
    roles,
    estSuperAdmin: ensembleRoles.has(ROLES.SUPER_ADMIN),
    estHandler,
    estProfesseur,
    handlerIds,
    handlerOwnIds,
    handlerProfesseurIds,
    professeurIdsHandlerOwn,
    // Un Handler est toujours un intervenant possible dans son propre espace,
    // même s'il n'a pas besoin d'un faux compte Professeur.
    intervenantIds: normaliserListeIds([...(estHandler || estProfesseur ? [utilisateurId] : [])]),
  };
}

function construireFiltreLectureSeances(scope) {
  const handlerOwnIds = normaliserListeIds(scope?.handlerOwnIds);
  const handlerProfesseurIds = normaliserListeIds(scope?.handlerProfesseurIds);
  const utilisateurId = normaliserIdentifiant(scope?.utilisateurId);

  if (handlerOwnIds.length > 0 && handlerProfesseurIds.length > 0 && utilisateurId) {
    return {
      handlerIds: normaliserListeIds([...handlerOwnIds, ...handlerProfesseurIds]),
      handlerOwnIds,
      handlerProfesseurIds,
      intervenantId: utilisateurId,
    };
  }

  if (handlerOwnIds.length > 0) {
    return {
      handlerIds: handlerOwnIds,
      intervenantId: null,
    };
  }

  if (handlerProfesseurIds.length > 0 && utilisateurId) {
    return {
      handlerIds: handlerProfesseurIds,
      intervenantId: utilisateurId,
    };
  }

  return {
    handlerIds: [],
    intervenantId: null,
  };
}

async function listerIntervenantsAutorisesHandler(handlerId) {
  const handler = normaliserIdentifiant(handlerId);

  if (!handler) {
    return [];
  }

  const [handlerRoles, rattachements] = await Promise.all([
    listerRolesUtilisateur(handler),
    listerProfesseursActifsHandler(handler),
  ]);
  const handlerEstIntervenant = handlerRoles.includes(ROLES.HANDLER);

  return normaliserListeIds([
    ...(handlerEstIntervenant ? [handler] : []),
    ...rattachements.map((rattachement) => rattachement.professeur_id),
  ]);
}

async function scopePeutAccederHandler(scope, handlerId) {
  const handler = normaliserIdentifiant(handlerId);
  return Boolean(handler && normaliserListeIds(scope?.handlerIds).includes(handler));
}

async function scopePeutGererIntervenant(scope, { handlerId, intervenantId }) {
  const handler = normaliserIdentifiant(handlerId);
  const intervenant = normaliserIdentifiant(intervenantId);

  if (!handler || !intervenant || !(await scopePeutAccederHandler(scope, handler))) {
    return false;
  }

  if (Number(scope?.utilisateurId) === intervenant) {
    return true;
  }

  if (!scope?.estHandler || Number(scope.utilisateurId) !== handler) {
    return false;
  }

  return Boolean(
    await trouverRattachementActif({
      handlerId: handler,
      professeurId: intervenant,
    })
  );
}

module.exports = {
  ROLES,
  normaliserIdentifiant,
  normaliserListeIds,
  normaliserRole,
  normaliserRolesCompte,
  comptePossedeRole,
  listerRolesUtilisateur,
  listerRattachementsActifsProfesseur,
  listerProfesseursActifsHandler,
  listerIntervenantsAutorisesHandler,
  trouverRattachementActif,
  construireScopeAcces,
  construireFiltreLectureSeances,
  scopePeutAccederHandler,
  scopePeutGererIntervenant,
};
