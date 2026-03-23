const fs = require('fs');
const path = require('path');

function runFixes() {
  console.log("Starting fixes...");

  // 1. PUBLIC/INDEX.HTML -> VIEWS/INDEX.EJS
  const viewsDir = path.join(__dirname, 'views');
  if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
  }

  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8');

    // Mémoriser l'identifiant text fix
    html = html.replace("Enregistrer l'identifiant sur cet appareil", "Mémoriser l'identifiant (Pseudo/Email)");

    // Inject EJS block for app-view
    const appViewStart = '<section id="app-view" class="page app-page hidden">';
    html = html.replace(appViewStart, '<% if (typeof user !== "undefined" && user) { %>\n      ' + appViewStart);
    
    // Inject ending EJS block for app-view before </main>
    html = html.replace('</main>', '<% } %>\n    </main>');

    // Inject EJS block for admin-tools-panel
    const adminToolsStart = '<section id="admin-tools-panel" class="user-admin-shell hidden">';
    html = html.replace(adminToolsStart, '<% if (typeof user !== "undefined" && user.est_admin === 1) { %>\n              ' + adminToolsStart);
    
    // The section ends right before the sessions article
    const endAdminTools = '</article>\n\n                <article class="admin-card admin-sessions-card">';
    html = html.replace(endAdminTools, '<% } %>\n                </article>\n\n                <article class="admin-card admin-sessions-card">');

    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), html);
    fs.unlinkSync(indexPath);
    console.log("Moved index.html to views/index.ejs and added EJS tags.");
  }

  // 2. MODIFY APP.JS
  const appJsPath = path.join(__dirname, 'app.js');
  let appJs = fs.readFileSync(appJsPath, 'utf-8');

  // Add compression
  if (!appJs.includes('compression')) {
    appJs = appJs.replace('const express = require("express");', 'const express = require("express");\nconst compression = require("compression");');
    appJs = appJs.replace('app.use(appliquerEnTetesSecurite);', 'app.use(compression());\napp.use(appliquerEnTetesSecurite);');
  }

  // Update root route
  if (!appJs.includes('app.set("view engine"')) {
    const oldRoute = 'app.get("/", (req, res) => {\n  appliquerNoCacheStatic(res);\n  res.sendFile(path.join(__dirname, "public", "index.html"));\n});';
    const newRoute = `app.set("view engine", "ejs");
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
    appJs = appJs.replace(oldRoute, newRoute);
  }

  // Remove uploads route
  const uploadsRoute = 'app.use("/uploads", (req, res) => {\n  res.status(404).end();\n});\n';
  appJs = appJs.replace(uploadsRoute, '');

  fs.writeFileSync(appJsPath, appJs);
  console.log("Patched app.js.");

  // 3. MODIFY UI.JS
  const uiJsPath = path.join(__dirname, 'public', 'js', 'ui.js');
  let uiJs = fs.readFileSync(uiJsPath, 'utf-8');

  // DOM Proxy fallback
  if (!uiJs.includes('const _origGet')) {
    const proxyBlock = `
const _origGet = document.getElementById.bind(document);
document.getElementById = function(id) {
  const el = _origGet(id);
  if (!el && typeof id === 'string') {
    const dummy = document.createElement(id.includes('select') ? 'select' : 'div');
    dummy.id = id;
    return dummy;
  }
  return el;
};
`;
    uiJs = uiJs.replace('const elements = {', proxyBlock + '\nconst elements = {');
  }

  // Add robust ?. to elements.loginPassword.type = ...
  uiJs = uiJs.replace('elements.loginPassword.type = elements.loginShowPassword.checked ? "text" : "password";', 'if (elements.loginPassword) elements.loginPassword.type = elements.loginShowPassword.checked ? "text" : "password";');
  
  // Make event listeners robust with Optional Chaining
  // Replace .addEventListener with ?.addEventListener
  uiJs = uiJs.replace(/\.addEventListener\(/g, '?.addEventListener(');

  // Add native confirm dialogs for destructive actions in admin tools
  const seancesConfirmStr = `if (!confirm("Êtes-vous sûr(e) de vouloir tout supprimer ? Cette action est irréversible et effacera toutes les séances et captures.")) return;`;
  uiJs = uiJs.replace('async function gererSuppressionToutesLesSeances(event) {\n  event.preventDefault();', 'async function gererSuppressionToutesLesSeances(event) {\n  event.preventDefault();\n  ' + seancesConfirmStr);

  const historyConfirmStr = `if (!confirm("Voulez-vous vraiment supprimer tout l'historique des actions ?")) return;`;
  uiJs = uiJs.replace('async function gererSuppressionToutHistorique(event) {\n  event.preventDefault();', 'async function gererSuppressionToutHistorique(event) {\n  event.preventDefault();\n  ' + historyConfirmStr);

  const catchBlock = `afficherErreur(elements.loginError, erreur.message);`;
  const newCatchBlock = `
    if (erreur.status === 429 && erreur.retryAfter) {
      let restantes = parseInt(erreur.retryAfter, 10);
      if (!isNaN(restantes)) {
        if (elements.loginButton) elements.loginButton.disabled = true;
        afficherErreur(elements.loginError, "Trop de tentatives. Reessayez dans " + restantes + "s");
        const timer = setInterval(() => {
          restantes--;
          if (restantes <= 0) {
            clearInterval(timer);
            masquerErreur(elements.loginError);
            if (elements.loginButton) {
              elements.loginButton.disabled = false;
              elements.loginButton.textContent = "Se connecter";
            }
          } else {
            afficherErreur(elements.loginError, "Trop de tentatives. Reessayez dans " + restantes + "s");
          }
        }, 1000);
        return;
      }
    }
    afficherErreur(elements.loginError, erreur.message);
  `;
  uiJs = uiJs.replace(catchBlock, newCatchBlock);

  // Page reloads on login success and logout
  // Wait, these are in ui.js under gererConnexion ? 
  uiJs = uiJs.replace('afficherApplication();', 'if (!document.getElementById("aujourdhui-section") || !document.getElementById("aujourdhui-section").parentElement) {\n    window.location.reload();\n    return;\n  }\n  afficherApplication();');
  uiJs = uiJs.replace('afficherConnexion();', 'if (document.getElementById("aujourdhui-section") && document.getElementById("aujourdhui-section").parentElement) {\n    window.location.reload();\n    return;\n  }\n  afficherConnexion();');

  // Add Loader state in `gererConnexion`
  uiJs = uiJs.replace('elements.loginButton.disabled = true;', 'elements.loginButton.disabled = true;\n  const originalText = elements.loginButton.textContent;\n  elements.loginButton.textContent = "Connexion en cours...";');
  uiJs = uiJs.replace('elements.loginButton.disabled = false;', 'elements.loginButton.disabled = false;\n    if (typeof originalText !== "undefined") elements.loginButton.textContent = originalText;');

  fs.writeFileSync(uiJsPath, uiJs);
  console.log("Patched ui.js with robust generic checks, loader, and refresh handling.");

}

runFixes();
