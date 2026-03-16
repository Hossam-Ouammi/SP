import {
  connecterUtilisateur,
  deconnecterUtilisateur,
  recupererUtilisateurCourant,
} from "./auth.js";
import {
  recupererSeances,
  ajouterSeance,
  modifierSeance,
  supprimerSeance,
  changerStatutSeance,
  televerserPhotosDeSeance,
  recupererPhotosDeSeance,
} from "./seances.js";
import { initialiserCalendrier, mettreAJourEvenements } from "./calendrier.js";

const libellesStatutSeance = {
  planifiee: "Planifiée",
  faite: "Faite",
  annulee: "Annulée",
  reportee: "Reportée",
};

const heuresDebutDisponibles = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);
const minutesDebutDisponibles = ["00", "30"];

const etat = {
  utilisateur: null,
  seances: [],
  seanceSelectionnee: null,
  calendrier: null,
};

const elements = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  loginButton: document.getElementById("login-button"),
  logoutButton: document.getElementById("logout-button"),
  addSeanceButton: document.getElementById("add-seance-button"),
  currentUserName: document.getElementById("current-user-name"),
  calendar: document.getElementById("calendar"),
  plannedCount: document.getElementById("planned-count"),
  completedCount: document.getElementById("completed-count"),
  trialCount: document.getElementById("trial-count"),
  regularCount: document.getElementById("regular-count"),
  seanceModal: document.getElementById("seance-modal"),
  seanceModalTitle: document.getElementById("seance-modal-title"),
  seanceModalSubtitle: document.getElementById("seance-modal-subtitle"),
  seanceForm: document.getElementById("seance-form"),
  seanceFormError: document.getElementById("seance-form-error"),
  saveSeanceButton: document.getElementById("save-seance-button"),
  seanceId: document.getElementById("seance-id"),
  etudiant: document.getElementById("etudiant"),
  matiereCheckboxes: Array.from(document.querySelectorAll(".matiere-checkbox")),
  compteCheckboxes: Array.from(document.querySelectorAll(".compte-checkbox")),
  statusOptions: Array.from(document.querySelectorAll(".status-option")),
  date: document.getElementById("date"),
  heureDebut: document.getElementById("heure_debut"),
  heureDebutHourOptions: document.getElementById("heure-debut-hour-options"),
  heureDebutMinuteOptions: document.getElementById("heure-debut-minute-options"),
  heureCheckboxes: [],
  minuteCheckboxes: [],
  heureFinCalculee: document.getElementById("heure_fin_calculee"),
  dureeCheckboxes: Array.from(document.querySelectorAll(".duration-checkbox")),
  statutCheckboxes: Array.from(document.querySelectorAll(".statut-checkbox")),
  essaiCheckboxes: Array.from(document.querySelectorAll(".essai-checkbox")),
  description: document.getElementById("description"),
  screenshotsInput: document.getElementById("seance-screenshots"),
  selectedFiles: document.getElementById("selected-files"),
  detailModal: document.getElementById("detail-modal"),
  detailTitle: document.getElementById("detail-title"),
  detailStatusBadge: document.getElementById("detail-status-badge"),
  detailStudent: document.getElementById("detail-student"),
  detailSubject: document.getElementById("detail-subject"),
  detailAccount: document.getElementById("detail-account"),
  detailDate: document.getElementById("detail-date"),
  detailTime: document.getElementById("detail-time"),
  detailDuration: document.getElementById("detail-duration"),
  detailTrial: document.getElementById("detail-trial"),
  detailCreatedBy: document.getElementById("detail-created-by"),
  detailUpdatedBy: document.getElementById("detail-updated-by"),
  detailCreatedAt: document.getElementById("detail-created-at"),
  detailUpdatedAt: document.getElementById("detail-updated-at"),
  detailDescription: document.getElementById("detail-description"),
  detailPhotos: document.getElementById("detail-photos"),
  detailPhotoCount: document.getElementById("detail-photo-count"),
  editSeanceButton: document.getElementById("edit-seance-button"),
  deleteSeanceButton: document.getElementById("delete-seance-button"),
  quickStatusButtons: Array.from(document.querySelectorAll(".quick-status-button")),
  screenshotPreviewModal: document.getElementById("screenshot-preview-modal"),
  previewTitle: document.getElementById("preview-title"),
  previewImage: document.getElementById("preview-image"),
  previewFilename: document.getElementById("preview-filename"),
  previewDownload: document.getElementById("preview-download"),
  toastContainer: document.getElementById("toast-container"),
};

document.addEventListener("DOMContentLoaded", initialiserApplication);

async function initialiserApplication() {
  initialiserChoixHeureDebut();
  attacherEcouteurs();

  try {
    const utilisateur = await recupererUtilisateurCourant();

    if (utilisateur) {
      etat.utilisateur = utilisateur;
      afficherApplication();
      await chargerSeances();
    } else {
      afficherConnexion();
    }
  } catch (erreur) {
    afficherConnexion();
    afficherToast(erreur.message, "error");
  }
}

function initialiserChoixHeureDebut() {
  elements.heureDebutHourOptions.innerHTML = heuresDebutDisponibles
    .map(
      (heure) => `
        <label class="checkbox-option">
          <input
            class="single-checkbox hour-checkbox"
            name="heure_debut_heure"
            type="checkbox"
            value="${heure}"
          />
          <span>${heure}</span>
        </label>
      `
    )
    .join("");

  elements.heureDebutMinuteOptions.innerHTML = minutesDebutDisponibles
    .map(
      (minute) => `
        <label class="checkbox-option">
          <input
            class="single-checkbox minute-checkbox"
            name="heure_debut_minute"
            type="checkbox"
            value="${minute}"
          />
          <span>${minute}</span>
        </label>
      `
    )
    .join("");

  elements.heureCheckboxes = Array.from(document.querySelectorAll(".hour-checkbox"));
  elements.minuteCheckboxes = Array.from(document.querySelectorAll(".minute-checkbox"));
}

function attacherEcouteurs() {
  elements.loginForm.addEventListener("submit", gererConnexion);
  elements.logoutButton.addEventListener("click", gererDeconnexion);
  elements.addSeanceButton.addEventListener("click", () => {
    ouvrirFormulaireCreation();
  });
  elements.seanceForm.addEventListener("submit", gererSoumissionSeance);
  elements.screenshotsInput.addEventListener("change", afficherFichiersSelectionnes);
  elements.editSeanceButton.addEventListener("click", ouvrirFormulaireModification);
  elements.deleteSeanceButton.addEventListener("click", gererSuppressionSeance);

  attacherSelectionUnique(elements.matiereCheckboxes);
  attacherSelectionUnique(elements.compteCheckboxes);
  attacherSelectionUnique(elements.statutCheckboxes);
  attacherSelectionUnique(elements.heureCheckboxes, mettreAJourHeureDebutSelectionnee);
  attacherSelectionUnique(elements.minuteCheckboxes, mettreAJourHeureDebutSelectionnee);
  attacherSelectionUnique(elements.dureeCheckboxes, mettreAJourHeureFinCalculee);
  attacherSelectionUnique(elements.essaiCheckboxes);

  elements.quickStatusButtons.forEach((bouton) => {
    if (bouton.dataset.status === "reportee") {
      bouton.addEventListener("click", ouvrirFormulaireReport);
      return;
    }

    bouton.addEventListener("click", async () => {
      await gererChangementStatut(bouton.dataset.status);
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", () => {
      fermerModal(document.getElementById(element.dataset.closeModal));
    });
  });
}

function afficherConnexion() {
  elements.loginView.classList.remove("hidden");
  elements.appView.classList.add("hidden");
  elements.loginError.classList.add("hidden");
  elements.loginForm.reset();
}

function afficherApplication() {
  elements.loginView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  elements.currentUserName.textContent = etat.utilisateur.nom;

  if (!etat.calendrier) {
    etat.calendrier = initialiserCalendrier(elements.calendar, {
      onDateClick: ouvrirFormulaireCreation,
      onEventClick: ouvrirDetailSeance,
    });
  }
}

async function gererConnexion(event) {
  event.preventDefault();
  masquerErreur(elements.loginError);
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = "Connexion...";

  try {
    const utilisateur = await connecterUtilisateur(
      elements.loginEmail.value.trim(),
      elements.loginPassword.value
    );

    etat.utilisateur = utilisateur;
    afficherApplication();
    await chargerSeances();
    afficherToast("Connexion réussie.");
  } catch (erreur) {
    afficherErreur(elements.loginError, erreur.message);
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "Se connecter";
  }
}

async function gererDeconnexion() {
  try {
    await deconnecterUtilisateur();
    etat.utilisateur = null;
    etat.seances = [];
    etat.seanceSelectionnee = null;
    afficherConnexion();
    if (etat.calendrier) {
      mettreAJourEvenements(etat.calendrier, []);
    }
    afficherToast("Déconnexion réussie.");
  } catch (erreur) {
    afficherToast(erreur.message, "error");
  }
}

async function chargerSeances(options = {}) {
  const seances = await recupererSeances();
  etat.seances = seances;
  mettreAJourEvenements(etat.calendrier, seances);
  mettreAJourResume();

  if (options.ouvrirSeanceId) {
    const seance = etat.seances.find(
      (item) => Number(item.id) === Number(options.ouvrirSeanceId)
    );

    if (seance) {
      await ouvrirDetailSeance(seance);
    }
  }
}

function mettreAJourResume() {
  const totalPlanifiees = etat.seances.filter(
    (seance) => seance.statut_seance === "planifiee"
  ).length;
  const totalFaites = etat.seances.filter(
    (seance) => seance.statut_seance === "faite"
  ).length;
  const totalEssai = etat.seances.filter((seance) => seance.est_essai).length;
  const totalNormales = etat.seances.filter((seance) => !seance.est_essai).length;

  elements.plannedCount.textContent = String(totalPlanifiees);
  elements.completedCount.textContent = String(totalFaites);
  elements.trialCount.textContent = String(totalEssai);
  elements.regularCount.textContent = String(totalNormales);
}

function ouvrirFormulaireCreation(dateSelectionnee = "") {
  elements.seanceForm.reset();
  masquerErreur(elements.seanceFormError);
  elements.seanceForm.dataset.mode = "creation";
  configurerOptionsStatut("creation");
  definirSousTitreModalSeance("");
  elements.seanceModalTitle.textContent = "Nouvelle séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  elements.seanceId.value = "";
  definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  definirValeurSelectionnee(elements.compteCheckboxes, "Abdo");
  definirValeurSelectionnee(elements.matiereCheckboxes, "Maths");
  definirValeurSelectionnee(elements.essaiCheckboxes, "0");
  definirDureeSelectionnee(60);
  definirHeureDebutSelectionnee(recupererHeureDebutParDefaut());
  viderFichiersSelectionnes();

  if (dateSelectionnee) {
    elements.date.value = dateSelectionnee;
  }

  mettreAJourHeureFinCalculee();
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
}

function ouvrirFormulaireModification() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  configurerOptionsStatut("modification");
  definirSousTitreModalSeance("");
  remplirFormulaire(etat.seanceSelectionnee);
  elements.seanceModalTitle.textContent = "Modifier la séance";
  elements.saveSeanceButton.textContent = "Sauvegarder";
  ouvrirModal(elements.seanceModal);
}

function ouvrirFormulaireReport() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  fermerModal(elements.detailModal);
  elements.seanceForm.dataset.mode = "modification";
  configurerOptionsStatut("modification");
  remplirFormulaire(etat.seanceSelectionnee);
  definirValeurSelectionnee(elements.statutCheckboxes, "reportee");
  definirSousTitreModalSeance(
    `Ancien créneau : ${formatDate(etat.seanceSelectionnee.date)}, ${construirePlageHoraire(
      etat.seanceSelectionnee
    )}. Choisissez une nouvelle date et une nouvelle heure.`
  );
  elements.date.value = "";
  definirHeureDebutSelectionnee("");
  elements.seanceModalTitle.textContent = "Reporter la séance";
  elements.saveSeanceButton.textContent = "Enregistrer";
  ouvrirModal(elements.seanceModal);
  elements.date.focus();
}

function remplirFormulaire(seance) {
  elements.seanceId.value = seance.id;
  elements.etudiant.value = seance.etudiant;
  definirValeurSelectionnee(elements.matiereCheckboxes, seance.matiere);
  definirValeurSelectionnee(elements.compteCheckboxes, seance.compte);
  elements.date.value = seance.date;
  elements.heureDebut.value = seance.heure_debut;
  definirDureeSelectionnee(seance.duree_minutes);
  definirValeurSelectionnee(
    elements.statutCheckboxes,
    seance.statut_manuel || seance.statut_seance
  );
  definirHeureDebutSelectionnee(seance.heure_debut);
  definirValeurSelectionnee(elements.essaiCheckboxes, seance.est_essai ? "1" : "0");
  elements.description.value = seance.description || "";
  masquerErreur(elements.seanceFormError);
  viderFichiersSelectionnes();
  mettreAJourHeureFinCalculee();
}

async function gererSoumissionSeance(event) {
  event.preventDefault();
  masquerErreur(elements.seanceFormError);

  const dureeMinutes = recupererDureeSelectionnee();
  const screenshots = Array.from(elements.screenshotsInput.files);
  const donneesSeance = {
    etudiant: elements.etudiant.value.trim(),
    matiere: recupererValeurSelectionnee(elements.matiereCheckboxes),
    compte: recupererValeurSelectionnee(elements.compteCheckboxes),
    est_essai: recupererValeurSelectionnee(elements.essaiCheckboxes),
    date: elements.date.value,
    heure_debut: elements.heureDebut.value,
    duree_minutes: dureeMinutes,
    statut_seance: recupererValeurSelectionnee(elements.statutCheckboxes),
    description: elements.description.value.trim(),
  };
  const heureFinCalculee = calculerHeureFin(donneesSeance.heure_debut, dureeMinutes);

  if (!donneesSeance.matiere) {
    afficherErreur(elements.seanceFormError, "Sélectionnez une matière.");
    return;
  }

  if (!donneesSeance.compte) {
    afficherErreur(elements.seanceFormError, "Sélectionnez un compte.");
    return;
  }

  if (donneesSeance.est_essai === "") {
    afficherErreur(elements.seanceFormError, "Indiquez s'il s'agit d'une séance d'essai.");
    return;
  }

  if (!dureeMinutes) {
    afficherErreur(elements.seanceFormError, "Sélectionnez une durée.");
    return;
  }

  if (!donneesSeance.statut_seance) {
    afficherErreur(elements.seanceFormError, "Sélectionnez un statut.");
    return;
  }

  if (!donneesSeance.date) {
    afficherErreur(elements.seanceFormError, "La date est obligatoire.");
    return;
  }

  if (!estDateIsoValide(donneesSeance.date)) {
    afficherErreur(elements.seanceFormError, "La date est invalide.");
    return;
  }

  if (!elements.heureDebut.value) {
    afficherErreur(elements.seanceFormError, "L'heure de début est obligatoire.");
    return;
  }

  if (!estHeureDebutSeanceValide(donneesSeance.heure_debut)) {
    afficherErreur(
      elements.seanceFormError,
      "L'heure de début doit être choisie par tranches de 30 minutes."
    );
    return;
  }

  if (!heureFinCalculee) {
    afficherErreur(elements.seanceFormError, "La séance ne peut pas dépasser minuit.");
    return;
  }

  if (screenshots.length > 8) {
    afficherErreur(elements.seanceFormError, "Vous pouvez ajouter jusqu'à 8 screenshots.");
    return;
  }

  const mode = elements.seanceForm.dataset.mode || "creation";

  elements.saveSeanceButton.disabled = true;
  elements.saveSeanceButton.textContent =
    mode === "creation" ? "Création..." : "Sauvegarde...";

  try {
    let seance;

    if (mode === "modification") {
      seance = await modifierSeance(elements.seanceId.value, donneesSeance);
    } else {
      seance = await ajouterSeance(donneesSeance);
    }

    if (screenshots.length > 0) {
      try {
        await televerserPhotosDeSeance(seance.id, screenshots);
      } catch (erreurUpload) {
        afficherToast(
          `${mode === "creation" ? "Séance ajoutée" : "Séance mise à jour"}, mais l'ajout des screenshots a échoué : ${erreurUpload.message}`,
          "warning"
        );
      }
    }

    fermerModal(elements.seanceModal);
    await chargerSeances({ ouvrirSeanceId: seance.id });
    afficherToast(
      mode === "creation" ? "Séance ajoutée." : "Séance mise à jour."
    );
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherErreur(elements.seanceFormError, erreur.message);
  } finally {
    elements.saveSeanceButton.disabled = false;
    elements.saveSeanceButton.textContent =
      mode === "creation" ? "Enregistrer" : "Sauvegarder";
  }
}

async function ouvrirDetailSeance(seance) {
  etat.seanceSelectionnee = seance;
  elements.detailTitle.textContent = seance.libelle;
  elements.detailStudent.textContent = seance.etudiant;
  elements.detailSubject.textContent = seance.matiere;
  elements.detailAccount.textContent = seance.compte;
  elements.detailDate.textContent = formatDate(seance.date);
  elements.detailTime.textContent = construirePlageHoraire(seance);
  elements.detailDuration.textContent = seance.duree_label || "-";
  elements.detailTrial.textContent = seance.essai_label || "Non";
  elements.detailCreatedBy.textContent = seance.cree_par_nom || "Inconnu";
  elements.detailUpdatedBy.textContent = seance.modifie_par_nom || "Inconnu";
  elements.detailCreatedAt.textContent = formatDateHeure(seance.created_at);
  elements.detailUpdatedAt.textContent = formatDateHeure(seance.updated_at);
  elements.detailDescription.textContent =
    seance.description || "Aucune description.";

  definirBadge(
    elements.detailStatusBadge,
    seance.statut_seance,
    libellesStatutSeance[seance.statut_seance]
  );
  mettreEnEtatActionsRapides();
  elements.detailPhotoCount.textContent = "...";
  elements.detailPhotos.innerHTML = '<div class="empty-state">Chargement des screenshots...</div>';

  ouvrirModal(elements.detailModal);

  try {
    const photos = await recupererPhotosDeSeance(seance.id);
    afficherScreenshots(photos);
  } catch (erreur) {
    if (erreur.status === 401) {
      fermerModal(elements.detailModal);
      await gererDeconnexion();
      return;
    }

    elements.detailPhotoCount.textContent = "0";
    elements.detailPhotos.innerHTML = `<div class="empty-state">${erreur.message}</div>`;
  }
}

function mettreEnEtatActionsRapides() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  elements.quickStatusButtons.forEach((bouton) => {
    bouton.disabled =
      bouton.dataset.status !== "reportee" &&
      bouton.dataset.status === etat.seanceSelectionnee.statut_seance;
  });
}

async function gererChangementStatut(nouveauStatut) {
  if (!etat.seanceSelectionnee) {
    return;
  }

  try {
    await changerStatutSeance(etat.seanceSelectionnee.id, nouveauStatut);
    await chargerSeances({ ouvrirSeanceId: etat.seanceSelectionnee.id });
    afficherToast("Statut de la séance mis à jour.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

async function gererSuppressionSeance() {
  if (!etat.seanceSelectionnee) {
    return;
  }

  const confirmation = window.confirm(
    `Supprimer définitivement la séance "${etat.seanceSelectionnee.libelle}" ?`
  );

  if (!confirmation) {
    return;
  }

  try {
    await supprimerSeance(etat.seanceSelectionnee.id);
    fermerModal(elements.detailModal);
    await chargerSeances();
    afficherToast("Séance supprimée.");
  } catch (erreur) {
    if (erreur.status === 401) {
      await gererDeconnexion();
      return;
    }

    afficherToast(erreur.message, "error");
  }
}

function afficherScreenshots(photos) {
  elements.detailPhotoCount.textContent = String(photos.length);

  if (photos.length === 0) {
    elements.detailPhotos.innerHTML =
      '<div class="empty-state">Aucun screenshot pour cette séance.</div>';
    return;
  }

  elements.detailPhotos.innerHTML = "";

  photos.forEach((photo) => {
    const carte = document.createElement("button");
    carte.type = "button";
    carte.className = "photo-card";
    carte.addEventListener("click", () => {
      ouvrirVisionneuseScreenshot(photo);
    });

    const image = document.createElement("img");
    image.src = photo.chemin_fichier;
    image.alt = photo.nom_fichier;
    image.loading = "lazy";

    const legende = document.createElement("span");
    legende.textContent = photo.nom_fichier;

    carte.append(image, legende);
    elements.detailPhotos.appendChild(carte);
  });
}

function ouvrirVisionneuseScreenshot(photo) {
  elements.previewTitle.textContent = "Screenshot";
  elements.previewImage.src = photo.chemin_fichier;
  elements.previewImage.alt = photo.nom_fichier;
  elements.previewFilename.textContent = photo.nom_fichier;
  elements.previewDownload.href = photo.chemin_fichier;
  elements.previewDownload.download = photo.nom_fichier;
  ouvrirModal(elements.screenshotPreviewModal);
}

function afficherFichiersSelectionnes() {
  const fichiers = Array.from(elements.screenshotsInput.files);
  elements.selectedFiles.innerHTML = "";

  if (fichiers.length === 0) {
    return;
  }

  fichiers.forEach((fichier) => {
    const balise = document.createElement("span");
    balise.className = "file-pill";
    balise.textContent = fichier.name;
    elements.selectedFiles.appendChild(balise);
  });
}

function viderFichiersSelectionnes() {
  elements.screenshotsInput.value = "";
  elements.selectedFiles.innerHTML = "";
}

function recupererDureeSelectionnee() {
  const valeur = recupererValeurSelectionnee(elements.dureeCheckboxes);
  return valeur ? Number(valeur) : 0;
}

function configurerOptionsStatut(mode) {
  const creationSeulement = mode === "creation";

  elements.statusOptions.forEach((option) => {
    const checkbox = option.querySelector(".statut-checkbox");
    const estEditionSeulement = option.classList.contains("status-option-edit-only");

    if (!checkbox || !estEditionSeulement) {
      return;
    }

    option.classList.toggle("hidden", creationSeulement);
    checkbox.disabled = creationSeulement;

    if (creationSeulement) {
      checkbox.checked = false;
    }
  });

  if (
    creationSeulement &&
    !["planifiee", "faite"].includes(recupererValeurSelectionnee(elements.statutCheckboxes))
  ) {
    definirValeurSelectionnee(elements.statutCheckboxes, "planifiee");
  }
}

function definirDureeSelectionnee(dureeMinutes) {
  definirValeurSelectionnee(elements.dureeCheckboxes, String(dureeMinutes));
}

function definirHeureDebutSelectionnee(heureDebut) {
  if (!estHeureValide(heureDebut)) {
    definirValeurSelectionnee(elements.heureCheckboxes, "");
    definirValeurSelectionnee(elements.minuteCheckboxes, "");
    elements.heureDebut.value = "";
    mettreAJourHeureFinCalculee();
    return;
  }

  const [heure, minute] = heureDebut.split(":");

  definirValeurSelectionnee(elements.heureCheckboxes, heure);
  definirValeurSelectionnee(elements.minuteCheckboxes, minute);
  elements.heureDebut.value =
    recupererValeurSelectionnee(elements.heureCheckboxes) &&
    recupererValeurSelectionnee(elements.minuteCheckboxes)
      ? `${heure}:${minute}`
      : "";
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureDebutSelectionnee() {
  const heure = recupererValeurSelectionnee(elements.heureCheckboxes);
  const minute = recupererValeurSelectionnee(elements.minuteCheckboxes);

  elements.heureDebut.value = heure && minute ? `${heure}:${minute}` : "";
  mettreAJourHeureFinCalculee();
}

function mettreAJourHeureFinCalculee() {
  const heureDebut = elements.heureDebut.value;
  const dureeMinutes = recupererDureeSelectionnee();

  if (!heureDebut || !dureeMinutes) {
    elements.heureFinCalculee.value = "";
    return;
  }

  elements.heureFinCalculee.value = calculerHeureFin(heureDebut, dureeMinutes);
}

function calculerHeureFin(heureDebut, dureeMinutes) {
  if (!estHeureValide(heureDebut)) {
    return "";
  }

  const [heures, minutes] = heureDebut.split(":").map(Number);
  const totalMinutes = heures * 60 + minutes + Number(dureeMinutes);

  if (totalMinutes > 24 * 60) {
    return "";
  }

  const heuresFin = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutesFin = String(totalMinutes % 60).padStart(2, "0");
  return `${heuresFin}:${minutesFin}`;
}

function estDateIsoValide(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const dateObjet = new Date(`${date}T12:00:00`);
  return !Number.isNaN(dateObjet.getTime()) && dateObjet.toISOString().startsWith(date);
}

function estHeureValide(heure) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);
}

function estHeureDebutSeanceValide(heure) {
  return estHeureValide(heure) && /:(00|30)$/.test(heure);
}

function recupererHeureDebutParDefaut() {
  const maintenant = new Date();
  let heures = maintenant.getHours();
  let minutes = maintenant.getMinutes() <= 30 ? 30 : 0;

  if (minutes === 0) {
    heures += 1;
  }

  if (heures > 23) {
    return "23:30";
  }

  return `${String(heures).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function attacherSelectionUnique(checkboxes, callback) {
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        checkboxes.forEach((autreCheckbox) => {
          if (autreCheckbox !== checkbox) {
            autreCheckbox.checked = false;
          }
        });
      }

      if (callback) {
        callback();
      }
    });
  });
}

function recupererValeurSelectionnee(checkboxes) {
  const checkboxSelectionnee = checkboxes.find((checkbox) => checkbox.checked);
  return checkboxSelectionnee ? checkboxSelectionnee.value : "";
}

function definirValeurSelectionnee(checkboxes, valeur) {
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checkbox.value === valeur;
  });
}

function definirSousTitreModalSeance(message) {
  elements.seanceModalSubtitle.textContent = message;
  elements.seanceModalSubtitle.classList.toggle("hidden", !message);
}

function ouvrirModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function fermerModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  if (modal === elements.seanceModal) {
    elements.seanceForm.reset();
    masquerErreur(elements.seanceFormError);
    definirSousTitreModalSeance("");
    definirValeurSelectionnee(elements.heureCheckboxes, "");
    definirValeurSelectionnee(elements.minuteCheckboxes, "");
    viderFichiersSelectionnes();
    elements.heureFinCalculee.value = "";
    elements.heureDebut.value = "";
  }

  if (modal === elements.screenshotPreviewModal) {
    elements.previewImage.src = "";
    elements.previewImage.alt = "";
    elements.previewFilename.textContent = "-";
    elements.previewDownload.href = "#";
    elements.previewDownload.removeAttribute("download");
  }

  if (
    elements.seanceModal.classList.contains("hidden") &&
    elements.detailModal.classList.contains("hidden") &&
    elements.screenshotPreviewModal.classList.contains("hidden")
  ) {
    document.body.classList.remove("modal-open");
  }
}

function afficherErreur(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function masquerErreur(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function definirBadge(element, type, texte) {
  element.className = "status-badge";
  element.classList.add(`badge-${type}`);
  element.textContent = texte;
}

function afficherToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}

function formatDate(date) {
  if (!estDateIsoValide(date)) {
    return date || "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatDateHeure(dateHeure) {
  if (!dateHeure) {
    return "-";
  }

  const dateNormalisee =
    typeof dateHeure === "string" ? dateHeure.replace(" ", "T") : dateHeure;
  const dateObjet = new Date(dateNormalisee);

  if (Number.isNaN(dateObjet.getTime())) {
    return String(dateHeure);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateObjet);
}

function construirePlageHoraire(seance) {
  const heureDebutValide = estHeureValide(seance.heure_debut);
  const heureFinValide = estHeureValide(seance.heure_fin);

  if (heureDebutValide && heureFinValide) {
    return `${seance.heure_debut} - ${seance.heure_fin}`;
  }

  if (heureDebutValide) {
    return seance.heure_debut;
  }

  return "-";
}
