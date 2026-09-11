/*
 * Fixture prive du controle navigateur E2E.
 *
 * Ce script ne sert jamais au runtime : il complete la base temporaire creee
 * par e2e-browser-audit.js apres le bootstrap explicite du Super Admin. Les
 * identifiants sont donc confines a cette base et ne reintroduisent aucun
 * compte ou mot de passe par defaut dans l'application.
 */
const bcrypt = require("bcryptjs");
const {
  initialiserBaseDeDonnees,
  fermerBaseDeDonnees,
  get,
  run,
} = require("../models/db");
const {
  ajouterMatiereHandler,
  trouverMatiereHandlerParLibelle,
  mettreAJourTarifsMatieresHandler,
  obtenirTarifHorairePourSeance,
} = require("../models/tarification-matieres.model");

const utilisateurFixture = {
  nom: "Abdo E2E",
  email: "abdo.e2e@example.test",
  motDePasseInitial: "BootstrapUserE2E!2026",
  publicId: "PR-E2E-ABDO",
};
const matiereFixture = "Maths E2E";
const tarifHoraireFixture = 100;
const instantBaselineTarif = new Date("1970-01-01T00:00:00.000Z");

async function assurerTarifsFixture({ handlerId, professeurId, matiereId }) {
  const realisateurIds = [Number(handlerId), Number(professeurId)];
  const demandesManquantes = [];

  for (const intervenantId of realisateurIds) {
    const tarifCourant = await get(
      `
        SELECT id
        FROM tarifs_realisateur_matiere
        WHERE handler_id = ?
          AND intervenant_id = ?
          AND matiere_id = ?
          AND effectif_jusqua IS NULL
        LIMIT 1
      `,
      [handlerId, intervenantId, matiereId]
    );

    if (!tarifCourant) {
      demandesManquantes.push({
        intervenant_id: intervenantId,
        matiere_id: matiereId,
        tarif_horaire: tarifHoraireFixture,
      });
    }
  }

  if (demandesManquantes.length > 0) {
    await mettreAJourTarifsMatieresHandler(
      handlerId,
      demandesManquantes,
      instantBaselineTarif
    );
  }
}

async function main() {
  const emailHandler = String(process.env.INITIAL_SUPERADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  if (!emailHandler) {
    throw new Error("INITIAL_SUPERADMIN_EMAIL est requis pour le fixture E2E.");
  }

  await initialiserBaseDeDonnees();

  const handler = await get(
    "SELECT id, nom FROM utilisateurs WHERE lower(email) = lower(?) LIMIT 1",
    [emailHandler]
  );

  if (!handler?.id) {
    throw new Error("Le Super Admin E2E bootstrappe est introuvable.");
  }

  const motDePasseHash = await bcrypt.hash(utilisateurFixture.motDePasseInitial, 12);
  const utilisateurExistant = await get(
    "SELECT id FROM utilisateurs WHERE lower(email) = lower(?) LIMIT 1",
    [utilisateurFixture.email]
  );

  let professeurId = Number(utilisateurExistant?.id || 0);

  if (professeurId) {
    await run(
      `
        UPDATE utilisateurs
        SET nom = ?, mot_de_passe = ?, public_id = ?, est_admin = 0,
            acces_active = 1, statut_compte = 'active', session_version = 1,
            doit_changer_mot_de_passe = 1, mot_de_passe_change_at = NULL,
            peut_voir_monetisation = 0, peut_voir_aujourdhui = 1,
            peut_voir_indisponibilites = 1, tarif_horaire = 100
        WHERE id = ?
      `,
      [
        utilisateurFixture.nom,
        motDePasseHash,
        utilisateurFixture.publicId,
        professeurId,
      ]
    );
  } else {
    const insertion = await run(
      `
        INSERT INTO utilisateurs (
          nom, email, mot_de_passe, public_id, est_admin, acces_active,
          statut_compte, session_version, doit_changer_mot_de_passe,
          mot_de_passe_change_at, peut_voir_monetisation, peut_voir_aujourdhui,
          peut_voir_indisponibilites, tarif_horaire
        )
        VALUES (?, ?, ?, ?, 0, 1, 'active', 1, 1, NULL, 0, 1, 1, 100)
      `,
      [
        utilisateurFixture.nom,
        utilisateurFixture.email,
        motDePasseHash,
        utilisateurFixture.publicId,
      ]
    );
    professeurId = Number(insertion.id);
  }

  await run(
    "INSERT OR IGNORE INTO utilisateur_roles (utilisateur_id, role, accorde_par) VALUES (?, 'professeur', ?)",
    [professeurId, handler.id]
  );
  const roleProfesseur = await get(
    "SELECT 1 AS present FROM utilisateur_roles WHERE utilisateur_id = ? AND role = 'professeur'",
    [professeurId]
  );

  if (!roleProfesseur) {
    throw new Error("Le role professeur du fixture E2E n'a pas ete enregistre.");
  }

  const rattachementActif = await get(
    `
      SELECT handler_id
      FROM rattachements_professeurs
      WHERE professeur_id = ? AND actif = 1
      LIMIT 1
    `,
    [professeurId]
  );

  if (rattachementActif && Number(rattachementActif.handler_id) !== Number(handler.id)) {
    throw new Error("Le professeur fixture E2E est deja rattache a un autre Handler actif.");
  }

  if (!rattachementActif) {
    await run(
      `
        INSERT INTO rattachements_professeurs (
          handler_id, professeur_id, actif, cree_par
        )
        VALUES (?, ?, 1, ?)
      `,
      [handler.id, professeurId, handler.id]
    );
  }

  const rattachementFixture = await get(
    `
      SELECT 1 AS present
      FROM rattachements_professeurs
      WHERE handler_id = ? AND professeur_id = ? AND actif = 1
    `,
    [handler.id, professeurId]
  );

  if (!rattachementFixture) {
    throw new Error("Le rattachement actif du fixture E2E n'a pas ete enregistre.");
  }

  let matiere = await trouverMatiereHandlerParLibelle(handler.id, matiereFixture, {
    inclureArchivees: true,
  });
  if (!matiere || Number(matiere.actif) !== 1) {
    matiere = await ajouterMatiereHandler(handler.id, matiereFixture);
  }
  await assurerTarifsFixture({
    handlerId: handler.id,
    professeurId,
    matiereId: matiere.id,
  });

  for (const intervenantId of [handler.id, professeurId]) {
    const tarifResolu = await obtenirTarifHorairePourSeance({
      handlerId: handler.id,
      intervenantId,
      matiere: matiereFixture,
      effectifAu: "2026-03-01T10:00:00.000Z",
    });
    if (tarifResolu !== tarifHoraireFixture) {
      throw new Error(
        "Le fixture E2E ne peut pas creer ses seances : tarif par matiere introuvable."
      );
    }
  }

  // These legacy account labels are retained only for report compatibility.
  // Subject validity and pricing now come exclusively from the Handler-scoped
  // catalogue and the explicit versioned rates above.
  for (const [type, valeur] of [
    ["compte", utilisateurFixture.nom],
    ["compte", String(handler.nom || "Hossam E2E")],
  ]) {
    await run(
      "INSERT OR IGNORE INTO catalogue_options (type, valeur, tarif_horaire) VALUES (?, ?, 0)",
      [type, valeur]
    );
  }

  console.log("e2e-browser-audit-seed: OK");
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fermerBaseDeDonnees().catch(() => {});
  });
