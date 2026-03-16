async function envoyerRequete(url, options = {}) {
  const reponse = await fetch(url, {
    credentials: "same-origin",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });

  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const erreur = new Error(donnees.message || "Une erreur est survenue.");
    erreur.status = reponse.status;
    throw erreur;
  }

  return donnees;
}

export async function connecterUtilisateur(email, motDePasse) {
  const resultat = await envoyerRequete("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      mot_de_passe: motDePasse,
    }),
  });

  return resultat.utilisateur;
}

export async function deconnecterUtilisateur() {
  await envoyerRequete("/api/auth/logout", {
    method: "POST",
  });
}

export async function recupererUtilisateurCourant() {
  try {
    const resultat = await envoyerRequete("/api/auth/me");
    return resultat.utilisateur;
  } catch (erreur) {
    if (erreur.status === 401) {
      return null;
    }

    throw erreur;
  }
}
