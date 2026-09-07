function lireNombreEntierEnvironnement(nom, valeurParDefaut, { minimum, maximum }) {
  const valeur = Number(process.env[nom]);

  if (!Number.isFinite(valeur)) {
    return valeurParDefaut;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(valeur)));
}

module.exports = {
  // 32 octets aleatoires = 256 bits d'entropie avant encodage URL-safe.
  PUBLIC_CALENDAR_TOKEN_BYTES: lireNombreEntierEnvironnement(
    "PUBLIC_CALENDAR_TOKEN_BYTES",
    32,
    { minimum: 24, maximum: 64 }
  ),
  PUBLIC_CALENDAR_REFRESH_INTERVAL_MS: lireNombreEntierEnvironnement(
    "PUBLIC_CALENDAR_REFRESH_INTERVAL_MS",
    15000,
    { minimum: 5000, maximum: 5 * 60 * 1000 }
  ),
  PUBLIC_CALENDAR_SLOT_DURATION_MINUTES: 30,
};
