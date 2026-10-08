// Carottage — le vault comme une carotte de sédiments.

import { buildCore, fetchUniverse, depthMeters } from './data.js';
import { layoutTray, layoutByPeriod, layerAt } from './layout.js';
import { renderTray, drawVeins, litColor } from './render.js';
import { renderSheet } from './panel.js';
import { matcher } from './filter.js';

const svg = document.getElementById('tray');
const wrap = document.getElementById('tray-wrap');
const tip = document.getElementById('tip');
const sheet = document.getElementById('sheet');
const search = document.getElementById('search');
const status = document.getElementById('status');
const cut = document.getElementById('cut');

// Découpage choisi : retenu d'une visite à l'autre (si le navigateur le permet).
const CUT_KEY = 'carottage.cut';
try {
  const saved = localStorage.getItem(CUT_KEY);
  if (saved && cut.querySelector(`option[value="${saved}"]`)) cut.value = saved;
} catch { /* stockage indisponible : découpage par défaut */ }
if (!cut.value) cut.value = 't12';
cut.addEventListener('change', () => {
  try { localStorage.setItem(CUT_KEY, cut.value); } catch { /* sans importance */ }
  layout();
  if (selected) scrollToLayer(selected);
});

let core = null;
let tray = null;
let view = null;
let hovered = null;
let selected = null;
let query = '';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

async function boot() {
  try {
    core = buildCore(await fetchUniverse());
  } catch (err) {
    console.error(err);
    showStatus('Impossible de joindre le back (/api/universe). Lance obsidian-back puis recharge la page.');
    svg.hidden = true;
    document.getElementById('subtitle').textContent = 'Carottier à l’arrêt';
    return;
  }
  if (!core.hasDates) {
    showStatus('Aucune note n’a de date de publication (published_at) : tout reste en sédiments meubles. '
      + 'Le back doit exposer les propriétés du frontmatter.');
  }
  describe();
  buildLegend();
  layout();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) select(core.layers.find(l => l.path.endsWith(`/${fromHash}.md`)) || null, true);
}

function showStatus(text) {
  status.hidden = false;
  status.textContent = text;
}

function describe() {
  const strata = core.counts.get('strate') || 0;
  const drafts = core.counts.get('meuble') || 0;
  const parts = [`${core.name}`, `${strata} strates`];
  if (drafts) parts.push(`${drafts} en sédiment meuble`);
  parts.push(`${depthMeters(core.totalWords).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m de dépôt`);
  if (core.span) {
    const years = (core.span.newest - core.span.oldest) / (365.25 * 86_400_000);
    parts.push(`${years.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`);
  }
  parts.push(`${core.hiatuses.length} lacune${core.hiatuses.length > 1 ? 's' : ''}`);
  document.getElementById('subtitle').textContent = parts.join(' · ');
}

function buildLegend() {
  const ul = document.getElementById('legend-list');
  ul.replaceChildren();
  for (const g of core.groups) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = litColor(g);
    b.append(sw, `${g.name} `, Object.assign(document.createElement('span'), { className: 'count', textContent: g.count }));
    b.title = g.key;
    b.addEventListener('click', () => setQuery(g.key.includes(' ') ? `dossier:"${g.key}"` : `dossier:${g.key}`));
    li.append(b);
    ul.append(li);
  }
  const toggle = document.getElementById('legend-toggle');
  const legend = document.getElementById('legend');
  toggle.onclick = () => {
    legend.hidden = !legend.hidden;
    toggle.setAttribute('aria-expanded', String(!legend.hidden));
    layout();
  };
}

function layout() {
  if (!core) return;
  const rect = wrap.getBoundingClientRect();
  const narrow = window.innerWidth < 640;
  const width = rect.width - 40;
  const height = window.innerHeight - rect.top - document.getElementById('foot').offsetHeight - 110;
  const mode = cut.value;
  const amount = Number(mode.slice(1));
  if (mode[0] === 't') {
    // Une carotte par période : colonnes plus larges pour l'année, plus serrées pour le mois.
    const size = amount === 1 ? { colW: 40, gap: 20 } : amount >= 12 ? { colW: 84, gap: 56 } : { colW: 60, gap: 30 };
    if (narrow) Object.assign(size, { colW: Math.round(size.colW * 0.7), gap: Math.round(size.gap * 0.7) });
    tray = layoutByPeriod(core, height, amount, size);
  } else {
    const size = narrow ? { colW: 46, gap: 28, minMedian: 12 } : {};
    tray = layoutTray(core, width, height, mode[0] === 'w' ? { ...size, words: amount } : size);
  }
  hovered = null;   // les couches ont bougé sous le pointeur
  tip.hidden = true;
  view = renderTray(svg, core, tray);
  applyFilter();
  highlight();
}

// --- Survol, sélection, veines -------------------------------------------

function trayPoint(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

svg.addEventListener('pointermove', e => {
  if (!tray) return;
  const p = trayPoint(e);
  const l = layerAt(tray, p.x, p.y);
  if (l !== hovered) {
    hovered = l;
    highlight();
  }
  svg.style.cursor = l ? 'pointer' : 'default';
  if (!l) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.replaceChildren();
  const t = document.createElement('strong');
  t.textContent = l.name;
  const m = document.createElement('span');
  const when = l.date ? fmtDate.format(l.date) : l.zone === 'meuble' ? 'brouillon' : 'non daté';
  m.textContent = `${when} · ${l.words.toLocaleString('fr-FR')} mots · ${l.litho.name}`;
  tip.append(t, m);
  const r = wrap.getBoundingClientRect();
  const x = e.clientX - r.left + wrap.scrollLeft;
  const y = e.clientY - r.top + wrap.scrollTop;
  tip.style.transform = `translate(${Math.min(x + 14, wrap.scrollWidth - 280)}px, ${y + 16}px)`;
});

svg.addEventListener('pointerleave', () => {
  hovered = null;
  tip.hidden = true;
  highlight();
});

svg.addEventListener('click', e => {
  const l = layerAt(tray, trayPoint(e).x, trayPoint(e).y);
  select(l === selected ? null : l);
});

function select(layer, scroll = false) {
  selected = layer;
  renderSheet(sheet, layer, core, { onSelect: select, onTag: t => setQuery(`#${t}`) });
  if (document.body.classList.contains('has-sheet') !== !!layer) {
    document.body.classList.toggle('has-sheet', !!layer);
    layout();   // la fiche prend de la place : la caisse se réorganise
  }
  history.replaceState(null, '', layer ? `#${encodeURIComponent(layer.path.split('/').pop().replace(/\.md$/, ''))}` : location.pathname);
  highlight();
  if (layer && scroll) scrollToLayer(layer);
}

function scrollToLayer(layer) {
  const p = layer.pieces[0];
  const box = svg.getBoundingClientRect();
  const scale = box.width / svg.viewBox.baseVal.width;
  const y = window.scrollY + box.top + (p.y0 - svg.viewBox.baseVal.y) * scale;
  const x = wrap.scrollLeft + box.left + (p.x + 20) * scale - wrap.getBoundingClientRect().left;
  window.scrollTo({ top: Math.max(0, y - window.innerHeight / 2), behavior: 'smooth' });
  wrap.scrollTo({ left: Math.max(0, x - wrap.clientWidth / 2), behavior: 'smooth' });
}

function highlight() {
  if (!view) return;
  const focus = selected || hovered;
  svg.classList.toggle('focusing', !!focus);
  for (const [id, els] of view.byLayer) {
    const l = core.layers.find(x => x.id === id);
    const state = !focus ? '' : l === focus ? 'is-focus' : focus.out.includes(l) || focus.in.includes(l) ? 'is-linked' : '';
    for (const e of els) {
      e.classList.toggle('is-focus', state === 'is-focus');
      e.classList.toggle('is-linked', state === 'is-linked');
      e.classList.toggle('is-selected', l === selected);
    }
  }
  drawVeins(view.veins, focus, tray);
}

// --- Filtre --------------------------------------------------------------

function setQuery(q) {
  search.value = q;
  query = q;
  applyFilter();
}

search.addEventListener('input', () => {
  query = search.value;
  applyFilter();
});

function applyFilter() {
  if (!view) return;
  const match = matcher(query);
  svg.classList.toggle('filtering', !!match);
  let n = 0;
  for (const l of core.layers) {
    const ok = !match || match(l);
    if (ok && match) n++;
    for (const e of view.byLayer.get(l.id) || []) e.classList.toggle('match', ok);
  }
  search.title = match ? `${n} couche${n > 1 ? 's' : ''}` : '';
  search.classList.toggle('empty-result', !!match && n === 0);
}

// --- Clavier -------------------------------------------------------------

window.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== search) {
    e.preventDefault();
    search.focus();
    return;
  }
  if (e.key === 'Escape') {
    if (document.activeElement === search && search.value) setQuery('');
    else if (selected) select(null);
    else search.blur();
    return;
  }
  if (document.activeElement === search || !core) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const match = matcher(query);
    let i = selected ? selected.index : step > 0 ? -1 : core.layers.length;
    do i += step; while (i >= 0 && i < core.layers.length && match && !match(core.layers[i]));
    if (core.layers[i]) select(core.layers[i], true);
  }
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
});

boot();
