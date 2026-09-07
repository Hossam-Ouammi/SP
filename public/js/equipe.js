import { envoyerRequete } from "./http.js";

export async function recupererProfesseursEquipe() {
  const resultat = await envoyerRequete("/api/equipe/professeurs");
  return Array.isArray(resultat.professeurs) ? resultat.professeurs : [];
}

export async function modifierProfesseurEquipe(professeurId, donnees) {
  const resultat = await envoyerRequete(`/api/equipe/professeurs/${Number(professeurId)}`, {
    method: "PATCH",
    body: JSON.stringify(donnees),
  });

  return resultat.professeur;
}

export async function envoyerLienResetProfesseur(professeurId) {
  return envoyerRequete(`/api/equipe/professeurs/${Number(professeurId)}/password-reset`, {
    method: "POST",
  });
}
