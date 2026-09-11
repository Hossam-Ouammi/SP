const path = require("path");

/**
 * CLI jobs are executed directly by Node, unlike app.js. Load the deployment
 * .env before importing config or models so DATABASE_PATH and SMTP settings
 * resolve exactly like the running application. Existing process variables
 * keep priority because dotenv never overwrites them by default.
 */
function chargerEnvironnementRuntime() {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
    quiet: true,
  });
}

module.exports = {
  chargerEnvironnementRuntime,
};
