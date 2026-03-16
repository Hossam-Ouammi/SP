import { envoyerRequete, viderTokenCsrf } from "./http.js";

export async function connecterUtilisateur(username, motDePasse) {
  const resultat = await envoyerRequete("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username,
      mot_de_passe: motDePasse,
    }),
  });

  return resultat.utilisateur;
}

export async function changerMotDePasse(motDePasseActuel, nouveauMotDePasse) {
  return envoyerRequete("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
      nouveau_mot_de_passe: nouveauMotDePasse,
    }),
  });
}

export async function deconnecterUtilisateur() {
  await envoyerRequete("/api/auth/logout", {
    method: "POST",
  });
  viderTokenCsrf();
}

export async function recupererUtilisateurCourant() {
  try {
    const resultat = await envoyerRequete("/api/auth/me");
    return resultat.utilisateur;
  } catch (erreur) {
    if (erreur.status === 401) {
      viderTokenCsrf();
      return null;
    }

    throw erreur;
  }
}
