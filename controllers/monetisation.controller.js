const puppeteer = require("puppeteer");
const { listerSeancesPourMonetisation } = require("../models/seance.model");
const { listerCatalogueOptions } = require("../models/catalogue.model");
const { convertirDateHeureZonneeEnInstant } = require("../utils/timezone");
const { CENTRAL_CALENDAR_TIMEZONE } = require("../config/public-reservation.config");

const TARIFS_HORAIRES_PAR_DEFAUT = {
  abdo: 90,
  yassine: 130,
  hossam: 150,
};
const REGEX_MOIS_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;
const REGEX_ANNEE_ISO = /^\d{4}$/;
const PDF_GENERATION_TIMEOUT_MS = Math.max(
  Number(process.env.PDF_GENERATION_TIMEOUT_MS) || 30000,
  5000
);
const PDF_GENERATION_MAX_CONCURRENT = Math.max(
  Math.min(Number(process.env.PDF_GENERATION_MAX_CONCURRENT) || 1, 3),
  1
);
const PDF_GENERATION_QUEUE_LIMIT = Math.max(
  Math.min(Number(process.env.PDF_GENERATION_QUEUE_LIMIT) || 5, 20),
  0
);
const PUPPETEER_DISABLE_SANDBOX = ["1", "true", "yes", "on"].includes(
  String(process.env.PUPPETEER_DISABLE_SANDBOX || "").trim().toLowerCase()
);
let generationsPdfActives = 0;
const fileAttentePdf = [];

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(heure || ""));
}

function estHeureFinLegacyValide(heure) {
  return estHeureValide(heure) || heure === "24:00";
}

function convertirHeureEnMinutes(heure) {
  if (heure === "24:00") {
    return 24 * 60;
  }

  const [heures, minutes] = String(heure || "")
    .split(":")
    .map(Number);
  return heures * 60 + minutes;
}

function calculerDureeMinutes(seance) {
  if (Number.isFinite(Number(seance?.duree_minutes)) && Number(seance.duree_minutes) > 0) {
    return Number(seance.duree_minutes);
  }

  if (!estHeureValide(seance?.heure_debut) || !estHeureFinLegacyValide(seance?.heure_fin)) {
    return 0;
  }

  const difference = convertirHeureEnMinutes(seance.heure_fin) - convertirHeureEnMinutes(seance.heure_debut);
  return difference > 0 ? difference : 0;
}

function construireDateHeureLocale(date, heure) {
  if (!date || !estHeureFinLegacyValide(heure)) {
    return null;
  }

  return convertirDateHeureZonneeEnInstant(date, heure, CENTRAL_CALENDAR_TIMEZONE);
}

function calculerStatutMonetisation(seance) {
  if (!["planifiee", "reportee"].includes(seance?.statut_seance)) {
    return seance?.statut_seance || "";
  }

  const dateFin = construireDateHeureLocale(seance.date, seance.heure_fin);

  if (!dateFin) {
    return seance.statut_seance;
  }

  return dateFin.getTime() <= Date.now() ? "faite" : seance.statut_seance;
}

function estSeanceGratuiteMonetisation(seance) {
  return Number(seance?.est_essai) === 1 || seance?.est_essai === true;
}

function estSeanceFaiteMonetisation(seance) {
  return calculerStatutMonetisation(seance) === "faite";
}

function estSeanceFacturableMonetisation(seance) {
  return estSeanceFaiteMonetisation(seance) && !estSeanceGratuiteMonetisation(seance);
}

function calculerMontantSeance(seance, tarifUnitaire) {
  const dureeMinutes = calculerDureeMinutes(seance);

  if (!dureeMinutes || !tarifUnitaire) {
    return 0;
  }

  return (tarifUnitaire * dureeMinutes) / 60;
}

function calculerMonetisationPourCompte(seances, nomCompte, tarifUnitaire) {
  const seancesDuCompte = seances.filter(
    (seance) => (seance.compte || "").trim().toLowerCase() === nomCompte.toLowerCase()
  );
  const seancesFacturables = seancesDuCompte.filter(estSeanceFacturableMonetisation);
  const seancesEssaiFaites = seancesDuCompte.filter(
    (seance) => estSeanceFaiteMonetisation(seance) && estSeanceGratuiteMonetisation(seance)
  );
  const montantDu = seancesFacturables.reduce(
    (total, seance) => total + calculerMontantSeance(seance, tarifUnitaire),
    0
  );

  return {
    tarif_unitaire: tarifUnitaire,
    seances_facturables: seancesFacturables.length,
    seances_essai_faites: seancesEssaiFaites.length,
    montant_du: montantDu,
  };
}

function normaliserCleCompte(valeur) {
  return String(valeur || "").trim().toLowerCase();
}

function extraireCleMoisSeance(seance) {
  const dateSeance = String(seance?.date || "").trim();
  const mois = dateSeance.slice(0, 7);
  return REGEX_MOIS_ISO.test(mois) ? mois : "";
}

function lireFiltreMoisMonetisation(valeur) {
  const texte = String(valeur || "").trim();

  if (!texte || texte.toLowerCase() === "all") {
    return {
      valeur: null,
      invalide: false,
    };
  }

  return {
    valeur: REGEX_MOIS_ISO.test(texte) ? texte : null,
    invalide: !REGEX_MOIS_ISO.test(texte),
  };
}

function lireModePeriodeMonetisation(valeur) {
  const texte = String(valeur || "").trim().toLowerCase();

  if (!texte) {
    return {
      valeur: "annual",
      invalide: false,
    };
  }

  if (["annual", "annuelle"].includes(texte)) {
    return {
      valeur: "annual",
      invalide: false,
    };
  }

  if (["global", "globale"].includes(texte)) {
    return {
      valeur: "global",
      invalide: false,
    };
  }

  return {
    valeur: null,
    invalide: true,
  };
}

function lireFiltreAnneeMonetisation(valeur) {
  const texte = String(valeur || "").trim();

  if (!texte) {
    return {
      valeur: null,
      invalide: false,
    };
  }

  return {
    valeur: REGEX_ANNEE_ISO.test(texte) ? texte : null,
    invalide: !REGEX_ANNEE_ISO.test(texte),
  };
}

function lireListeComptesMonetisation(valeur) {
  if (Array.isArray(valeur)) {
    return valeur
      .flatMap((element) => String(element || "").split(","))
      .map((element) => String(element || "").trim())
      .filter(Boolean);
  }

  return String(valeur || "")
    .split(",")
    .map((element) => element.trim())
    .filter(Boolean);
}

function lireFormatReleveMonetisation(valeur) {
  const texte = String(valeur || "").trim().toLowerCase();

  if (!texte) {
    return {
      valeur: "pdf",
      invalide: false,
    };
  }

  if (["pdf", "html"].includes(texte)) {
    return {
      valeur: texte,
      invalide: false,
    };
  }

  return {
    valeur: null,
    invalide: true,
  };
}

function obtenirTarifHoraireParDefautCompte(nomCompte) {
  return TARIFS_HORAIRES_PAR_DEFAUT[normaliserCleCompte(nomCompte)] || 100;
}

function utilisateurPeutVoirCompteHossam(utilisateur) {
  return normaliserCleCompte(utilisateur?.email) === "hossam@test.com";
}

function peutAfficherCompteDansMonetisation(utilisateur, nomCompte) {
  if (normaliserCleCompte(nomCompte) !== "hossam") {
    return true;
  }

  return utilisateurPeutVoirCompteHossam(utilisateur);
}

function construireContexteMonetisation(utilisateur, seances, catalogue) {
  const comptesCatalogue = Array.isArray(catalogue?.comptes) ? catalogue.comptes : [];
  const comptesCatalogueParNom = new Map(
    comptesCatalogue.map((compte) => [
      normaliserCleCompte(compte?.valeur),
      compte,
    ])
  );
  const seancesVisibles = seances.filter((seance) =>
    peutAfficherCompteDansMonetisation(utilisateur, seance?.compte)
  );
  const comptesVisibles = [];
  const comptesVisiblesParCle = new Set();

  function ajouterCompteVisible(nomCompte) {
    const nomNormalise = String(nomCompte || "").trim();
    const cleCompte = normaliserCleCompte(nomNormalise);

    if (
      !cleCompte ||
      comptesVisiblesParCle.has(cleCompte) ||
      !peutAfficherCompteDansMonetisation(utilisateur, nomNormalise)
    ) {
      return;
    }

    comptesVisiblesParCle.add(cleCompte);
    comptesVisibles.push({
      cle: cleCompte,
      nom: comptesCatalogueParNom.get(cleCompte)?.valeur || nomNormalise,
    });
  }

  comptesCatalogue.forEach((compte) => {
    ajouterCompteVisible(compte?.valeur);
  });

  seancesVisibles.forEach((seance) => {
    ajouterCompteVisible(seance?.compte);
  });

  return {
    comptesCatalogueParNom,
    seancesVisibles,
    comptesVisibles,
  };
}

function obtenirTarifUnitaireCompte(compteVisible, comptesCatalogueParNom) {
  const compteCatalogue = comptesCatalogueParNom.get(compteVisible.cle);
  return Number.isFinite(Number(compteCatalogue?.tarif_horaire))
    ? Number(compteCatalogue.tarif_horaire)
    : obtenirTarifHoraireParDefautCompte(compteVisible.nom);
}

function listerMoisDisponibles(seances) {
  return Array.from(
    new Set(seances.map((seance) => extraireCleMoisSeance(seance)).filter(Boolean))
  ).sort((premierMois, secondMois) => secondMois.localeCompare(premierMois));
}

function listerAnneesDisponibles(seances) {
  return Array.from(
    new Set(
      seances
        .map((seance) => extraireCleMoisSeance(seance))
        .filter(Boolean)
        .map((mois) => mois.slice(0, 4))
    )
  ).sort((premiereAnnee, secondeAnnee) => secondeAnnee.localeCompare(premiereAnnee));
}

function filtrerSeancesParMois(seances, moisIso) {
  if (!moisIso) {
    return seances;
  }

  return seances.filter((seance) => extraireCleMoisSeance(seance) === moisIso);
}

function filtrerSeancesParAnnee(seances, anneeIso) {
  if (!anneeIso) {
    return seances;
  }

  return seances.filter((seance) => extraireCleMoisSeance(seance).startsWith(`${anneeIso}-`));
}

function trierSeancesParDateEtHeure(premiereSeance, secondeSeance) {
  const comparaisonDate = String(premiereSeance?.date || "").localeCompare(String(secondeSeance?.date || ""));

  if (comparaisonDate !== 0) {
    return comparaisonDate;
  }

  const comparaisonHeure = String(premiereSeance?.heure_debut || "").localeCompare(
    String(secondeSeance?.heure_debut || "")
  );

  if (comparaisonHeure !== 0) {
    return comparaisonHeure;
  }

  return Number(premiereSeance?.id || 0) - Number(secondeSeance?.id || 0);
}

function formaterMontantDh(montant) {
  const montantNormalise = Number(montant);
  const options = Number.isInteger(montantNormalise)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  return `${new Intl.NumberFormat("fr-FR", options).format(
    Number.isFinite(montantNormalise) ? montantNormalise : 0
  )} dh`;
}

function formaterDateReleve(dateIso) {
  if (!dateIso) {
    return "-";
  }

  const dateObjet = new Date(`${dateIso}T12:00:00`);
  return Number.isNaN(dateObjet.getTime())
    ? String(dateIso)
    : new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(dateObjet);
}

function formaterMoisReleve(moisIso) {
  if (!REGEX_MOIS_ISO.test(String(moisIso || ""))) {
    return String(moisIso || "-");
  }

  const dateObjet = new Date(`${moisIso}-01T12:00:00`);
  const libelle = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(dateObjet);

  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

function formaterDateHeureGeneration(dateObjet = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateObjet);
}

function formaterPlageHoraire(seance) {
  const heureDebut = estHeureValide(seance?.heure_debut) ? seance.heure_debut : "--:--";
  const heureFin = estHeureFinLegacyValide(seance?.heure_fin) ? seance.heure_fin : "--:--";
  return `${heureDebut} - ${heureFin}`;
}

function echapperHtml(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normaliserNomFichier(valeur) {
  return String(valeur || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function construirePeriodeReleveMonetisation({ filtreMois, modePeriode, filtreAnnee }) {
  if (filtreMois?.valeur) {
    return {
      mode: "monthly",
      mois: filtreMois.valeur,
      annee: filtreMois.valeur.slice(0, 4),
    };
  }

  if (modePeriode?.valeur === "global") {
    return {
      mode: "global",
      mois: null,
      annee: null,
    };
  }

  return {
    mode: "annual",
    mois: null,
    annee: filtreAnnee?.valeur || String(new Date().getFullYear()),
  };
}

function filtrerSeancesPourPeriodeReleveMonetisation(seances, periode) {
  if (periode.mode === "global") {
    return seances;
  }

  if (periode.mode === "annual") {
    return filtrerSeancesParAnnee(seances, periode.annee);
  }

  return filtrerSeancesParMois(seances, periode.mois);
}

function formaterPeriodeReleveMonetisation(periode) {
  if (periode.mode === "global") {
    return "Vue globale";
  }

  if (periode.mode === "annual") {
    return String(periode.annee || "-");
  }

  return formaterMoisReleve(periode.mois);
}

function decrirePeriodeReleveMonetisation(periode) {
  if (periode.mode === "global") {
    return "de la vue globale";
  }

  if (periode.mode === "annual") {
    return `de l'année ${periode.annee}`;
  }

  return `du mois de ${formaterMoisReleve(periode.mois)}`;
}

function construireNomFichierReleveMonetisation(periode, suffixeComptes, extension = "html") {
  if (periode.mode === "global") {
    return ["releve-monetisation", "globale", suffixeComptes || "comptes"].join("-") + `.${extension}`;
  }

  if (periode.mode === "annual") {
    return [
      "releve-monetisation",
      "annuelle",
      periode.annee || String(new Date().getFullYear()),
      suffixeComptes || "comptes",
    ].join("-") + `.${extension}`;
  }

  return [
    "releve-monetisation",
    "mensuelle",
    periode.mois || "mois",
    suffixeComptes || "comptes",
  ].join("-") + `.${extension}`;
}

function creerErreurHttp(status, message) {
  const erreur = new Error(message);
  erreur.status = status;
  return erreur;
}

function acquerirJetonGenerationPdf() {
  if (generationsPdfActives < PDF_GENERATION_MAX_CONCURRENT) {
    generationsPdfActives += 1;
    return Promise.resolve();
  }

  if (fileAttentePdf.length >= PDF_GENERATION_QUEUE_LIMIT) {
    throw creerErreurHttp(
      429,
      "Trop de relevés PDF sont déjà en cours. Réessayez dans quelques instants."
    );
  }

  return new Promise((resolve) => {
    fileAttentePdf.push(resolve);
  }).then(() => {
    generationsPdfActives += 1;
  });
}

function libererJetonGenerationPdf() {
  generationsPdfActives = Math.max(generationsPdfActives - 1, 0);
  const prochain = fileAttentePdf.shift();

  if (prochain) {
    prochain();
  }
}

function executerAvecTimeout(promesse, delaiMs, message) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(creerErreurHttp(504, message));
    }, delaiMs);
  });

  return Promise.race([promesse, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

async function genererPdfDepuisHtml(html) {
  await acquerirJetonGenerationPdf();
  let navigateur = null;

  try {
    navigateur = await executerAvecTimeout(
      puppeteer.launch({
        headless: true,
        args: PUPPETEER_DISABLE_SANDBOX ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
      }),
      PDF_GENERATION_TIMEOUT_MS,
      "Le lancement du générateur PDF a pris trop de temps."
    );
    const page = await navigateur.newPage();
    page.setDefaultNavigationTimeout(PDF_GENERATION_TIMEOUT_MS);
    await executerAvecTimeout(
      page.setContent(html, {
        waitUntil: "networkidle0",
      }),
      PDF_GENERATION_TIMEOUT_MS,
      "La préparation du relevé PDF a pris trop de temps."
    );
    await page.emulateMediaType("screen");

    const pdf = await executerAvecTimeout(
      page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0",
        },
      }),
      PDF_GENERATION_TIMEOUT_MS,
      "La génération du relevé PDF a pris trop de temps."
    );

    return Buffer.from(pdf);
  } finally {
    if (navigateur) {
      await navigateur.close().catch(() => {});
    }
    libererJetonGenerationPdf();
  }
}

function construireHtmlReleveMonetisation({
  periode,
  comptesSelectionnes,
  lignes,
  totauxParCompte,
  montantTotal,
  dateGeneration,
}) {
  const libellePeriode = formaterPeriodeReleveMonetisation(periode);
  const descriptionPeriode = decrirePeriodeReleveMonetisation(periode);
  const lignesHtml = lignes.length
    ? lignes
        .map(
          (ligne) => `
            <tr>
              <td>${echapperHtml(formaterDateReleve(ligne.date))}</td>
              <td>${echapperHtml(formaterPlageHoraire(ligne))}</td>
              <td>${echapperHtml(ligne.compte)}</td>
              <td>${echapperHtml(ligne.etudiant || "-")}</td>
              <td>${echapperHtml(ligne.matiere || "-")}</td>
              <td>${echapperHtml(ligne.duree_label)}</td>
              <td>
                <span class="badge ${ligne.est_gratuite ? "badge-free" : "badge-paid"}">
                  ${ligne.est_gratuite ? "Gratuite" : "Facturable"}
                </span>
              </td>
              <td class="amount-cell">${echapperHtml(formaterMontantDh(ligne.montant))}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="8" class="empty-row">
          Aucune seance faite pour les comptes selectionnes sur cette periode.
        </td>
      </tr>
    `;
  const resumeComptesHtml = comptesSelectionnes
    .map((compte) => {
      const totalCompte = totauxParCompte[compte.nom] || {
        seances_facturables: 0,
        seances_gratuites: 0,
        montant_total: 0,
      };

      return `
        <tr>
          <td>${echapperHtml(compte.nom)}</td>
          <td>${totalCompte.seances_facturables}</td>
          <td>${totalCompte.seances_gratuites}</td>
          <td class="amount-cell">${echapperHtml(formaterMontantDh(totalCompte.montant_total))}</td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Relevé de monétisation ${echapperHtml(libellePeriode)}</title>
    <style>
      :root {
        color-scheme: light;
        --border: #d7e3f4;
        --border-strong: #bfd0e6;
        --text: #0f172a;
        --muted: #6b7a90;
        --surface-soft: #f8fbff;
        --accent: #0f766e;
        --accent-soft: #ecfdf5;
        --accent-strong: #115e59;
      }

      * {
        box-sizing: border-box;
      }

      @page {
        size: A4;
        margin: 10mm 10mm 12mm;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .report-page {
        width: 100%;
      }

      .header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 270px;
        align-items: start;
        gap: 20px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--border);
      }

      .title {
        margin: 0;
        max-width: 280px;
        font-size: 2.05rem;
        line-height: 1.05;
        letter-spacing: -0.03em;
        font-weight: 800;
      }

      .subtitle,
      .meta,
      .note {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.5;
        font-size: 0.9rem;
      }

      .meta-box {
        width: 100%;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-soft);
      }

      .meta-item + .meta-item {
        margin-top: 10px;
      }

      .meta-label {
        display: block;
        margin-bottom: 4px;
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .meta-value {
        display: block;
        font-size: 0.94rem;
        font-weight: 600;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin: 18px 0 22px;
      }

      .summary-card {
        min-height: 78px;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-soft);
      }

      .summary-card span {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .summary-card strong {
        display: block;
        margin-top: 8px;
        font-size: 1.8rem;
        line-height: 1.05;
      }

      h2 {
        margin: 0 0 10px;
        font-size: 1.02rem;
        font-weight: 800;
      }

      .report-section + .report-section {
        margin-top: 20px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      th,
      td {
        padding: 10px 6px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
        word-break: break-word;
      }

      th {
        color: var(--muted);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      td {
        font-size: 0.86rem;
      }

      .amount-cell {
        text-align: right;
        white-space: nowrap;
      }

      .summary-table th:nth-child(1),
      .summary-table td:nth-child(1) {
        width: 26%;
      }

      .summary-table th:nth-child(2),
      .summary-table td:nth-child(2),
      .summary-table th:nth-child(3),
      .summary-table td:nth-child(3) {
        width: 24%;
      }

      .summary-table th:nth-child(4),
      .summary-table td:nth-child(4) {
        width: 26%;
      }

      .details-table th:nth-child(1),
      .details-table td:nth-child(1) {
        width: 12%;
      }

      .details-table th:nth-child(2),
      .details-table td:nth-child(2) {
        width: 12%;
      }

      .details-table th:nth-child(3),
      .details-table td:nth-child(3) {
        width: 10%;
      }

      .details-table th:nth-child(4),
      .details-table td:nth-child(4) {
        width: 18%;
      }

      .details-table th:nth-child(5),
      .details-table td:nth-child(5) {
        width: 13%;
      }

      .details-table th:nth-child(6),
      .details-table td:nth-child(6) {
        width: 10%;
      }

      .details-table th:nth-child(7),
      .details-table td:nth-child(7) {
        width: 15%;
      }

      .details-table th:nth-child(8),
      .details-table td:nth-child(8) {
        width: 10%;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 0.66rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .badge-free {
        color: #92400e;
        background: #fffbeb;
        border: 1px solid #fde68a;
      }

      .badge-paid {
        color: var(--accent-strong);
        background: var(--accent-soft);
        border: 1px solid #a7f3d0;
      }

      .empty-row {
        color: var(--muted);
        text-align: center;
        padding: 22px 12px;
      }

      .total-row td {
        font-weight: 800;
        border-bottom: 0;
        padding-top: 12px;
      }

      .footer {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
      }

      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }

        thead {
          display: table-header-group;
        }

        tr,
        .summary-grid,
        .report-section {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="report-page">
      <header class="header">
        <section>
          <h1 class="title">Relevé de monétisation</h1>
          <p class="subtitle">
            Facture détaillée ${echapperHtml(descriptionPeriode)}.
          </p>
          <p class="meta">
            Comptes inclus : ${echapperHtml(comptesSelectionnes.map((compte) => compte.nom).join(", "))}
          </p>
        </section>

        <aside class="meta-box">
          <div class="meta-item">
            <span class="meta-label">Généré le</span>
            <span class="meta-value">${echapperHtml(formaterDateHeureGeneration(dateGeneration))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Période</span>
            <span class="meta-value">${echapperHtml(libellePeriode)}</span>
          </div>
        </aside>
      </header>

      <section class="summary-grid">
        <article class="summary-card">
          <span>Période</span>
          <strong>${echapperHtml(libellePeriode)}</strong>
        </article>
        <article class="summary-card">
          <span>Nombre de comptes</span>
          <strong>${comptesSelectionnes.length}</strong>
        </article>
        <article class="summary-card">
          <span>Montant total</span>
          <strong>${echapperHtml(formaterMontantDh(montantTotal))}</strong>
        </article>
      </section>

      <section class="report-section">
        <h2>Résumé par compte</h2>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Séances facturables</th>
              <th>Séances gratuites</th>
              <th class="amount-cell">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${resumeComptesHtml}
          </tbody>
        </table>
      </section>

      <section class="report-section">
        <h2>Détail des séances</h2>
        <table class="details-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Horaire</th>
              <th>Compte</th>
              <th>Étudiant</th>
              <th>Matière</th>
              <th>Durée</th>
              <th>Type</th>
              <th class="amount-cell">Prix</th>
            </tr>
          </thead>
          <tbody>
            ${lignesHtml}
            <tr class="total-row">
              <td colspan="7">Total</td>
              <td class="amount-cell">${echapperHtml(formaterMontantDh(montantTotal))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer class="footer">
        <p class="note">
          Les séances gratuites sont affichées avec un prix de 0 dh. Les séances facturables
          sont calculees selon la duree reelle et le tarif horaire du compte selectionne.
        </p>
      </footer>
    </main>
  </body>
</html>`;
}

async function recupererMonetisation(req, res) {
  try {
    const filtreMois = lireFiltreMoisMonetisation(req.query?.mois);
    const modePeriode = lireModePeriodeMonetisation(req.query?.mode);
    const filtreAnnee = lireFiltreAnneeMonetisation(req.query?.annee);

    if (filtreMois.invalide) {
      return res.status(400).json({
        message: "Le mois de monétisation doit être au format YYYY-MM.",
      });
    }

    if (modePeriode.invalide) {
      return res.status(400).json({
        message: "Le mode de monétisation doit être 'annual' ou 'global'.",
      });
    }

    if (filtreAnnee.invalide) {
      return res.status(400).json({
        message: "L'année de monétisation doit être au format YYYY.",
      });
    }

    const [seances, catalogue] = await Promise.all([
      listerSeancesPourMonetisation(),
      listerCatalogueOptions(),
    ]);
    const { comptesCatalogueParNom, seancesVisibles, comptesVisibles } = construireContexteMonetisation(
      req.utilisateur,
      seances,
      catalogue
    );
    const moisDisponibles = listerMoisDisponibles(seancesVisibles);
    const anneesDisponiblesInitiales = listerAnneesDisponibles(seancesVisibles);
    const modeSelectionne = filtreMois.valeur ? "monthly" : modePeriode.valeur;
    const anneeSelectionnee =
      modeSelectionne === "annual"
        ? filtreAnnee.valeur || anneesDisponiblesInitiales[0] || String(new Date().getFullYear())
        : filtreMois.valeur
          ? filtreMois.valeur.slice(0, 4)
          : null;
    const anneesDisponibles = Array.from(
      new Set(
        [anneeSelectionnee, ...anneesDisponiblesInitiales].filter(
          (annee) => REGEX_ANNEE_ISO.test(String(annee || ""))
        )
      )
    ).sort((premiereAnnee, secondeAnnee) => secondeAnnee.localeCompare(premiereAnnee));
    const seancesFiltrees = filtreMois.valeur
      ? filtrerSeancesParMois(seancesVisibles, filtreMois.valeur)
      : modeSelectionne === "global"
        ? seancesVisibles
        : filtrerSeancesParAnnee(seancesVisibles, anneeSelectionnee);
    const moisReleveDisponibles = filtreMois.valeur
      ? moisDisponibles
      : modeSelectionne === "global"
        ? moisDisponibles
        : listerMoisDisponibles(seancesFiltrees);
    const nombreSeancesFacturables = seancesFiltrees.filter(estSeanceFacturableMonetisation).length;
    const nombreSeancesEssaiFaites = seancesFiltrees.filter(
      (seance) => estSeanceFaiteMonetisation(seance) && estSeanceGratuiteMonetisation(seance)
    ).length;
    const statsComptes = {};
    const ordreComptes = [];
    let montantTotal = 0;
    let nombreTotalFacturable = 0;

    comptesVisibles.forEach((compteVisible) => {
      const tarifUnitaire = obtenirTarifUnitaireCompte(compteVisible, comptesCatalogueParNom);
      const stats = calculerMonetisationPourCompte(
        seancesFiltrees,
        compteVisible.nom,
        tarifUnitaire
      );

      ordreComptes.push(compteVisible.nom);
      statsComptes[compteVisible.nom] = stats;
      montantTotal += stats.montant_du;
      nombreTotalFacturable += stats.seances_facturables;
    });

    return res.json({
      monetisation: {
        montant_total: montantTotal,
        nombre_total_facturable: nombreTotalFacturable,
        ordre_comptes: ordreComptes,
        comptes: statsComptes,
        periode: {
          mode_selectionne: modeSelectionne,
          annee_selectionnee: anneeSelectionnee,
          annees_disponibles: anneesDisponibles,
          mois_selectionne: filtreMois.valeur,
          mois_disponibles: moisDisponibles,
          mois_releve_disponibles: moisReleveDisponibles,
          nombre_seances: seancesFiltrees.length,
          nombre_seances_facturables: nombreSeancesFacturables,
          nombre_seances_essai_faites: nombreSeancesEssaiFaites,
        },
      },
    });
  } catch (error) {
    console.error("Erreur monétisation:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de la monétisation." });
  }
}

async function telechargerReleveMonetisation(req, res) {
  try {
    const filtreMois = lireFiltreMoisMonetisation(req.query?.mois);
    const modePeriode = lireModePeriodeMonetisation(req.query?.mode);
    const filtreAnnee = lireFiltreAnneeMonetisation(req.query?.annee);
    const formatReleve = lireFormatReleveMonetisation(req.query?.format);

    if (filtreMois.invalide) {
      return res.status(400).json({
        message: "Le mois du relevé doit être au format YYYY-MM.",
      });
    }

    if (!filtreMois.valeur && modePeriode.invalide) {
      return res.status(400).json({
        message: "Le mode du relevé doit être 'annual' ou 'global'.",
      });
    }

    if (!filtreMois.valeur && filtreAnnee.invalide) {
      return res.status(400).json({
        message: "L'année du relevé doit être au format YYYY.",
      });
    }

    if (formatReleve.invalide) {
      return res.status(400).json({
        message: "Le format du relevé doit être 'pdf' ou 'html'.",
      });
    }

    const periodeSelectionnee = construirePeriodeReleveMonetisation({
      filtreMois,
      modePeriode,
      filtreAnnee,
    });

    const comptesDemandes = lireListeComptesMonetisation(req.query?.compte);

    if (comptesDemandes.length === 0) {
      return res.status(400).json({
        message: "Sélectionnez au moins un compte pour télécharger le relevé.",
      });
    }

    const [seances, catalogue] = await Promise.all([
      listerSeancesPourMonetisation(),
      listerCatalogueOptions(),
    ]);
    const { comptesCatalogueParNom, seancesVisibles, comptesVisibles } = construireContexteMonetisation(
      req.utilisateur,
      seances,
      catalogue
    );
    const comptesVisiblesParCle = new Map(
      comptesVisibles.map((compteVisible) => [compteVisible.cle, compteVisible])
    );
    const comptesSelectionnes = Array.from(
      new Map(
        comptesDemandes
          .map((nomCompte) => comptesVisiblesParCle.get(normaliserCleCompte(nomCompte)))
          .filter(Boolean)
          .map((compteVisible) => [compteVisible.cle, compteVisible])
      ).values()
    );

    if (comptesSelectionnes.length === 0) {
      return res.status(400).json({
        message: "Aucun compte sélectionné n'est disponible pour ce relevé.",
      });
    }

    const comptesSelectionnesParCle = new Map(
      comptesSelectionnes.map((compteVisible) => [compteVisible.cle, compteVisible])
    );
    const lignes = filtrerSeancesPourPeriodeReleveMonetisation(seancesVisibles, periodeSelectionnee)
      .filter(
        (seance) =>
          comptesSelectionnesParCle.has(normaliserCleCompte(seance?.compte)) &&
          estSeanceFaiteMonetisation(seance)
      )
      .sort(trierSeancesParDateEtHeure)
      .map((seance) => {
        const compteVisible = comptesSelectionnesParCle.get(normaliserCleCompte(seance.compte));
        const tarifUnitaire = obtenirTarifUnitaireCompte(compteVisible, comptesCatalogueParNom);
        const estGratuite = estSeanceGratuiteMonetisation(seance);
        const montant = estGratuite ? 0 : calculerMontantSeance(seance, tarifUnitaire);
        const dureeMinutes = calculerDureeMinutes(seance);

        return {
          id: seance.id,
          date: seance.date,
          heure_debut: seance.heure_debut,
          heure_fin: seance.heure_fin,
          etudiant: seance.etudiant || "",
          matiere: seance.matiere || "",
          compte: compteVisible.nom,
          duree_minutes: dureeMinutes,
          duree_label: dureeMinutes > 0 ? `${dureeMinutes} min` : "-",
          est_gratuite: estGratuite,
          montant,
        };
      });
    const totauxParCompte = {};

    comptesSelectionnes.forEach((compteVisible) => {
      totauxParCompte[compteVisible.nom] = {
        seances_facturables: 0,
        seances_gratuites: 0,
        montant_total: 0,
      };
    });

    lignes.forEach((ligne) => {
      const totalCompte = totauxParCompte[ligne.compte];

      if (!totalCompte) {
        return;
      }

      if (ligne.est_gratuite) {
        totalCompte.seances_gratuites += 1;
      } else {
        totalCompte.seances_facturables += 1;
        totalCompte.montant_total += ligne.montant;
      }
    });

    const montantTotal = lignes.reduce((total, ligne) => total + ligne.montant, 0);
    const dateGeneration = new Date();
    const html = construireHtmlReleveMonetisation({
      periode: periodeSelectionnee,
      comptesSelectionnes,
      lignes,
      totauxParCompte,
      montantTotal,
      dateGeneration,
    });
    const suffixeComptes = comptesSelectionnes
      .map((compteVisible) => normaliserNomFichier(compteVisible.nom))
      .filter(Boolean)
      .join("-");

    if (formatReleve.valeur === "html") {
      const nomFichierHtml = construireNomFichierReleveMonetisation(
        periodeSelectionnee,
        suffixeComptes,
        "html"
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${nomFichierHtml}"`);
      return res.send(html);
    }

    const pdf = await genererPdfDepuisHtml(html);
    const nomFichierPdf = construireNomFichierReleveMonetisation(
      periodeSelectionnee,
      suffixeComptes,
      "pdf"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomFichierPdf}"`);
    return res.send(pdf);
  } catch (error) {
    console.error("Erreur relevé monétisation:", error);
    const status = Number(error.status || 500);
    return res.status(status).json({
      message: status >= 500 ? "Erreur lors de la génération du relevé." : error.message,
    });
  }
}

module.exports = {
  recupererMonetisation,
  telechargerReleveMonetisation,
};
