const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const databasePath = path.join(
  os.tmpdir(),
  `sp-professor-multi-team-${process.pid}-${Date.now()}.db`
);
process.env.DATABASE_PATH = databasePath;

const { initialiserBaseDeDonnees, fermerBaseDeDonnees, run, get } = require("../models/db");
const { construireScopeAcces } = require("../models/access-scope.model");
const {
  listerSeancesScopees,
  listerSeancesPourMonetisationScopees,
} = require("../models/seance.model");
const {
  listerEquipesDisponibles, creerDemandeRattachement,
  listerDemandesHandler, traiterDemandeRattachement,
} = require("../models/team-membership.model");
const { retirerProfesseurEquipe } = require("../models/equipe.model");
const { resoudreAffectationSeance } = require("../controllers/seances.controller");

async function user(nom, email, role) {
  const result = await run(`INSERT INTO utilisateurs
    (nom,email,mot_de_passe,statut_compte,acces_active,tarif_horaire)
    VALUES (?,?,'hash','active',1,90)`, [nom, email]);
  await run("INSERT INTO utilisateur_roles (utilisateur_id,role) VALUES (?,?)", [result.id, role]);
  return Number(result.id);
}

(async () => {
  try {
    await initialiserBaseDeDonnees();
    const h1 = await user("Equipe A", "a@example.test", "handler");
    const h2 = await user("Equipe B", "b@example.test", "handler");
    const p = await user("Professeur", "p@example.test", "professeur");
    await run("INSERT INTO rattachements_professeurs (handler_id,professeur_id,actif) VALUES (?,?,1)", [h1, p]);
    assert.deepEqual((await listerEquipesDisponibles(p)).map((x) => Number(x.id)), [h2]);
    const demande = await creerDemandeRattachement({ professeurId: p, handlerId: h2, description: "Je souhaite rejoindre cette equipe." });
    assert.equal((await listerDemandesHandler(h2)).length, 1);
    await traiterDemandeRattachement({ demandeId: demande.id, handlerId: h2, reviewerId: h2, accepter: true });
    const scope = await construireScopeAcces({ id: p });
    assert.deepEqual(scope.handlerProfesseurIds, [h1, h2]);

    const demandeHandler = await creerDemandeRattachement({
      professeurId: h1,
      handlerId: h2,
      description: "Je rejoins cette equipe comme intervenant.",
    });
    await traiterDemandeRattachement({
      demandeId: demandeHandler.id,
      handlerId: h2,
      reviewerId: h2,
      accepter: true,
    });
    assert.equal(Number((await get(
      "SELECT COUNT(*) AS total FROM utilisateur_roles WHERE utilisateur_id = ? AND role = 'professeur'",
      [h1]
    )).total), 1);
    const scopeHandlerIntervenant = await construireScopeAcces({ id: h1 });
    assert.deepEqual(scopeHandlerIntervenant.handlerOwnIds, [h1]);
    assert.deepEqual(scopeHandlerIntervenant.handlerProfesseurIds, [h2]);

    assert.deepEqual(await resoudreAffectationSeance({
      scope: scopeHandlerIntervenant,
      acteur: { id: h1 },
      donneesSeance: { handler_id: h2, intervenant_id: h1 },
    }), { handler_id: h2, intervenant_id: h1 });
    await assert.rejects(
      resoudreAffectationSeance({
        scope: scopeHandlerIntervenant,
        acteur: { id: h1 },
        donneesSeance: { handler_id: h2, intervenant_id: p },
      }),
      (error) => Number(error?.status) === 404
    );
    assert.deepEqual(await resoudreAffectationSeance({
      scope,
      acteur: { id: p },
      donneesSeance: { handler_id: h2, intervenant_id: p },
    }), { handler_id: h2, intervenant_id: p });

    for (const [handlerId, intervenantId, etudiant] of [
      [h1, h1, "Propre Handler"],
      [h1, p, "Professeur de son equipe"],
      [h2, h1, "Handler intervenant externe"],
      [h2, p, "Autre intervenant externe"],
    ]) {
      await run(`INSERT INTO seances
        (etudiant, matiere, date, heure_debut, heure_fin, duree_minutes,
         statut_seance, handler_id, intervenant_id, tarif_horaire_applique)
        VALUES (?, 'Maths', '2026-09-01', '10:00', '11:00', 60,
                'faite', ?, ?, 90)`, [etudiant, handlerId, intervenantId]);
    }

    const filtre = {
      handlerIds: scopeHandlerIntervenant.handlerIds,
      handlerOwnIds: scopeHandlerIntervenant.handlerOwnIds,
      handlerProfesseurIds: scopeHandlerIntervenant.handlerProfesseurIds,
      intervenantId: h1,
    };
    const statistiques = await listerSeancesScopees(filtre);
    const monetisation = await listerSeancesPourMonetisationScopees(filtre);
    assert.deepEqual(statistiques.map((x) => x.etudiant).sort(), [
      "Handler intervenant externe", "Professeur de son equipe", "Propre Handler",
    ]);
    assert.deepEqual(monetisation.map((x) => x.etudiant).sort(), [
      "Handler intervenant externe", "Professeur de son equipe", "Propre Handler",
    ]);

    const professeurRetire = await retirerProfesseurEquipe(h1, p);
    assert.equal(Number(professeurRetire.id), p);
    const scopeApresRetrait = await construireScopeAcces({ id: p });
    assert.deepEqual(
      scopeApresRetrait.handlerProfesseurIds,
      [h2],
      "Le retrait doit fermer uniquement le rattachement de cette équipe."
    );
    console.log("professor multi-team test: PASS");
  } finally { await fermerBaseDeDonnees(); }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});
