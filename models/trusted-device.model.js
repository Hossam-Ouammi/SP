const crypto = require("crypto");

const { all, get, run } = require("./db");

function hacherValidator(validator) {
  return crypto.createHash("sha256").update(String(validator || "")).digest("hex");
}

function genererSelector() {
  return crypto.randomBytes(12).toString("hex");
}

function genererValidator() {
  return crypto.randomBytes(32).toString("hex");
}

function analyserCookieAppareil(valeur) {
  const [selector, validator] = String(valeur || "").split(":");

  if (
    !selector ||
    !validator ||
    !/^[a-f0-9]{24}$/i.test(selector) ||
    !/^[a-f0-9]{64}$/i.test(validator)
  ) {
    return null;
  }

  return {
    selector: selector.toLowerCase(),
    validator: validator.toLowerCase(),
  };
}

function construireValeurCookieAppareil(selector, validator) {
  return `${selector}:${validator}`;
}

function detecterPlateforme(userAgent) {
  const valeur = String(userAgent || "").toLowerCase();

  if (valeur.includes("iphone")) return "iPhone";
  if (valeur.includes("ipad")) return "iPad";
  if (valeur.includes("android")) return "Android";
  if (valeur.includes("windows")) return "Windows";
  if (valeur.includes("mac os") || valeur.includes("macintosh")) return "Mac";
  if (valeur.includes("linux")) return "Linux";
  return "Appareil";
}

function detecterNavigateur(userAgent) {
  const valeur = String(userAgent || "").toLowerCase();

  if (valeur.includes("edg/")) return "Edge";
  if (valeur.includes("opr/") || valeur.includes("opera")) return "Opera";
  if (valeur.includes("chrome/")) return "Chrome";
  if (valeur.includes("firefox/")) return "Firefox";
  if (valeur.includes("safari/")) return "Safari";
  return "Navigateur";
}

function construireLibelleAppareil(userAgent) {
  return `${detecterPlateforme(userAgent)} - ${detecterNavigateur(userAgent)}`;
}

async function trouverAppareilAutoLoginParSelector(selector) {
  return get(
    `
      SELECT
        trusted_devices.*,
        utilisateurs.nom AS utilisateur_nom,
        utilisateurs.email AS utilisateur_email,
        utilisateurs.acces_active,
        utilisateurs.session_version AS utilisateur_session_version
      FROM trusted_devices
      LEFT JOIN utilisateurs ON utilisateurs.id = trusted_devices.utilisateur_id
      WHERE trusted_devices.selector = ?
    `,
    [String(selector || "").toLowerCase()]
  );
}

async function trouverAppareilAutoLoginParId(id) {
  return get(
    `
      SELECT
        trusted_devices.*,
        utilisateurs.nom AS utilisateur_nom,
        utilisateurs.email AS utilisateur_email
      FROM trusted_devices
      LEFT JOIN utilisateurs ON utilisateurs.id = trusted_devices.utilisateur_id
      WHERE trusted_devices.id = ?
    `,
    [id]
  );
}

async function creerAppareilAutoLogin({
  utilisateurId,
  sessionVersion,
  adresseIp,
  userAgent,
}) {
  for (let tentative = 0; tentative < 5; tentative += 1) {
    const selector = genererSelector();
    const validator = genererValidator();

    try {
      const resultat = await run(
        `
          INSERT INTO trusted_devices (
            utilisateur_id,
            selector,
            validator_hash,
            session_version,
            device_label,
            user_agent,
            adresse_ip
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          utilisateurId,
          selector,
          hacherValidator(validator),
          Number(sessionVersion) || 1,
          construireLibelleAppareil(userAgent),
          userAgent ? String(userAgent).slice(0, 400) : null,
          adresseIp ? String(adresseIp).slice(0, 80) : null,
        ]
      );

      const appareil = await trouverAppareilAutoLoginParId(resultat.id);

      return {
        appareil,
        cookieValue: construireValeurCookieAppareil(selector, validator),
      };
    } catch (error) {
      if (error?.code !== "SQLITE_CONSTRAINT") {
        throw error;
      }
    }
  }

  throw new Error("Impossible de generer un appareil de confiance unique.");
}

async function renouvelerAppareilAutoLogin(
  appareilId,
  { sessionVersion, adresseIp, userAgent }
) {
  const appareil = await trouverAppareilAutoLoginParId(appareilId);

  if (!appareil) {
    return null;
  }

  const validator = genererValidator();

  await run(
    `
      UPDATE trusted_devices
      SET
        validator_hash = ?,
        session_version = ?,
        device_label = ?,
        user_agent = ?,
        adresse_ip = ?,
        last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      hacherValidator(validator),
      Number(sessionVersion) || 1,
      construireLibelleAppareil(userAgent || appareil.user_agent),
      userAgent ? String(userAgent).slice(0, 400) : appareil.user_agent,
      adresseIp ? String(adresseIp).slice(0, 80) : appareil.adresse_ip,
      appareilId,
    ]
  );

  return {
    cookieValue: construireValeurCookieAppareil(appareil.selector, validator),
  };
}

async function supprimerAppareilAutoLoginParId(id) {
  return run("DELETE FROM trusted_devices WHERE id = ?", [id]);
}

async function supprimerAppareilAutoLoginParSelector(selector) {
  return run("DELETE FROM trusted_devices WHERE selector = ?", [String(selector || "").toLowerCase()]);
}

async function supprimerAppareilsAutoLoginUtilisateur(utilisateurId) {
  return run("DELETE FROM trusted_devices WHERE utilisateur_id = ?", [utilisateurId]);
}

async function listerAppareilsAutoLogin() {
  return all(`
    SELECT
      trusted_devices.*,
      utilisateurs.nom AS utilisateur_nom,
      utilisateurs.email AS utilisateur_email
    FROM trusted_devices
    LEFT JOIN utilisateurs ON utilisateurs.id = trusted_devices.utilisateur_id
    ORDER BY trusted_devices.last_used_at DESC, trusted_devices.created_at DESC
  `);
}

module.exports = {
  analyserCookieAppareil,
  hacherValidator,
  creerAppareilAutoLogin,
  trouverAppareilAutoLoginParSelector,
  trouverAppareilAutoLoginParId,
  renouvelerAppareilAutoLogin,
  supprimerAppareilAutoLoginParId,
  supprimerAppareilAutoLoginParSelector,
  supprimerAppareilsAutoLoginUtilisateur,
  listerAppareilsAutoLogin,
};
