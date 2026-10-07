// Contrôles tactiles : croix directionnelle + boutons d'action.
// Les flèches alimentent le même Set de touches que le clavier.

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export function setupTouch(container, keys, { attack, interact, dodge }) {
  if (!isTouchDevice()) return false;
  document.body.classList.add('touch');
  container.hidden = false;

  const hold = (btn, code) => {
    const release = () => keys.delete(code);
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      keys.add(code);
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // pointeur déjà relâché : le pointerup suivant libérera la touche
      }
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  };
  for (const btn of container.querySelectorAll('[data-code]')) hold(btn, btn.dataset.code);

  const tap = (sel, fn) => {
    container.querySelector(sel).addEventListener('pointerdown', e => {
      e.preventDefault();
      fn();
    });
  };
  tap('[data-act="attack"]', attack);
  tap('[data-act="interact"]', interact);
  tap('[data-act="dodge"]', dodge);
  return true;
}
