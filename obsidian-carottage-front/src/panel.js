// Fiche d'échantillon : ce qu'on note sur l'étiquette d'une couche prélevée.

import { depthMeters } from './data.js';
import { litColor } from './render.js';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function relativeAge(t, now = Date.now()) {
  const days = Math.round((t - now) / 86_400_000);
  if (Math.abs(days) < 31) return rtf.format(days, 'day');
  const months = Math.round(days / 30.44);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(days / 365.25), 'year');
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Lien obsidian:// vers la note, relatif à la racine du vault. */
export function obsidianUrl(vaultName, layer) {
  const marker = `/${vaultName}/`;
  const i = layer.path.indexOf(marker);
  const file = i >= 0 ? layer.path.slice(i + marker.length) : layer.path;
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file.replace(/\.md$/, ''))}`;
}

export function renderSheet(root, layer, core, { onSelect, onTag }) {
  root.replaceChildren();
  if (!layer) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const zone = { strate: 'strate', meuble: 'sédiment meuble · brouillon', socle: 'socle · non daté' }[layer.zone];

  const head = h('div', 'sheet-head');
  head.append(
    h('span', 'sheet-no', `Échantillon n° ${String(layer.index + 1).padStart(3, '0')} / ${core.layers.length}`),
    h('span', 'sheet-zone', zone),
  );
  const close = h('button', 'sheet-close', '×');
  close.type = 'button';
  close.title = 'Fermer (Échap)';
  close.addEventListener('click', () => onSelect(null));
  head.append(close);

  const title = h('h2', 'sheet-title', layer.name);
  const lit = h('div', 'sheet-litho');
  const sw = h('span', 'swatch');
  sw.style.background = litColor(layer.litho);
  lit.append(sw, h('span', null, layer.folders.join(' / ') || 'racine'));

  const grid = h('dl', 'sheet-grid');
  const row = (k, v) => grid.append(h('dt', null, k), h('dd', null, v));
  if (layer.date) row('Dépôt', `${fmtDate.format(layer.date)} · ${relativeAge(layer.date)}`);
  row('Profondeur', `${depthMeters(layer.from).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`);
  row('Épaisseur', `${layer.words.toLocaleString('fr-FR')} mots · ${Math.max(1, Math.round(layer.words / 230))} min de lecture`);
  row('Liens', `cite ${layer.out.length} · citée par ${layer.in.length}${layer.fossil ? ' · fossile directeur' : ''}`);

  root.append(head, title, lit, grid);

  if (layer.tags.length) {
    const tags = h('div', 'sheet-tags');
    for (const t of layer.tags) {
      const b = h('button', 'tag', `#${t}`);
      b.type = 'button';
      b.addEventListener('click', () => onTag(t));
      tags.append(b);
    }
    root.append(tags);
  }
  if (layer.excerpt) root.append(h('p', 'sheet-excerpt', layer.excerpt));

  const list = (label, items, cls) => {
    if (!items.length) return;
    const box = h('div', `sheet-links ${cls}`);
    box.append(h('h3', null, label));
    const ul = h('ul');
    for (const o of [...items].sort((a, b) => a.index - b.index)) {
      const li = h('li');
      const b = h('button', null, o.name);
      b.type = 'button';
      const sw2 = h('span', 'swatch');
      sw2.style.background = litColor(o.litho);
      b.prepend(sw2);
      b.addEventListener('click', () => onSelect(o, true));
      li.append(b, h('span', 'when', o.date ? new Date(o.date).getUTCFullYear() : o.zone));
      ul.append(li);
    }
    box.append(ul);
    root.append(box);
  };
  list('Cite', layer.out, 'out');
  list('Citée par', layer.in, 'in');

  const actions = h('div', 'sheet-actions');
  const open = h('a', 'btn', 'Ouvrir dans Obsidian');
  open.href = obsidianUrl(core.name, layer);
  actions.append(open);
  if (layer.sourceUrl) {
    const web = h('a', 'btn ghost', 'Lire en ligne ↗');
    web.href = layer.sourceUrl;
    web.target = '_blank';
    web.rel = 'noopener';
    actions.append(web);
  }
  root.append(actions);
}
