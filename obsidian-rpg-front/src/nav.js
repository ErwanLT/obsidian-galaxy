import { childToward, isAncestor } from './universe.js';

// Outils de navigation purs : champs de distance, ligne de vue, quêtes, progression.

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Distance (en cases, 4-connexité) de chaque case praticable jusqu'à (sx, sy). -1 = inaccessible.
export function bfsField(walls, W, H, sx, sy) {
  const field = new Int16Array(W * H).fill(-1);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return field;
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  field[sy * W + sx] = 0;
  queue[tail++] = sy * W + sx;
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (walls[j] || field[j] >= 0) continue;
      field[j] = field[i] + 1;
      queue[tail++] = j;
    }
  }
  return field;
}

// Case voisine qui rapproche le plus de la source du champ, ou null.
export function stepDown(field, W, H, x, y) {
  const here = field[y * W + x];
  let best = null;
  let bd = here < 0 ? Infinity : here;
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const d = field[ny * W + nx];
    if (d >= 0 && d < bd) {
      bd = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

// Une case est vue si le segment depuis l'œil n'est coupé par aucun mur
// avant de l'atteindre (le mur visé lui-même reste visible).
export function lineOfSight(walls, W, ox, oy, tx, ty) {
  const ex = tx + 0.5;
  const ey = ty + 0.5;
  const len = Math.hypot(ex - ox, ey - oy);
  const steps = Math.ceil(len * 4);
  for (let s = 1; s < steps; s++) {
    const x = Math.floor(ox + ((ex - ox) * s) / steps);
    const y = Math.floor(oy + ((ey - oy) * s) / steps);
    if (x === tx && y === ty) return true;
    if (walls[y * W + x]) return false;
  }
  return true;
}

// Prochaine case-cible (dans la salle courante) pour rejoindre la note `target`.
export function questWaypoint(room, target) {
  if (!room || !target) return null;
  const folder = target._parent;
  const here = room.node;
  if (folder === here) {
    const n = room.notes.find(e => e.node === target);
    if (n) return { x: n.x, y: n.y, kind: 'note' };
    if (room.library && room.library.notes.includes(target)) return { x: room.library.x, y: room.library.y, kind: 'library' };
    return null;
  }
  if (isAncestor(here, folder)) {
    const child = childToward(here, folder);
    const pt = room.portals.find(p => p.kind === 'dir' && p.node === child);
    if (pt) return { x: pt.x, y: pt.y, kind: 'portal' };
    if (room.sign && room.sign.extras.includes(child)) return { x: room.sign.x, y: room.sign.y, kind: 'sign' };
    return null;
  }
  const back = room.portals.find(p => p.kind === 'back');
  return back ? { x: back.x, y: back.y, kind: 'portal' } : null;
}

// Notes collectées par dossier : `total` cumule les sous-dossiers, `direct` non.
export function folderProgress(byPath, collected) {
  const total = new Map();
  const direct = new Map();
  for (const path of collected) {
    const n = byPath.get(path);
    if (!n || !n._parent) continue;
    direct.set(n._parent, (direct.get(n._parent) || 0) + 1);
    for (let p = n._parent; p; p = p._parent) total.set(p, (total.get(p) || 0) + 1);
  }
  return { total, direct };
}

export function pct(done, all) {
  return all ? Math.round((100 * done) / all) : 100;
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchNotes(notes, query, limit = 40) {
  const q = normalize(query).trim();
  if (!q) return [];
  const scored = [];
  for (const n of notes) {
    const name = normalize(n.name);
    const i = name.indexOf(q);
    if (i < 0) continue;
    scored.push([i === 0 ? 0 : 1, name.length, n]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(s => s[2]);
}

export function xpForLevel(level) {
  return 4 * level * (level - 1);
}

export function levelFromXp(xp) {
  let l = 1;
  while (xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function maxHpFor(level) {
  return Math.min(10, 4 + level);
}
