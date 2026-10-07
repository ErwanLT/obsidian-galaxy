import { VisualType, TYPE_LABEL } from './universe.js';
import { esc, dot } from './dom.js';

// Contenu du panneau d'infos (dossier ou note). Les actions de navigation sont
// fournies par l'appelant : ce module ne connaît ni la scène ni la caméra.

const MAX_CHILDREN_SHOWN = 14;
const RARITY_LABEL = { commune: 'Commune', rare: 'Rare', legendaire: 'Légendaire' };
const $ = id => document.getElementById(id);

function statRows(rows) {
  return rows.map(([lbl, val]) => `
      <div class="stat-row">
        <span class="stat-lbl">${esc(lbl)}</span>
        <span class="stat-val">${esc(val)}</span>
      </div>`).join('');
}

/** Ligne cliquable du panneau (contenu d'un dossier ou note liée). */
function panelItem(label, visualType, prefix, onClick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'child-item';
  item.title = label;
  item.innerHTML = `
        <span class="child-num">${esc(prefix)}</span>
        ${dot(visualType)}
        <span class="child-name">${esc(label)}</span>
      `;
  item.addEventListener('click', onClick);
  return item;
}

/** Lignes de statistiques et entrées listées pour une note. */
function noteContent(node) {
  const out = node._out || [];
  const inc = node._in || [];
  const rows = [
    ['Rareté', RARITY_LABEL[node.rarity] || '—'],
    ['Taille', `${Math.max(1, Math.round((node.size || 0) / 1024))} ko`],
    ['Liens sortants', out.length],
    ['Liens entrants', inc.length],
  ];
  if (!out.length && !inc.length) rows.push(['Statut', 'Orpheline — aucun lien']);
  else if (inc.length >= 5) rows.push(['Statut', 'Très citée']);
  if (node._parent && node._parent._parent) rows.push(['Dossier', node._parent.name]);
  // Notes liées, dans les deux sens : un clic y emmène, où qu'elles soient.
  const entries = [
    ...out.map(t => ({ node: t, prefix: '↗' })),
    ...inc.filter(t => !out.includes(t)).map(t => ({ node: t, prefix: '↙' })),
  ];
  return { rows, entries, title: 'Liens' };
}

function folderContent(node) {
  const children = node.children || [];
  const folders = children.filter(c => c.type === 'DIRECTORY').length;
  const rows = [['Notes', node.markdownCount ?? 0]];
  if (folders > 0) rows.push(['Sous-dossiers', folders]);
  if (children.length > 0) rows.push(['Objets en orbite', children.length]);
  rows.push(['Profondeur', `Niveau ${node.depth ?? 0}`]);
  return { rows, entries: children.map((c, i) => ({ node: c, prefix: `${i + 1}` })), title: 'Contenu' };
}

/**
 * @param node        dossier ou note à afficher
 * @param isCurrent   true si c'est le dossier dans lequel on se trouve déjà
 * @param onEnter     entrer dans le dossier
 * @param onEntry     clic sur une ligne (enfant d'un dossier, ou note liée)
 */
export function renderPanel(node, { isCurrent, onEnter, onEntry, onPath }) {
  const vt = node.visualType;
  const isNote = node.type === 'MARKDOWN_FILE';
  const badge = $('info-badge');
  badge.textContent = isNote && node.rarity && node.rarity !== 'commune'
    ? `Lune ${RARITY_LABEL[node.rarity].toLowerCase()}`
    : TYPE_LABEL[vt] || '';
  badge.className = vt;
  $('info-name').textContent = node.name;
  $('info-path').textContent = node.path || '';

  const { rows, entries, title } = isNote ? noteContent(node) : folderContent(node);
  $('info-stats').innerHTML = statRows(rows);
  $('info-children-title').textContent = title;

  const list = $('info-children');
  const render = limit => {
    list.innerHTML = '';
    entries.slice(0, limit).forEach(({ node: n, prefix }) => {
      list.appendChild(panelItem(n.name, n.visualType, prefix, () => onEntry(n)));
    });
    if (entries.length > limit) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'child-more';
      more.textContent = `+ ${entries.length - limit} autres`;
      more.addEventListener('click', () => render(entries.length));
      list.appendChild(more);
    }
  };
  render(MAX_CHILDREN_SHOWN);
  // On masque toute la section quand il n'y a rien à lister, plutôt
  // que de laisser un titre orphelin.
  $('info-children-section').style.display = entries.length > 0 ? '' : 'none';

  const btnEnter = $('btn-enter');
  const canEnter = vt !== VisualType.MOON && (node.children || []).length > 0 && !isCurrent;
  btnEnter.style.display = canEnter ? 'flex' : 'none';
  btnEnter.onclick = canEnter ? onEnter : null;

  const btnPath = $('btn-path');
  btnPath.style.display = isNote && onPath ? 'flex' : 'none';
  btnPath.onclick = isNote && onPath ? onPath : null;

  const btnObsidian = $('btn-open-obsidian');
  btnObsidian.style.display = isNote ? 'flex' : 'none';
  btnObsidian.onclick = isNote && node.path
    ? () => { window.location.href = `obsidian://open?path=${encodeURIComponent(node.path)}`; }
    : null;
}

/** Panneau d'un chemin entre deux notes : chaque étape est cliquable. */
export function renderPathPanel(path, from, to, onStep) {
  const badge = $('info-badge');
  badge.textContent = 'Chemin';
  badge.className = 'path';
  $('info-name').textContent = `${from.name} → ${to.name}`;
  $('info-path').textContent = path.length
    ? `${path.length - 1} lien${path.length > 2 ? 's' : ''} à suivre`
    : 'Aucune chaîne de liens ne relie ces deux notes.';
  $('info-stats').innerHTML = statRows([
    ['Départ', from.name],
    ['Arrivée', to.name],
    ['Étapes', path.length ? path.length - 2 : '—'],
  ]);
  $('info-children-title').textContent = 'Étapes';
  const list = $('info-children');
  list.innerHTML = '';
  path.forEach((n, i) => list.appendChild(panelItem(n.name, n.visualType, `${i + 1}`, () => onStep(n))));
  $('info-children-section').style.display = path.length ? '' : 'none';
  for (const id of ['btn-enter', 'btn-open-obsidian', 'btn-path']) $(id).style.display = 'none';
}
