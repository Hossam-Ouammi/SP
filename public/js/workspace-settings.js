import { envoyerRequete } from "./http.js";

export async function recupererReglagesEspace() {
  const resultat = await envoyerRequete("/api/settings");
  return resultat.reglages;
}

export async function modifierReglagesCalendrierEspace(reglages) {
  return envoyerRequete("/api/settings/calendar", {
    method: "PATCH",
    body: JSON.stringify(reglages),
  });
}

export async function modifierEtatCalendrierPublic(reglages) {
  const corps =
    typeof reglages === "boolean"
      ? { actif: reglages }
      : reglages && typeof reglages === "object"
        ? reglages
        : {};

  return envoyerRequete("/api/settings/public-calendar", {
    method: "PATCH",
    body: JSON.stringify(corps),
  });
}
