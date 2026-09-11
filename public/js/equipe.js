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

export async function recupererTarificationEquipe() {
  const resultat = await envoyerRequete("/api/equipe/tarification");
  return resultat?.tarification || { matieres: [], realisateurs: [] };
}

export function ajouterMatiereEquipe(libelle) {
  return envoyerRequete("/api/equipe/matieres", {
    method: "POST",
    body: JSON.stringify({ libelle }),
  });
}

export function modifierMatiereEquipe(matiereId, libelle) {
  return envoyerRequete(`/api/equipe/matieres/${Number(matiereId)}`, {
    method: "PATCH",
    body: JSON.stringify({ libelle }),
  });
}

export function supprimerMatiereEquipe(matiereId) {
  return envoyerRequete(`/api/equipe/matieres/${Number(matiereId)}`, {
    method: "DELETE",
  });
}

export function modifierTarificationEquipe(tarifs) {
  return envoyerRequete("/api/equipe/tarification", {
    method: "PUT",
    body: JSON.stringify({ tarifs }),
  });
}

export async function envoyerLienResetProfesseur(professeurId) {
  return envoyerRequete(`/api/equipe/professeurs/${Number(professeurId)}/password-reset`, {
    method: "POST",
  });
}
