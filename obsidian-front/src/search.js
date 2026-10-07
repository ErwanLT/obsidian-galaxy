import { TYPE_LABEL } from './universe.js';
import { esc, dot } from './dom.js';

// Palette de recherche (⌘K ou /) : dossiers et notes, sans tenir compte des accents.

/** Aplatit l'arbre : [{ node, ancestors }]. */
export function flattenUniverse(universe) {
  const out = [];
  const walk = (node, ancestors) => {
    out.push({ node, ancestors });
    (node.children || []).forEach(c => walk(c, [...ancestors, node]));
  };
  (universe.children || []).forEach(c => walk(c, []));
  return out;
}

/** Minuscules sans accents, caractère par caractère (les positions restent alignées). */
export function fold(str) {
  return [...String(str)].map(c => c.normalize('NFD')[0].toLowerCase()).join('');
}

/** Correspondances triées : début de nom d'abord, puis noms courts. */
export function searchEntries(entries, query, limit = 40) {
  const q = fold(query.trim());
  if (!q) return [];
  return entries
    .map(e => ({ e, i: fold(e.node.name).indexOf(q) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i || a.e.node.name.length - b.e.node.name.length)
    .slice(0, limit)
    .map(x => x.e);
}

function highlight(name, q) {
  const i = fold(name).indexOf(q);
  if (i < 0 || !q) return esc(name);
  const chars = [...name];
  return esc(chars.slice(0, i).join(''))
    + `<mark>${esc(chars.slice(i, i + q.length).join(''))}</mark>`
    + esc(chars.slice(i + q.length).join(''));
}

export class SearchPalette {
  constructor({ overlay, input, results }, onPick) {
    this.overlay = overlay;
    this.input = input;
    this.results = results;
    this.onPick = onPick;
    this.entries = [];
    this.hits = [];
    this.active = 0;
    this.pickOverride = null;
    this.defaultPlaceholder = input.placeholder;

    input.addEventListener('input', () => this.render(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setActive(this.active + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setActive(this.active - 1);
      } else if (e.key === 'Enter' && this.hits[this.active]) {
        e.preventDefault();
        this.pick(this.hits[this.active]);
      }
    });
    // Clic en dehors de la boîte = fermeture
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });
  }

  setUniverse(universe) {
    this.entries = flattenUniverse(universe);
  }

  get isOpen() {
    return !this.overlay.classList.contains('hidden');
  }

  open() {
    this.overlay.classList.remove('hidden');
    this.input.value = '';
    this.render('');
    this.input.focus();
  }

  close() {
    this.overlay.classList.add('hidden');
    this.pickOverride = null;
    this.input.placeholder = this.defaultPlaceholder;
  }

  /** Ouvre la palette pour choisir une note, puis appelle `cb` (au lieu de naviguer). */
  openPicker(placeholder, cb) {
    this.pickOverride = cb;
    this.open();
    this.input.placeholder = placeholder;
  }

  pick(entry) {
    const override = this.pickOverride;
    this.close();
    if (override) override(entry);
    else this.onPick(entry);
  }

  setActive(i) {
    if (!this.hits.length) return;
    this.active = (i + this.hits.length) % this.hits.length;
    [...this.results.children].forEach((el, n) => el.classList.toggle('is-active', n === this.active));
    this.results.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  render(query) {
    this.results.innerHTML = '';
    this.hits = searchEntries(this.entries, query);
    const q = fold(query.trim());
    if (!q) return;
    if (!this.hits.length) {
      this.results.innerHTML = `<div class="search-empty">Aucun résultat pour « ${esc(query.trim())} »</div>`;
      return;
    }
    this.hits.forEach((entry, i) => {
      const { node, ancestors } = entry;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-hit';
      const parents = ancestors.map(a => a.name).join(' / ') || 'Univers';
      btn.innerHTML = `
      ${dot(node.visualType, 'search-hit-dot')}
      <span class="search-hit-text">
        <span class="search-hit-name">${highlight(node.name, q)}</span>
        <span class="search-hit-path">${esc(parents)}</span>
      </span>
      <span class="search-hit-type">${esc(TYPE_LABEL[node.visualType] || '')}</span>
    `;
      btn.addEventListener('click', () => this.pick(entry));
      btn.addEventListener('mouseenter', () => this.setActive(i));
      this.results.appendChild(btn);
    });
    this.setActive(0);
  }
}
