const crypto = require("crypto");
const net = require("net");

function genererTokenCsrf() {
  return crypto.randomBytes(32).toString("hex");
}

function determinerOrigineAttendue(req) {
  const protoEntete = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocole = protoEntete || req.protocol || "http";
  return `${protocole}://${req.get("host")}`;
}

function origineCorrespond(origine, origineAttendue) {
  try {
    return new URL(origine).origin === origineAttendue;
  } catch (error) {
    return false;
  }
}

function appliquerEnTetesSecurite(req, res, next) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  if (req.secure || String(req.headers["x-forwarded-proto"]).includes("https")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

function desactiverCacheApi(req, res, next) {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

function verifierOrigineRequete(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const origineAttendue = determinerOrigineAttendue(req);
  const origin = req.get("origin");
  const referer = req.get("referer");

  if (origin && !origineCorrespond(origin, origineAttendue)) {
    return res.status(403).json({
      message: "Origine de requête non autorisée.",
    });
  }

  if (!origin && referer && !origineCorrespond(referer, origineAttendue)) {
    return res.status(403).json({
      message: "Référent de requête non autorisé.",
    });
  }

  return next();
}

function attacherTokenCsrf(req, res, next) {
  if (req.session?.utilisateur) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = genererTokenCsrf();
    }

    res.setHeader("X-CSRF-Token", req.session.csrfToken);
  }

  next();
}

function verifierProtectionCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (!req.session?.utilisateur) {
    return next();
  }

  const tokenRecu = req.get("x-csrf-token");

  if (!tokenRecu || tokenRecu !== req.session.csrfToken) {
    return res.status(403).json({
      message: "Jeton de sécurité invalide. Rechargez la page puis réessayez.",
    });
  }

  return next();
}

function normaliserValeurIp(valeur) {
  let ip = String(valeur || "").trim();

  if (!ip) {
    return "";
  }

  if (ip === "::1") {
    return "127.0.0.1";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const ipEntouree = ip.match(/^\[(.+)\](?::\d+)?$/);
  if (ipEntouree) {
    ip = ipEntouree[1];
  }

  if (net.isIP(ip)) {
    return ip;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    const sansPort = ip.replace(/:\d+$/, "");
    if (net.isIP(sansPort)) {
      return sansPort;
    }
  }

  return ip;
}

function normaliserIpClient(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ip = normaliserValeurIp(
    forwardedFor || req.ip || req.socket?.remoteAddress || ""
  );
  return ip || "ip-inconnue";
}

module.exports = {
  appliquerEnTetesSecurite,
  desactiverCacheApi,
  verifierOrigineRequete,
  attacherTokenCsrf,
  verifierProtectionCsrf,
  genererTokenCsrf,
  normaliserIpClient,
};
