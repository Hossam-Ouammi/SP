import { envoyerRequete } from "./http.js";

export async function recupererVueAdministration() {
  const resultat = await envoyerRequete("/api/admin");
  return resultat.administration;
}

export async function creerUtilisateurAdmin(donneesUtilisateur) {
  return envoyerRequete("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(donneesUtilisateur),
  });
}

export async function supprimerUtilisateurAdmin(utilisateurId, motDePasseActuel) {
  return envoyerRequete(`/api/admin/users/${Number(utilisateurId)}`, {
    method: "DELETE",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function ajouterElementCatalogueAdmin(type, valeur, motDePasseActuel) {
  return envoyerRequete("/api/admin/catalogue-items", {
    method: "POST",
    body: JSON.stringify({
      type,
      valeur,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function reinitialiserMotDePasseCompte(utilisateurId, motDePasseActuel) {
  return envoyerRequete("/api/admin/reset-password", {
    method: "POST",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function mettreAJourAccesCompte(utilisateurId, accesActive, motDePasseActuel) {
  return envoyerRequete("/api/admin/access", {
    method: "PATCH",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      acces_active: accesActive,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function mettreAJourLectureSeuleCompte(
  utilisateurId,
  modeLectureSeule,
  motDePasseActuel
) {
  return envoyerRequete("/api/admin/read-only", {
    method: "PATCH",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      mode_lecture_seule: modeLectureSeule,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function mettreAJourAccesMonetisationCompte(
  utilisateurId,
  peutVoirMonetisation,
  motDePasseActuel
) {
  return envoyerRequete("/api/admin/monetisation-access", {
    method: "PATCH",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      peut_voir_monetisation: peutVoirMonetisation,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function revoquerSessionsUtilisateurAdmin(utilisateurId, motDePasseActuel) {
  return envoyerRequete("/api/admin/sessions/revoke-user", {
    method: "POST",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function revoquerSessionAdmin(sessionId, motDePasseActuel) {
  return envoyerRequete("/api/admin/sessions/revoke", {
    method: "POST",
    body: JSON.stringify({
      sid: sessionId,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function supprimerToutesLesSeancesAdmin(motDePasseActuel) {
  return envoyerRequete("/api/admin/clear-seances", {
    method: "POST",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function supprimerToutHistoriqueAdmin(motDePasseActuel) {
  return envoyerRequete("/api/admin/clear-history", {
    method: "POST",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}
