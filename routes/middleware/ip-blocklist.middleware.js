const { estIpBloquee } = require("../models/ip-blocklist.model");
const { normaliserIpClient } = require("./security.middleware");

async function verifierIpBlocklist(req, res, next) {
  try {
    const ip = normaliserIpClient(req);
    const bloquee = await estIpBloquee(ip);

    if (bloquee) {
      return res.status(403).json({
        message: "Votre adresse IP a ete bloquee par l'administrateur.",
        code: "IP_BLOCKED",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifierIpBlocklist,
};
