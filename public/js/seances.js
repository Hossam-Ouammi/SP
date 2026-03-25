import { envoyerRequete } from "./http.js";

export async function recupererSeances() {
  const resultat = await envoyerRequete("/api/seances");
  return resultat.seances;
}

export async function recupererOptionsSeances() {
  const resultat = await envoyerRequete("/api/seances/options");
  return resultat.options;
}

export async function ajouterSeance(donneesSeance) {
  const resultat = await envoyerRequete("/api/seances", {
    method: "POST",
    body: JSON.stringify(donneesSeance),
  });

  return resultat.seance;
}

export async function modifierSeance(seanceId, donneesSeance) {
  const resultat = await envoyerRequete(`/api/seances/${seanceId}`, {
    method: "PUT",
    body: JSON.stringify(donneesSeance),
  });

  return resultat.seance;
}

export async function supprimerSeance(seanceId) {
  return envoyerRequete(`/api/seances/${seanceId}`, {
    method: "DELETE",
  });
}

export async function changerStatutSeance(seanceId, statutSeance) {
  const resultat = await envoyerRequete(`/api/seances/${seanceId}/statut`, {
    method: "PATCH",
    body: JSON.stringify({
      statut_seance: statutSeance,
    }),
  });

  return resultat.seance;
}

export async function televerserPhotosDeSeance(seanceId, fichiers) {
  const formulaire = new FormData();

  for (const fichier of fichiers) {
    formulaire.append("screenshots", fichier);
  }

  const resultat = await envoyerRequete(`/api/photos/seance/${seanceId}`, {
    method: "POST",
    body: formulaire,
  });

  return resultat.photos;
}

export async function recupererPhotosDeSeance(seanceId) {
  const resultat = await envoyerRequete(`/api/photos/seance/${seanceId}`);
  return resultat.photos;
}

export async function recupererIndisponibilites() {
  const resultat = await envoyerRequete("/api/indisponibilites");
  return resultat.indisponibilites;
}

export async function creerIndisponibilite(donneesIndisponibilite) {
  const resultat = await envoyerRequete("/api/indisponibilites", {
    method: "POST",
    body: JSON.stringify(donneesIndisponibilite),
  });

  return resultat.indisponibilite;
}

export async function supprimerIndisponibilite(indisponibiliteId) {
  return envoyerRequete(`/api/indisponibilites/${indisponibiliteId}`, {
    method: "DELETE",
  });
}

export async function recupererHistoriqueActions() {
  const resultat = await envoyerRequete("/api/historique");
  return resultat.historique;
}

export async function recupererDetailHistorique(entreeId) {
  const resultat = await envoyerRequete(`/api/historique/${entreeId}`);
  return resultat.entree;
}

export async function recupererMonetisation() {
  const resultat = await envoyerRequete("/api/monetisation");
  return resultat.monetisation;
}
