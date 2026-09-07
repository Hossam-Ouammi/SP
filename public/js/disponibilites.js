import { envoyerRequete } from "./http.js";

export async function recupererDisponibilitesDeclarees(options = {}) {
  const parametres = new URLSearchParams();
  if (options.intervenantId) {
    parametres.set("intervenant_id", String(options.intervenantId));
  }
  const suffixe = parametres.toString() ? `?${parametres.toString()}` : "";
  return envoyerRequete(`/api/disponibilites${suffixe}`);
}

export async function creerRegleDisponibilite(donnees) {
  return envoyerRequete("/api/disponibilites/regles", {
    method: "POST",
    body: JSON.stringify(donnees),
  });
}

export async function supprimerRegleDisponibilite(regleId) {
  return envoyerRequete(`/api/disponibilites/regles/${Number(regleId)}`, {
    method: "DELETE",
  });
}

export async function creerExceptionDisponibilite(donnees) {
  return envoyerRequete("/api/disponibilites/exceptions", {
    method: "POST",
    body: JSON.stringify(donnees),
  });
}

export async function supprimerExceptionDisponibilite(exceptionId) {
  return envoyerRequete(`/api/disponibilites/exceptions/${Number(exceptionId)}`, {
    method: "DELETE",
  });
}
