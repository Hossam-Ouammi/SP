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

export async function supprimerEntreeHistorique(entreeId, motDePasseActuel) {
  return envoyerRequete(`/api/historique/${Number(entreeId)}`, {
    method: "DELETE",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
    }),
  });
}

export async function recupererMonetisation(options = {}) {
  const parametres = new URLSearchParams();

  if (typeof options === "string") {
    if (options && options !== "all") {
      parametres.set("mois", options);
    }
  } else {
    const mode = String(options?.mode || "").trim();
    const annee = String(options?.annee || "").trim();
    const mois = String(options?.mois || "").trim();

    if (mois && mois !== "all") {
      parametres.set("mois", mois);
    } else {
      if (mode) {
        parametres.set("mode", mode);
      }

      if (annee) {
        parametres.set("annee", annee);
      }
    }
  }

  const suffixe = parametres.toString() ? `?${parametres.toString()}` : "";
  const resultat = await envoyerRequete(`/api/monetisation${suffixe}`);
  return resultat.monetisation;
}

export async function telechargerReleveMonetisation(options = {}, comptes = []) {
  const parametres = new URLSearchParams();
  let format = "pdf";

  if (typeof options === "string") {
    if (options && options !== "all") {
      parametres.set("mois", options);
    }
  } else {
    format = String(options?.format || "pdf").trim().toLowerCase() || "pdf";
    const mode = String(options?.mode || "").trim();
    const annee = String(options?.annee || "").trim();
    const mois = String(options?.mois || "").trim();

    if (mois && mois !== "all") {
      parametres.set("mois", mois);
    } else {
      if (mode) {
        parametres.set("mode", mode);
      }

      if (annee) {
        parametres.set("annee", annee);
      }
    }
  }

  parametres.set("format", format === "html" ? "html" : "pdf");

  comptes.forEach((compte) => {
    if (compte) {
      parametres.append("compte", compte);
    }
  });

  const reponse = await fetch(`/api/monetisation/releve?${parametres.toString()}`, {
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!reponse.ok) {
    const texteErreur = await reponse.text().catch(() => "");
    let donneesErreur = {};

    if (texteErreur) {
      try {
        donneesErreur = JSON.parse(texteErreur);
      } catch (error) {
        donneesErreur = {
          message: texteErreur,
        };
      }
    }

    const erreur = new Error(donneesErreur.message || "Une erreur est survenue.");
    erreur.status = reponse.status;
    throw erreur;
  }

  const blob = await reponse.blob();
  const disposition = reponse.headers.get("content-disposition") || "";
  const correspondanceNomFichier = disposition.match(/filename="?([^";]+)"?/i);

  return {
    blob,
    fileName: correspondanceNomFichier?.[1] || "releve-monetisation.pdf",
  };
}
