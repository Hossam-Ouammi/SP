import { etatOffline, synchroniserOffline, abandonnerOperation } from "./offline.js";

export function initialiserInterfaceOffline(rafraichir) {
  const panel = document.getElementById("offline-status");
  const dialogue = document.getElementById("offline-status-dialog");
  if (!panel || !dialogue) return;
  const titre = panel.querySelector("[data-offline-title]");
  const icone = panel.querySelector("[data-offline-icon]");
  const chevron = panel.querySelector("[data-offline-chevron]");
  const ouvrir = panel.querySelector("[data-offline-toggle]");
  const titreDialogue = dialogue.querySelector("h2");
  const texte = dialogue.querySelector("[data-offline-text]");
  const liste = dialogue.querySelector("[data-offline-operations]");
  const bouton = dialogue.querySelector("[data-offline-sync]");
  const dessins = {
    offline: '<path d="M3 3l18 18M5 8a12 12 0 0 1 14 0M8 12a7 7 0 0 1 3-1m5 1 1 1M10 16a3 3 0 0 1 4 0M12 20h.01"/>',
    pending: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2"/>',
    error: '<path d="m12 3 10 18H2L12 3Z M12 9v5M12 17h.01"/>',
  };
  let rendu = 0;
  let modeIcone = '';
  function fermer() { if (dialogue.open) dialogue.close(); ouvrir.setAttribute('aria-expanded', 'false'); }
  const afficher = async () => {
    const version = ++rendu;
    try {
      const state = await etatOffline();
      if (version !== rendu) return;
      const conflits = state.operations.some(op => op.status === "conflict" || op.error);
      const erreur = Boolean(state.error || conflits);
      // Online writes/replay stay silent. Only offline status and unresolved
      // errors belong in the header; transport retries automatically on reconnect.
      panel.hidden = !state.owner || (!state.offline && !erreur);
      if (panel.hidden) fermer();
      panel.classList.toggle("has-conflict", erreur);
      panel.classList.toggle("is-pending", !erreur && state.pending > 0);
      dialogue.classList.toggle('has-conflict', erreur);
      titre.textContent = erreur || state.pending ? "Synchronisation" : "Hors ligne";
      const mode = erreur ? 'error' : state.pending ? 'pending' : 'offline';
      if (modeIcone !== mode) {
        modeIcone = mode;
        icone.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${dessins[mode]}</svg>`;
      }
      chevron.toggleAttribute('hidden', !state.pending && !erreur);
      ouvrir.disabled = !state.pending && !erreur;
      ouvrir.setAttribute('aria-label', erreur ? 'Afficher les erreurs de synchronisation' : state.pending ? `Afficher les ${state.pending} changements à synchroniser` : 'Hors ligne');
      titreDialogue.textContent = erreur ? 'Erreurs de synchronisation' : 'Changements à synchroniser';
      texte.textContent = state.error || (erreur ? 'Certaines modifications n’ont pas pu être synchronisées. Consultez les détails ci-dessous.'
        : state.pending ? `${state.pending} modification(s) enregistrée(s) sur cet appareil. La synchronisation se fera automatiquement au retour de la connexion.`
        : 'Aucune modification en attente.');
      bouton.hidden = state.offline || !erreur;
      bouton.disabled = state.offline || state.syncing;
      liste.replaceChildren();
      for (const op of state.operations) {
        const row = document.createElement("li");
        row.classList.toggle('has-error', Boolean(op.error || op.status === 'conflict'));
        const label = document.createElement("span");
        const nom = document.createElement('strong');
        nom.textContent = op.label;
        const detail = document.createElement('small');
        detail.textContent = op.error || (op.status === 'conflict' ? 'Cette modification nécessite une vérification.' : 'En attente de synchronisation');
        label.append(nom, detail);
        const annuler = document.createElement("button");
        annuler.type = "button"; annuler.textContent = "Abandonner";
        annuler.disabled = state.syncing;
        annuler.addEventListener("click", async () => {
          if (confirm("Abandonner cette modification locale et les modifications qui en dépendent ? Les autres modifications seront conservées.")) await abandonnerOperation(op.id);
        });
        row.append(label, annuler); liste.append(row);
      }
    } catch (_) { panel.hidden = true; fermer(); }
  };
  ouvrir.addEventListener('click', () => {
    if (dialogue.open) fermer();
    else { dialogue.showModal(); ouvrir.setAttribute('aria-expanded', 'true'); }
  });
  dialogue.querySelector('[data-offline-close]').addEventListener('click', fermer);
  dialogue.addEventListener('close', () => ouvrir.setAttribute('aria-expanded', 'false'));
  dialogue.addEventListener('click', event => {
    if (event.target !== dialogue) return;
    const r = dialogue.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) fermer();
  });
  bouton.addEventListener("click", () => synchroniserOffline().catch(error => { texte.textContent = error.message; }));
  window.addEventListener("sp-offline-state", afficher);
  window.addEventListener("sp-offline-synced", () => { afficher(); rafraichir(); });
  window.addEventListener("offline", afficher);
  window.addEventListener("online", afficher);
  afficher();
}
