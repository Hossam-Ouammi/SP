const {
  listerPropositionsSeances,
  trouverPropositionSeanceParId,
  creerPropositionSeance,
  mettreAJourPropositionSeance,
  marquerPropositionSeanceAcceptee,
  marquerPropositionSeanceRefusee,
} = require("../models/proposition-seance.model");
const {
  creerIndisponibilite,
  listerIndisponibilitesChevauchantes,
  supprimerIndisponibilite,
  trouverIndisponibiliteChevauchante,
} = require("../models/indisponibilite.model");
const { trouverSeanceParId } = require("../models/seance.model");
const { executerTransactionImmediate } = require("../models/db");
const {
  preparerDonneesSeance,
  validerDonneesSeance,
  transformerSeancePourClientSelonUtilisateur,
  utilisateurPeutVoirCompteHossam,
  verifierAbsenceConflitSeance,
  creerSeanceDepuisDonneesValidees,
  modifierSeanceDepuisDonneesValidees,
  statutsCreationValides,
} = require("./seances.controller");

function creerErreurHttp(status, message) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function normaliserIdentifiantOptionnel(valeur, libelle) {
  if (valeur === undefined || valeur === null || valeur === "") {
    return null;
  }

  if (!estIdentifiantValide(valeur)) {
    throw creerErreurHttp(400, `${libelle} invalide.`);
  }

  return Number(valeur);
}

function seanceEstCompteHossam(seance) {
  return String(seance?.compte || "").trim().toLowerCase() === "hossam";
}

async function recupererSeanceSourceProposition(corps, utilisateur) {
  const seanceSourceId = normaliserIdentifiantOptionnel(
    corps?.seance_source_id ?? corps?.seanceSourceId,
    "Identifiant de séance source"
  );

  if (!seanceSourceId) {
    return null;
  }

  const seanceSource = await trouverSeanceParId(seanceSourceId);

  if (!seanceSource) {
    throw creerErreurHttp(404, "Seance source introuvable.");
  }

  if (!utilisateurPeutVoirCompteHossam(utilisateur) && seanceEstCompteHossam(seanceSource)) {
    throw creerErreurHttp(
      403,
      "Seul l'administrateur peut proposer le déplacement d'une séance du compte Hossam."
    );
  }

  return seanceSource;
}

function convertirHeureEnMinutes(heure) {
  if (heure === "24:00") {
    return 24 * 60;
  }

  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function convertirMinutesEnHeure(minutesTotales) {
  const heures = String(Math.floor(minutesTotales / 60)).padStart(2, "0");
  const minutes = String(minutesTotales % 60).padStart(2, "0");
  return `${heures}:${minutes}`;
}

function verifierPropositionEnAttente(proposition) {
  if (!proposition) {
    throw creerErreurHttp(404, "Proposition introuvable.");
  }

  if (proposition.statut !== "en_attente") {
    throw creerErreurHttp(400, "Cette proposition a déjà été traitée.");
  }
}

function preparerDonneesDepuisProposition(proposition, corps = {}) {
  return preparerDonneesSeance({
    etudiant: corps.etudiant ?? proposition.etudiant,
    parent: corps.parent ?? proposition.parent,
    matiere: corps.matiere ?? proposition.matiere,
    compte: corps.compte ?? proposition.compte,
    est_essai: corps.est_essai ?? proposition.est_essai,
    date: corps.date ?? proposition.date,
    heure_debut: corps.heure_debut ?? proposition.heure_debut,
    duree_minutes: corps.duree_minutes ?? proposition.duree_minutes,
    statut_seance: corps.statut_seance ?? proposition.statut_seance,
    description: corps.description ?? proposition.description,
  });
}

function transformerPropositionPourClient(proposition) {
  if (!proposition) {
    return proposition;
  }

  return {
    ...proposition,
    est_essai: Number(proposition.est_essai) === 1,
    jour_complet_indisponibilite: Number(proposition.indisponibilite_jour_complet) === 1,
  };
}

async function validerPropositionCommeCreation(donneesSeance, utilisateur, options = {}) {
  const erreurs = await validerDonneesSeance(donneesSeance, utilisateur, options);

  if (!statutsCreationValides.includes(donneesSeance.statut_seance)) {
    erreurs.push("À la création, le statut doit être planifiée ou faite.");
  }

  return erreurs;
}

async function recupererConflitIndisponibiliteObligatoire(donneesSeance) {
  const conflit = await trouverIndisponibiliteChevauchante({
    date: donneesSeance.date,
    heureDebut: donneesSeance.heure_debut,
    heureFin: donneesSeance.heure_fin,
  });

  if (!conflit) {
    throw creerErreurHttp(
      400,
      "Ce créneau n'est plus bloqué. La séance peut être créée normalement."
    );
  }

  return conflit;
}

function construireFragmentsIndisponibilite(indisponibilite, donneesSeance) {
  const debutBloc = convertirHeureEnMinutes(indisponibilite.heure_debut);
  const finBloc = convertirHeureEnMinutes(indisponibilite.heure_fin);
  const debutSeance = convertirHeureEnMinutes(donneesSeance.heure_debut);
  const finSeance = convertirHeureEnMinutes(donneesSeance.heure_fin);

  if (debutBloc >= finBloc || debutSeance >= finSeance) {
    return [];
  }

  if (debutBloc >= finSeance || finBloc <= debutSeance) {
    return [];
  }

  const fragments = [];

  if (debutBloc < debutSeance) {
    fragments.push({
      heureDebut: indisponibilite.heure_debut,
      heureFin: convertirMinutesEnHeure(Math.min(debutSeance, finBloc)),
    });
  }

  if (finSeance < finBloc) {
    fragments.push({
      heureDebut: convertirMinutesEnHeure(Math.max(finSeance, debutBloc)),
      heureFin: indisponibilite.heure_fin,
    });
  }

  return fragments.filter(
    (fragment) =>
      convertirHeureEnMinutes(fragment.heureFin) > convertirHeureEnMinutes(fragment.heureDebut)
  );
}

async function decouperIndisponibilitesAutourSeance(donneesSeance) {
  const indisponibilites = await listerIndisponibilitesChevauchantes({
    date: donneesSeance.date,
    heureDebut: donneesSeance.heure_debut,
    heureFin: donneesSeance.heure_fin,
  });

  for (const indisponibilite of indisponibilites) {
    const fragments = construireFragmentsIndisponibilite(indisponibilite, donneesSeance);

    await supprimerIndisponibilite(indisponibilite.id);

    for (const fragment of fragments) {
      await creerIndisponibilite({
        date: indisponibilite.date,
        heureDebut: fragment.heureDebut,
        heureFin: fragment.heureFin,
        jourComplet: 0,
        raison: "",
        creePar: indisponibilite.cree_par || null,
      });
    }
  }
}

async function recupererPropositionsSeances(req, res) {
  const propositions = await listerPropositionsSeances({ statut: "en_attente" });
  return res.json({
    propositions: propositions.map(transformerPropositionPourClient),
  });
}

async function ajouterPropositionSeance(req, res) {
  const donneesSeance = preparerDonneesSeance(req.body || {});
  const seanceSource = await recupererSeanceSourceProposition(req.body || {}, req.utilisateur);
  const erreurs = await validerPropositionCommeCreation(donneesSeance, req.utilisateur, {
    seanceExistante: seanceSource,
  });

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  await verifierAbsenceConflitSeance(donneesSeance, req.utilisateur, {
    exclureSeanceId: seanceSource?.id || null,
  });
  const conflitIndisponibilite = await recupererConflitIndisponibiliteObligatoire(donneesSeance);

  const proposition = await creerPropositionSeance({
    ...donneesSeance,
    indisponibilite_id: conflitIndisponibilite.id,
    indisponibilite_date_originale: conflitIndisponibilite.date,
    indisponibilite_heure_debut_originale: conflitIndisponibilite.heure_debut,
    indisponibilite_heure_fin_originale: conflitIndisponibilite.heure_fin,
    indisponibilite_jour_complet_original: conflitIndisponibilite.jour_complet,
    proposee_par: req.utilisateur.id,
    seance_source_id: seanceSource?.id || null,
  });

  return res.status(201).json({
    message: "Proposition envoyee a Hossam.",
    proposition: transformerPropositionPourClient(proposition),
  });
}

async function modifierPropositionSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de proposition invalide." });
  }

  const propositionExistante = await trouverPropositionSeanceParId(req.params.id);
  verifierPropositionEnAttente(propositionExistante);
  const seanceSourceId = normaliserIdentifiantOptionnel(
    propositionExistante.seance_source_id,
    "Identifiant de séance source"
  );
  const seanceSource = seanceSourceId ? await trouverSeanceParId(seanceSourceId) : null;

  if (seanceSourceId && !seanceSource) {
    return res.status(404).json({ message: "Seance source introuvable." });
  }

  const donneesSeance = preparerDonneesDepuisProposition(propositionExistante, req.body || {});
  const erreurs = await validerPropositionCommeCreation(donneesSeance, req.utilisateur, {
    seanceExistante: seanceSource,
  });

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  await verifierAbsenceConflitSeance(donneesSeance, req.utilisateur, {
    exclureSeanceId: seanceSource?.id || null,
  });
  const conflitIndisponibilite = await recupererConflitIndisponibiliteObligatoire(donneesSeance);

  const proposition = await mettreAJourPropositionSeance(req.params.id, {
    ...donneesSeance,
    indisponibilite_id: conflitIndisponibilite.id,
    indisponibilite_date_originale: conflitIndisponibilite.date,
    indisponibilite_heure_debut_originale: conflitIndisponibilite.heure_debut,
    indisponibilite_heure_fin_originale: conflitIndisponibilite.heure_fin,
    indisponibilite_jour_complet_original: conflitIndisponibilite.jour_complet,
  });

  return res.json({
    message: "Proposition modifiée.",
    proposition: transformerPropositionPourClient(proposition),
  });
}

async function accepterPropositionSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de proposition invalide." });
  }

  const proposition = await trouverPropositionSeanceParId(req.params.id);
  verifierPropositionEnAttente(proposition);

  const seanceSourceId = normaliserIdentifiantOptionnel(
    proposition.seance_source_id,
    "Identifiant de séance source"
  );
  const seanceSource = seanceSourceId ? await trouverSeanceParId(seanceSourceId) : null;

  if (seanceSourceId && !seanceSource) {
    return res.status(404).json({ message: "Seance source introuvable." });
  }

  const donneesSeance = preparerDonneesDepuisProposition(proposition);
  const erreurs = await validerPropositionCommeCreation(donneesSeance, req.utilisateur, {
    seanceExistante: seanceSource,
  });

  if (erreurs.length > 0) {
    return res.status(400).json({ message: erreurs.join(" ") });
  }

  const resultat = await executerTransactionImmediate(async () => {
    await recupererConflitIndisponibiliteObligatoire(donneesSeance);

    const seance = seanceSource
      ? await modifierSeanceDepuisDonneesValidees({
          seanceExistante: seanceSource,
          donneesSeance,
          acteur: req.utilisateur,
          verifierIndisponibilite: false,
          utiliserTransaction: false,
        })
      : await creerSeanceDepuisDonneesValidees({
          donneesSeance,
          acteur: req.utilisateur,
          verifierIndisponibilite: false,
          utiliserTransaction: false,
        });
    await decouperIndisponibilitesAutourSeance(donneesSeance);
    const propositionAcceptee = await marquerPropositionSeanceAcceptee(req.params.id, {
      acteurId: req.utilisateur.id,
      seanceId: seance.id,
    });

    return {
      message: seanceSource
        ? "Proposition acceptée et séance déplacée."
        : "Proposition acceptée et séance créée.",
      proposition: transformerPropositionPourClient(propositionAcceptee),
      seance: transformerSeancePourClientSelonUtilisateur(seance, req.utilisateur),
    };
  });

  return res.json(resultat);
}

async function refuserPropositionSeance(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({ message: "Identifiant de proposition invalide." });
  }

  const proposition = await trouverPropositionSeanceParId(req.params.id);
  verifierPropositionEnAttente(proposition);

  const propositionRefusee = await marquerPropositionSeanceRefusee(req.params.id, {
    acteurId: req.utilisateur.id,
  });

  return res.json({
    message: "Proposition refusée.",
    proposition: transformerPropositionPourClient(propositionRefusee),
  });
}

module.exports = {
  recupererPropositionsSeances,
  ajouterPropositionSeance,
  modifierPropositionSeance,
  accepterPropositionSeance,
  refuserPropositionSeance,
};
