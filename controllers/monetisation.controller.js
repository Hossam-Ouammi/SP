const { listerToutesLesSeances } = require("../models/seance.model");

const tarifsParCompte = {
  Yassine: 130,
  Abdo: 90,
};

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

function normaliserCompte(compte) {
  const valeur = String(compte || "").trim().toLowerCase();

  if (valeur === "yassine") {
    return "Yassine";
  }

  if (valeur === "abdo" || valeur === "ami") {
    return "Abdo";
  }

  return "";
}

function calculerMonetisationPourCompte(seances, compte) {
  const tarifUnitaire = tarifsParCompte[compte] || 0;
  const seancesDuCompte = seances.filter(
    (seance) => normaliserCompte(seance.compte) === compte
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

async function recupererMonetisation(req, res) {
  const seances = await listerToutesLesSeances();
  const yassine = calculerMonetisationPourCompte(seances, "Yassine");
  const abdo = calculerMonetisationPourCompte(seances, "Abdo");

  return res.json({
    monetisation: {
      montant_abdo_a_payer: abdo.montant_du,
      montant_total: yassine.montant_du + abdo.montant_du,
      nombre_total_facturable: yassine.seances_facturables + abdo.seances_facturables,
      comptes: {
        Yassine: yassine,
        Abdo: abdo,
      },
    },
  });
}

module.exports = {
  recupererMonetisation,
};
