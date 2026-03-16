const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth.routes");
const seancesRoutes = require("./routes/seances.routes");
const photosRoutes = require("./routes/photos.routes");
const { initialiserBaseDeDonnees } = require("./models/db");

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync(path.join(__dirname, "public", "uploads"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "database"), { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "gestion-seances-secret-local",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use("/vendor", express.static(path.join(__dirname, "node_modules")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/seances", seancesRoutes);
app.use("/api/photos", photosRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
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
