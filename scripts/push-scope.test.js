const assert = require("node:assert/strict");

const {
  utilisateurPeutRecevoirEvenementApplication,
  filtrerDonneesRappelParScope,
  indisponibiliteChevaucheSeance,
} = require("../utils/push-notifications");

function abonnement(utilisateurId, overrides = {}) {
  return {
    utilisateur_id: utilisateurId,
    acces_active: 1,
    statut_compte: "active",
    doit_changer_mot_de_passe: 0,
    ...overrides,
  };
}

const scopeHandler10 = {
  utilisateurId: 10,
  estHandler: true,
  estProfesseur: false,
  estSuperAdmin: false,
  handlerOwnIds: [10],
  handlerProfesseurIds: [],
};
const scopeProf101 = {
  utilisateurId: 101,
  estHandler: false,
  estProfesseur: true,
  estSuperAdmin: false,
  handlerOwnIds: [],
  handlerProfesseurIds: [10],
};
const scopeProf102 = {
  utilisateurId: 102,
  estHandler: false,
  estProfesseur: true,
  estSuperAdmin: false,
  handlerOwnIds: [],
  handlerProfesseurIds: [10],
};
const scopeHandler20 = {
  utilisateurId: 20,
  estHandler: true,
  estProfesseur: false,
  estSuperAdmin: false,
  handlerOwnIds: [20],
  handlerProfesseurIds: [],
};
const scopeSuperAdmin = {
  utilisateurId: 1,
  estHandler: false,
  estProfesseur: false,
  estSuperAdmin: true,
  handlerOwnIds: [],
  handlerProfesseurIds: [],
};

const evenementCible = {
  action: "seance_updated",
  actorId: 999,
  handlerId: 10,
  intervenantId: 101,
};

assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(10), scopeHandler10, evenementCible),
  true
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(101), scopeProf101, evenementCible),
  true
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(102), scopeProf102, evenementCible),
  false
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(20), scopeHandler20, evenementCible),
  false
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(1), scopeSuperAdmin, evenementCible),
  false
);

// Sans paire Handler/intervenant complete, la notification ne peut viser que
// son auteur, meme si un autre abonnement a un role global.
const evenementSansCible = { action: "seance_updated", actorId: 101, handlerId: 10 };
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(101), scopeProf101, evenementSansCible),
  true
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(10), scopeHandler10, evenementSansCible),
  false
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(abonnement(1), scopeSuperAdmin, evenementSansCible),
  false
);
assert.equal(
  utilisateurPeutRecevoirEvenementApplication(
    abonnement(101, { statut_compte: "suspendu" }),
    scopeProf101,
    evenementCible
  ),
  false
);

const seances = [
  { id: 1, handler_id: 10, intervenant_id: 101 },
  { id: 2, handler_id: 10, intervenant_id: 102 },
  { id: 3, handler_id: 10, intervenant_id: null },
  { id: 4, handler_id: 20, intervenant_id: 201 },
];
const indisponibilites = [
  { id: 11, handler_id: 10, intervenant_id: 101 },
  { id: 12, handler_id: 10, intervenant_id: 102 },
  { id: 13, handler_id: 10, intervenant_id: null },
  { id: 14, handler_id: 20, intervenant_id: 201 },
];

const ids = (lignes) => lignes.map((ligne) => ligne.id);
assert.deepEqual(ids(filtrerDonneesRappelParScope(scopeHandler10, seances).seances), [1, 2, 3]);
assert.deepEqual(ids(filtrerDonneesRappelParScope(scopeProf101, seances).seances), [1]);
assert.deepEqual(ids(filtrerDonneesRappelParScope(scopeProf102, seances).seances), [2]);
assert.deepEqual(ids(filtrerDonneesRappelParScope(scopeHandler20, seances).seances), [4]);
assert.deepEqual(
  ids(filtrerDonneesRappelParScope(scopeProf101, seances, indisponibilites).indisponibilites),
  [11]
);
assert.deepEqual(
  ids(filtrerDonneesRappelParScope(scopeSuperAdmin, seances, indisponibilites).indisponibilites),
  []
);

const seanceProf101 = {
  date: "2026-09-07",
  heure_debut: "10:00",
  heure_fin: "11:00",
  handler_id: 10,
  intervenant_id: 101,
};
assert.equal(
  indisponibiliteChevaucheSeance(
    {
      date: "2026-09-07",
      heure_debut: "10:00",
      heure_fin: "11:00",
      handler_id: 10,
      intervenant_id: 102,
    },
    seanceProf101
  ),
  false
);
assert.equal(
  indisponibiliteChevaucheSeance(
    {
      date: "2026-09-07",
      heure_debut: "10:00",
      heure_fin: "11:00",
      handler_id: 10,
      intervenant_id: 101,
    },
    seanceProf101
  ),
  true
);

console.log("push-scope.test.js: OK");
