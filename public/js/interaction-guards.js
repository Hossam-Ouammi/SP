// Preserve normal form editing while preventing gesture conflicts elsewhere.
(() => {
  const editable = target => target instanceof Element &&
    target.closest('input, textarea, [contenteditable="true"], [role="textbox"]');
  for (const name of ['selectstart', 'contextmenu', 'copy', 'cut', 'paste', 'dragstart']) {
    document.addEventListener(name, event => {
      if (!editable(event.target)) event.preventDefault();
    });
  }
})();
