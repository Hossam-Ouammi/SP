import { envoyerRequete } from "./http.js";

export async function recupererLiensReservation() {
  const resultat = await envoyerRequete("/api/liens-reservation");
  return resultat.liens_reservation;
}

export async function creerLienReservation(donneesLien) {
  const resultat = await envoyerRequete("/api/liens-reservation", {
    method: "POST",
    body: JSON.stringify(donneesLien),
  });

  return resultat.lien_reservation;
}

export async function revoquerLienReservation(lienId) {
  const resultat = await envoyerRequete(`/api/liens-reservation/${Number(lienId)}`, {
    method: "DELETE",
  });

  return resultat.lien_reservation;
}
