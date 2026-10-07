import { describe, it, expect } from 'vitest';
import { buildWorld, buildDemoWorld } from '../src/universe.js';
import { generateRoom, CLASSIC, DUNGEON, mulberry32 } from '../src/worldgen.js';
import { bfsField } from '../src/nav.js';

// Vault synthétique : beaucoup de dossiers, de notes et de sous-dossiers
// pour couvrir les cas limites (bibliothèque, panneau de routes, gardiens).
function synthVault(seed) {
  const rand = mulberry32(seed);
  let n = 0;
  const md = (dir) => ({ name: `note${n}`, path: `${dir}/note${n++}.md`, type: 'MARKDOWN_FILE', size: (1 + rand() * 300) * 1024, links: [], children: [] });
  const dir = (path, depth) => {
    const children = [];
    const notes = (rand() * (depth === 1 ? 40 : 14)) | 0;
    for (let i = 0; i < notes; i++) children.push(md(path));
    const subs = depth < 3 ? (rand() * (depth === 1 ? 14 : 4)) | 0 : 0;
    for (let i = 0; i < subs; i++) children.push(dir(`${path}/d${i}`, depth + 1));
    return { name: path.split('/').pop(), path, type: 'DIRECTORY', links: [], children };
  };
  return { name: 'vault', children: [dir('/v/a', 1), dir('/v/b', 1), ...Array.from({ length: 5 }, () => md('/v'))] };
}

const worlds = [buildWorld(buildDemoWorld()), buildWorld(synthVault(1)), buildWorld(synthVault(7)), buildWorld(synthVault(42))];

function checkRoom(room) {
  const { W, H, walls } = room;
  const floor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !walls[y * W + x];
  const sx = Math.floor(room.spawn.x);
  const sy = Math.floor(room.spawn.y);
  expect(floor(sx, sy)).toBe(true);
  const field = bfsField(walls, W, H, sx, sy);
  const reach = (x, y) => field[y * W + x] >= 0;

  const tiles = [];
  for (const pt of room.portals) {
    expect(floor(pt.x, pt.y)).toBe(true);
    expect(floor(pt.front.x, pt.front.y)).toBe(true);
    expect(reach(pt.x, pt.y)).toBe(true);
    expect(reach(pt.front.x, pt.front.y)).toBe(true);
    tiles.push([pt.x, pt.y]);
  }
  for (const n of room.notes) {
    expect(floor(n.x, n.y)).toBe(true);
    expect(reach(n.x, n.y)).toBe(true);
    tiles.push([n.x, n.y]);
  }
  for (const it of [room.library, room.sign].filter(Boolean)) {
    expect(reach(it.x, it.y)).toBe(true);
    tiles.push([it.x, it.y]);
  }
  for (const m of room.monsters) expect(floor(Math.floor(m.x), Math.floor(m.y))).toBe(true);
  if (room.boss) expect(reach(Math.floor(room.boss.x), Math.floor(room.boss.y))).toBe(true);

  const keys = tiles.map(([x, y]) => `${x},${y}`);
  expect(new Set(keys).size).toBe(keys.length);
}

describe.each([CLASSIC, DUNGEON])('generateRoom (%s)', (mode) => {
  it('place tout le contenu sur des cases praticables et accessibles depuis l’entrée', () => {
    for (const w of worlds) {
      for (const d of w.dirs) checkRoom(generateRoom(d, { mode }));
    }
  });

  it('est déterministe', () => {
    for (const d of worlds[1].dirs.slice(0, 10)) {
      const a = generateRoom(d, { mode });
      const b = generateRoom(d, { mode });
      expect([...a.walls]).toEqual([...b.walls]);
      expect(a.notes.map(n => [n.x, n.y])).toEqual(b.notes.map(n => [n.x, n.y]));
      expect(a.portals.map(p => [p.x, p.y])).toEqual(b.portals.map(p => [p.x, p.y]));
    }
  });

  it('chaque note et sous-dossier est soit dans la salle, soit à la bibliothèque / aux routes', () => {
    for (const w of worlds) {
      for (const d of w.dirs) {
        const room = generateRoom(d, { mode });
        const md = d.children.filter(c => c.type === 'MARKDOWN_FILE');
        const subs = d.children.filter(c => c.type === 'DIRECTORY');
        const placed = room.notes.length + (room.library ? room.library.notes.length : 0);
        expect(placed).toBe(md.length);
        const doors = room.portals.filter(p => p.kind === 'dir').length + (room.sign ? room.sign.extras.length : 0);
        expect(doors).toBe(subs.length);
        expect(room.portals.some(p => p.kind === 'back')).toBe(!!d._parent);
      }
    }
  });

  it('ne place pas de gardien quand il a déjà été vaincu', () => {
    for (const d of worlds[1].dirs) expect(generateRoom(d, { mode, bossAllowed: false }).boss).toBeNull();
  });
});

describe('donjon', () => {
  it('crée plusieurs chambres et ne garde que les notes de la chambre du gardien', () => {
    let guardedSeen = false;
    for (const d of worlds[1].dirs) {
      const room = generateRoom(d, { mode: DUNGEON });
      expect(room.chambers.length).toBeGreaterThanOrEqual(4);
      if (!room.boss) {
        expect(room.notes.every(n => !n.guarded)).toBe(true);
        continue;
      }
      const z = room.bossZone;
      for (const n of room.notes) {
        const inside = n.x >= z.x1 && n.x <= z.x2 && n.y >= z.y1 && n.y <= z.y2;
        expect(n.guarded).toBe(inside);
        guardedSeen ||= n.guarded;
      }
    }
    expect(guardedSeen).toBe(true);
  });
});

describe('zone sûre', () => {
  it('ne contient aucun monstre au départ et englobe le point d’apparition', async () => {
    const { inRect } = await import('../src/worldgen.js');
    for (const mode of [CLASSIC, DUNGEON]) {
      for (const w of worlds) {
        for (const d of w.dirs) {
          const room = generateRoom(d, { mode });
          expect(inRect(room.safe, Math.floor(room.spawn.x), Math.floor(room.spawn.y))).toBe(true);
          for (const m of room.monsters) expect(inRect(room.safe, Math.floor(m.x), Math.floor(m.y))).toBe(false);
        }
      }
    }
  });
});

describe('buildWorld — élagage', () => {
  it('retire les dossiers cachés et ceux sans aucune note', () => {
    const w = buildWorld({
      name: 'v',
      children: [
        { name: '.obsidian', path: '/v/.obsidian', type: 'DIRECTORY', children: [{ name: 'x', path: '/v/.obsidian/x.md', type: 'MARKDOWN_FILE' }] },
        { name: 'vide', path: '/v/vide', type: 'DIRECTORY', children: [{ name: 'sous', path: '/v/vide/sous', type: 'DIRECTORY', children: [] }] },
        { name: 'plein', path: '/v/plein', type: 'DIRECTORY', children: [{ name: 'n', path: '/v/plein/n.md', type: 'MARKDOWN_FILE' }] },
      ],
    });
    expect(w.dirs.map(d => d.name)).toEqual(['v', 'plein']);
    expect(w.notes).toHaveLength(1);
  });
});

describe('bestiaire', () => {
  it('réserve les créatures avancées aux dossiers profonds', async () => {
    const { MONSTER_TYPES } = await import('../src/worldgen.js');
    const kinds = new Set();
    for (const w of worlds) {
      for (const d of w.dirs) {
        for (const m of generateRoom(d, { mode: DUNGEON }).monsters) {
          expect(d._depth).toBeGreaterThanOrEqual(MONSTER_TYPES[m.kind].minDepth);
          kinds.add(m.kind);
        }
      }
    }
    expect([...kinds].sort()).toEqual(Object.keys(MONSTER_TYPES).sort());
  });
});

describe('donjon — clé, portes, coffres, secrets', () => {
  const rooms = worlds.flatMap(w => w.dirs.map(d => generateRoom(d, { mode: DUNGEON })));
  const withDoors = (room, open = false) => {
    const walls = room.walls.slice();
    if (!open) for (const d of room.doors) walls[d.y * room.W + d.x] = 1;
    return walls;
  };
  const reach = (room, walls) => bfsField(walls, room.W, room.H, Math.floor(room.spawn.x), Math.floor(room.spawn.y));
  const at = (room, field, p) => field[Math.floor(p.y) * room.W + Math.floor(p.x)] >= 0;

  it('scelle la chambre du gardien et met la clé hors de portée de la porte', () => {
    let locked = 0;
    for (const room of rooms) {
      if (!room.boss) {
        expect(room.doors).toEqual([]);
        expect(room.key).toBeNull();
        continue;
      }
      expect(room.key).not.toBeNull();
      expect(room.doors.length).toBeGreaterThan(0);
      const closed = reach(room, withDoors(room));
      expect(at(room, closed, room.key)).toBe(true);
      expect(at(room, closed, room.boss)).toBe(false);
      const open = reach(room, withDoors(room, true));
      expect(at(room, open, room.boss)).toBe(true);
      locked++;
    }
    expect(locked).toBeGreaterThan(0);
  });

  it('les fissures sont des raccourcis : tout reste accessible portes ouvertes, sauf les alcôves', () => {
    let secrets = 0;
    for (const room of rooms) {
      const field = reach(room, withDoors(room, true));
      for (const n of room.notes) expect(at(room, field, n)).toBe(true);
      for (const p of room.portals) expect(at(room, field, p)).toBe(true);
      for (const c of room.chests) {
        if (!c.secret) {
          expect(at(room, field, c)).toBe(true);
          continue;
        }
        secrets++;
        expect(at(room, field, c)).toBe(false);
        const broken = withDoors(room, true);
        for (const k of room.cracks) broken[k.y * room.W + k.x] = 0;
        expect(at(room, reach(room, broken), c)).toBe(true);
      }
      for (const k of room.cracks) expect(room.walls[k.y * room.W + k.x]).toBe(1);
    }
    expect(secrets).toBeGreaterThan(0);
  });
});
