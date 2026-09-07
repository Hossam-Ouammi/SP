import { envoyerRequete } from "./http.js";

export async function recupererIdentifiantsHandlersPublics() {
  const resultat = await envoyerRequete("/api/account-lifecycle/handlers");
  return Array.isArray(resultat.handler_ids) ? resultat.handler_ids : [];
}

export async function soumettreDemandeCompte(donnees) {
  return envoyerRequete("/api/account-lifecycle/requests", {
    method: "POST",
    body: JSON.stringify(donnees),
  });
}

export async function demanderLienReinitialisation(identifiant) {
  return envoyerRequete("/api/account-lifecycle/password-resets", {
    method: "POST",
    body: JSON.stringify({ identifiant }),
  });
}

export async function activerCompteAvecJeton(token, nouveauMotDePasse) {
  return envoyerRequete("/api/account-lifecycle/activation", {
    method: "POST",
    body: JSON.stringify({ token, nouveau_mot_de_passe: nouveauMotDePasse }),
  });
}

export async function reinitialiserMotDePasseAvecJeton(token, nouveauMotDePasse) {
  return envoyerRequete("/api/account-lifecycle/password-resets/confirm", {
    method: "POST",
    body: JSON.stringify({ token, nouveau_mot_de_passe: nouveauMotDePasse }),
  });
}

export async function recupererDemandesCompte() {
  const resultat = await envoyerRequete("/api/account-lifecycle/requests");
  return Array.isArray(resultat.demandes) ? resultat.demandes : [];
}

export async function approuverDemandeCompte(demandeId) {
  return envoyerRequete(`/api/account-lifecycle/requests/${Number(demandeId)}/approve`, {
    method: "POST",
  });
}

export async function refuserDemandeCompte(demandeId, raison = "") {
  return envoyerRequete(`/api/account-lifecycle/requests/${Number(demandeId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ raison }),
  });
}

export async function renvoyerActivationCompte(demandeId) {
  return envoyerRequete(
    `/api/account-lifecycle/requests/${Number(demandeId)}/resend-activation`,
    { method: "POST" }
  );
}

// The SuperAdmin endpoints are deliberately separate from the Handler ones:
// a dual-role person reaches cross-team requests only from Administration.
export async function recupererDemandesCompteAdministration() {
  const resultat = await envoyerRequete("/api/admin/account-requests");
  return Array.isArray(resultat.demandes) ? resultat.demandes : [];
}

export async function approuverDemandeCompteAdministration(demandeId) {
  return envoyerRequete(`/api/admin/account-requests/${Number(demandeId)}/approve`, {
    method: "POST",
  });
}

export async function refuserDemandeCompteAdministration(demandeId, raison = "") {
  return envoyerRequete(`/api/admin/account-requests/${Number(demandeId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ raison }),
  });
}

export async function renvoyerActivationCompteAdministration(demandeId) {
  return envoyerRequete(
    `/api/admin/account-requests/${Number(demandeId)}/resend-activation`,
    { method: "POST" }
  );
}
