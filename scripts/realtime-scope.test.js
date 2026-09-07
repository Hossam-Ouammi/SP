const assert = require("node:assert/strict");

const {
  ajouterClientTempsReel,
  retirerClientTempsReel,
  fermerFluxTempsReelUtilisateur,
  fermerFluxTempsReelSession,
  fermerFluxTempsReelPublicHandler,
  diffuserMiseAJourApplication,
} = require("../utils/realtime");

function creerReponseFausse() {
  const ecritures = [];

  return {
    writableEnded: false,
    destroyed: false,
    ecritures,
    write(contenu) {
      ecritures.push(contenu);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

function nombreEvenementsApplication(reponse) {
  return reponse.ecritures.filter((contenu) => contenu === "event: app-updated\n").length;
}

function vider(reponse) {
  reponse.ecritures.length = 0;
}

function dernierPayloadApplication(reponse) {
  const donnees = reponse.ecritures
    .filter((contenu) => contenu.startsWith("data: "))
    .map((contenu) => JSON.parse(contenu.slice("data: ".length)));
  return donnees.at(-1) || null;
}

const clients = [];

try {
  const reponseActeur = creerReponseFausse();
  const reponseMemeHandler = creerReponseFausse();
  const reponseMemeIntervenant = creerReponseFausse();
  const reponseAutreEquipe = creerReponseFausse();
  const reponsePublique = creerReponseFausse();
  const reponsePubliqueAutreEquipe = creerReponseFausse();

  clients.push(
    ajouterClientTempsReel({
      res: reponseActeur,
      utilisateurId: 1,
      handlerIds: [10],
      handlerOwnIds: [10],
      intervenantIds: [100],
    }),
    ajouterClientTempsReel({
      res: reponseMemeHandler,
      utilisateurId: 2,
      handlerIds: [10],
      intervenantIds: [200],
    }),
    ajouterClientTempsReel({
      res: reponseMemeIntervenant,
      utilisateurId: 3,
      handlerIds: [10],
      intervenantIds: [100],
    }),
    ajouterClientTempsReel({
      res: reponseAutreEquipe,
      utilisateurId: 4,
      handlerIds: [20],
      intervenantIds: [400],
    }),
    ajouterClientTempsReel({
      res: reponsePublique,
      public: true,
      scopes: ["seances"],
      handlerIds: [10],
    }),
    ajouterClientTempsReel({
      res: reponsePubliqueAutreEquipe,
      public: true,
      scopes: ["seances"],
      handlerIds: [20],
    })
  );

  diffuserMiseAJourApplication({
    scope: "seances",
    actorId: 1,
    handlerId: 10,
    intervenantId: 100,
  });

  assert.equal(nombreEvenementsApplication(reponseActeur), 1);
  assert.equal(nombreEvenementsApplication(reponseMemeHandler), 0);
  assert.equal(nombreEvenementsApplication(reponseMemeIntervenant), 1);
  assert.equal(nombreEvenementsApplication(reponseAutreEquipe), 0);
  assert.equal(nombreEvenementsApplication(reponsePublique), 1);
  assert.equal(nombreEvenementsApplication(reponsePubliqueAutreEquipe), 0);
  assert.equal(
    dernierPayloadApplication(reponseActeur)?.handlerId,
    10,
    "Le Handler doit conserver le contexte complet de son équipe."
  );
  assert.deepEqual(
    Object.keys(dernierPayloadApplication(reponseMemeIntervenant) || {}).sort(),
    ["action", "scope", "timestamp"],
    "Le Professeur ciblé ne doit recevoir qu'un signal de rafraîchissement."
  );
  assert.equal(dernierPayloadApplication(reponseMemeIntervenant)?.actorId, undefined);
  assert.equal(dernierPayloadApplication(reponseMemeIntervenant)?.message, undefined);

  [
    reponseActeur,
    reponseMemeHandler,
    reponseMemeIntervenant,
    reponseAutreEquipe,
    reponsePublique,
    reponsePubliqueAutreEquipe,
  ].forEach(vider);

  diffuserMiseAJourApplication({ scope: "seances", actorId: 1, handlerId: 999 });

  assert.equal(nombreEvenementsApplication(reponseActeur), 0);
  assert.equal(nombreEvenementsApplication(reponseMemeHandler), 0);
  assert.equal(nombreEvenementsApplication(reponseMemeIntervenant), 0);
  assert.equal(nombreEvenementsApplication(reponseAutreEquipe), 0);
  assert.equal(nombreEvenementsApplication(reponsePublique), 0);
  assert.equal(nombreEvenementsApplication(reponsePubliqueAutreEquipe), 0);

  [
    reponseActeur,
    reponseMemeHandler,
    reponseMemeIntervenant,
    reponseAutreEquipe,
    reponsePublique,
    reponsePubliqueAutreEquipe,
  ].forEach(vider);

  diffuserMiseAJourApplication({ scope: "seances", actorId: 1 });

  assert.equal(nombreEvenementsApplication(reponseActeur), 1);
  assert.equal(nombreEvenementsApplication(reponseMemeHandler), 0);
  assert.equal(nombreEvenementsApplication(reponseMemeIntervenant), 0);
  assert.equal(nombreEvenementsApplication(reponseAutreEquipe), 0);
  assert.equal(nombreEvenementsApplication(reponsePublique), 0);
  assert.equal(nombreEvenementsApplication(reponsePubliqueAutreEquipe), 0);

  // Scope may change after a stream has opened (suspension, role removal,
  // Professor transfer). The reusable helper must terminate only the target's
  // private streams, never another user or a public calendar stream.
  const fluxProfesseurAvant = reponseMemeIntervenant.ecritures.length;
  const fluxFerme = fermerFluxTempsReelUtilisateur(3, {
    reason: "access_scope_changed",
  });
  assert.equal(fluxFerme, 1);
  assert.equal(reponseMemeIntervenant.writableEnded, true);
  assert.ok(
    reponseMemeIntervenant.ecritures.some(
      (contenu) => contenu === "event: session-invalidated\n"
    ),
    "Le flux cible doit etre informe avant fermeture."
  );
  assert.ok(
    reponseMemeIntervenant.ecritures.length > fluxProfesseurAvant,
    "La fermeture ciblee doit produire un evenement SSE."
  );
  assert.equal(reponseAutreEquipe.writableEnded, false);
  assert.equal(reponsePublique.writableEnded, false);

  // A logout or a single-session revocation must close only the matching
  // private stream. Other devices for the same account stay connected.
  const reponseSessionCible = creerReponseFausse();
  const reponseSessionAutreAppareil = creerReponseFausse();
  clients.push(
    ajouterClientTempsReel({
      res: reponseSessionCible,
      utilisateurId: 1,
      sessionId: "sid-cible",
      handlerIds: [10],
    }),
    ajouterClientTempsReel({
      res: reponseSessionAutreAppareil,
      utilisateurId: 1,
      sessionId: "sid-autre-appareil",
      handlerIds: [10],
    })
  );
  assert.equal(
    fermerFluxTempsReelSession("sid-cible", { reason: "logout" }),
    1
  );
  assert.equal(reponseSessionCible.writableEnded, true);
  assert.equal(reponseSessionAutreAppareil.writableEnded, false);

  // Rotating or disabling a public link must close the already-open stream
  // associated with its handler, without affecting another public calendar.
  assert.equal(
    fermerFluxTempsReelPublicHandler(10, {
      reason: "public_calendar_link_regenerated",
    }),
    1
  );
  assert.equal(reponsePublique.writableEnded, true);
  assert.equal(reponsePubliqueAutreEquipe.writableEnded, false);

  // Even before the timeout callback has run, an expired private session is
  // removed before an application update can be written to it.
  const reponseSessionExpiree = creerReponseFausse();
  clients.push(
    ajouterClientTempsReel({
      res: reponseSessionExpiree,
      utilisateurId: 1,
      sessionId: "sid-expiree",
      sessionExpiresAt: Date.now() - 1,
      handlerIds: [10],
    })
  );
  diffuserMiseAJourApplication({
    scope: "seances",
    actorId: 999,
    handlerId: 10,
    intervenantId: 100,
  });
  assert.equal(reponseSessionExpiree.writableEnded, true);
  assert.equal(nombreEvenementsApplication(reponseSessionExpiree), 0);

  console.log("realtime-scope.test.js: OK");
} finally {
  clients.forEach(retirerClientTempsReel);
}
