/* Missing SMTP must be observable as a failed delivery, never as a fake
 * successful development email. The local outbox remains an explicit dry-run
 * facility covered by account-lifecycle.test.js. */
const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.ACCOUNT_EMAIL_DRY_RUN;
process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR = path.join(
  os.tmpdir(),
  `gestion-seances-mail-config-${process.pid}-${Date.now()}`
);

const { envoyerEmailCycleCompte } = require("../utils/account-email");

async function main() {
  const resultat = await envoyerEmailCycleCompte({
    to: "recipient@example.test",
    subject: "Test SMTP absent",
    text: "Cette livraison ne doit pas etre simulee.",
    html: "<p>Cette livraison ne doit pas etre simulee.</p>",
  });

  assert.equal(resultat.envoye, false);
  assert.equal(resultat.raison, "smtp-non-configure");
  const fichiers = await fs.readdir(process.env.ACCOUNT_EMAIL_DEV_OUTBOX_DIR).catch(() => []);
  assert.equal(fichiers.length, 0, "Aucun faux email ne doit etre depose sans dry-run explicite.");
  console.log("account-email-configuration test: PASS");
}

main().catch((error) => {
  console.error("account-email-configuration test: FAIL", error);
  process.exitCode = 1;
});
