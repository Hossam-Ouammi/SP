const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const secretPath = path.join(__dirname, "..", "database", ".session-secret");

function recupererSecretSession() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  fs.mkdirSync(path.dirname(secretPath), { recursive: true });

  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString("hex"), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  return fs.readFileSync(secretPath, "utf8").trim();
}

module.exports = {
  recupererSecretSession,
};
