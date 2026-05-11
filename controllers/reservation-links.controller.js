const { listerCatalogueOptions } = require("../models/catalogue.model");
const {
  listerLiensReservationUtilisateur,
  trouverLienReservationParIdEtUtilisateur,
  creerLienReservation,
  desactiverLienReservation,
} = require("../models/reservation-link.model");
const { utilisateurEstAdministrateur } = require("../middleware/auth.middleware");

const DUREES_VALIDEES = [60, 90, 120];
const COMPTE_PRIVE_HOSSAM = "hossam";

function normaliserTexte(valeur) {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserCleCompte(valeur) {
  return normaliserTexte(valeur).toLowerCase();
}

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function peutUtiliserCompteHossam(utilisateur) {
  return utilisateurEstAdministrateur(utilisateur);
}

function construireCheminPublicLienReservation(tokenPublic) {
  return `/reservation/${encodeURIComponent(tokenPublic)}`;
}

function transformerLienReservationPourClient(lienReservation) {
  if (!lienReservation) {
    return null;
  }

  return {
    id: lienReservation.id,
    utilisateur_id: lienReservation.utilisateur_id,
    etudiant: lienReservation.etudiant,
    parent: lienReservation.parent || "",
    matiere: lienReservation.matiere,
    compte: lienReservation.compte,
    duree_minutes: Number(lienReservation.duree_minutes || 0),
    actif: Number(lienReservation.actif) === 1,
    created_at: lienReservation.created_at,
    updated_at: lienReservation.updated_at,
    last_accessed_at: lienReservation.last_accessed_at || null,
    public_path: construireCheminPublicLienReservation(lienReservation.token_public),
  };
}

async function validerDonneesLienReservation(req) {
  const erreurs = [];
  const etudiant = normaliserTexte(req.body.etudiant);
  const parent = normaliserTexte(req.body.parent);
  const matiere = normaliserTexte(req.body.matiere);
  const compte = normaliserTexte(req.body.compte);
  const dureeMinutes = Number(req.body.duree_minutes);
  const catalogue = await listerCatalogueOptions();
  const matieres = Array.isArray(catalogue?.matieres)
    ? catalogue.matieres.map((element) => normaliserTexte(element?.valeur))
    : [];
  const comptes = Array.isArray(catalogue?.comptes)
    ? catalogue.comptes.map((element) => normaliserTexte(element?.valeur))
    : [];

  if (!etudiant) {
    erreurs.push("Le nom de l'etudiant est obligatoire.");
  } else if (etudiant.length > 120) {
    erreurs.push("Le nom de l'etudiant est trop long.");
  }

  if (parent.length > 120) {
    erreurs.push("Le nom du parent est trop long.");
  }

  if (!matieres.includes(matiere)) {
    erreurs.push("La matiere choisie est invalide.");
  }

  if (!comptes.includes(compte)) {
    erreurs.push("Le compte choisi est invalide.");
  }

  if (
    normaliserCleCompte(compte) === COMPTE_PRIVE_HOSSAM &&
    !peutUtiliserCompteHossam(req.utilisateur)
  ) {
    erreurs.push("Seul Hossam peut creer un lien sur le compte Hossam.");
  }

  if (!DUREES_VALIDEES.includes(dureeMinutes)) {
    erreurs.push("La duree doit etre 60, 90 ou 120 minutes.");
  }

  return {
    erreurs,
    donnees: {
      etudiant,
      parent,
      matiere,
      compte,
      duree_minutes: dureeMinutes,
    },
  };
}

async function recupererLiensReservation(req, res) {
  const liensReservation = await listerLiensReservationUtilisateur(req.utilisateur.id);

  return res.json({
    liens_reservation: liensReservation.map(transformerLienReservationPourClient),
  });
}

async function creerLienReservationEtudiant(req, res) {
  const { erreurs, donnees } = await validerDonneesLienReservation(req);

  if (erreurs.length > 0) {
    return res.status(400).json({
      message: erreurs.join(" "),
    });
  }

  const lienReservation = await creerLienReservation({
    utilisateurId: req.utilisateur.id,
    etudiant: donnees.etudiant,
    parent: donnees.parent,
    matiere: donnees.matiere,
    compte: donnees.compte,
    dureeMinutes: donnees.duree_minutes,
  });

  return res.status(201).json({
    message: `Lien de reservation cree pour ${lienReservation.etudiant}.`,
    lien_reservation: transformerLienReservationPourClient(lienReservation),
  });
}

async function revoquerLienReservationEtudiant(req, res) {
  const lienReservationId = Number(req.params.id);

  if (!estIdentifiantValide(lienReservationId)) {
    return res.status(400).json({
      message: "Identifiant de lien invalide.",
    });
  }

  const lienExistant = await trouverLienReservationParIdEtUtilisateur(
    lienReservationId,
    req.utilisateur.id
  );

  if (!lienExistant) {
    return res.status(404).json({
      message: "Lien de reservation introuvable.",
    });
  }

  if (Number(lienExistant.actif) !== 1) {
    return res.status(400).json({
      message: "Ce lien est deja revoque.",
    });
  }

  const lienReservation = await desactiverLienReservation(lienReservationId, req.utilisateur.id);

  return res.json({
    message: `Lien de reservation revoque pour ${lienReservation.etudiant}.`,
    lien_reservation: transformerLienReservationPourClient(lienReservation),
  });
}

module.exports = {
  recupererLiensReservation,
  creerLienReservationEtudiant,
  revoquerLienReservationEtudiant,
};
