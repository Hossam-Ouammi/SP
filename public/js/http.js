let csrfToken = null;

function mettreAJourTokenDepuisReponse(reponse) {
  const tokenRecu = reponse.headers.get("x-csrf-token");

  if (tokenRecu) {
    csrfToken = tokenRecu;
  }
}

export function viderTokenCsrf() {
  csrfToken = null;
}

export async function envoyerRequete(url, options = {}) {
  const methode = String(options.method || "GET").toUpperCase();
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    "X-Requested-With": "XMLHttpRequest",
    ...(options.headers || {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(methode) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const reponse = await fetch(url, {
    credentials: "same-origin",
    ...options,
    method: methode,
    headers,
  });

  mettreAJourTokenDepuisReponse(reponse);

  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const erreur = new Error(donnees.message || "Une erreur est survenue.");
    erreur.status = reponse.status;
    erreur.code = donnees.code || null;
    throw erreur;
  }

  return donnees;
}
