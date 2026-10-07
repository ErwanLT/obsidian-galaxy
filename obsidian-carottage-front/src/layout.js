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
export function layoutTray(core, width, height, { colW = 64, gap = 34, minMedian = 16 } = {}) {
  const { layers } = core;
  const cols = Math.max(1, Math.floor((width + gap) / (colW + gap)));
  const draftsEnd = layers.findIndex(l => l.zone !== 'meuble');
  const hasDraftGap = draftsEnd > 0;

  let H = Math.max(160, height);
  let k = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const length = cols * H - (hasDraftGap ? DRAFT_GAP : 0);
    k = fitScale(layers, length);
    const med = median(layers.filter(l => l.words > 0).map(l => thickness(l, k)));
    if (med >= minMedian || !layers.length) break;
    H = Math.ceil(H * 1.25);
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
