const nodemailer = require("nodemailer");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  BACKUP_SEANCES_EMAIL_FROM,
} = require("../config/backup.config");
const {
  ACCOUNT_LIFECYCLE_APP_URL,
  ACCOUNT_EMAIL_FROM,
  ACCOUNT_EMAIL_DRY_RUN,
} = require("../config/account-lifecycle.config");

function smtpEstConfigure() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function creerTransportSmtp() {
  if (!smtpEstConfigure()) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function obtenirUrlApplication() {
  let valeur = String(ACCOUNT_LIFECYCLE_APP_URL || "").trim();

  if (!valeur && process.env.NODE_ENV !== "production") {
    valeur = `http://localhost:${process.env.PORT || 3000}/`;
  }

  if (!valeur) {
    return null;
  }

  try {
    const url = new URL(valeur);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch (error) {
    return null;
  }
}

function construireLienCycleCompte(type, token) {
  const url = obtenirUrlApplication();

  if (!url) {
    return null;
  }

  const action = type === "activation" ? "activation" : "reset-password";
  // The raw token stays in the URL fragment: browsers do not include it in the
  // HTTP request or in a Referer header when loading the application.
  url.hash = `${action}?token=${encodeURIComponent(token)}`;
  return url.toString();
}

function echapperHtml(valeur) {
  return String(valeur || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function envoyerEmailCycleCompte({ to, subject, text, html }) {
  const transport = creerTransportSmtp();

  if (!transport) {
    return { envoye: false, raison: "smtp-non-configure" };
  }

  if (ACCOUNT_EMAIL_DRY_RUN) {
    return { envoye: false, raison: "dry-run" };
  }

  const from = ACCOUNT_EMAIL_FROM || BACKUP_SEANCES_EMAIL_FROM || SMTP_USER;

  try {
    const info = await transport.sendMail({
      from,
      to: String(to || "").trim(),
      subject,
      text,
      html,
    });

    return {
      envoye: true,
      messageId: info.messageId || null,
    };
  } catch (error) {
    // Do not log the link or token. The caller can safely expose only the
    // delivery state to an authenticated reviewer.
    console.error("Envoi de l'email de cycle de compte impossible :", error.message);
    return { envoye: false, raison: "envoi-echoue" };
  }
}

async function envoyerEmailActivation({ email, nom, token }) {
  const lien = construireLienCycleCompte("activation", token);

  if (!lien) {
    return { envoye: false, raison: "url-application-non-configuree" };
  }

  const nomAffiche = String(nom || "").trim() || "Bonjour";
  const lienHtml = echapperHtml(lien);

  return envoyerEmailCycleCompte({
    to: email,
    subject: "Activez votre compte",
    text:
      `Bonjour ${nomAffiche},\n\n` +
      "Votre demande a été approuvée. Définissez votre mot de passe en ouvrant ce lien :\n" +
      `${lien}\n\n` +
      "Ce lien est personnel, à usage unique et expire prochainement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    html:
      `<p>Bonjour ${echapperHtml(nomAffiche)},</p>` +
      "<p>Votre demande a été approuvée. Définissez votre mot de passe via ce lien :</p>" +
      `<p><a href="${lienHtml}">Activer mon compte</a></p>` +
      "<p>Ce lien est personnel, à usage unique et expire prochainement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>",
  });
}

async function envoyerEmailNouvelleDemandeProfesseur({
  email,
  nomHandler,
  nomDemandeur,
  emailDemandeur,
  handlerPublicId,
}) {
  const nomDestinataire = String(nomHandler || "").trim() || "Bonjour";
  const identifiantHandler = String(handlerPublicId || "").trim();
  const demandeur = String(nomDemandeur || "").trim() || "Un professeur";
  const adresseDemandeur = String(emailDemandeur || "").trim();

  return envoyerEmailCycleCompte({
    to: email,
    subject: "Nouvelle demande Professeur à valider",
    text:
      `Bonjour ${nomDestinataire},\n\n` +
      `${demandeur}${adresseDemandeur ? ` (${adresseDemandeur})` : ""} souhaite rejoindre votre équipe${
        identifiantHandler ? ` (${identifiantHandler})` : ""
      }.\n` +
      "Connectez-vous à l'application, puis ouvrez l'espace Équipe pour accepter ou refuser la demande.\n\n" +
      "Si vous ne reconnaissez pas cette demande, vous pouvez simplement la refuser.",
    html:
      `<p>Bonjour ${echapperHtml(nomDestinataire)},</p>` +
      `<p><strong>${echapperHtml(demandeur)}</strong>${
        adresseDemandeur ? ` (${echapperHtml(adresseDemandeur)})` : ""
      } souhaite rejoindre votre équipe${
        identifiantHandler ? ` (${echapperHtml(identifiantHandler)})` : ""
      }.</p>` +
      "<p>Connectez-vous à l'application, puis ouvrez l'espace Équipe pour accepter ou refuser la demande.</p>" +
      "<p>Si vous ne reconnaissez pas cette demande, vous pouvez simplement la refuser.</p>",
  });
}

async function envoyerEmailReinitialisationMotDePasse({ email, nom, token }) {
  const lien = construireLienCycleCompte("reset", token);

  if (!lien) {
    return { envoye: false, raison: "url-application-non-configuree" };
  }

  const nomAffiche = String(nom || "").trim() || "Bonjour";
  const lienHtml = echapperHtml(lien);

  return envoyerEmailCycleCompte({
    to: email,
    subject: "Réinitialisation de votre mot de passe",
    text:
      `Bonjour ${nomAffiche},\n\n` +
      "Une réinitialisation de mot de passe a été demandée. Utilisez ce lien pour choisir un nouveau mot de passe :\n" +
      `${lien}\n\n` +
      "Ce lien est personnel, à usage unique et expire prochainement. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.",
    html:
      `<p>Bonjour ${echapperHtml(nomAffiche)},</p>` +
      "<p>Une réinitialisation de mot de passe a été demandée. Utilisez ce lien pour choisir un nouveau mot de passe :</p>" +
      `<p><a href="${lienHtml}">Réinitialiser mon mot de passe</a></p>` +
      "<p>Ce lien est personnel, à usage unique et expire prochainement. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>",
  });
}

module.exports = {
  smtpEstConfigure,
  creerTransportSmtp,
  obtenirUrlApplication,
  construireLienCycleCompte,
  envoyerEmailCycleCompte,
  envoyerEmailActivation,
  envoyerEmailNouvelleDemandeProfesseur,
  envoyerEmailReinitialisationMotDePasse,
};
