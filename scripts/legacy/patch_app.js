const fs = require('fs');
let text = fs.readFileSync('app.js', 'utf8');

if (!text.includes('require("compression")')) {
    text = text.replace(/const express = require\("express"\);/, 'const express = require("express");\nconst compression = require("compression");');
    text = text.replace(/app\.use\(appliquerEnTetesSecurite\);/, 'app.use(compression());\napp.use(appliquerEnTetesSecurite);');
}

text = text.replace(/app\.use\("\/uploads", \s*\(req, res\) =>\s*\{[\s\S]*?res\.status\(404\)\.end\(\);\s*\};\s*\);\s*/, '');

const getRegex = /app\.get\("\/", \s*\(req, res\) =>\s*\{[\s\S]*?res\.sendFile\(path\.join\(__dirname, "public", "index\.html"\)\);\s*\};\s*\);/;
const newGet = `app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.get("/", async (req, res) => {
  appliquerNoCacheStatic(res);
  const { chargerUtilisateurAuthentifie } = require("./middleware/auth.middleware");
  try {
    const user = await chargerUtilisateurAuthentifie(req, res);
    res.render("index", { user });
  } catch (error) {
    res.render("index", { user: null });
  }
});`;

text = text.replace(/app\.get\("\/", \(req, res\) => \{[\s\S]*?res\.sendFile\(path\.join\(__dirname, "public", "index\.html"\)\);\r?\n\}\);/, newGet);
text = text.replace(/app\.use\("\/uploads", \(req, res\) => \{[\s\S]*?res\.status\(404\)\.end\(\);\r?\n\}\);/, '');

fs.writeFileSync('app.js', text);
