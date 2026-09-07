const crypto = require("crypto");

const { all, get, run, executerTransactionImmediate } = require("./db");
const {
  ROLES,
  normaliserIdentifiant,
  normaliserRole,
} = require("./access-scope.model");

const ROLES_DEMANDE = Object.freeze({
  HANDLER: ROLES.HANDLER,
  PROFESSEUR: ROLES.PROFESSEUR,
});

const STATUTS_DEMANDE = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  ACTIVATED: "activated",
});

const TYPES_TOKEN = Object.freeze({
  ACTIVATION: "activation",
  RESET_PASSWORD: "reset_password",
});

const STATUTS_COMPTE = Object.freeze({
  ACTIF: "active",
  EN_ATTENTE_ACTIVATION: "en_attente_activation",
});

function normaliserTexte(valeur, longueurMax = 0) {
  const texte = String(valeur || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return longueurMax > 0 ? texte.slice(0, longueurMax) : texte;
}

function normaliserEmail(email) {
  return normaliserTexte(email).toLowerCase();
}

function normaliserPublicId(publicId) {
  return normaliserTexte(publicId).toLowerCase();
}

function normaliserRoleDemande(role) {
  const roleNormalise = normaliserRole(role);
  return Object.values(ROLES_DEMANDE).includes(roleNormalise) ? roleNormalise : "";
}

function hacherTokenCompte(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function genererTokenCompteBrut() {
  return crypto.randomBytes(32).toString("base64url");
}

function prefixePublicPourRole(role) {
  if (role === ROLES.HANDLER) {
    return "HD";
  }

  if (role === ROLES.PROFESSEUR) {
    return "PR";
  }

  return "AD";
}

async function genererPublicId(role) {
  const prefixe = prefixePublicPourRole(role);
  const lignes = await all(
    "SELECT public_id FROM utilisateurs WHERE upper(public_id) LIKE ?",
    [`${prefixe}-%`]
  );
  let sequence = 0;

  for (const ligne of lignes) {
    const correspondance = new RegExp(`^${prefixe}-(\\d+)$`, "i").exec(
      String(ligne.public_id || "").trim()
    );

    if (correspondance) {
      sequence = Math.max(sequence, Number(correspondance[1]) || 0);
    }
  }

  return `${prefixe}-${String(sequence + 1).padStart(3, "0")}`;
}

function calculerExpiration(minutes) {
  const dureeMs = Math.max(Number(minutes) || 0, 1) * 60 * 1000;
  return new Date(Date.now() + dureeMs).toISOString();
}

function erreurDomaine(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function estErreurContrainteSqlite(error) {
  return String(error?.code || "").startsWith("SQLITE_CONSTRAINT");
}

function serialiserDemande(demande) {
  if (!demande) {
    return null;
  }

  return {
    id: Number(demande.id),
    nom: demande.nom,
    email: demande.email,
    role_demande: demande.role_demande,
    handler_id: demande.handler_id ? Number(demande.handler_id) : null,
    handler_public_id: demande.handler_public_id || null,
    statut: demande.statut,
    utilisateur_id: demande.utilisateur_id ? Number(demande.utilisateur_id) : null,
    reviewed_by: demande.reviewed_by ? Number(demande.reviewed_by) : null,
    reviewed_at: demande.reviewed_at || null,
    refusal_reason: demande.refusal_reason || null,
    activated_at: demande.activated_at || null,
    created_at: demande.created_at || null,
  };
}

function serialiserUtilisateurCycleCompte(utilisateur) {
  if (!utilisateur) {
    return null;
  }

  return {
    id: Number(utilisateur.id),
    nom: utilisateur.nom,
    email: utilisateur.email,
    public_id: utilisateur.public_id || null,
    statut_compte: utilisateur.statut_compte || null,
    acces_active: Number(utilisateur.acces_active) === 1,
  };
}

async function listerIdentifiantsPublicsHandlers() {
  const lignes = await all(
    `
      SELECT DISTINCT utilisateurs.public_id
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
      WHERE utilisateur_roles.role = ?
        AND utilisateurs.acces_active = 1
        AND utilisateurs.statut_compte = ?
        AND utilisateurs.public_id IS NOT NULL
        AND trim(utilisateurs.public_id) <> ''
      ORDER BY lower(utilisateurs.public_id) ASC
    `,
    [ROLES.HANDLER, STATUTS_COMPTE.ACTIF]
  );

  return lignes.map((ligne) => normaliserTexte(ligne.public_id)).filter(Boolean);
}

async function trouverHandlerActifParPublicId(publicId) {
  const identifiant = normaliserPublicId(publicId);

  if (!identifiant) {
    return null;
  }

  return get(
    `
      SELECT utilisateurs.id, utilisateurs.public_id, utilisateurs.nom, utilisateurs.email
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
      WHERE lower(utilisateurs.public_id) = lower(?)
        AND utilisateur_roles.role = ?
        AND utilisateurs.acces_active = 1
        AND utilisateurs.statut_compte = ?
      LIMIT 1
    `,
    [identifiant, ROLES.HANDLER, STATUTS_COMPTE.ACTIF]
  );
}

async function creerDemandeInscription({ nom, email, roleDemande, handlerId = null }) {
  const nomNormalise = normaliserTexte(nom);
  const emailNormalise = normaliserEmail(email);
  const role = normaliserRoleDemande(roleDemande);
  const handler = normaliserIdentifiant(handlerId);

  if (
    !nomNormalise ||
    nomNormalise.length > 120 ||
    !emailNormalise ||
    emailNormalise.length > 160 ||
    !role
  ) {
    throw erreurDomaine("INVALID_REQUEST", "Demande d'inscription invalide.");
  }

  if ((role === ROLES_DEMANDE.PROFESSEUR && !handler) || (role === ROLES_DEMANDE.HANDLER && handler)) {
    throw erreurDomaine("INVALID_HANDLER", "Handler cible invalide.");
  }

  return executerTransactionImmediate(async () => {
    if (role === ROLES_DEMANDE.PROFESSEUR && !(await handlerEstActif(handler))) {
      throw erreurDomaine("INVALID_HANDLER", "Handler cible invalide.");
    }

    const utilisateurExistant = await get(
      `
        SELECT id
        FROM utilisateurs
        WHERE lower(email) = lower(?)
        LIMIT 1
      `,
      [emailNormalise]
    );

    if (utilisateurExistant) {
      return { creee: false, raison: "email-deja-utilise" };
    }

    const demandeEnAttente = await get(
      `
        SELECT id
        FROM demandes_inscription
        WHERE lower(email) = lower(?)
          AND statut = ?
        LIMIT 1
      `,
      [emailNormalise, STATUTS_DEMANDE.PENDING]
    );

    if (demandeEnAttente) {
      return { creee: false, raison: "demande-deja-en-attente" };
    }

    const insertion = await run(
      `
        INSERT INTO demandes_inscription (
          nom,
          email,
          role_demande,
          handler_id,
          statut,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [nomNormalise, emailNormalise, role, handler, STATUTS_DEMANDE.PENDING]
    );

    return {
      creee: true,
      demande: await trouverDemandeInscriptionParIdInterne(insertion.id),
    };
  });
}

async function trouverDemandeInscriptionParIdInterne(demandeId) {
  const id = normaliserIdentifiant(demandeId);

  if (!id) {
    return null;
  }

  return get(
    `
      SELECT
        demandes_inscription.*,
        handlers.public_id AS handler_public_id
      FROM demandes_inscription
      LEFT JOIN utilisateurs AS handlers ON handlers.id = demandes_inscription.handler_id
      WHERE demandes_inscription.id = ?
      LIMIT 1
    `,
    [id]
  );
}

async function trouverDemandeInscriptionParId(demandeId) {
  return serialiserDemande(await trouverDemandeInscriptionParIdInterne(demandeId));
}

async function listerDemandesInscriptionEnAttente({ estSuperAdmin, handlerId = null }) {
  const handler = normaliserIdentifiant(handlerId);
  let requete = `
    SELECT
      demandes_inscription.*,
      handlers.public_id AS handler_public_id
    FROM demandes_inscription
    LEFT JOIN utilisateurs AS handlers ON handlers.id = demandes_inscription.handler_id
    WHERE demandes_inscription.statut = ?
  `;
  const parametres = [STATUTS_DEMANDE.PENDING];

  if (!estSuperAdmin) {
    if (!handler) {
      return [];
    }

    requete += `
      AND demandes_inscription.role_demande = ?
      AND demandes_inscription.handler_id = ?
    `;
    parametres.push(ROLES_DEMANDE.PROFESSEUR, handler);
  }

  requete += " ORDER BY demandes_inscription.created_at ASC, demandes_inscription.id ASC";

  const lignes = await all(requete, parametres);
  return lignes.map(serialiserDemande);
}

async function creerUtilisateurEnAttenteActivation({ nom, email, motDePasseHash, roleDemande }) {
  const nomNormalise = normaliserTexte(nom);
  const emailNormalise = normaliserEmail(email);

  if (
    !nomNormalise ||
    nomNormalise.length > 120 ||
    !emailNormalise ||
    emailNormalise.length > 160
  ) {
    throw erreurDomaine("INVALID_ACCOUNT", "Compte à activer invalide.");
  }

  const role = normaliserRoleDemande(roleDemande);

  if (!role) {
    throw erreurDomaine("INVALID_ACCOUNT", "Rôle du compte à activer invalide.");
  }

  for (let tentative = 0; tentative < 5; tentative += 1) {
    const publicId = await genererPublicId(role);

    try {
      const insertion = await run(
        `
          INSERT INTO utilisateurs (
            nom,
            email,
            mot_de_passe,
            public_id,
            statut_compte,
            acces_active,
            session_version,
            doit_changer_mot_de_passe,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, 0, 1, 1, CURRENT_TIMESTAMP)
        `,
        [
          nomNormalise,
          emailNormalise,
          motDePasseHash,
          publicId,
          STATUTS_COMPTE.EN_ATTENTE_ACTIVATION,
        ]
      );

      const utilisateur = await get(
        `
          SELECT id, nom, email, public_id, statut_compte, acces_active
          FROM utilisateurs
          WHERE id = ?
        `,
        [insertion.id]
      );

      return utilisateur;
    } catch (error) {
      if (!estErreurContrainteSqlite(error)) {
        throw error;
      }

      const emailExistant = await get(
        "SELECT id FROM utilisateurs WHERE lower(email) = lower(?) LIMIT 1",
        [emailNormalise]
      );

      if (emailExistant) {
        throw erreurDomaine("EMAIL_ALREADY_USED", "Un compte utilise déjà cet email.");
      }

      const publicIdExistant = await get(
        "SELECT id FROM utilisateurs WHERE lower(public_id) = lower(?) LIMIT 1",
        [publicId]
      );

      if (!publicIdExistant) {
        throw error;
      }
    }
  }

  throw erreurDomaine("PUBLIC_ID_GENERATION_FAILED", "Impossible de générer un identifiant public.");
}

async function creerTokenCompte({ utilisateurId, demandeId = null, type, expiresInMinutes }) {
  const utilisateur = normaliserIdentifiant(utilisateurId);
  const demande = demandeId === null ? null : normaliserIdentifiant(demandeId);
  const typeNormalise = String(type || "").trim().toLowerCase();

  if (!utilisateur || !Object.values(TYPES_TOKEN).includes(typeNormalise)) {
    throw erreurDomaine("INVALID_TOKEN_CONTEXT", "Contexte de jeton invalide.");
  }

  const expiresAt = calculerExpiration(expiresInMinutes);

  for (let tentative = 0; tentative < 5; tentative += 1) {
    const token = genererTokenCompteBrut();
    const tokenHash = hacherTokenCompte(token);

    try {
      await run(
        `
          INSERT INTO tokens_compte (
            utilisateur_id,
            demande_id,
            type,
            token_hash,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [utilisateur, demande, typeNormalise, tokenHash, expiresAt]
      );

      return {
        token,
        expiresAt,
      };
    } catch (error) {
      if (!estErreurContrainteSqlite(error)) {
        throw error;
      }

      const collision = await get(
        "SELECT id FROM tokens_compte WHERE token_hash = ? LIMIT 1",
        [tokenHash]
      );

      if (!collision) {
        throw error;
      }
    }
  }

  throw erreurDomaine("TOKEN_GENERATION_FAILED", "Impossible de générer un jeton de compte.");
}

async function revoquerJetonsActifs({ utilisateurId = null, demandeId = null, type }) {
  const utilisateur = utilisateurId === null ? null : normaliserIdentifiant(utilisateurId);
  const demande = demandeId === null ? null : normaliserIdentifiant(demandeId);
  const typeNormalise = String(type || "").trim().toLowerCase();

  if (!Object.values(TYPES_TOKEN).includes(typeNormalise) || (!utilisateur && !demande)) {
    return { changes: 0 };
  }

  const conditions = ["type = ?", "used_at IS NULL", "revoked_at IS NULL"];
  const parametres = [typeNormalise];

  if (utilisateur) {
    conditions.push("utilisateur_id = ?");
    parametres.push(utilisateur);
  }

  if (demande) {
    conditions.push("demande_id = ?");
    parametres.push(demande);
  }

  return run(
    `
      UPDATE tokens_compte
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE ${conditions.join(" AND ")}
    `,
    parametres
  );
}

async function handlerEstActif(handlerId) {
  const handler = normaliserIdentifiant(handlerId);

  if (!handler) {
    return false;
  }

  const resultat = await get(
    `
      SELECT 1 AS existe
      FROM utilisateurs
      INNER JOIN utilisateur_roles
        ON utilisateur_roles.utilisateur_id = utilisateurs.id
      WHERE utilisateurs.id = ?
        AND utilisateur_roles.role = ?
        AND utilisateurs.acces_active = 1
        AND utilisateurs.statut_compte = ?
      LIMIT 1
    `,
    [handler, ROLES.HANDLER, STATUTS_COMPTE.ACTIF]
  );

  return Boolean(resultat);
}

async function approuverDemandeInscription({
  demandeId,
  reviewedBy,
  motDePasseInutilisableHash,
  activationTokenTtlMinutes,
}) {
  const id = normaliserIdentifiant(demandeId);
  const reviewer = normaliserIdentifiant(reviewedBy);

  if (!id || !reviewer || !motDePasseInutilisableHash) {
    throw erreurDomaine("INVALID_APPROVAL", "Approbation invalide.");
  }

  return executerTransactionImmediate(async () => {
    const demande = await trouverDemandeInscriptionParIdInterne(id);

    if (!demande || demande.statut !== STATUTS_DEMANDE.PENDING) {
      return null;
    }

    if (
      demande.role_demande === ROLES_DEMANDE.PROFESSEUR &&
      !(await handlerEstActif(demande.handler_id))
    ) {
      throw erreurDomaine("HANDLER_INACTIVE", "Le Handler cible n'est plus actif.");
    }

    const utilisateur = await creerUtilisateurEnAttenteActivation({
      nom: demande.nom,
      email: demande.email,
      motDePasseHash: motDePasseInutilisableHash,
      roleDemande: demande.role_demande,
    });

    await run(
      `
        INSERT INTO utilisateur_roles (utilisateur_id, role, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `,
      [utilisateur.id, demande.role_demande]
    );

    if (demande.role_demande === ROLES_DEMANDE.PROFESSEUR) {
      await run(
        `
          INSERT INTO rattachements_professeurs (
            handler_id,
            professeur_id,
            actif,
            debut_at,
            created_at
          )
          VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [demande.handler_id, utilisateur.id]
      );
    }

    const miseAJourDemande = await run(
      `
        UPDATE demandes_inscription
        SET
          statut = ?,
          utilisateur_id = ?,
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          refusal_reason = NULL
        WHERE id = ?
          AND statut = ?
      `,
      [
        STATUTS_DEMANDE.APPROVED,
        utilisateur.id,
        reviewer,
        demande.id,
        STATUTS_DEMANDE.PENDING,
      ]
    );

    if (Number(miseAJourDemande?.changes || 0) !== 1) {
      throw erreurDomaine("REQUEST_STATE_CHANGED", "La demande a été modifiée entre-temps.");
    }

    await revoquerJetonsActifs({
      utilisateurId: utilisateur.id,
      demandeId: demande.id,
      type: TYPES_TOKEN.ACTIVATION,
    });
    const activation = await creerTokenCompte({
      utilisateurId: utilisateur.id,
      demandeId: demande.id,
      type: TYPES_TOKEN.ACTIVATION,
      expiresInMinutes: activationTokenTtlMinutes,
    });

    return {
      demande: serialiserDemande({
        ...demande,
        statut: STATUTS_DEMANDE.APPROVED,
        utilisateur_id: utilisateur.id,
        reviewed_by: reviewer,
      }),
      utilisateur: serialiserUtilisateurCycleCompte(utilisateur),
      activationToken: activation.token,
      activationExpiresAt: activation.expiresAt,
    };
  });
}

async function refuserDemandeInscription({ demandeId, reviewedBy, raison = "" }) {
  const id = normaliserIdentifiant(demandeId);
  const reviewer = normaliserIdentifiant(reviewedBy);

  if (!id || !reviewer) {
    throw erreurDomaine("INVALID_REJECTION", "Refus invalide.");
  }

  return executerTransactionImmediate(async () => {
    const demande = await trouverDemandeInscriptionParIdInterne(id);

    if (!demande || demande.statut !== STATUTS_DEMANDE.PENDING) {
      return null;
    }

    const miseAJour = await run(
      `
        UPDATE demandes_inscription
        SET
          statut = ?,
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          refusal_reason = ?
        WHERE id = ?
          AND statut = ?
      `,
      [
        STATUTS_DEMANDE.REJECTED,
        reviewer,
        normaliserTexte(raison, 300) || null,
        id,
        STATUTS_DEMANDE.PENDING,
      ]
    );

    if (Number(miseAJour?.changes || 0) !== 1) {
      return null;
    }

    return serialiserDemande({
      ...demande,
      statut: STATUTS_DEMANDE.REJECTED,
      reviewed_by: reviewer,
      refusal_reason: normaliserTexte(raison, 300) || null,
    });
  });
}

async function creerNouveauJetonActivationPourDemande({
  demandeId,
  activationTokenTtlMinutes,
}) {
  const id = normaliserIdentifiant(demandeId);

  if (!id) {
    throw erreurDomaine("INVALID_REQUEST", "Demande invalide.");
  }

  return executerTransactionImmediate(async () => {
    const demande = await trouverDemandeInscriptionParIdInterne(id);

    if (!demande || demande.statut !== STATUTS_DEMANDE.APPROVED || !demande.utilisateur_id) {
      return null;
    }

    const utilisateur = await get(
      `
        SELECT id, nom, email, public_id, statut_compte, acces_active
        FROM utilisateurs
        WHERE id = ?
          AND acces_active = 0
          AND statut_compte = ?
        LIMIT 1
      `,
      [demande.utilisateur_id, STATUTS_COMPTE.EN_ATTENTE_ACTIVATION]
    );

    if (!utilisateur) {
      return null;
    }

    await revoquerJetonsActifs({
      utilisateurId: utilisateur.id,
      demandeId: demande.id,
      type: TYPES_TOKEN.ACTIVATION,
    });
    const activation = await creerTokenCompte({
      utilisateurId: utilisateur.id,
      demandeId: demande.id,
      type: TYPES_TOKEN.ACTIVATION,
      expiresInMinutes: activationTokenTtlMinutes,
    });

    return {
      demande: serialiserDemande(demande),
      utilisateur: serialiserUtilisateurCycleCompte(utilisateur),
      activationToken: activation.token,
      activationExpiresAt: activation.expiresAt,
    };
  });
}

async function creerJetonReinitialisationMotDePasse({ identifiant, expiresInMinutes }) {
  const valeur = normaliserTexte(identifiant);

  if (!valeur || valeur.length > 160) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const utilisateur = await get(
      `
        SELECT id, nom, email, public_id, statut_compte, acces_active
        FROM utilisateurs
        WHERE (lower(email) = lower(?) OR lower(public_id) = lower(?))
          AND acces_active = 1
          AND statut_compte = ?
        LIMIT 1
      `,
      [valeur, valeur, STATUTS_COMPTE.ACTIF]
    );

    if (!utilisateur) {
      return null;
    }

    await revoquerJetonsActifs({
      utilisateurId: utilisateur.id,
      type: TYPES_TOKEN.RESET_PASSWORD,
    });
    const reset = await creerTokenCompte({
      utilisateurId: utilisateur.id,
      type: TYPES_TOKEN.RESET_PASSWORD,
      expiresInMinutes,
    });

    return {
      utilisateur: serialiserUtilisateurCycleCompte(utilisateur),
      resetToken: reset.token,
      resetExpiresAt: reset.expiresAt,
    };
  });
}

async function trouverJetonActif(type, tokenHash) {
  return get(
    `
      SELECT
        tokens_compte.id AS token_id,
        tokens_compte.utilisateur_id,
        tokens_compte.demande_id,
        utilisateurs.nom,
        utilisateurs.email,
        utilisateurs.public_id,
        utilisateurs.statut_compte,
        utilisateurs.acces_active
      FROM tokens_compte
      INNER JOIN utilisateurs ON utilisateurs.id = tokens_compte.utilisateur_id
      WHERE tokens_compte.type = ?
        AND tokens_compte.token_hash = ?
        AND tokens_compte.used_at IS NULL
        AND tokens_compte.revoked_at IS NULL
        AND julianday(tokens_compte.expires_at) > julianday('now')
      LIMIT 1
    `,
    [type, tokenHash]
  );
}

async function activerCompteAvecJeton({ token, motDePasseHash }) {
  const tokenHash = hacherTokenCompte(token);

  if (!token || !motDePasseHash) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const jeton = await trouverJetonActif(TYPES_TOKEN.ACTIVATION, tokenHash);

    if (
      !jeton ||
      jeton.statut_compte !== STATUTS_COMPTE.EN_ATTENTE_ACTIVATION ||
      Number(jeton.acces_active) !== 0
    ) {
      return null;
    }

    const miseAJourUtilisateur = await run(
      `
        UPDATE utilisateurs
        SET
          mot_de_passe = ?,
          acces_active = 1,
          statut_compte = ?,
          doit_changer_mot_de_passe = 0,
          mot_de_passe_change_at = CURRENT_TIMESTAMP,
          session_version = COALESCE(session_version, 0) + 1,
          echecs_connexion = 0,
          premier_echec_connexion_at = NULL,
          bloque_jusqua = NULL
        WHERE id = ?
          AND acces_active = 0
          AND statut_compte = ?
      `,
      [
        motDePasseHash,
        STATUTS_COMPTE.ACTIF,
        jeton.utilisateur_id,
        STATUTS_COMPTE.EN_ATTENTE_ACTIVATION,
      ]
    );

    if (Number(miseAJourUtilisateur?.changes || 0) !== 1) {
      return null;
    }

    await run(
      `
        UPDATE tokens_compte
        SET used_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
      `,
      [jeton.token_id]
    );
    await revoquerJetonsActifs({
      utilisateurId: jeton.utilisateur_id,
      type: TYPES_TOKEN.ACTIVATION,
    });

    if (jeton.demande_id) {
      await run(
        `
          UPDATE demandes_inscription
          SET
            statut = ?,
            activated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND statut = ?
        `,
        [STATUTS_DEMANDE.ACTIVATED, jeton.demande_id, STATUTS_DEMANDE.APPROVED]
      );
    }

    return serialiserUtilisateurCycleCompte({
      id: jeton.utilisateur_id,
      nom: jeton.nom,
      email: jeton.email,
      public_id: jeton.public_id,
      statut_compte: STATUTS_COMPTE.ACTIF,
      acces_active: 1,
    });
  });
}

async function reinitialiserMotDePasseAvecJeton({ token, motDePasseHash }) {
  const tokenHash = hacherTokenCompte(token);

  if (!token || !motDePasseHash) {
    return null;
  }

  return executerTransactionImmediate(async () => {
    const jeton = await trouverJetonActif(TYPES_TOKEN.RESET_PASSWORD, tokenHash);

    if (
      !jeton ||
      jeton.statut_compte !== STATUTS_COMPTE.ACTIF ||
      Number(jeton.acces_active) !== 1
    ) {
      return null;
    }

    const miseAJourUtilisateur = await run(
      `
        UPDATE utilisateurs
        SET
          mot_de_passe = ?,
          doit_changer_mot_de_passe = 0,
          mot_de_passe_change_at = CURRENT_TIMESTAMP,
          session_version = COALESCE(session_version, 0) + 1,
          echecs_connexion = 0,
          premier_echec_connexion_at = NULL,
          bloque_jusqua = NULL
        WHERE id = ?
          AND acces_active = 1
          AND statut_compte = ?
      `,
      [motDePasseHash, jeton.utilisateur_id, STATUTS_COMPTE.ACTIF]
    );

    if (Number(miseAJourUtilisateur?.changes || 0) !== 1) {
      return null;
    }

    await run(
      `
        UPDATE tokens_compte
        SET used_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
      `,
      [jeton.token_id]
    );
    await revoquerJetonsActifs({
      utilisateurId: jeton.utilisateur_id,
      type: TYPES_TOKEN.RESET_PASSWORD,
    });

    return serialiserUtilisateurCycleCompte({
      id: jeton.utilisateur_id,
      nom: jeton.nom,
      email: jeton.email,
      public_id: jeton.public_id,
      statut_compte: STATUTS_COMPTE.ACTIF,
      acces_active: 1,
    });
  });
}

module.exports = {
  ROLES_DEMANDE,
  STATUTS_DEMANDE,
  TYPES_TOKEN,
  STATUTS_COMPTE,
  normaliserTexte,
  normaliserEmail,
  normaliserPublicId,
  normaliserRoleDemande,
  hacherTokenCompte,
  genererTokenCompteBrut,
  listerIdentifiantsPublicsHandlers,
  trouverHandlerActifParPublicId,
  creerDemandeInscription,
  trouverDemandeInscriptionParId,
  listerDemandesInscriptionEnAttente,
  approuverDemandeInscription,
  refuserDemandeInscription,
  creerNouveauJetonActivationPourDemande,
  creerJetonReinitialisationMotDePasse,
  activerCompteAvecJeton,
  reinitialiserMotDePasseAvecJeton,
};
