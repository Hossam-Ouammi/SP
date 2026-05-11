const express = require("express");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const historiqueRoutes = require("./routes/historique.routes");
const indisponibilitesRoutes = require("./routes/indisponibilites.routes");
const monetisationRoutes = require("./routes/monetisation.routes");
const realtimeRoutes = require("./routes/realtime.routes");
const pushRoutes = require("./routes/push.routes");
const seancesRoutes = require("./routes/seances.routes");
const photosRoutes = require("./routes/photos.routes");
const reservationLinksRoutes = require("./routes/reservation-links.routes");
const {
  pageRouter: publicReservationPageRoutes,
  apiRouter: publicReservationApiRoutes,
} = require("./routes/public-reservation.routes");
const { connecterUtilisateurDepuisFormulaire } = require("./controllers/auth.controller");
const { initialiserBaseDeDonnees } = require("./models/db");
const { recupererSecretSession } = require("./models/session-secret");
const { SQLiteSessionStore } = require("./models/session.store");
const {
  appliquerEnTetesSecurite,
  desactiverCacheApi,
  verifierOrigineRequete,
  verifierProtectionCsrf,
  attacherTokenCsrf,
} = require("./middleware/security.middleware");
const { verifierIpBlocklist } = require("./middleware/ip-blocklist.middleware");
const { restaurerConnexionAutomatique } = require("./middleware/auth.middleware");
const { assurerDossiersScreenshots } = require("./utils/screenshot-storage");
const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} = require("./config/security.config");
const { demarrerPlanificateurRappelsPush } = require("./utils/push-notifications");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || process.env.IP || "0.0.0.0";
const trustProxy =
  ["1", "true", "yes", "on"].includes(
    String(process.env.TRUST_PROXY || "").trim().toLowerCase()
  );

fs.mkdirSync(path.join(__dirname, "database"), { recursive: true });
assurerDossiersScreenshots();

app.disable("x-powered-by");
app.set("trust proxy", trustProxy);

function appliquerNoCacheStatic(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

app.use(verifierIpBlocklist);

app.use(compression({
  filter: (req, res) => {
    if (req.headers["accept"] === "text/event-stream") {
      return false;
    }
    return compression.filter(req, res);
  }
}));

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // Limit each IP to 1000 requests per 5 minutes
  message: { message: "Trop de requêtes, veuillez réessayer plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);
app.use(appliquerEnTetesSecurite);
app.use(desactiverCacheApi);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(verifierOrigineRequete);

app.use(
  "/vendor/@fullcalendar/core",
  express.static(path.join(__dirname, "node_modules", "@fullcalendar", "core"), {
    index: false,
    fallthrough: true,
    setHeaders: appliquerNoCacheStatic,
  })
);
app.use(
  "/vendor/@fullcalendar/daygrid",
  express.static(path.join(__dirname, "node_modules", "@fullcalendar", "daygrid"), {
    index: false,
    fallthrough: true,
    setHeaders: appliquerNoCacheStatic,
  })
);
app.use(
  "/vendor/@fullcalendar/timegrid",
  express.static(path.join(__dirname, "node_modules", "@fullcalendar", "timegrid"), {
    index: false,
    fallthrough: true,
    setHeaders: appliquerNoCacheStatic,
  })
);
app.use(
  "/vendor/@fullcalendar/interaction",
  express.static(path.join(__dirname, "node_modules", "@fullcalendar", "interaction"), {
    index: false,
    fallthrough: true,
    setHeaders: appliquerNoCacheStatic,
  })
);

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    fallthrough: true,
    dotfiles: "ignore",
    setHeaders: appliquerNoCacheStatic,
  })
);

app.use("/api/reservation-public", publicReservationApiRoutes);
app.use("/reservation", publicReservationPageRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: recupererSecretSession(),
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: "destroy",
    proxy: trustProxy,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: "auto",
      maxAge: SESSION_MAX_AGE_MS,
    },
  })
);

app.use(restaurerConnexionAutomatique);
app.use(verifierProtectionCsrf);
app.use(attacherTokenCsrf);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/historique", historiqueRoutes);
app.use("/api/indisponibilites", indisponibilitesRoutes);
app.use("/api/monetisation", monetisationRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/liens-reservation", reservationLinksRoutes);
app.use("/api/seances", seancesRoutes);
app.use("/api/photos", photosRoutes);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

function recupererEtatConnexionFormulaire(req) {
  const loginError = String(req.session?.login_error || "").trim();
  const loginUsername = String(req.session?.login_username || "").trim();

  if (req.session) {
    delete req.session.login_error;
    delete req.session.login_username;
  }

  return {
    loginError,
    loginUsername,
  };
}

app.get("/", async (req, res) => {
  appliquerNoCacheStatic(res);
  const { chargerUtilisateurAuthentifie } = require("./middleware/auth.middleware");
  const etatConnexion = recupererEtatConnexionFormulaire(req);
  try {
    const user = await chargerUtilisateurAuthentifie(req, res);
    res.render("index", {
      user,
      loginError: etatConnexion.loginError,
      loginUsername: etatConnexion.loginUsername,
    });
  } catch (error) {
    res.render("index", {
      user: null,
      loginError: etatConnexion.loginError,
      loginUsername: etatConnexion.loginUsername,
    });
  }
});
app.post("/", connecterUtilisateurDepuisFormulaire);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Route introuvable." });
  }

  return res.redirect("/");
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "Chaque screenshot doit faire moins de 5 Mo.",
      LIMIT_FILE_COUNT: "Vous pouvez ajouter jusqu'à 8 screenshots.",
      LIMIT_UNEXPECTED_FILE:
        error.field === "screenshots" || error.field === "photos"
          ? "Vous pouvez ajouter jusqu'à 8 screenshots."
          : "Le champ d'envoi des screenshots est invalide.",
    };

    return res.status(400).json({
      message: messages[error.code] || "Erreur lors de l'envoi des screenshots.",
    });
  }

  return res.status(error.status || 500).json({
    message: error.message || "Une erreur serveur est survenue.",
  });
});

async function demarrerServeur() {
  try {
    await initialiserBaseDeDonnees();
    demarrerPlanificateurRappelsPush();

    app.listen(PORT, HOST, () => {
      console.log(`Serveur lancé sur http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Impossible de démarrer le serveur :", error);
    process.exit(1);
  }
}

demarrerServeur();
