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

export async function supprimerElementCatalogueAdmin(elementId, motDePasseActuel) {
  return envoyerRequete(`/api/admin/catalogue-items/${Number(elementId)}`, {
    method: "DELETE",
    body: JSON.stringify({
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

export async function mettreAJourAccesAujourdhuiCompte(
  utilisateurId,
  peutVoirAujourdhui,
  motDePasseActuel
) {
  return envoyerRequete("/api/admin/today-access", {
    method: "PATCH",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      peut_voir_aujourdhui: peutVoirAujourdhui,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function mettreAJourAccesIndisponibilitesCompte(
  utilisateurId,
  peutVoirIndisponibilites,
  motDePasseActuel
) {
  return envoyerRequete("/api/admin/unavailability-access", {
    method: "PATCH",
    body: JSON.stringify({
      utilisateur_id: Number(utilisateurId),
      peut_voir_indisponibilites: peutVoirIndisponibilites,
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
export async function recupererJournalAuthAdmin(limit = 200) {
  return envoyerRequete(`/api/admin/audit-logins?limit=${limit}`);
}

export async function recupererSessionsAdmin() {
  const resultat = await envoyerRequete("/api/admin/sessions");
  return resultat.sessions;
}

export async function revoquerSessionSpecifiqueAdmin(sessionId, motDePasseActuel) {
  return envoyerRequete("/api/admin/sessions/revoke-sid", {
    method: "POST",
    body: JSON.stringify({
      sid: sessionId,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function recupererIpsBloqueesAdmin() {
  const resultat = await envoyerRequete("/api/admin/blocked-ips");
  return resultat.ips;
}

export async function bloquerIpAdmin(ip, raison, motDePasseActuel) {
  return envoyerRequete("/api/admin/blocked-ips", {
    method: "POST",
    body: JSON.stringify({
      ip,
      raison,
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function debloquerIpAdmin(ip, motDePasseActuel) {
  return envoyerRequete(`/api/admin/blocked-ips/${encodeURIComponent(ip)}`, {
    method: "DELETE",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}
