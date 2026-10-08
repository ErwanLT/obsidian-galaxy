// Mise en caisse : la carotte, trop longue pour tenir d'un seul tenant, est
// coupée en tronçons rangés côte à côte, comme dans une caisse de carottier.
// Calcul pur (positions en px), sans DOM.

export const MIN_LAYER = 2;        // une note vide reste visible
export const DRAFT_GAP = 10;       // jeu entre les sédiments meubles et la première strate

/**
 * Épaisseur de chaque couche pour une échelle `k` (px par mot).
 * Les meubles et le socle suivent la même loi que les strates.
 */
export function thickness(layer, k) {
  return Math.max(MIN_LAYER, layer.words * k);
}

/** Échelle telle que la carotte remplisse exactement `length` px. */
export function fitScale(layers, length) {
  const fixed = layers.length * MIN_LAYER;
  if (length <= fixed) return 0;
  let lo = 0, hi = length / Math.max(1, layers.reduce((s, l) => s + l.words, 0)) * 4 + 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const total = layers.reduce((s, l) => s + thickness(l, mid), 0);
    if (total > length) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Dispose la carotte dans la caisse.
 *
 * @param core      résultat de buildCore
 * @param width     largeur disponible (px)
 * @param height    hauteur disponible pour un tronçon (px)
 * @param opts      colW (largeur d'un tronçon), gap, minMedian (épaisseur
 *                  médiane minimale d'une couche : sinon on allonge les tronçons
 *                  et la page défile)
 */
export function layoutTray(core, width, height, { colW = 64, gap = 34, minMedian = 16, words = 0 } = {}) {
  const { layers } = core;
  const cols = Math.max(1, Math.floor((width + gap) / (colW + gap)));
  const draftsEnd = layers.findIndex(l => l.zone !== 'meuble');
  const hasDraftGap = draftsEnd > 0;

  let H = Math.max(160, height);
  let k = 0;
  if (words > 0) {
    // Tronçons de longueur fixe : `words` mots par tronçon, la caisse défile si besoin.
    k = H / words;
  } else {
    for (let attempt = 0; attempt < 30; attempt++) {
      const length = cols * H - (hasDraftGap ? DRAFT_GAP : 0);
      k = fitScale(layers, length);
      const med = median(layers.filter(l => l.words > 0).map(l => thickness(l, k)));
      if (med >= minMedian || !layers.length) break;
      H = Math.ceil(H * 1.25);
    }
  }

  // Position de chaque couche le long de la carotte.
  let at = 0;
  for (const l of layers) {
    if (hasDraftGap && l.index === draftsEnd) at += DRAFT_GAP;
    l.top = at;
    l.h = thickness(l, k);
    at += l.h;
    l.bottom = at;
  }
  const total = at;
  const used = Math.max(1, Math.ceil(total / H - 1e-9));

  // Morceaux par tronçon : une couche à cheval sur deux tronçons est coupée.
  const columns = Array.from({ length: used }, (_, c) => ({
    index: c,
    x: c * (colW + gap),
    from: c * H,
    to: (c + 1) * H,
    pieces: [],
  }));
  for (const l of layers) {
    l.pieces = [];
    const c0 = Math.min(used - 1, Math.floor(l.top / H));
    const c1 = Math.min(used - 1, Math.floor((l.bottom - 1e-6) / H));
    for (let c = c0; c <= c1; c++) {
      const col = columns[c];
      const y0 = Math.max(l.top, col.from) - col.from;
      const y1 = Math.min(l.bottom, col.to) - col.from;
      if (y1 - y0 <= 0) continue;
      const piece = { layer: l, col: c, x: col.x, y0, y1, cutTop: l.top < col.from, cutBottom: l.bottom > col.to };
      l.pieces.push(piece);
      col.pieces.push(piece);
    }
  }
  return {
    cols: used,
    colW,
    gap,
    H,
    k,
    total,
    width: used * colW + (used - 1) * gap,
    columns,
  };
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Période calendaire (alignée sur janvier) d'une date, pour des périodes de `months` mois. */
export function periodOf(t, months) {
  const d = new Date(t);
  return Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / months);
}

/** Libellés d'une période : titre court et année. */
export function periodLabel(p, months) {
  const m0 = p * months;
  const year = Math.floor(m0 / 12);
  const month = m0 % 12;
  if (months === 12) return { title: String(year), sub: '' };
  if (months === 6) return { title: `S${month / 6 + 1}`, sub: String(year) };
  if (months === 3) return { title: `T${month / 3 + 1}`, sub: String(year) };
  if (months === 1) return { title: MONTHS[month], sub: String(year) };
  return { title: `${MONTHS[month]}–${MONTHS[(month + months - 1) % 12]}`, sub: String(year) };
}

/**
 * Une carotte par période (année, semestre…) : chaque tronçon regroupe les
 * strates de sa période, de la plus récente en haut à la plus ancienne. Les
 * périodes sans publication gardent leur tronçon, vide. Brouillons et socle
 * ont chacun le leur. Échelle commune : le tronçon le plus chargé remplit
 * la hauteur, les longueurs se comparent d'un coup d'œil.
 */
export function layoutByPeriod(core, height, months, { colW = 64, gap = 34, minMedian = 12 } = {}) {
  const { layers } = core;
  const groups = [];
  const drafts = layers.filter(l => l.zone === 'meuble');
  if (drafts.length) groups.push({ layers: drafts, title: 'meuble', sub: 'brouillons', kind: 'meuble' });
  const strata = layers.filter(l => l.zone === 'strate');
  if (strata.length) {
    const newest = periodOf(strata[0].date, months);
    const oldest = periodOf(strata.at(-1).date, months);
    const byPeriod = new Map();
    for (const l of strata) {
      const p = periodOf(l.date, months);
      if (!byPeriod.has(p)) byPeriod.set(p, []);
      byPeriod.get(p).push(l);
    }
    for (let p = newest; p >= oldest; p--) {
      groups.push({ layers: byPeriod.get(p) || [], ...periodLabel(p, months), kind: 'periode' });
    }
  }
  const socle = layers.filter(l => l.zone === 'socle');
  if (socle.length) groups.push({ layers: socle, title: 'socle', sub: 'non daté', kind: 'socle' });

  // Plus grande échelle telle qu'aucun tronçon ne dépasse H ; si les couches
  // deviennent trop fines pour être lues, on allonge les tronçons (la page défile).
  let H = Math.max(160, height);
  let k = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    let lo = 0, hi = H;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const fits = groups.every(g => g.layers.reduce((s, l) => s + thickness(l, mid), 0) <= H);
      if (fits) lo = mid;
      else hi = mid;
    }
    k = lo;
    const med = median(layers.filter(l => l.words > 0).map(l => thickness(l, k)));
    if (med >= minMedian || !layers.length) break;
    H = Math.ceil(H * 1.25);
  }

  const columns = groups.map((g, c) => {
    const col = { index: c, x: c * (colW + gap), from: 0, to: H, pieces: [], ...g };
    let y = 0;
    for (const l of g.layers) {
      l.top = y;
      l.h = thickness(l, k);
      y += l.h;
      l.bottom = y;
      const piece = { layer: l, col: c, x: col.x, y0: l.top, y1: l.bottom, cutTop: false, cutBottom: false };
      l.pieces = [piece];
      col.pieces.push(piece);
    }
    col.words = g.layers.reduce((s, l) => s + l.words, 0);
    return col;
  });
  return {
    grouped: true,
    cols: columns.length,
    colW,
    gap,
    H,
    k,
    total: H,
    width: columns.length * colW + Math.max(0, columns.length - 1) * gap,
    columns,
  };
}

/** Point d'ancrage d'une couche (centre de son plus gros morceau). */
export function anchor(layer, tray) {
  const p = layer.pieces.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a), layer.pieces[0]);
  return { x: p.x + tray.colW / 2, y: (p.y0 + p.y1) / 2, piece: p };
}

/** Couche à la position (x, y) de la caisse, ou null. */
export function layerAt(tray, x, y) {
  const c = Math.floor(x / (tray.colW + tray.gap));
  const col = tray.columns[c];
  if (!col || x - col.x > tray.colW || x < col.x) return null;
  for (const p of col.pieces) if (y >= p.y0 && y < p.y1) return p.layer;
  return null;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}
