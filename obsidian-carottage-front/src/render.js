// Rendu SVG de la caisse de carottes.

import { anchor } from './layout.js';
import { depthMeters } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const TOP = 46;      // place des étiquettes au-dessus des tronçons
const BOTTOM = 40;   // et en dessous

// Couleurs « carte géologique » : tons de terre, imprimés sur papier.
export const PALETTE = [
  '#d9a441', '#c8553d', '#8aa37b', '#5b7a99', '#d68c9f', '#e4cf9c',
  '#9b9a4a', '#7d5a7a', '#4f8f8a', '#e6a57e', '#b9c48a', '#a77c58',
  '#6f8fb8', '#c9a3c4', '#8c8c84',
];
// Figurés lithologiques, du plus discret au plus marqué.
const PATTERNS = ['plain', 'dots', 'hatch', 'shale', 'brick', 'cross', 'gravel', 'wave', 'vee', 'dash'];

export const litColor = g => PALETTE[g.index % PALETTE.length];
export const litPattern = g => PATTERNS[g.index % PATTERNS.length];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/** Motif de remplissage d'une lithologie : aplat de couleur + figuré à l'encre. */
function patternDef(defs, g) {
  const id = `lit-${g.index}`;
  const kind = litPattern(g);
  const size = { plain: 8, dots: 6, hatch: 6, shale: 10, brick: 12, cross: 7, gravel: 14, wave: 12, vee: 10, dash: 12 }[kind];
  const p = el('pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { width: size, height: size, fill: litColor(g) }, p);
  const ink = { class: 'ink', fill: 'none', 'stroke-width': 0.8 };
  switch (kind) {
    case 'dots': el('circle', { cx: 3, cy: 3, r: 0.8, class: 'ink-fill' }, p); break;
    case 'hatch': el('path', { d: 'M-1 7 L7 -1 M5 7 L7 5 M-1 1 L1 -1', ...ink }, p); break;
    case 'shale': el('path', { d: 'M0 3 H6 M4 8 H10', ...ink }, p); break;
    case 'brick': el('path', { d: 'M0 0.5 H12 M0 6.5 H12 M3 0.5 V6.5 M9 6.5 V12', ...ink }, p); break;
    case 'cross': el('path', { d: 'M0 0 L7 7 M7 0 L0 7', ...ink, 'stroke-width': 0.6 }, p); break;
    case 'gravel':
      el('ellipse', { cx: 4, cy: 4, rx: 2.4, ry: 1.6, ...ink }, p);
      el('ellipse', { cx: 10.5, cy: 10, rx: 1.8, ry: 1.3, ...ink }, p);
      break;
    case 'wave': el('path', { d: 'M0 6 Q3 3 6 6 T12 6', ...ink }, p); break;
    case 'vee': el('path', { d: 'M2 3 L4 6 L6 3', ...ink }, p); break;
    case 'dash': el('path', { d: 'M1 3 H5 M7 9 H11', ...ink }, p); break;
    default: break;
  }
  return `url(#${id})`;
}

// Interface entre deux couches : légère ondulation, identique des deux côtés.
function wave(seed, x, amp) {
  return amp * (Math.sin(x * 0.19 + seed * 1.7) * 0.6 + Math.sin(x * 0.43 + seed * 3.1) * 0.4);
}

function edge(y, seed, amp, w, reverse) {
  const pts = [];
  for (let x = 0; x <= w; x += 4) pts.push([x, y + wave(seed, x, amp)]);
  if (pts.at(-1)[0] !== w) pts.push([w, y + wave(seed, w, amp)]);
  if (reverse) pts.reverse();
  return pts.map(([x, yy]) => `${x.toFixed(1)} ${yy.toFixed(1)}`).join(' L');
}

function piecePath(p, w) {
  const l = p.layer;
  const ampTop = p.cutTop ? 0 : Math.min(1.8, (p.y1 - p.y0) / 3);
  const ampBot = p.cutBottom ? 0 : Math.min(1.8, (p.y1 - p.y0) / 3);
  // La graine d'une interface est l'indice de la couche du dessous : partagée par les deux voisines.
  return `M${edge(p.y0, l.index, ampTop, w, false)} L${edge(p.y1, l.index + 1, ampBot, w, true)} Z`;
}

const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Construit la caisse dans `svg`. Retourne les éléments par couche, pour les
 * mises en évidence, et la fonction de dessin des veines (liens).
 */
export function renderTray(svg, core, tray) {
  svg.replaceChildren();
  const W = tray.width + 64;   // 20 px à gauche, 44 à droite pour la durée des lacunes
  const Hs = tray.H + TOP + BOTTOM;
  svg.setAttribute('viewBox', `-20 ${-TOP} ${W} ${Hs}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', Hs);

  const defs = el('defs', {}, svg);
  const fills = new Map(core.groups.map(g => [g.key, patternDef(defs, g)]));
  const shade = el('linearGradient', { id: 'cylinder', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  [[0, 'rgba(0,0,0,.34)'], [0.18, 'rgba(0,0,0,.06)'], [0.36, 'rgba(255,255,255,.22)'], [0.5, 'rgba(255,255,255,0)'],
    [0.82, 'rgba(0,0,0,.08)'], [1, 'rgba(0,0,0,.4)']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, shade));
  // Ammonite : fossile directeur des notes les plus citées.
  const amm = el('symbol', { id: 'ammonite', viewBox: '-10 -10 20 20' }, defs);
  el('path', {
    d: 'M0 0 m0.6 0 a0.6 0.6 0 1 0 -1.2 0 a1.5 1.5 0 1 0 3 0 a2.7 2.7 0 1 0 -5.4 0 a4.2 4.2 0 1 0 8.4 0 a6 6 0 1 0 -12 0',
    fill: 'none', class: 'fossil', 'stroke-width': 1.3, 'stroke-linecap': 'round',
  }, amm);
  for (const a of [0.9, 1.9, 2.9, 3.9, 5]) {
    el('path', { d: `M${a} -0.6 L${a + 0.9} 0.6`, class: 'fossil', 'stroke-width': 0.7 }, amm);
  }

  const hatch = el('pattern', { id: 'hiatus-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('path', { d: 'M0 0 V8', class: 'hiatus-hatch' }, hatch);

  const byLayer = new Map();
  const add = (l, e) => {
    if (!byLayer.has(l.id)) byLayer.set(l.id, []);
    byLayer.get(l.id).push(e);
  };
  const w = tray.colW;
  const yearOf = l => (l.zone === 'strate' ? new Date(l.date).getUTCFullYear() : null);

  for (const col of tray.columns) {
    const g = el('g', { class: 'column', transform: `translate(${col.x} 0)` }, svg);
    const clipId = `clip-${col.index}`;
    const clip = el('clipPath', { id: clipId }, defs);
    const last = col.pieces.at(-1);
    const bottom = last ? last.y1 : 0;
    el('rect', { x: 0, y: 0, width: w, height: tray.H, rx: 7, class: 'channel' }, g);
    el('rect', { x: 0, y: 0, width: w, height: bottom, rx: 7 }, clip);

    const body = el('g', { 'clip-path': `url(#${clipId})` }, g);
    for (const p of col.pieces) {
      const l = p.layer;
      const path = el('path', {
        d: piecePath(p, w),
        fill: fills.get(l.litho.key),
        class: `layer zone-${l.zone}`,
        'data-id': l.id,
      }, body);
      add(l, path);
      if (l.fossil && p === anchor(l, tray).piece && p.y1 - p.y0 >= 12) {
        const s = Math.min(18, p.y1 - p.y0 - 2);
        el('use', { href: '#ammonite', x: w / 2 - s / 2, y: (p.y0 + p.y1) / 2 - s / 2, width: s, height: s, class: 'fossil-use' }, body);
      }
    }
    el('rect', { x: 0, y: 0, width: w, height: bottom, rx: 7, fill: 'url(#cylinder)', class: 'shade' }, g);

    // Lacunes : surface d'érosion en dents de scie, par-dessus l'ombrage et
    // débordant du tronçon, avec sa durée dans l'intervalle à droite.
    for (const h of tray.grouped ? [] : core.hiatuses) {
      const y = core.layers[h.index].top - col.from;
      if (y <= 0 || y >= tray.H || core.layers[h.index].pieces[0]?.col !== col.index) continue;
      const months = Math.round(h.days / 30.4);
      hiatusMark(g, y, w, `${months} mois`, `Lacune : ${months} mois sans publication (${h.days} jours)`);
    }

    // Repères d'années, dans l'intervalle à gauche du tronçon.
    for (const p of tray.grouped ? [] : col.pieces) {
      const l = p.layer;
      const prev = core.layers[l.index - 1];
      if (p.cutTop || !prev || yearOf(l) == null || yearOf(prev) == null || yearOf(prev) === yearOf(l)) continue;
      el('path', { d: `M-9 ${p.y0} H0`, class: 'year-tick' }, g);
      el('text', { x: -12, y: p.y0, class: 'year', transform: `rotate(-90 -12 ${p.y0})`, 'text-anchor': 'end' }, g)
        .textContent = String(yearOf(prev));
    }
    if (!tray.grouped && col.index === 0 && core.counts.get('meuble')) {
      const lastDraft = core.layers.filter(l => l.zone === 'meuble').at(-1);
      el('text', { x: -12, y: 0, class: 'year muted', transform: 'rotate(-90 -12 0)', 'text-anchor': 'end' }, g)
        .textContent = 'meuble';
      el('path', { d: `M-9 ${lastDraft.bottom + 5} H${w + 9}`, class: 'draft-line' }, g);
    }

    if (tray.grouped) {
      labelPeriod(g, col, w, bottom);
      continue;
    }

    // Étiquettes du tronçon.
    const first = col.pieces[0]?.layer, lastL = last?.layer;
    el('text', { x: w / 2, y: -28, class: 'col-id', 'text-anchor': 'middle' }, g)
      .textContent = `T-${String(col.index + 1).padStart(2, '0')}`;
    if (first && lastL) {
      el('text', { x: w / 2, y: -14, class: 'col-depth', 'text-anchor': 'middle' }, g)
        .textContent = `${fmtDepth(first.from)}–${fmtDepth(lastL.to)} m`;
      const span = [first, lastL].map(l => (l.date ? fmtMonth.format(l.date) : l.zone === 'meuble' ? 'meuble' : 'socle'));
      el('text', { x: w / 2, y: bottom + 16, class: 'col-date', 'text-anchor': 'middle' }, g).textContent = span[0];
      el('text', { x: w / 2, y: bottom + 28, class: 'col-date', 'text-anchor': 'middle' }, g).textContent = `→ ${span[1]}`;
    }
  }

  const veins = el('g', { class: 'veins' }, svg);
  const focusRing = el('g', { class: 'focus-ring' }, svg);
  return { byLayer, veins, focusRing };
}

/** Trait de lacune : dents de scie rouges sur un liseré clair, lisibles sur toutes les couches. */
function hiatusMark(g, y, w, label, title) {
  let d = `M-6 ${y}`;
  for (let x = -6, i = 0; x <= w + 6; x += 5, i++) d += ` L${x} ${y + (i % 2 ? 3 : -3)}`;
  const mark = el('g', { class: 'hiatus-mark' }, g);
  el('path', { d, class: 'hiatus-halo' }, mark);
  el('path', { d, class: 'hiatus' }, mark);
  if (label) el('text', { x: w + 5, y: y + 3.5, class: 'hiatus-label' }, mark).textContent = label;
  el('title', {}, mark).textContent = title;
}

/** Étiquettes d'une carotte par période ; une période vide est une lacune. */
function labelPeriod(g, col, w, bottom) {
  const n = col.pieces.length;
  // Sous-titre affiché seulement s'il tient dans la largeur du tronçon (≈ 5,5 px par caractère).
  const sub = col.sub && col.sub.length * 5.5 <= w + 14 ? col.sub : '';
  el('text', { x: w / 2, y: sub ? -28 : -20, class: 'col-id', 'text-anchor': 'middle' }, g).textContent = col.title;
  if (sub) el('text', { x: w / 2, y: -14, class: 'col-depth', 'text-anchor': 'middle' }, g).textContent = sub;
  if (!n) {
    // Période vide : le tronçon entier est hachuré de rouge.
    el('rect', { x: 0, y: 0, width: w, height: col.to - col.from, rx: 7, class: 'hiatus-fill' }, g);
    hiatusMark(g, 12, w, '', 'Lacune : aucune publication sur la période');
    el('text', { x: w / 2, y: 34, class: 'hiatus-label', 'text-anchor': 'middle' }, g).textContent = 'lacune';
    return;
  }
  el('text', { x: w / 2, y: bottom + 16, class: 'col-date', 'text-anchor': 'middle' }, g)
    .textContent = `${n} note${n > 1 ? 's' : ''}`;
  el('text', { x: w / 2, y: bottom + 28, class: 'col-date', 'text-anchor': 'middle' }, g)
    .textContent = `${fmtDepth(col.words)} m`;
}

const fmtDepth = words => depthMeters(words).toLocaleString('fr-FR', { maximumFractionDigits: words < 10_000 ? 1 : 0 });

/** Veines : un filet d'encre entre la couche et chacune de ses voisines liées. */
export function drawVeins(veins, layer, tray) {
  veins.replaceChildren();
  if (!layer) return;
  const a = anchor(layer, tray);
  const draw = (other, dir) => {
    const b = anchor(other, tray);
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    // Même tronçon : la veine sort par le flanc droit. Sinon, arc bombé vers le haut.
    const same = Math.abs(dx) < 1;
    const cx = same ? a.x + tray.colW / 2 + 10 + Math.min(50, dist * 0.25) : (a.x + b.x) / 2;
    const cy = same ? (a.y + b.y) / 2 : Math.min(a.y, b.y) - Math.min(120, dist * 0.22);
    el('path', { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, class: `vein vein-${dir}` }, veins);
    el('circle', { cx: b.x, cy: b.y, r: 2.6, class: `vein-dot vein-${dir}` }, veins);
  };
  for (const o of layer.out) draw(o, 'out');
  for (const i of layer.in) if (!layer.out.includes(i)) draw(i, 'in');
  el('circle', { cx: a.x, cy: a.y, r: 3.2, class: 'vein-origin' }, veins);
}
