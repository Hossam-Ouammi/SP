const { listerToutesLesSeances } = require("../models/seance.model");

const tarifsParCompte = {
  Yassine: 130,
  Abdo: 90,
};

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
      seance.statut_seance === "faite" &&
      !(Number(seance.est_essai) === 1 || seance.est_essai === true)
  );
  const seancesEssaiFaites = seancesDuCompte.filter(
    (seance) =>
      seance.statut_seance === "faite" &&
      (Number(seance.est_essai) === 1 || seance.est_essai === true)
  );

  return {
    tarif_unitaire: tarifUnitaire,
    seances_facturables: seancesFacturables.length,
    seances_essai_faites: seancesEssaiFaites.length,
    montant_du: seancesFacturables.length * tarifUnitaire,
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
