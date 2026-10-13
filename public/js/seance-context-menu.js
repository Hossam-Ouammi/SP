// A lightweight context menu, not a modal: the rest of the page stays usable.
export function creerMenuContextuelSeance({ id = "seance-context-menu", label = "Options de la séance" } = {}) {
  const menu = document.createElement("div");
  menu.className = "seance-context-menu";
  menu.id = id;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label);
  menu.hidden = true;
  document.body.appendChild(menu);
  let origine = null;

  function fermer({ restaurerFocus = false } = {}) {
    menu.hidden = true;
    if (restaurerFocus && origine?.isConnected) origine.focus({ preventScroll: true });
    origine = null;
  }

  function fermerDepuisExterieur(event) {
    if (!menu.hidden && !menu.contains(event.target)) fermer();
  }

  function clavier(event) {
    if (menu.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      fermer({ restaurerFocus: true });
    } else if (event.key === "Tab") {
      fermer();
    } else if (menu.contains(event.target) && event.target.matches("button") &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const boutons = [...menu.querySelectorAll("button:not(:disabled)")];
      const index = boutons.indexOf(document.activeElement);
      const suivant = event.key === "Home" ? 0 : event.key === "End" ? boutons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + boutons.length) % boutons.length;
      boutons[suivant]?.focus();
    }
  }

  function repositionnement(event) {
    if (!(event.target instanceof Node) || !menu.contains(event.target)) fermer();
  }

  document.addEventListener("pointerdown", fermerDepuisExterieur, true);
  document.addEventListener("focusin", fermerDepuisExterieur);
  document.addEventListener("keydown", clavier);
  document.addEventListener("scroll", repositionnement, true);
  window.addEventListener("resize", repositionnement);

  function ouvrir({ seance, seances = [seance], info, peutModifier, onAction,
    libelleSelection = (selection) => selection.etudiant || "Séance",
    actions = [["information", "Informations"], ["modifier", "Modifier"],
      ["dupliquer", "Dupliquer"], ["supprimer", "Supprimer"]],
  }) {
    fermer();
    origine = info?.el || document.activeElement;
    menu.replaceChildren();
    let selection = seance;
    const titre = document.createElement("div");
    titre.className = "seance-context-menu-title";
    titre.textContent = libelleSelection(seance);
    menu.appendChild(titre);

    const boutons = [];
    function actualiserActions() {
      titre.textContent = libelleSelection(selection);
      boutons.forEach((bouton) => {
        bouton.disabled = bouton.dataset.action !== "information" && !peutModifier(selection);
      });
    }

    if (seances.length > 1) {
      const choix = document.createElement("select");
      choix.className = "seance-context-menu-choice";
      choix.setAttribute("aria-label", "Choisir une séance parmi celles qui se chevauchent");
      seances.forEach((candidate) => {
        const option = document.createElement("option");
        option.value = String(candidate.id);
        option.textContent = `${candidate.etudiant || "Séance"} · ${candidate.heure_debut}–${candidate.heure_fin}`;
        option.selected = Number(candidate.id) === Number(seance.id);
        choix.appendChild(option);
      });
      choix.addEventListener("change", () => {
        selection = seances.find((candidate) => String(candidate.id) === choix.value);
        actualiserActions();
      });
      menu.appendChild(choix);
    }

    for (const [action, libelle] of actions) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "seance-context-menu-action";
      bouton.dataset.action = action;
      bouton.setAttribute("role", "menuitem");
      bouton.textContent = libelle;
      bouton.addEventListener("click", () => {
        if (bouton.disabled) return;
        fermer();
        onAction(action, selection);
      });
      boutons.push(bouton);
      menu.appendChild(bouton);
    }
    actualiserActions();
    menu.hidden = false;
    // Clamp to the viewport, including when tapped at its lower/right edge.
    const rect = info?.el?.getBoundingClientRect();
    const event = info?.jsEvent;
    const x = event?.clientX || rect?.left || 8;
    const y = event?.clientY || rect?.bottom || 8;
    menu.style.left = `${Math.max(8, Math.min(x, document.documentElement.clientWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    boutons[0].focus({ preventScroll: true });
  }

  return { ouvrir, fermer };
}
