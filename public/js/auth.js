import { envoyerRequete, viderTokenCsrf } from "./http.js";

export async function connecterUtilisateur(username, motDePasse, rememberDevice = false) {
  const resultat = await envoyerRequete("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username,
      mot_de_passe: motDePasse,
      remember_device: rememberDevice,
    }),
  });

  return {
    ...resultat.utilisateur,
    scope: resultat.scope || null,
  };
}

export async function changerMotDePasse(motDePasseActuel, nouveauMotDePasse) {
  const resultat = await envoyerRequete("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
      nouveau_mot_de_passe: nouveauMotDePasse,
    }),
  });

  return {
    ...resultat,
    utilisateur: {
      ...resultat.utilisateur,
      scope: resultat.scope || null,
    },
  };
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
    return {
      ...resultat.utilisateur,
      scope: resultat.scope || null,
    };
  } catch (erreur) {
    if (erreur.status === 401) {
      viderTokenCsrf();
      return null;
    }

    throw erreur;
  }
}
