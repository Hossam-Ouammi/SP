const MINIMUM_SECRET_BYTES = 32;

function environnementEstProduction(environnement = process.env) {
  return String(environnement?.NODE_ENV || "").trim().toLowerCase() === "production";
}

function secretSembleEtreUnPlaceholder(valeur) {
  return /^(?:change|replace|your|example|placeholder|default|test)(?:[-_\s]|$)/i.test(
    String(valeur || "").trim()
  );
}

function secretConfigureEstRobuste(valeur) {
  const secret = String(valeur || "").trim();

  return (
    Buffer.byteLength(secret, "utf8") >= MINIMUM_SECRET_BYTES &&
    !secretSembleEtreUnPlaceholder(secret)
  );
}

/**
 * An explicitly configured secret takes precedence over the protected local
 * fallback files.  In production it must therefore be strong enough to be a
 * real secret; accepting a short `CHANGE_ME_...` value would silently weaken
 * every signed session or audit record.
 */
function verifierSecretConfigurePourProduction(nom, valeur, environnement = process.env) {
  const secret = String(valeur || "").trim();

  if (!secret || !environnementEstProduction(environnement)) {
    return;
  }

  if (!secretConfigureEstRobuste(secret)) {
    throw new Error(
      `${nom} doit contenir au moins ${MINIMUM_SECRET_BYTES} octets aléatoires et ne peut pas être une valeur exemple en production.`
    );
  }
}

module.exports = {
  MINIMUM_SECRET_BYTES,
  environnementEstProduction,
  secretSembleEtreUnPlaceholder,
  secretConfigureEstRobuste,
  verifierSecretConfigurePourProduction,
};
