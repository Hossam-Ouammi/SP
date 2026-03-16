const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth.routes");
const historiqueRoutes = require("./routes/historique.routes");
const monetisationRoutes = require("./routes/monetisation.routes");
const seancesRoutes = require("./routes/seances.routes");
const photosRoutes = require("./routes/photos.routes");
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
const { assurerDossiersScreenshots } = require("./utils/screenshot-storage");
const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} = require("./config/security.config");

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync(path.join(__dirname, "database"), { recursive: true });
assurerDossiersScreenshots();

app.disable("x-powered-by");
app.set("trust proxy", 1);

function appliquerNoCacheStatic(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

app.use(appliquerEnTetesSecurite);
app.use(desactiverCacheApi);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: recupererSecretSession(),
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: "destroy",
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: "auto",
      maxAge: SESSION_MAX_AGE_MS,
    },
  })
);

app.use(verifierOrigineRequete);
app.use(verifierProtectionCsrf);
app.use(attacherTokenCsrf);

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

app.use("/uploads", (req, res) => {
  res.status(404).end();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    fallthrough: true,
    dotfiles: "ignore",
    setHeaders: appliquerNoCacheStatic,
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/historique", historiqueRoutes);
app.use("/api/monetisation", monetisationRoutes);
app.use("/api/seances", seancesRoutes);
app.use("/api/photos", photosRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  appliquerNoCacheStatic(res);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

    app.listen(PORT, () => {
      console.log(`Serveur lancé sur http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Impossible de démarrer le serveur :", error);
    process.exit(1);
  }
}

demarrerServeur();
