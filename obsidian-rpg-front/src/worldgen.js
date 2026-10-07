import { hashStr } from './universe.js';

// Génération déterministe des salles : même dossier + même mode = même salle.
// Module pur (aucun accès DOM) pour pouvoir être testé.

export const CLASSIC = 'salle';
export const DUNGEON = 'donjon';

const CLASSIC_W = 24;
const CLASSIC_H = 16;
const CLASSIC_NOTE_CAP = 8;
const CLASSIC_PORTAL_CAP = 6;

const CELL_W = 12;
const CELL_H = 10;
const DUNGEON_NOTE_CAP = 24;
const DUNGEON_PORTAL_CAP = 10;

// minDepth : profondeur de dossier à partir de laquelle le type apparaît.
export const MONSTER_TYPES = {
  slime: { id: 'slime', name: 'limaçon', hp: 2, xp: 2, speed: 1.1, dmg: 1, aggro: 6.6, weight: 3, minDepth: 0 },
  wisp: { id: 'wisp', name: 'farceur', hp: 3, xp: 3, speed: 1.6, dmg: 1, aggro: 7.2, weight: 2, minDepth: 0 },
  archer: { id: 'archer', name: 'archer spectral', hp: 2, xp: 3, speed: 1.3, dmg: 1, aggro: 8, weight: 2, minDepth: 1 },
  charger: { id: 'charger', name: 'bélier', hp: 4, xp: 4, speed: 0.9, dmg: 1, aggro: 7, weight: 1, minDepth: 1 },
  splitter: { id: 'splitter', name: 'gelée mère', hp: 4, xp: 3, speed: 0.85, dmg: 1, aggro: 6, weight: 2, minDepth: 2 },
  knight: { id: 'knight', name: 'chevalier de pierre', hp: 4, xp: 5, speed: 0.8, dmg: 1, aggro: 6.5, weight: 1, minDepth: 2 },
};

export const BOSS = { name: 'Gardien de la voûte', hp: 16, xp: 8, speed: 0.95, dmg: 2 };

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Rectangle en cases, bornes incluses.
export const inRect = (r, x, y) => !!r && x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

// (x, y) : coordonnées exactes du centre de la créature.
export function spawnMonster(type, x, y, depth, rand = Math.random) {
  const eliteChance = depth >= 2 ? Math.min(0.4, 0.1 * depth) : 0;
  const elite = rand() < eliteChance;
  const hp = (type.hp + Math.floor(depth / 2)) * (elite ? 2 : 1);
  return {
    kind: type.id,
    name: elite ? `${type.name} enragé` : type.name,
    elite,
    hp,
    maxHp: hp,
    xp: type.xp * (elite ? 2 : 1),
    dmg: type.dmg + (elite && depth >= 4 ? 1 : 0),
    speed: type.speed * (1 + 0.04 * Math.min(depth, 6)),
    aggro: type.aggro,
    x,
    y,
    seed: rand() * 10,
    angle: rand() * Math.PI * 2,
    turnT: 1 + rand() * 2,
  };
}

function makeBoss(x, y, depth, rand) {
  const hp = BOSS.hp + 3 * depth;
  return {
    name: BOSS.name,
    hp,
    maxHp: hp,
    xp: BOSS.xp + 2 * depth,
    dmg: BOSS.dmg,
    speed: BOSS.speed,
    x: x + 0.5,
    y: y + 0.5,
    seed: rand() * 10,
  };
}

const makeMonster = (type, tx, ty, depth, rand) => spawnMonster(type, tx + 0.5, ty + 0.5, depth, rand);

function randomType(rand, depth) {
  const pool = Object.values(MONSTER_TYPES).filter(t => depth >= t.minDepth);
  let r = rand() * pool.reduce((a, t) => a + t.weight, 0);
  for (const t of pool) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return pool[0];
}

function hasGuardian(node, mdCount, bossAllowed, mode) {
  if (!bossAllowed || mdCount === 0) return false;
  const h = hashStr(`${node.path || node.name}:guard`);
  return mode === DUNGEON ? h % 3 === 0 || mdCount >= 10 : h % 5 === 0;
}

function splitChildren(node, noteCap, portalCap) {
  const subs = node.children.filter(c => c.type === 'DIRECTORY');
  const md = node.children.filter(c => c.type === 'MARKDOWN_FILE');
  return {
    subs: subs.slice(0, portalCap),
    extras: subs.slice(portalCap),
    md: md.slice(0, noteCap),
    leftover: md.slice(noteCap),
  };
}

function countFloor(walls) {
  let n = 0;
  for (let i = 0; i < walls.length; i++) if (!walls[i]) n++;
  return n;
}

export function generateRoom(node, { mode = DUNGEON, bossAllowed = true } = {}) {
  const key = node.path || node.name || node.id;
  if (mode === CLASSIC) return classicRoom(node, mulberry32(hashStr(key)), bossAllowed);
  return dungeonRoom(node, mulberry32(hashStr(`donjon:${key}`)), bossAllowed);
}

function classicRoom(node, rand, bossAllowed) {
  const W = CLASSIC_W;
  const H = CLASSIC_H;
  const I = (x, y) => y * W + x;
  const depth = node._depth || 0;
  const walls = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) walls[I(x, y)] = 1;
    }
  }

  const clusters = 1 + ((rand() * 2) | 0);
  for (let i = 0; i < clusters; i++) {
    const cx = 4 + ((rand() * (W - 9)) | 0);
    const cy = 4 + ((rand() * (H - 9)) | 0);
    const cells = 1 + ((rand() * 3) | 0);
    walls[I(cx, cy)] = 1;
    if (cells > 1) walls[I(cx + 1, cy)] = 1;
    if (cells > 2) walls[I(cx, cy + 1)] = 1;
  }

  const { subs, extras, md, leftover } = splitChildren(node, CLASSIC_NOTE_CAP, CLASSIC_PORTAL_CAP);

  const portals = [];
  const step = subs.length ? (W - 8) / subs.length : 1;
  subs.forEach((c, i) => {
    const x = Math.round(3 + i * step);
    portals.push({ key: c._key, kind: 'dir', node: c, x, y: 0, front: { x, y: 1 } });
  });
  if (node._parent) {
    const x = W / 2;
    portals.push({ key: node._parent._key, kind: 'back', node: node._parent, x, y: H - 1, front: { x, y: H - 2 } });
  }

  const used = new Set();
  for (const pt of portals) {
    walls[I(pt.x, pt.y)] = 0;
    walls[I(pt.front.x, pt.front.y)] = 0;
    used.add(I(pt.x, pt.y));
    used.add(I(pt.front.x, pt.front.y));
  }
  const sx = W / 2;
  const sy = H - 2;
  walls[I(sx, sy)] = 0;
  used.add(I(sx, sy));

  const safe = { x1: sx - 3, y1: sy - 3, x2: sx + 3, y2: H - 1 };

  const free = [];
  for (let y = 2; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!walls[I(x, y)] && !used.has(I(x, y))) free.push([x, y]);
    }
  }
  shuffle(free, rand);

  let boss = null;
  let bossCell = null;
  if (hasGuardian(node, md.length, bossAllowed, CLASSIC)) {
    let wd = -1;
    for (const [x, y] of free) {
      const d = dist(x, y, sx, sy);
      if (d > wd) {
        wd = d;
        bossCell = [x, y];
      }
    }
    if (bossCell) {
      boss = makeBoss(bossCell[0], bossCell[1], depth, rand);
      used.add(I(bossCell[0], bossCell[1]));
    }
  }

  const notes = [];
  for (const [x, y] of free) {
    if (notes.length >= md.length) break;
    if (bossCell && dist(x, y, bossCell[0], bossCell[1]) < 2.2) continue;
    if (dist(x, y, sx, sy) < 3) continue;
    if (Math.abs(x - sx) < 2 && y > sy - 1) continue;
    const n = md[notes.length];
    notes.push({ x, y, node: n, seed: hashStr(n.path || n.name), guarded: !!boss });
    used.add(I(x, y));
  }

  const takeFree = (minSpawn) => {
    for (const [x, y] of free) {
      if (used.has(I(x, y)) || dist(x, y, sx, sy) < minSpawn) continue;
      used.add(I(x, y));
      return [x, y];
    }
    return null;
  };

  let library = null;
  if (leftover.length) {
    const c = takeFree(2.5);
    if (c) library = { x: c[0], y: c[1], notes: leftover };
  }
  let sign = null;
  if (extras.length) {
    const c = takeFree(0);
    if (c) sign = { x: c[0], y: c[1], extras };
  }

  const particles = [];
  for (let i = 0; i < 18; i++) particles.push(makeParticle(rand, 2, 2, W - 4, H - 4));

  const monsters = [];
  const mCount = 4 + ((rand() * 3) | 0);
  const mCells = free.filter(([x, y]) =>
    !inRect(safe, x, y) && !used.has(I(x, y)) && !(bossCell && dist(x, y, bossCell[0], bossCell[1]) < 3));
  shuffle(mCells, rand);
  for (let i = 0; i < mCount && i < mCells.length; i++) {
    monsters.push(makeMonster(randomType(rand, depth), mCells[i][0], mCells[i][1], depth, rand));
  }

  return {
    mode: CLASSIC,
    W,
    H,
    walls,
    floorCount: countFloor(walls),
    portals,
    notes,
    library,
    sign,
    spawn: { x: sx + 0.5, y: sy + 0.5 },
    safe,
    monsters,
    boss,
    bossZone: null,
    particles,
    chambers: [{ x1: 1, y1: 1, x2: W - 2, y2: H - 2 }],
    doors: [],
    key: null,
    chests: [],
    cracks: [],
  };
}

function makeParticle(rand, x, y, w, h) {
  return {
    x: x + rand() * w,
    y: y + rand() * h,
    vx: (rand() - 0.5) * 0.6,
    vy: (rand() - 0.5) * 0.6,
    seed: (rand() * 6.2831) | 0,
    speed: 0.6 + rand() * 1.2,
  };
}

// Donjon : une grille de chambres reliées par un labyrinthe de couloirs
// (arbre couvrant + quelques boucles). Les sous-dossiers sont des portes
// creusées dans les murs des chambres, le gardien attend dans la chambre
// la plus éloignée de l'entrée et protège les parchemins qui s'y trouvent.
function dungeonRoom(node, rand, bossAllowed) {
  const depth = node._depth || 0;
  const { subs, extras, md, leftover } = splitChildren(node, DUNGEON_NOTE_CAP, DUNGEON_PORTAL_CAP);
  const content = subs.length + md.length;
  const [cols, rows] = content <= 4 ? [2, 2] : content <= 9 ? [3, 2] : content <= 15 ? [3, 3] : [4, 3];
  const W = cols * CELL_W + 1;
  const H = rows * CELL_H + 1;
  const I = (x, y) => y * W + x;
  const walls = new Uint8Array(W * H).fill(1);
  const inChamber = new Int16Array(W * H).fill(-1);

  const chambers = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const w = 5 + ((rand() * 5) | 0);
      const h = 4 + ((rand() * 4) | 0);
      const x1 = cx * CELL_W + 1 + ((rand() * (CELL_W - w)) | 0);
      const y1 = cy * CELL_H + 1 + ((rand() * (CELL_H - h)) | 0);
      const ch = {
        i: chambers.length,
        cx,
        cy,
        x1,
        y1,
        x2: x1 + w - 1,
        y2: y1 + h - 1,
        mx: x1 + Math.floor(w / 2),
        my: y1 + Math.floor(h / 2),
        links: [],
      };
      for (let y = ch.y1; y <= ch.y2; y++) {
        for (let x = ch.x1; x <= ch.x2; x++) {
          walls[I(x, y)] = 0;
          inChamber[I(x, y)] = ch.i;
        }
      }
      chambers.push(ch);
    }
  }

  const cid = (cx, cy) => cy * cols + cx;
  const edges = [];
  const seen = new Uint8Array(chambers.length);
  const stack = [(rand() * chambers.length) | 0];
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [cx + dx, cy + dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows && !seen[cid(x, y)]);
    if (!nbs.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = nbs[(rand() * nbs.length) | 0];
    const nxt = cid(nx, ny);
    seen[nxt] = 1;
    edges.push([cur, nxt]);
    stack.push(nxt);
  }
  const hasEdge = (a, b) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const a = cid(cx, cy);
      if (cx + 1 < cols && !hasEdge(a, a + 1) && rand() < 0.2) edges.push([a, a + 1]);
      if (cy + 1 < rows && !hasEdge(a, a + cols) && rand() < 0.2) edges.push([a, a + cols]);
    }
  }

  // Les premières arêtes forment l'arbre couvrant, les suivantes sont des boucles
  // (candidates aux raccourcis secrets). On garde le tracé de chaque couloir.
  const loops = [];
  edges.forEach(([a, b], k) => {
    const A = chambers[a];
    const B = chambers[b];
    A.links.push(b);
    B.links.push(a);
    let x = A.mx;
    let y = A.my;
    const path = [];
    const dig = () => {
      walls[I(x, y)] = 0;
      if (inChamber[I(x, y)] < 0) path.push([x, y]);
    };
    const walkX = () => { while (x !== B.mx) { x += Math.sign(B.mx - x); dig(); } };
    const walkY = () => { while (y !== B.my) { y += Math.sign(B.my - y); dig(); } };
    if (rand() < 0.5) { walkX(); walkY(); } else { walkY(); walkX(); }
    if (k >= chambers.length - 1) loops.push(path);
  });

  const entrance = chambers[cid(Math.floor(cols / 2), rows - 1)];
  const hops = new Array(chambers.length).fill(-1);
  hops[entrance.i] = 0;
  const queue = [entrance.i];
  while (queue.length) {
    const c = queue.shift();
    for (const n of chambers[c].links) {
      if (hops[n] < 0) {
        hops[n] = hops[c] + 1;
        queue.push(n);
      }
    }
  }

  const used = new Set();
  const reserve = (x, y) => used.add(I(x, y));

  // Niche dans le mur haut/bas d'une chambre, à l'écart des couloirs.
  const niche = (ch, side) => {
    const wy = side === 'top' ? ch.y1 - 1 : ch.y2 + 1;
    const behind = side === 'top' ? wy - 1 : wy + 1;
    const fy = side === 'top' ? ch.y1 : ch.y2;
    const xs = [];
    for (let x = ch.x1 + 1; x <= ch.x2 - 1; x++) {
      if (x === ch.mx) continue;
      if (!walls[I(x, wy)] || !walls[I(x - 1, wy)] || !walls[I(x + 1, wy)]) continue;
      if (behind >= 0 && behind < H && !walls[I(x, behind)]) continue;
      if (used.has(I(x, fy)) || used.has(I(x - 1, fy)) || used.has(I(x + 1, fy))) continue;
      xs.push(x);
    }
    if (!xs.length) return null;
    const x = xs[(rand() * xs.length) | 0];
    walls[I(x, wy)] = 0;
    reserve(x, wy);
    reserve(x, fy);
    return { x, y: wy, front: { x, y: fy } };
  };

  // Repli : une dalle de passage posée au sol de la chambre.
  const floorPortal = (ch) => {
    for (let y = ch.y1; y < ch.y2; y++) {
      for (let x = ch.x1; x <= ch.x2; x++) {
        if (used.has(I(x, y)) || used.has(I(x, y + 1))) continue;
        reserve(x, y);
        reserve(x, y + 1);
        return { x, y, front: { x, y: y + 1 } };
      }
    }
    return null;
  };

  const portals = [];
  let spawnCell = [entrance.mx, entrance.my];
  if (node._parent) {
    const spot = niche(entrance, 'bottom') || floorPortal(entrance);
    portals.push({ key: node._parent._key, kind: 'back', node: node._parent, ...spot });
    spawnCell = [spot.front.x, spot.front.y];
  }
  reserve(spawnCell[0], spawnCell[1]);
  const [sx, sy] = spawnCell;

  const others = shuffle(chambers.filter(c => c !== entrance), rand);
  subs.forEach((c, i) => {
    const ch = others[i % others.length];
    const spot = niche(ch, 'top') || niche(ch, 'bottom') || floorPortal(ch) || floorPortal(entrance);
    if (spot) portals.push({ key: c._key, kind: 'dir', node: c, ...spot });
  });

  const takeCell = (ch, minSpawn = 2.5) => {
    const cells = [];
    for (let y = ch.y1; y <= ch.y2; y++) {
      for (let x = ch.x1; x <= ch.x2; x++) {
        if (used.has(I(x, y)) || walls[I(x, y)]) continue;
        if (dist(x, y, sx, sy) < minSpawn) continue;
        cells.push([x, y]);
      }
    }
    if (!cells.length) return null;
    const c = cells[(rand() * cells.length) | 0];
    reserve(c[0], c[1]);
    return c;
  };

  let bossCh = null;
  let boss = null;
  if (hasGuardian(node, md.length, bossAllowed, DUNGEON)) {
    const far = Math.max(...hops);
    const candidates = chambers.filter(c => hops[c.i] === far && c !== entrance);
    bossCh = candidates.length ? candidates[(rand() * candidates.length) | 0] : null;
    if (bossCh && !used.has(I(bossCh.mx, bossCh.my))) {
      reserve(bossCh.mx, bossCh.my);
      boss = makeBoss(bossCh.mx, bossCh.my, depth, rand);
    } else {
      bossCh = null;
    }
  }

  const order = [
    ...(bossCh ? [bossCh] : []),
    ...shuffle(chambers.filter(c => c !== bossCh && c !== entrance), rand),
    entrance,
  ];
  const notes = [];
  let guard = 0;
  for (let k = 0; notes.length < md.length && guard < md.length * order.length * 2; k++, guard++) {
    const ch = order[k % order.length];
    const c = takeCell(ch, 3);
    if (!c) continue;
    const n = md[notes.length];
    notes.push({ x: c[0], y: c[1], node: n, seed: hashStr(n.path || n.name), guarded: ch === bossCh });
  }

  const quiet = chambers.filter(c => c !== entrance && c !== bossCh);
  let library = null;
  if (leftover.length) {
    for (const ch of [...shuffle(quiet.slice(), rand), entrance]) {
      const c = takeCell(ch);
      if (c) {
        library = { x: c[0], y: c[1], notes: leftover };
        break;
      }
    }
  }
  let sign = null;
  if (extras.length) {
    for (const ch of [entrance, ...quiet]) {
      const c = takeCell(ch, 1.5);
      if (c) {
        sign = { x: c[0], y: c[1], extras };
        break;
      }
    }
  }

  const monsters = [];
  for (const ch of chambers) {
    if (ch === entrance) continue;
    const n = 1 + (rand() < 0.5 ? 1 : 0) + (ch === bossCh ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const c = takeCell(ch, 4);
      if (c) monsters.push(makeMonster(randomType(rand, depth), c[0], c[1], depth, rand));
    }
  }

  const secrets = carveSecrets({ W, H, I, walls, inChamber, chambers, entrance, bossCh, loops, used, portals, takeCell, sx, sy, rand });

  const particles = [];
  for (const ch of chambers) {
    for (let k = 0; k < 3; k++) particles.push(makeParticle(rand, ch.x1, ch.y1, ch.x2 - ch.x1 + 1, ch.y2 - ch.y1 + 1));
  }

  return {
    mode: DUNGEON,
    W,
    H,
    walls,
    floorCount: countFloor(walls),
    portals,
    notes,
    library,
    sign,
    spawn: { x: sx + 0.5, y: sy + 0.5 },
    safe: { x1: entrance.x1, y1: entrance.y1, x2: entrance.x2, y2: entrance.y2 + 1 },
    monsters,
    boss,
    bossZone: bossCh ? { x1: bossCh.x1, y1: bossCh.y1, x2: bossCh.x2, y2: bossCh.y2 } : null,
    particles,
    chambers,
    ...secrets,
  };
}

// Atteignables depuis (sx, sy), en traitant `blocked` comme des murs en plus.
function reachCount(walls, W, H, sx, sy, blocked = new Set()) {
  const seen = new Uint8Array(W * H);
  const stack = [sy * W + sx];
  seen[stack[0]] = 1;
  let n = 0;
  while (stack.length) {
    const i = stack.pop();
    n++;
    const x = i % W;
    const y = (i / W) | 0;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || walls[j] || blocked.has(j)) continue;
      if (Math.abs((j % W) - x) + Math.abs(((j / W) | 0) - y) !== 1) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return n;
}

// Structure « vrai donjon » : porte(s) scellée(s) devant le gardien + clé ailleurs,
// coffres dans les culs-de-sac, raccourcis et alcôve cachés derrière des murs fissurés.
function carveSecrets({ W, H, I, walls, inChamber, chambers, entrance, bossCh, loops, used, portals, takeCell, sx, sy, rand }) {
  const doors = [];
  let key = null;
  let keyCh = null;
  if (bossCh) {
    const portalTiles = new Set(portals.map(p => I(p.x, p.y)));
    const around = [];
    for (let x = bossCh.x1; x <= bossCh.x2; x++) around.push([x, bossCh.y1 - 1], [x, bossCh.y2 + 1]);
    for (let y = bossCh.y1; y <= bossCh.y2; y++) around.push([bossCh.x1 - 1, y], [bossCh.x2 + 1, y]);
    for (const [x, y] of around) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (!walls[I(x, y)] && !portalTiles.has(I(x, y))) doors.push({ x, y });
    }
    // Clé : chambre la plus éloignée de l'entrée sans traverser celle du gardien.
    const hops = new Map([[entrance.i, 0]]);
    const queue = [entrance.i];
    while (queue.length) {
      const c = queue.shift();
      for (const n of chambers[c].links) {
        if (n === bossCh.i || hops.has(n)) continue;
        hops.set(n, hops.get(c) + 1);
        queue.push(n);
      }
    }
    const far = [...hops.entries()].filter(([i]) => i !== entrance.i).sort((a, b) => b[1] - a[1]);
    for (const [i] of [...far, [entrance.i]]) {
      const c = takeCell(chambers[i], 2);
      if (c) {
        key = { x: c[0], y: c[1] };
        keyCh = chambers[i];
        break;
      }
    }
    if (!key) doors.length = 0;
  }

  const chests = [];
  const deadEnds = shuffle(chambers.filter(c => c.links.length === 1 && c !== entrance && c !== bossCh && c !== keyCh), rand);
  for (const ch of deadEnds.slice(0, 2)) {
    const c = takeCell(ch, 2);
    if (c) chests.push({ x: c[0], y: c[1], secret: false });
  }

  const cracks = [];
  const doorSet = new Set(doors.map(d => I(d.x, d.y)));
  const base = reachCount(walls, W, H, sx, sy);
  for (const path of loops) {
    if (path.length < 3 || rand() < 0.4) continue;
    const [x, y] = path[(path.length / 2) | 0];
    const i = I(x, y);
    if (doorSet.has(i) || used.has(i)) continue;
    walls[i] = 1;
    // On ne garde la fissure que si elle ne coupe rien : c'est un raccourci, pas un verrou.
    if (reachCount(walls, W, H, sx, sy) === base - 1) cracks.push({ x, y });
    else walls[i] = 0;
  }

  // Alcôve : une case creusée dans la roche derrière un mur fissuré, avec un coffre.
  const solid = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && walls[I(x, y)] === 1 && inChamber[I(x, y)] < 0;
  const spots = [];
  for (const ch of chambers) {
    if (ch === bossCh) continue;
    for (let y = ch.y1 + 1; y < ch.y2; y++) {
      if (y === ch.my) continue;
      spots.push({ wx: ch.x2 + 1, wy: y, bx: ch.x2 + 2, by: y, side: 'h' }, { wx: ch.x1 - 1, wy: y, bx: ch.x1 - 2, by: y, side: 'h' });
    }
    for (let x = ch.x1 + 1; x < ch.x2; x++) {
      if (x === ch.mx) continue;
      spots.push({ wx: x, wy: ch.y1 - 1, bx: x, by: ch.y1 - 2, side: 'v' }, { wx: x, wy: ch.y2 + 1, bx: x, by: ch.y2 + 2, side: 'v' });
    }
  }
  shuffle(spots, rand);
  // Pas d'alcôve à chaque étage : un secret doit rester une surprise.
  if (rand() < 0.4) spots.length = 0;
  for (const sp of spots) {
    const { wx, wy, bx, by, side } = sp;
    if (!solid(wx, wy) || !solid(bx, by)) continue;
    const sideOk = side === 'h'
      ? solid(wx, wy - 1) && solid(wx, wy + 1) && solid(bx, by - 1) && solid(bx, by + 1) && solid(2 * bx - wx, by)
      : solid(wx - 1, wy) && solid(wx + 1, wy) && solid(bx - 1, by) && solid(bx + 1, by) && solid(bx, 2 * by - wy);
    if (!sideOk) continue;
    walls[I(bx, by)] = 0;
    used.add(I(bx, by));
    cracks.push({ x: wx, y: wy });
    chests.push({ x: bx, y: by, secret: true });
    break;
  }

  return { doors, key, chests, cracks };
}
