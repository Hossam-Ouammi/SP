// A copy remains purely visual until the user confirms a legal destination.
export function commencerDuplicationFantome({ element, calendrier, seance, palette = {}, point,
  verifier, confirmer, annuler = () => {}, terminer = () => {} }) {
  const fantome = document.createElement("div");
  fantome.className = "calendar-duplicate-ghost";
  fantome.setAttribute("aria-hidden", "true");
  const titre = document.createElement("strong");
  titre.textContent = seance.etudiant || "Copie de séance";
  const horaire = document.createElement("span");
  const aide = document.createElement("small");
  aide.textContent = "Cliquer pour poser · Échap pour annuler";
  fantome.append(titre, horaire, aide);
  fantome.style.setProperty("--ghost-background", palette.backgroundColor || "#e3eefb");
  fantome.style.setProperty("--ghost-border", palette.borderColor || "#a4bfd9");
  fantome.style.setProperty("--ghost-text", palette.textColor || "#244866");
  document.body.appendChild(fantome);
  document.body.classList.add("is-copying-session");
  calendrier.unselect();
  let ferme = false;
  let position = point || { clientX: innerWidth / 2, clientY: innerHeight / 2 };
  let frame = null;
  const duree = Number(seance.duree_minutes) || 60;
  const minutes = heure => {
    const [h, m] = String(heure).split(":").map(Number);
    return h * 60 + m;
  };
  const heure = valeur => `${String(Math.floor(valeur / 60)).padStart(2, "0")}:${String(valeur % 60).padStart(2, "0")}`;
  const navigation = cible => cible instanceof Element &&
    cible.closest(".fc-prev-button, .fc-next-button, .fc-today-button, .fc-timeGridWeek-button, .fc-dayGridMonth-button");

  function destination() {
    const x = position.clientX, y = position.clientY;
    if (!element.isConnected || !element.getClientRects().length || x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
    const cible = document.elementFromPoint(x, y);
    if (!cible || !element.contains(cible) || cible.closest("button, .fc-toolbar, .fc-col-header, .fc-more-link")) return null;
    if (calendrier.view.type === "dayGridMonth") {
      const jour = cible.closest(".fc-daygrid-day[data-date]");
      if (!jour) return null;
      const rect = jour.getBoundingClientRect();
      return { date: jour.dataset.date, heure_debut: seance.heure_debut,
        heure_fin: heure(minutes(seance.heure_debut) + duree),
        left: rect.left + 5, top: Math.max(rect.top + 25, y - 10), width: rect.width - 10, height: 70 };
    }
    if (calendrier.view.type !== "timeGridWeek") return null;
    const colonne = [...element.querySelectorAll(".fc-timegrid-col[data-date]")].find(el => {
      const rect = el.getBoundingClientRect(); return x >= rect.left && x < rect.right;
    });
    const lignes = [...element.querySelectorAll(".fc-timegrid-slot-lane[data-time]")];
    const index = lignes.findIndex(el => {
      const rect = el.getBoundingClientRect(); return y >= rect.top && y < rect.bottom;
    });
    if (!colonne || index < 0) return null;
    const ligne = lignes[index], rect = ligne.getBoundingClientRect();
    const debutLigne = minutes(ligne.dataset.time);
    const pas = lignes[index + 1] ? minutes(lignes[index + 1].dataset.time) - debutLigne :
      index ? debutLigne - minutes(lignes[index - 1].dataset.time) : 30;
    const debut = Math.floor((debutLigne + (y - rect.top) / rect.height * pas) / 30) * 30;
    const colonneRect = colonne.getBoundingClientRect();
    return { date: colonne.dataset.date, heure_debut: heure(debut), heure_fin: heure(debut + duree),
      left: colonneRect.left + 5, top: rect.top + (debut - debutLigne) / pas * rect.height,
      width: colonneRect.width - 10, height: Math.max(35, duree / pas * rect.height - 2) };
  }

  function afficher() {
    frame = null;
    if (ferme) return;
    const cible = destination();
    const erreur = cible ? verifier(cible) : "Choisissez un créneau dans le calendrier.";
    fantome.classList.toggle("is-forbidden", Boolean(erreur));
    fantome.dataset.allowed = String(!erreur);
    horaire.textContent = cible ? `${cible.heure_debut} – ${cible.heure_fin}` : "Choisissez un créneau";
    Object.assign(fantome.style, {
      left: `${cible?.left ?? Math.min(position.clientX + 12, innerWidth - 210)}px`,
      top: `${cible?.top ?? position.clientY + 12}px`,
      width: `${cible?.width ?? 200}px`, height: `${cible?.height ?? 76}px`,
    });
  }
  function mouvement(event) {
    position = { clientX: event.clientX, clientY: event.clientY };
    if (frame === null) frame = requestAnimationFrame(afficher);
  }
  function defilement() { if (frame === null) frame = requestAnimationFrame(afficher); }
  function redimensionner() { if (innerWidth <= 720) abandonner(); else defilement(); }
  function nettoyer() {
    if (ferme) return;
    ferme = true;
    cancelAnimationFrame(frame);
    fantome.remove();
    document.body.classList.remove("is-copying-session");
    document.removeEventListener("mousemove", mouvement);
    document.removeEventListener("mousedown", bloquer, true);
    document.removeEventListener("pointerdown", bloquer, true);
    document.removeEventListener("click", poser, true);
    document.removeEventListener("keydown", clavier, true);
    document.removeEventListener("scroll", defilement, true);
    window.removeEventListener("resize", redimensionner);
    window.removeEventListener("blur", abandonner);
    terminer();
  }
  function abandonner() { if (!ferme) { nettoyer(); annuler(); } }
  function bloquer(event) {
    if (navigation(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function poser(event) {
    if (navigation(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    position = { clientX: event.clientX, clientY: event.clientY };
    const cible = destination();
    const erreur = cible ? verifier(cible) : "Emplacement interdit.";
    nettoyer();
    if (erreur) annuler(erreur);
    else confirmer({ date: cible.date, heure_debut: cible.heure_debut });
  }
  function clavier(event) {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); abandonner();
    }
  }
  document.addEventListener("mousemove", mouvement);
  document.addEventListener("mousedown", bloquer, true);
  document.addEventListener("pointerdown", bloquer, true);
  document.addEventListener("click", poser, true);
  document.addEventListener("keydown", clavier, true);
  document.addEventListener("scroll", defilement, true);
  window.addEventListener("resize", redimensionner);
  window.addEventListener("blur", abandonner);
  afficher();
  return { annuler: abandonner };
}
