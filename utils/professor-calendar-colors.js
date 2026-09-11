/*
 * Couleurs d'intervenants pilotees par le serveur.
 *
 * Elles sont volontairement independantes d'une saisie utilisateur : une
 * couleur est attribuee de facon deterministe a chaque professeur dans son
 * equipe. La palette privilegie des tons doux lisibles sur fond clair.
 */
const PALETTE_PROFESSEURS = Object.freeze([
  "#5f8fd6",
  "#c37f91",
  "#6cae99",
  "#9a82c5",
  "#c99b5d",
  "#6d9db4",
  "#bd82a0",
  "#80a66b",
  "#7d89c7",
  "#c78a66",
  "#68a49f",
  "#b985b5",
  "#9d9d63",
  "#7397c2",
  "#c38c84",
  "#75a78f",
  "#a986c0",
  "#c0a15f",
  "#6b9ebd",
  "#bd7f82",
  "#78a783",
  "#9189ba",
  "#bf916a",
  "#689da0",
]);

function normaliserIdentifiant(valeur) {
  const id = Number(valeur);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function hacherIdentifiant(identifiant) {
  // FNV-1a 32-bit : stable entre processus, sans exposer de preference
  // utilisateur ni dependre de l'ordre visuel courant.
  let hash = 0x811c9dc5;
  for (const caractere of String(identifiant)) {
    hash ^= caractere.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function couleurSupplementaire(index) {
  // Au-dela de la palette, des teintes HSL pastel deterministes evitent toute
  // collision pratique, y compris pour une grande equipe.
  const hue = (index * 137.508) % 360;
  const saturation = 42 + (index % 4) * 4;
  const lightness = 58 + (index % 3) * 4;
  const chroma = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100);
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const base =
    segment < 1
      ? [chroma, second, 0]
      : segment < 2
        ? [second, chroma, 0]
        : segment < 3
          ? [0, chroma, second]
          : segment < 4
            ? [0, second, chroma]
            : segment < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness / 100 - chroma / 2;
  const composante = (valeur) =>
    Math.round((valeur + offset) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${composante(base[0])}${composante(base[1])}${composante(base[2])}`;
}

/**
 * Retourne une Map professeurId -> couleur hexadecimale unique pour la liste
 * passee. L'ordre d'entree ne change pas l'attribution.
 */
function attribuerCouleursCalendrierProfesseurs(professeurs = []) {
  const ids = Array.from(
    new Set(
      (Array.isArray(professeurs) ? professeurs : [professeurs])
        .map((professeur) => normaliserIdentifiant(professeur?.id ?? professeur))
        .filter(Boolean)
    )
  ).sort((premier, second) => premier - second);
  const couleurs = new Map();
  const utilisees = new Set();

  ids.forEach((id, position) => {
    const depart = hacherIdentifiant(id) % PALETTE_PROFESSEURS.length;
    let couleur = null;

    for (let decalage = 0; decalage < PALETTE_PROFESSEURS.length; decalage += 1) {
      const candidate = PALETTE_PROFESSEURS[(depart + decalage) % PALETTE_PROFESSEURS.length];
      if (!utilisees.has(candidate)) {
        couleur = candidate;
        break;
      }
    }

    if (!couleur) {
      let indexSupplementaire = position + PALETTE_PROFESSEURS.length;
      do {
        couleur = couleurSupplementaire(indexSupplementaire);
        indexSupplementaire += 1;
      } while (utilisees.has(couleur));
    }

    utilisees.add(couleur);
    couleurs.set(id, couleur);
  });

  return couleurs;
}

function appliquerCouleursCalendrierProfesseurs(professeurs = []) {
  const liste = Array.isArray(professeurs) ? professeurs : [];
  const couleurs = attribuerCouleursCalendrierProfesseurs(liste);

  return liste.map((professeur) => {
    const id = normaliserIdentifiant(professeur?.id);
    return id && couleurs.has(id)
      ? { ...professeur, couleur_calendrier: couleurs.get(id) }
      : { ...professeur };
  });
}

module.exports = {
  PALETTE_PROFESSEURS,
  attribuerCouleursCalendrierProfesseurs,
  appliquerCouleursCalendrierProfesseurs,
};
