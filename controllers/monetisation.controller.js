const { listerSeancesPourMonetisation } = require("../models/seance.model");
const { listerCatalogueOptions } = require("../models/catalogue.model");

const CONFIGURATION_COMPTES_MONETISATION = [
  { nom: "Yassine", tarif_par_defaut: 130 },
  { nom: "Abdo", tarif_par_defaut: 90 },
];

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""));
}

function convertirHeureEnMinutes(heure) {
  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function calculerDureeMinutes(seance) {
  if (Number.isFinite(Number(seance?.duree_minutes)) && Number(seance.duree_minutes) > 0) {
    return Number(seance.duree_minutes);
  }

  if (!estHeureValide(seance?.heure_debut) || !estHeureValide(seance?.heure_fin)) {
    return 0;
  }

  const difference = convertirHeureEnMinutes(seance.heure_fin) - convertirHeureEnMinutes(seance.heure_debut);
  return difference > 0 ? difference : 0;
}

function construireDateHeureLocale(date, heure) {
  if (!date || !estHeureValide(heure)) {
    return null;
  }

  const [heures, minutes] = heure.split(":").map(Number);
  const dateLocale = new Date(`${date}T00:00:00`);
  dateLocale.setHours(heures, minutes, 0, 0);
  return dateLocale;
}

function calculerStatutMonetisation(seance) {
  if (!["planifiee", "reportee"].includes(seance?.statut_seance)) {
    return seance?.statut_seance || "";
  }

  const dateFin = construireDateHeureLocale(seance.date, seance.heure_fin);

  if (!dateFin) {
    return seance.statut_seance;
  }

  return dateFin.getTime() <= Date.now() ? "faite" : seance.statut_seance;
}

function calculerMontantSeance(seance, tarifUnitaire) {
  const dureeMinutes = calculerDureeMinutes(seance);

  if (!dureeMinutes || !tarifUnitaire) {
    return 0;
  }

  return (tarifUnitaire * dureeMinutes) / 60;
}

function calculerMonetisationPourCompte(seances, nomCompte, tarifUnitaire) {
  const seancesDuCompte = seances.filter(
    (seance) => (seance.compte || "").trim().toLowerCase() === nomCompte.toLowerCase()
  );
  const seancesFacturables = seancesDuCompte.filter(
    (seance) =>
      calculerStatutMonetisation(seance) === "faite" &&
      !(Number(seance.est_essai) === 1 || seance.est_essai === true)
  );
  const seancesEssaiFaites = seancesDuCompte.filter(
    (seance) =>
      calculerStatutMonetisation(seance) === "faite" &&
      (Number(seance.est_essai) === 1 || seance.est_essai === true)
  );
  const montantDu = seancesFacturables.reduce(
    (total, seance) => total + calculerMontantSeance(seance, tarifUnitaire),
    0
  );

  return {
    tarif_unitaire: tarifUnitaire,
    seances_facturables: seancesFacturables.length,
    seances_essai_faites: seancesEssaiFaites.length,
    montant_du: montantDu,
  };
}

function normaliserCleCompte(valeur) {
  return String(valeur || "").trim().toLowerCase();
}

function obtenirTarifHoraireParDefautCompte(nomCompte) {
  const compteConfigure = CONFIGURATION_COMPTES_MONETISATION.find(
    (compte) => normaliserCleCompte(compte.nom) === normaliserCleCompte(nomCompte)
  );
  return Number(compteConfigure?.tarif_par_defaut || 100);
}

async function recupererMonetisation(req, res) {
  try {
    const [seances, catalogue] = await Promise.all([
      listerSeancesPourMonetisation(),
      listerCatalogueOptions(),
    ]);

    const comptesCatalogue = Array.isArray(catalogue?.comptes) ? catalogue.comptes : [];
    const comptesCatalogueParNom = new Map(
      comptesCatalogue.map((compte) => [
        normaliserCleCompte(compte?.valeur),
        compte,
      ])
    );

    const statsComptes = {};
    let montantTotal = 0;
    let nombreTotalFacturable = 0;

    CONFIGURATION_COMPTES_MONETISATION
      .forEach((compteConfigure) => {
        const compteCatalogue = comptesCatalogueParNom.get(
          normaliserCleCompte(compteConfigure.nom)
        );
        const tarifUnitaire = Number.isFinite(Number(compteCatalogue?.tarif_horaire))
          ? Number(compteCatalogue.tarif_horaire)
          : obtenirTarifHoraireParDefautCompte(compteConfigure.nom);
        const stats = calculerMonetisationPourCompte(
          seances,
          compteConfigure.nom,
          tarifUnitaire
        );

        statsComptes[compteConfigure.nom] = stats;
        montantTotal += stats.montant_du;
        nombreTotalFacturable += stats.seances_facturables;
      });

    return res.json({
      monetisation: {
        montant_total: montantTotal,
        nombre_total_facturable: nombreTotalFacturable,
        comptes: statsComptes,
      },
    });
  } catch (error) {
    console.error("Erreur monetisation:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de la monetisation." });
  }
}

module.exports = {
  recupererMonetisation,
};
