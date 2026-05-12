const crypto = require("crypto");

const minuscules = "abcdefghijklmnopqrstuvwxyz";
const majuscules = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const chiffres = "0123456789";
const caracteresSpeciaux = "!@#$%^&*()_+";
const tousLesCaracteres = `${minuscules}${majuscules}${chiffres}${caracteresSpeciaux}`;

function choisirCaractereAleatoire(caracteres) {
  return caracteres[crypto.randomInt(0, caracteres.length)];
}

function melangerCaracteres(caracteres) {
  const elements = [...caracteres];

  for (let index = elements.length - 1; index > 0; index -= 1) {
    const indexAleatoire = crypto.randomInt(0, index + 1);
    [elements[index], elements[indexAleatoire]] = [elements[indexAleatoire], elements[index]];
  }

  return elements.join("");
}

function motDePasseRespectePolitique(motDePasse) {
  const valeur = String(motDePasse || "");
  return (
    valeur.length >= 12 &&
    /[a-z]/.test(valeur) &&
    /[A-Z]/.test(valeur) &&
    /\d/.test(valeur) &&
    /[^A-Za-z0-9]/.test(valeur)
  );
}

function genererMotDePasseAleatoire(longueur = 12) {
  const longueurCible = Math.max(Number(longueur) || 12, 12);
  const caracteres = [
    choisirCaractereAleatoire(minuscules),
    choisirCaractereAleatoire(majuscules),
    choisirCaractereAleatoire(chiffres),
    choisirCaractereAleatoire(caracteresSpeciaux),
  ];

  while (caracteres.length < longueurCible) {
    caracteres.push(choisirCaractereAleatoire(tousLesCaracteres));
  }

  return melangerCaracteres(caracteres);
}

module.exports = {
  genererMotDePasseAleatoire,
  motDePasseRespectePolitique,
};
