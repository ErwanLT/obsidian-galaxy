// Petits utilitaires DOM pour les fenêtres du jeu.

export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function button(label, onClick, cls = 'btn btn-mini') {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// Une ligne de liste : nom, sous-titre, puis boutons d'action.
export function row({ name, sub, cls, actions = [], indent = 0 }) {
  const r = h('div', `list-row${cls ? ` ${cls}` : ''}`);
  if (indent) r.style.paddingLeft = `${8 + indent * 10}px`;
  r.append(h('span', 'list-name', name), h('span', 'list-sub', sub || ''));
  for (const a of actions) r.appendChild(button(a.label, a.onClick));
  return r;
}

export function list(rows, empty) {
  const box = h('div', 'list-rows');
  if (rows.length) box.append(...rows);
  else box.appendChild(h('div', 'list-empty', empty || 'rien ici.'));
  return box;
}

const FOCUSABLE = 'button, input, [href], [tabindex]:not([tabindex="-1"])';

export class Modal {
  constructor({ root, title, body, close }, { onOpen, onClose } = {}) {
    this.root = root;
    this.titleEl = title;
    this.body = body;
    this.kind = null;
    this.locked = false;
    this.closeBtn = close;
    this.onOpen = onOpen;
    this.onClose = onClose;
    close.addEventListener('click', () => this.close());
    root.addEventListener('pointerdown', e => {
      if (e.target === root) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  // locked : la fenêtre ne se ferme que par un choix explicite (close(true)).
  open(kind, title, content, { focus, locked = false } = {}) {
    const wasOpen = this.isOpen;
    this.kind = kind;
    this.locked = locked;
    this.closeBtn.hidden = locked;
    this.titleEl.textContent = title;
    this.body.replaceChildren(content);
    this.root.hidden = false;
    const target = focus || this.body.querySelector('input') || this.root.querySelector('#modal-close');
    if (target) target.focus({ preventScroll: true });
    if (!wasOpen && this.onOpen) this.onOpen();
  }

  close(force = false) {
    if (!this.isOpen || (this.locked && !force)) return;
    this.root.hidden = true;
    this.kind = null;
    this.locked = false;
    if (this.onClose) this.onClose();
  }

  trapTab(e) {
    const items = [...this.root.querySelectorAll(FOCUSABLE)].filter(x => !x.disabled && x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!this.root.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
}
