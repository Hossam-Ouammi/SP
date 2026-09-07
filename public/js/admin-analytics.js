import { envoyerRequete } from "./http.js";

function construireSuffixePeriode({ du, au } = {}) {
  const parametres = new URLSearchParams({ mode: "global" });
  const dateDebut = String(du || "").trim();
  const dateFin = String(au || "").trim();

  if (dateDebut) {
    parametres.set("du", dateDebut);
  }
  if (dateFin) {
    parametres.set("au", dateFin);
  }

  return parametres.toString();
}

// This module deliberately targets only the explicit SuperAdmin endpoint.
// Normal Handler analytics keep using their scoped operational routes.
export async function recupererAnalysesGlobalesAdministration(periode = {}) {
  const suffixe = construireSuffixePeriode(periode);
  const [statistiques, monetisation] = await Promise.all([
    envoyerRequete(`/api/admin-analytics/statistiques?${suffixe}`),
    envoyerRequete(`/api/admin-analytics/monetisation?${suffixe}`),
  ]);

  return {
    periode: statistiques.periode || monetisation?.monetisation?.periode || null,
    statistiques: statistiques.statistiques || {},
    monetisation: monetisation.monetisation || {},
    portee: statistiques.portee || monetisation.portee || null,
  };
}
