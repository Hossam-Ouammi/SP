const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const vapidPath = path.join(__dirname, "..", "database", ".push-vapid-keys.json");

function lireJsonDepuisFichier(chemin) {
  try {
    const contenu = fs.readFileSync(chemin, "utf8");
    return JSON.parse(contenu);
  } catch (error) {
    return null;
  }
}

function recupererClesPushVapid() {
  if (process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY) {
    return {
      publicKey: String(process.env.PUSH_VAPID_PUBLIC_KEY).trim(),
      privateKey: String(process.env.PUSH_VAPID_PRIVATE_KEY).trim(),
    };
  }

  fs.mkdirSync(path.dirname(vapidPath), { recursive: true });

  if (!fs.existsSync(vapidPath)) {
    const cles = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(cles, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return cles;
  }

  const cles = lireJsonDepuisFichier(vapidPath);

  if (cles?.publicKey && cles?.privateKey) {
    return cles;
  }

  const nouvellesCles = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidPath, JSON.stringify(nouvellesCles, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return nouvellesCles;
}

module.exports = {
  recupererClesPushVapid,
};
