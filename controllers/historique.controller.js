const {
  listerEntreesHistorique,
  recupererEntreeHistoriqueDetail,
  supprimerEntreeHistoriqueParId,
} = require("../models/historique.model");
const { trouverSeanceParId } = require("../models/seance.model");
const { trouverUtilisateurAvecMotDePasseParId } = require("../models/utilisateur.model");
const { enregistrerEvenementAuth } = require("../models/journal-auth.model");
const { normaliserIpClient } = require("../middleware/security.middleware");
const bcrypt = require("bcryptjs");

function estIdentifiantValide(valeur) {
  return Number.isInteger(Number(valeur)) && Number(valeur) > 0;
}

function obtenirUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 400);
}

function utilisateurPeutVoirCompteHossam(utilisateur) {
  return (
    Number(utilisateur?.est_admin) === 1 ||
    String(utilisateur?.email || "").trim().toLowerCase() === "hossam@test.com"
  );
}

function entreeHistoriqueMentionneCompteHossam(entree) {
  const details = entree?.details || {};
  const compteSeance = String(details?.seance?.compte || "").trim().toLowerCase();

  if (compteSeance === "hossam") {
    return true;
  }

  const changements = Array.isArray(details?.changements) ? details.changements : [];
  return changements.some((changement) => {
    if (String(changement?.champ || "").trim() !== "compte") {
      return false;
    }

    return [changement?.avant, changement?.apres].some(
      (valeur) => String(valeur || "").trim().toLowerCase() === "hossam"
    );
  });
}

async function entreeHistoriqueConcerneCompteHossam(entree, cacheSeances = new Map()) {
  if (entreeHistoriqueMentionneCompteHossam(entree)) {
    return true;
  }

  const seanceId = Number(entree?.seance_id || 0);

  if (!seanceId) {
    return false;
  }

  if (!cacheSeances.has(seanceId)) {
    cacheSeances.set(seanceId, await trouverSeanceParId(seanceId));
  }

  const seance = cacheSeances.get(seanceId);
  return String(seance?.compte || "").trim().toLowerCase() === "hossam";
}

async function journaliserSuppressionHistorique(req, resultat, details = null) {
  await enregistrerEvenementAuth({
    utilisateurId: req.utilisateur?.id || null,
    identifiant: req.utilisateur?.nom || req.utilisateur?.email || "",
    actionType: "admin_delete_history_entry",
    resultat,
    adresseIp: normaliserIpClient(req),
    userAgent: obtenirUserAgent(req),
    details,
  });
}

async function verifierMotDePasseAdministrateur(req, motDePasseActuel) {
  const administrateur = await trouverUtilisateurAvecMotDePasseParId(req.utilisateur.id);

  if (!administrateur) {
    return {
      ok: false,
      status: 404,
      message: "Administrateur introuvable.",
    };
  }

  const motDePasseValide = await bcrypt.compare(
    String(motDePasseActuel || ""),
    administrateur.mot_de_passe
  );

  if (!motDePasseValide) {
    return {
      ok: false,
      status: 400,
      message: "Le mot de passe actuel est incorrect.",
    };
  }

  return {
    ok: true,
  };
}

async function recupererHistorique(req, res) {
  const historiqueBrut = await listerEntreesHistorique(300);
  let historique = historiqueBrut;

  if (!utilisateurPeutVoirCompteHossam(req.utilisateur)) {
    const cacheSeances = new Map();
    const visibilites = await Promise.all(
      historiqueBrut.map((entree) => entreeHistoriqueConcerneCompteHossam(entree, cacheSeances))
    );
    historique = historiqueBrut.filter((_, index) => !visibilites[index]);
  }

  return res.json({ historique });
}

async function recupererDetailHistorique(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({
      message: "Identifiant d'historique invalide.",
    });
  }

  const entree = await recupererEntreeHistoriqueDetail(req.params.id);

  if (!entree) {
    return res.status(404).json({
      message: "Entrée d'historique introuvable.",
    });
  }

  if (
    !utilisateurPeutVoirCompteHossam(req.utilisateur) &&
    (await entreeHistoriqueConcerneCompteHossam(entree))
  ) {
    return res.status(404).json({
      message: "Entrée d'historique introuvable.",
    });
  }

  return res.json({ entree });
}

async function supprimerEntreeHistoriqueAdministration(req, res) {
  if (!estIdentifiantValide(req.params.id)) {
    return res.status(400).json({
      message: "Identifiant d'historique invalide.",
    });
  }

  const { mot_de_passe_actuel: motDePasseActuel } = req.body || {};

  if (!motDePasseActuel) {
    return res.status(400).json({
      message: "Le mot de passe actuel est obligatoire.",
    });
  }

  const verification = await verifierMotDePasseAdministrateur(req, motDePasseActuel);

  if (!verification.ok) {
    await journaliserSuppressionHistorique(req, "failed_current_password", {
      historique_id: Number(req.params.id),
    }).catch(() => {});

    return res.status(verification.status).json({
      message: verification.message,
    });
  }

  const entree = await recupererEntreeHistoriqueDetail(req.params.id);

  if (!entree) {
    await journaliserSuppressionHistorique(req, "not_found", {
      historique_id: Number(req.params.id),
    }).catch(() => {});

    return res.status(404).json({
      message: "Entree d'historique introuvable.",
    });
  }

  const resultat = await supprimerEntreeHistoriqueParId(req.params.id);

  if (Number(resultat?.changes || 0) === 0) {
    return res.status(404).json({
      message: "Entree d'historique introuvable.",
    });
  }

  await journaliserSuppressionHistorique(req, "success", {
    historique_id: Number(entree.id),
    action_type: entree.action_type,
    action_label: entree.action_label,
    seance_id: entree.seance_id,
    seance_libelle: entree.seance_libelle,
  });

  return res.json({
    message: "L'entree d'historique a ete supprimee.",
  });
}

module.exports = {
  recupererHistorique,
  recupererDetailHistorique,
  supprimerEntreeHistoriqueAdministration,
};
