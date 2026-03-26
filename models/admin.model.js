const fsPromises = require("fs/promises");

const { all, get, run } = require("./db");
const {
  listerCatalogueOptions,
  trouverValeurCatalogue,
  ajouterValeurCatalogue,
  trouverValeurCatalogueParId,
  compterUtilisationValeurCatalogue,
  supprimerValeurCatalogueParId,
} = require("./catalogue.model");
const {
  storageUploadsDirectory,
  assurerDossiersScreenshots,
} = require("../utils/screenshot-storage");

function normaliserCleCompte(utilisateur) {
  const email = String(utilisateur?.email || "").trim().toLowerCase();

  if (email === "hossam@test.com") {
    return "hossam";
  }

  if (email === "ami@test.com") {
    return "abdo";
  }

  return `user-${utilisateur?.id || "inconnu"}`;
}

function normaliserUtilisateurAdministration(utilisateur) {
  return {
    ...utilisateur,
    cle: normaliserCleCompte(utilisateur),
  };
}

function parserSessionBrute(sessionEnregistree, sessionCouranteSid) {
  try {
    const sessionData = JSON.parse(sessionEnregistree.sess);
    const utilisateur = sessionData?.utilisateur;

    if (!utilisateur?.id) {
      return null;
    }

    return {
      sid: sessionEnregistree.sid,
      utilisateur_id: Number(utilisateur.id),
      utilisateur_nom: utilisateur.nom || "Utilisateur",
      utilisateur_email: utilisateur.email || "",
      session_courante: sessionEnregistree.sid === sessionCouranteSid,
      adresse_ip: sessionData?.session_meta?.adresse_ip || "-",
      user_agent: sessionData?.session_meta?.user_agent || "-",
      connected_at:
        sessionData?.session_meta?.connected_at ||
        sessionEnregistree.created_at ||
        null,
      updated_at: sessionEnregistree.updated_at,
      expires_at: Number(sessionEnregistree.expires_at || 0),
    };
  } catch (error) {
    return null;
  }
}

async function listerComptesAdministration() {
  const utilisateurs = await all(`
    SELECT
      id,
      nom,
      email,
      est_admin,
      acces_active,
      mode_lecture_seule,
      peut_voir_monetisation,
      peut_voir_aujourdhui,
      peut_voir_indisponibilites,
      doit_changer_mot_de_passe,
      dernier_login_at,
      dernier_login_ip,
      created_at
    FROM utilisateurs
    ORDER BY est_admin DESC, id ASC
  `);

  return utilisateurs.map(normaliserUtilisateurAdministration);
}

async function trouverCompteParId(utilisateurId) {
  const utilisateur = await get(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        doit_changer_mot_de_passe,
        dernier_login_at,
        dernier_login_ip,
        created_at
      FROM utilisateurs
      WHERE id = ?
    `,
    [utilisateurId]
  );

  return utilisateur ? normaliserUtilisateurAdministration(utilisateur) : null;
}

async function trouverCompteParCle(cleCompte) {
  const cle = String(cleCompte || "").trim().toLowerCase();

  if (cle === "hossam") {
    return trouverCompteParEmail("hossam@test.com");
  }

  if (cle === "abdo") {
    return trouverCompteParEmail("ami@test.com");
  }

  if (cle.startsWith("user-")) {
    return trouverCompteParId(cle.replace("user-", ""));
  }

  return null;
}

async function trouverCompteParEmail(email) {
  const utilisateur = await get(
    `
      SELECT
        id,
        nom,
        email,
        est_admin,
        acces_active,
        mode_lecture_seule,
        peut_voir_monetisation,
        peut_voir_aujourdhui,
        peut_voir_indisponibilites,
        doit_changer_mot_de_passe,
        dernier_login_at,
        dernier_login_ip,
        created_at
      FROM utilisateurs
      WHERE lower(email) = lower(?)
    `,
    [email]
  );

  return utilisateur ? normaliserUtilisateurAdministration(utilisateur) : null;
}

async function mettreAJourAccesCompte(utilisateurId, accesActive) {
  return run(
    `
      UPDATE utilisateurs
      SET
        acces_active = ?,
        session_version = session_version + 1,
        echecs_connexion = 0,
        premier_echec_connexion_at = NULL,
        bloque_jusqua = NULL
      WHERE id = ?
    `,
    [accesActive ? 1 : 0, utilisateurId]
  );
}

async function mettreAJourLectureSeuleCompte(utilisateurId, modeLectureSeule) {
  return run(
    `
      UPDATE utilisateurs
      SET mode_lecture_seule = ?
      WHERE id = ?
    `,
    [modeLectureSeule ? 1 : 0, utilisateurId]
  );
}

async function mettreAJourAccesMonetisationCompte(utilisateurId, peutVoirMonetisation) {
  return run(
    `
      UPDATE utilisateurs
      SET peut_voir_monetisation = ?
      WHERE id = ?
    `,
    [peutVoirMonetisation ? 1 : 0, utilisateurId]
  );
}

async function mettreAJourAccesAujourdhuiCompte(utilisateurId, peutVoirAujourdhui) {
  return run(
    `
      UPDATE utilisateurs
      SET peut_voir_aujourdhui = ?
      WHERE id = ?
    `,
    [peutVoirAujourdhui ? 1 : 0, utilisateurId]
  );
}

async function mettreAJourAccesIndisponibilitesCompte(
  utilisateurId,
  peutVoirIndisponibilites
) {
  return run(
    `
      UPDATE utilisateurs
      SET peut_voir_indisponibilites = ?
      WHERE id = ?
    `,
    [peutVoirIndisponibilites ? 1 : 0, utilisateurId]
  );
}

async function listerSessionsActives(sessionCouranteSid) {
  const sessions = await all(
    `
      SELECT sid, sess, expires_at, created_at, updated_at
      FROM sessions
      WHERE expires_at > ?
      ORDER BY updated_at DESC, created_at DESC
    `,
    [Date.now()]
  );

  return sessions
    .map((sessionEnregistree) => parserSessionBrute(sessionEnregistree, sessionCouranteSid))
    .filter(Boolean);
}

async function revoquerSession(sid) {
  return run("DELETE FROM sessions WHERE sid = ?", [sid]);
}

async function revoquerSessionsUtilisateur(utilisateurId, options = {}) {
  const excludeSid = options.excludeSid || null;
  const sessions = await all(
    `
      SELECT sid, sess
      FROM sessions
      WHERE expires_at > ?
    `,
    [Date.now()]
  );

  let totalSupprime = 0;

  for (const sessionEnregistree of sessions) {
    const sessionData = parserSessionBrute(
      {
        ...sessionEnregistree,
        created_at: null,
        updated_at: null,
        expires_at: Date.now() + 1,
      },
      null
    );

    if (!sessionData) {
      continue;
    }

    if (Number(sessionData.utilisateur_id) !== Number(utilisateurId)) {
      continue;
    }

    if (excludeSid && sessionData.sid === excludeSid) {
      continue;
    }

    const resultat = await run("DELETE FROM sessions WHERE sid = ?", [sessionData.sid]);
    totalSupprime += Number(resultat?.changes || 0);
  }

  return totalSupprime;
}

async function supprimerTousLesScreenshotsStockes() {
  await fsPromises.rm(storageUploadsDirectory, { recursive: true, force: true });
  assurerDossiersScreenshots();
}

async function supprimerToutesLesSeances() {
  const resume = await get(`
    SELECT
      (SELECT COUNT(*) FROM seances) AS total_seances,
      (SELECT COUNT(*) FROM photos) AS total_photos
  `);

  await supprimerTousLesScreenshotsStockes();
  await run("DELETE FROM seances");

  return {
    totalSeances: Number(resume?.total_seances || 0),
    totalPhotos: Number(resume?.total_photos || 0),
  };
}

async function supprimerToutHistorique() {
  const resume = await get(`
    SELECT
      (SELECT COUNT(*) FROM historique_actions) AS total_historique,
      (SELECT COUNT(*) FROM journal_auth) AS total_journal_auth
  `);

  await run("DELETE FROM historique_actions");
  await run("DELETE FROM journal_auth");

  return {
    totalHistorique: Number(resume?.total_historique || 0),
    totalJournalAuth: Number(resume?.total_journal_auth || 0),
  };
}

async function recupererCatalogueAdministration() {
  return listerCatalogueOptions();
}

async function trouverElementCatalogue(type, valeur) {
  return trouverValeurCatalogue(type, valeur);
}

async function ajouterElementCatalogue(type, valeur) {
  return ajouterValeurCatalogue(type, valeur);
}

async function trouverElementCatalogueParId(elementId) {
  return trouverValeurCatalogueParId(elementId);
}

async function compterUtilisationElementCatalogue(type, valeur) {
  return compterUtilisationValeurCatalogue(type, valeur);
}

async function supprimerElementCatalogue(elementId) {
  return supprimerValeurCatalogueParId(elementId);
}

async function supprimerUtilisateurAdministration(utilisateurId, utilisateurRemplacementId) {
  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    const totalSessionsSupprimees = await revoquerSessionsUtilisateur(utilisateurId);
    const seancesCreees = await run(
      `
        UPDATE seances
        SET cree_par = ?
        WHERE cree_par = ?
      `,
      [utilisateurRemplacementId, utilisateurId]
    );
    const seancesModifiees = await run(
      `
        UPDATE seances
        SET modifie_par = ?
        WHERE modifie_par = ?
      `,
      [utilisateurRemplacementId, utilisateurId]
    );
    const seancesLegacyDetachees = await run(
      `
        UPDATE seances
        SET utilisateur_id = NULL
        WHERE utilisateur_id = ?
      `,
      [utilisateurId]
    );
    await run(
      `
        UPDATE historique_actions
        SET acteur_id = NULL
        WHERE acteur_id = ?
      `,
      [utilisateurId]
    );
    await run(
      `
        UPDATE journal_auth
        SET utilisateur_id = NULL
        WHERE utilisateur_id = ?
      `,
      [utilisateurId]
    );
    const suppression = await run("DELETE FROM utilisateurs WHERE id = ?", [utilisateurId]);

    await run("COMMIT");

    return {
      totalSessionsSupprimees,
      totalSeancesCreeesReattribuees: Number(seancesCreees?.changes || 0),
      totalSeancesModifieesReattribuees: Number(seancesModifiees?.changes || 0),
      totalSeancesLegacyDetachees: Number(seancesLegacyDetachees?.changes || 0),
      totalUtilisateursSupprimes: Number(suppression?.changes || 0),
    };
  } catch (erreur) {
    await run("ROLLBACK").catch(() => {});
    throw erreur;
  }
}

module.exports = {
  listerComptesAdministration,
  trouverCompteParCle,
  trouverCompteParId,
  mettreAJourAccesCompte,
  mettreAJourLectureSeuleCompte,
  mettreAJourAccesMonetisationCompte,
  mettreAJourAccesAujourdhuiCompte,
  mettreAJourAccesIndisponibilitesCompte,
  listerSessionsActives,
  revoquerSession,
  revoquerSessionsUtilisateur,
  supprimerToutesLesSeances,
  supprimerToutHistorique,
  recupererCatalogueAdministration,
  trouverElementCatalogue,
  trouverElementCatalogueParId,
  ajouterElementCatalogue,
  compterUtilisationElementCatalogue,
  supprimerElementCatalogue,
  supprimerUtilisateurAdministration,
};
