import { hashStr } from './universe.js';
import { getTheme, makeThemeSprites, makePlayerFrames } from './sprites.js';

export const TILE = 8;
const VIEW_W = 40;
const VIEW_H = 24;
const W = 24;
const H = 16;
const OFF_X = ((VIEW_W - W) / 2) * TILE;
const OFF_Y = ((VIEW_H - H) / 2) * TILE;
const NOTE_CAP = 8;
const SPEED = 4.2;
const SIGHT = 6.0;
const PLAYER_MAX_HP = 5;
const LEVEL_XP = 8;
const ATTACK_CD = 0.32;
const ATTACK_MAX = 2.2;
const ATTACK_HALF = 0.7;

const FACING = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const MONSTER_TYPES = {
  slime: { name: 'limaçon', hp: 2, xp: 2, speed: 1.1, dmg: 1, aggro: 6.6, scale: 1 },
  wisp: { name: 'farceur', hp: 3, xp: 3, speed: 1.6, dmg: 1, aggro: 7.2, scale: 1 },
};

const BOSS = { name: 'Gardien de la voûte', hp: 16, xp: 8, speed: 0.95, dmg: 2 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export class Game {
  constructor(ctx, mctx, callbacks, sfxModule) {
    this.ctx = ctx;
    this.mctx = mctx;
    this.cb = callbacks || {};
    this.sfx = sfxModule.sfx;

    this.byPath = null;
    this.root = null;
    this.room = null;
    this.stack = [];
    this.visited = new Set();
    this.collected = new Set();
    this.defeatedBosses = new Set();
    this.achieved = new Set();
    this.stats = { kills: 0, deaths: 0 };

    this.player = {
      x: W / 2,
      y: H - 2,
      facing: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      xp: 0,
      level: 1,
      invuln: 0,
      kx: 0,
      ky: 0,
    };
    this.walking = false;
    this.walkT = 0;
    this.stepAccum = 0;
    this.time = 0;
    this.attackCd = 0;
    this.attackT = 0;
    this.flash = 0;
    this.dead = false;
    this.roomExplored = new Map();

    this.prompt = null;
    this.frames = makePlayerFrames();
    this.visSet = new Set();
    this._mmBuf = null;
  }

  setWorld({ root, byPath }) {
    this.root = root;
    this.byPath = byPath;
    this.roomExplored = new Map();
  }

  restore(p) {
    for (const path of p.collected || []) this.collected.add(path);
    for (const b of p.bosses || []) this.defeatedBosses.add(b);
    for (const a of p.achievements || []) this.achieved.add(a);
    if (p.stats) {
      this.stats.kills = p.stats.kills || 0;
      this.stats.deaths = p.stats.deaths || 0;
    }
    this.player.maxHp = PLAYER_MAX_HP;
    this.player.hp = p.hp != null ? p.hp : PLAYER_MAX_HP;
    this.player.xp = p.xp || 0;
    this.player.level = Math.max(1, 1 + Math.floor(this.player.xp / LEVEL_XP));
    const target = p.stack && p.stack.length ? p.stack[p.stack.length - 1] : this.root._key;
    const at = p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) ? p.pos : null;
    this.goTo(target, at);
  }

  goTo(key, at) {
    if (!this.byPath || !key) return;
    const node = this.byPath.get(key);
    if (!node) return;

    const stack = [];
    let p = node;
    while (p) {
      stack.unshift(p._key);
      p = p._parent;
    }
    this.stack = stack;
    for (const s of stack) this.visited.add(s);

    this.room = this.buildRoom(node);

    let px = at ? at.x : null;
    let py = at ? at.y : null;
    if (!Number.isFinite(px) || !Number.isFinite(py) || !this.canStand(px, py)) {
      px = this.room.spawn.x;
      py = this.room.spawn.y;
    }
    this.player.x = px;
    this.player.y = py;
    this.attackCd = 0;
    this.attackT = 0;
    this.updateVisibility();

    if (this.cb.onRoom) this.cb.onRoom(node, stack);
  }

  buildRoom(node) {
    const seed = hashStr(node.path || node.name || node.id);
    const rand = mulberry32(seed);
    const theme = getTheme(node.name || node.path || node.id);
    const spr = makeThemeSprites(theme);

    const walls = new Set();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x === 0 || x === W - 1 || y === 0 || y === H - 1) walls.add(y * W + x);
      }
    }

    const clusters = 1 + ((rand() * 2) | 0);
    for (let i = 0; i < clusters; i++) {
      const cx = 4 + ((rand() * (W - 9)) | 0);
      const cy = 4 + ((rand() * (H - 9)) | 0);
      const cells = 1 + ((rand() * 3) | 0);
      walls.add(cy * W + cx);
      if (cells > 1) walls.add(cy * W + cx + 1);
      if (cells > 2) walls.add((cy + 1) * W + cx);
      if (cells > 3) walls.add((cy + 2) * W + cx);
    }

    const subs = node.children.filter(c => c.type === 'DIRECTORY');
    const visSubs = subs.slice(0, 6);
    const extras = subs.slice(6);

    const portals = [];
    const count = Math.min(visSubs.length, 6);
    const step = count ? (W - 8) / count : 1;
    for (let i = 0; i < count; i++) {
      const c = visSubs[i];
      const x = Math.round(3 + i * step);
      portals.push({ key: c._key, kind: 'dir', x, y: 0, node: c });
    }
    if (node._parent) {
      portals.push({ key: node._parent._key, kind: 'back', x: Math.floor(W / 2), y: H - 1, node: node._parent });
    }

    for (const pt of portals) {
      walls.delete(pt.y * W + pt.x);
      if (pt.kind === 'dir') walls.delete((pt.y + 1) * W + pt.x);
      else walls.delete((pt.y - 1) * W + pt.x);
    }

    const spawn = { x: W / 2, y: H - 2 };
    walls.delete(spawn.y * W + spawn.x);

    const md = node.children.filter(c => c.type === 'MARKDOWN_FILE');
    const visibleMd = md.slice(0, NOTE_CAP);
    const leftover = md.slice(NOTE_CAP);

    const free = [];
    for (let y = 2; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (walls.has(idx)) continue;
        if (portals.some(pt => pt.x === x && pt.y === y)) continue;
        free.push([x, y]);
      }
    }
    shuffle(free, rand);

    const hasBoss =
      visibleMd.length > 0 && !this.defeatedBosses.has(node._key) && hashStr(`${node.path || node.name}:guard`) % 5 === 0;

    let boss = null;
    let bossCell = null;
    if (hasBoss) {
      let worst = null;
      let wd = -1;
      for (const [x, y] of free) {
        const d = Math.hypot(x - spawn.x, y - spawn.y);
        if (d > wd) {
          wd = d;
          worst = [x, y];
        }
      }
      if (worst) {
        bossCell = worst;
        boss = { x: worst[0] + 0.5, y: worst[1] + 0.5, hp: BOSS.hp, maxHp: BOSS.hp, name: BOSS.name, dmg: BOSS.dmg, speed: BOSS.speed, seed: rand() * 10, dead: false };
      }
    }

    const notes = [];
    let used = 0;
    const awayCells = [];
    for (const [x, y] of free) {
      if (used >= visibleMd.length) break;
      if (bossCell && Math.hypot(x - bossCell[0], y - bossCell[1]) < 2.2) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 3) continue;
      if (Math.abs(x - spawn.x) < 2 && y > spawn.y - 1) continue;
      if (y < 2) continue;
      awayCells.push([x, y]);
      notes.push({ x, y, node: visibleMd[used], seed: hashStr(visibleMd[used].path) });
      used++;
    }

    const usedCells = new Set(awayCells.map(([x, y]) => y * W + x));
    if (bossCell) usedCells.add(bossCell[1] * W + bossCell[0]);

    let library = null;
    for (const [x, y] of free) {
      if (usedCells.has(y * W + x)) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 2.5) continue;
      if (portals.some(pt => pt.x === x && pt.y === y)) continue;
      library = { x, y, count: leftover.length, notes: leftover };
      usedCells.add(y * W + x);
      break;
    }

    let sign = null;
    if (extras.length) {
      for (const [x, y] of free) {
        if (usedCells.has(y * W + x)) continue;
        if (portals.some(pt => pt.x === x && pt.y === y)) continue;
        sign = { x, y, extras };
        usedCells.add(y * W + x);
        break;
      }
    }

    const particles = [];
    for (let i = 0; i < 18; i++) {
      particles.push({
        x: 2 + rand() * (W - 4),
        y: 2 + rand() * (H - 4),
        vx: (rand() - 0.5) * 0.6,
        vy: (rand() - 0.5) * 0.6,
        seed: (rand() * 6.2831) | 0,
        speed: 0.6 + rand() * 1.2,
      });
    }

    const monsters = [];
    const mCount = 4 + ((rand() * 3) | 0);
    const mCells = [];
    for (const [x, y] of free) {
      if (Math.hypot(x - spawn.x, y - spawn.y) < 4) continue;
      if (usedCells.has(y * W + x)) continue;
      if (bossCell && Math.hypot(x - bossCell[0], y - bossCell[1]) < 3) continue;
      mCells.push([x, y]);
    }
    shuffle(mCells, rand);
    for (let i = 0; i < mCount && i < mCells.length; i++) {
      const [cx, cy] = mCells[i];
      const type = rand() < 0.6 ? MONSTER_TYPES.slime : MONSTER_TYPES.wisp;
      monsters.push({
        type,
        x: cx + 0.5,
        y: cy + 0.5,
        hp: type.hp,
        seed: rand() * 10,
        angle: rand() * Math.PI * 2,
        turnT: 1 + rand() * 2,
        dying: false,
      });
    }

    const expl = this.roomExplored.get(node._key) || new Uint8Array(W * H);
    this.roomExplored.set(node._key, expl);

    return {
      node,
      theme,
      spr,
      walls,
      portals,
      notes,
      library,
      sign,
      spawn,
      particles,
      monsters,
      boss,
      leftoverCount: leftover.length,
      explored: expl,
      visible: new Uint8Array(W * H),
    };
  }

  canStand(x, y) {
    if (!this.room) return false;
    const r = 0.22;
    const pts = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
      [x, y],
    ];
    for (const [px, py] of pts) {
      const tx = Math.floor(px);
      const ty = Math.floor(py);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (this.room.walls.has(ty * W + tx)) return false;
    }
    return true;
  }

  updateVisibility() {
    const room = this.room;
    if (!room) return;
    const cs = Math.floor(this.player.x);
    const ccy = Math.floor(this.player.y);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d2 = (x + 0.5 - this.player.x) ** 2 + (y + 0.5 - this.player.y) ** 2;
        if (d2 <= SIGHT * SIGHT) {
          const idx = y * W + x;
          room.visible[idx] = 1;
          room.explored[idx] = 1;
        }
      }
    }
    this.visSet = new Set();
    for (let i = 0; i < W * H; i++) if (room.visible[i]) this.visSet.add(i);
    void cs;
    void ccy;
  }

  nearest() {
    if (!this.room) return null;
    const { x, y } = this.player;
    const guarded = this.room.boss && !this.room.boss.dead;
    let best = null;
    let bd = 1.5;
    const consider = (it) => {
      const px = it.x + 0.5;
      const py = it.y + 0.5;
      const idx = Math.floor(py) * W + Math.floor(px);
      if (!this.visSet.has(idx)) return;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    };
    for (const note of this.room.notes) {
      if (this.collected.has(note.node.path)) continue;
      consider({ ...note, kind: 'note', label: guarded ? 'ombre protectrice…' : 'E — lire' });
    }
    for (const pt of this.room.portals) {
      consider({ x: pt.x, y: pt.y, kind: 'portal', portal: pt, label: pt.kind === 'back' ? 'E — remonter' : 'E — entrer' });
    }
    if (this.room.library && this.room.library.count > 0) {
      consider({ ...this.room.library, kind: 'library', label: 'E — bibliothèque' });
    }
    if (this.room.sign) {
      consider({ ...this.room.sign, kind: 'sign', label: 'E — routes' });
    }
    return best;
  }

  interact() {
    if (!this.room || this.dead) return;
    const it = this.nearest();
    if (!it) {
      this.sfx.error();
      return;
    }
    if (it.kind === 'note') {
      if (this.room.boss && !this.room.boss.dead) {
        this.sfx.error();
        if (this.cb.onBlocked) this.cb.onBlocked('Une aura sombre protège ce parchemin. Vaincs le gardien.');
        return;
      }
      this.collected.add(it.node.path);
      this.sfx.pickup();
      this.heal(1);
      if (this.cb.onCollect) this.cb.onCollect(it.node);
    } else if (it.kind === 'portal') {
      if (it.portal.kind === 'back') {
        this.sfx.back();
        this.goTo(it.portal.key);
      } else {
        this.sfx.door();
        this.goTo(it.portal.key);
      }
    } else if (it.kind === 'library') {
      this.sfx.open();
      if (this.cb.onLibrary) this.cb.onLibrary(this.room.node);
    } else if (it.kind === 'sign') {
      this.sfx.open();
      if (this.cb.onRoutes) this.cb.onRoutes(this.room.node, this.room.sign.extras);
    }
  }

  attack() {
    if (!this.room || this.dead || this.attackCd > 0) return;
    this.attackCd = ATTACK_CD;
    this.attackT = 0.22;
    this.sfx.sword();

    const { x, y } = this.player;
    const dir = FACING[this.player.facing];
    const hit = (m) => {
      const f = (m.x - x) * dir.x + (m.y - y) * dir.y;
      const p = (m.x - x) * -dir.y + (m.y - y) * dir.x;
      return f >= 0.25 && f <= ATTACK_MAX && Math.abs(p) <= ATTACK_HALF;
    };
    const damage = (m) => {
      if (m.dying) return;
      m.hp -= 1;
      this.sfx.hit();
      m.kick = { x: dir.x * 1.5, y: dir.y * 1.5 };
      if (m.hp <= 0) {
        m.dying = true;
        if (m.type) {
          this.stats.kills++;
          this.sfx.kill();
          this.gainXp(m.type.xp);
        }
      }
    };
    for (const m of this.room.monsters) {
      if (hit(m)) damage(m);
    }
    if (this.room.boss && !this.room.boss.dead && hit(this.room.boss)) damage(this.room.boss);
  }

  gainXp(n) {
    const p = this.player;
    p.xp += n;
    const lvl = 1 + Math.floor(p.xp / LEVEL_XP);
    if (lvl > p.level) {
      p.level = lvl;
      this.sfx.levelUp();
      this.heal(1);
      if (this.cb.onLevelUp) this.cb.onLevelUp(lvl);
    }
  }

  heal(n) {
    const p = this.player;
    if (p.hp < p.maxHp) {
      this.sfx.heal();
    }
    p.hp = Math.min(p.maxHp, p.hp + n);
  }

  canWarp(key) {
    return this.stack.includes(key);
  }

  isRoomFullyRevealed() {
    if (!this.room) return false;
    for (let i = 0; i < W * H; i++) {
      if (!this.room.explored[i]) return false;
    }
    return true;
  }

  snapPlayerOut() {
    const p = this.player;
    if (this.canStand(p.x, p.y)) return;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (this.canStand(nx, ny)) {
            p.x = nx;
            p.y = ny;
            return;
          }
        }
      }
    }
    p.x = this.room.spawn.x;
    p.y = this.room.spawn.y;
  }

  tick(keys, dt) {
    this.time += dt;
    if (!this.room || this.dead) return;

    const p = this.player;
    this.snapPlayerOut();
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    this.flash = Math.max(0, this.flash - dt);

    if (p.kx || p.ky) {
      const d = Math.hypot(p.kx, p.ky);
      const step = Math.min(d, 3.4 * dt);
      if (this.canStand(p.x + (p.kx / d) * step, p.y)) p.x += (p.kx / d) * step;
      if (this.canStand(p.x, p.y + (p.ky / d) * step)) p.y += (p.ky / d) * step;
      p.kx *= 0.85;
      p.ky *= 0.85;
    }

    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      if (dx !== 0) p.facing = dx > 0 ? 3 : 2;
      else if (dy !== 0) p.facing = dy > 0 ? 0 : 1;
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;

      const px = p.x;
      const py = p.y;
      const mx = px + dx * SPEED * dt;
      const my = py + dy * SPEED * dt;

      if (this.canStand(mx, py)) p.x = mx;
      if (this.canStand(px, my)) p.y = my;
      else if (dx && dy && this.canStand(mx, my)) {
        if (Math.abs(mx - px) > Math.abs(my - py)) p.x = mx;
        else p.y = my;
      }

      this.walkT += dt;
      this.walking = true;
      this.stepAccum += dt;
      if (this.stepAccum > 0.24) {
        this.stepAccum = 0;
        this.sfx.step();
      }
    } else {
      this.walking = false;
    }

    this.updateAmbience(dt);
    this.updateCreatures(dt);

    if (p.kx || p.ky) {
      let cand = null;
      let cd = Infinity;
      for (const m of this.room.monsters) {
        if (m.dying) continue;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < cd) {
          cd = d;
          cand = m;
        }
      }
      if (this.room.boss && !this.room.boss.dead) {
        const d = Math.hypot(this.room.boss.x - p.x, this.room.boss.y - p.y);
        if (d < cd) {
          cd = d;
          cand = this.room.boss;
        }
      }
if (cand && cd < 0.8) {
      const ang = Math.atan2(p.y - cand.y, p.x - cand.x);
      let placed = false;
      for (let i = 0; i < 8; i++) {
        const a = ang + i * (Math.PI / 4);
        const tx = cand.x + Math.cos(a) * 0.7;
        const ty = cand.y + Math.sin(a) * 0.7;
        if (this.canStand(tx, ty)) {
          p.x = tx;
          p.y = ty;
          placed = true;
          break;
        }
      }
      if (!placed) {
        p.kx = 0;
        p.ky = 0;
      }
    }
    }

    this.updateVisibility();
    this.prompt = this.nearest();
  }

  updateAmbience(dt) {
    const room = this.room;
    if (!room) return;
    for (const p of room.particles) {
      p.x += p.vx * dt * p.speed;
      p.y += p.vy * dt * p.speed;
      if (p.x < 1.5) { p.x = 1.5; p.vx = Math.abs(p.vx); }
      else if (p.x > W - 1.5) { p.x = W - 1.5; p.vx = -Math.abs(p.vx); }
      if (p.y < 1.5) { p.y = 1.5; p.vy = Math.abs(p.vy); }
      else if (p.y > H - 1.5) { p.y = H - 1.5; p.vy = -Math.abs(p.vy); }
      if (room.walls.has(Math.floor(p.y) * W + Math.floor(p.x))) {
        p.vx = -p.vx;
        p.vy = -p.vy;
      }
    }
  }

  updateCreatures(dt) {
    const room = this.room;
    if (!room) return;
    const p = this.player;
    const alive = (m) => !m.dying;

    for (const m of room.monsters) {
      if (!alive(m)) continue;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d = Math.hypot(dx, dy);
      if (m.kick) {
        m.x += m.kick.x * dt;
        m.y += m.kick.y * dt;
        m.kick.x *= 0.86;
        m.kick.y *= 0.86;
        if (Math.hypot(m.kick.x, m.kick.y) < 0.05) m.kick = null;
      } else if (d < m.type.aggro && d > 0.01) {
        const nx = m.x + (dx / d) * m.type.speed * dt;
        const ny = m.y + (dy / d) * m.type.speed * dt;
        if (this.canStand(nx, m.y)) m.x = nx;
        if (this.canStand(m.x, ny)) m.y = ny;
      } else {
        m.turnT -= dt;
        if (m.turnT <= 0) {
          m.turnT = 1.2 + Math.random() * 2;
          m.angle = Math.random() * Math.PI * 2;
        }
        const nx = m.x + Math.cos(m.angle) * m.type.speed * 0.4 * dt;
        const ny = m.y + Math.sin(m.angle) * m.type.speed * 0.4 * dt;
        if (this.canStand(nx, m.y)) m.x = nx;
        if (this.canStand(m.x, ny)) m.y = ny;
      }
      if (d < 0.62) this.damagePlayer(m.type.dmg, m.x, m.y);
    }

    const b = room.boss;
    if (b && !b.dead) {
      if (b.kick) {
        b.x += b.kick.x * dt * 0.5;
        b.y += b.kick.y * dt * 0.5;
        b.kick.x *= 0.9;
        b.kick.y *= 0.9;
        if (Math.hypot(b.kick.x, b.kick.y) < 0.05) b.kick = null;
      } else {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          const nx = b.x + (dx / d) * b.speed * dt;
          const ny = b.y + (dy / d) * b.speed * dt;
          if (this.canStand(nx, b.y)) b.x = nx;
          if (this.canStand(b.x, ny)) b.y = ny;
        }
        if (d < 0.68) this.damagePlayer(b.dmg, b.x, b.y);
      }
      if (b.hp <= 0 && !b.dead) {
        b.dead = true;
        this.sfx.bossKill();
        this.heal(3);
        this.gainXp(BOSS.xp);
        this.defeatedBosses.add(room.node._key);
        if (this.cb.onBossDefeat) this.cb.onBossDefeat(room.node, b);
      }
    }
  }

  damagePlayer(dmg, mx, my) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 1.1;
    this.flash = 0.4;
    this.sfx.hurt();
    const ang = Math.atan2(p.y - my, p.x - mx);
    p.kx = Math.cos(ang) * 2.4;
    p.ky = Math.sin(ang) * 2.4;
    if (p.hp <= 0) {
      p.hp = 0;
this.stats.deaths++;
    this.dead = true;
    this.sfx.error();
    if (this.cb.onDeath) this.cb.onDeath(this.room.node);
    }
  }

  respawn() {
    if (!this.room) return;
    const key = this.room.node._key;
    const spawn = { x: W / 2, y: H - 2 };
    this.dead = false;
    this.player.hp = this.player.maxHp;
    this.player.invuln = 1.5;
    this.goTo(key, spawn);
    this.sfx.door();
  }

  screenOf(wx, wy) {
    return {
      x: Math.round(wx * TILE + OFF_X),
      y: Math.round(wy * TILE + OFF_Y),
    };
  }

  render() {
    const ctx = this.ctx;
    const room = this.room;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, VIEW_W * TILE, VIEW_H * TILE);
    if (!room) return;

    const { spr } = room;
    const seedBase = hashStr(room.node.path || room.node.name || room.node.id);
    const guarded = room.boss && !room.boss.dead;

    const interactCells = new Set();
    const putInteract = (list) => {
      for (const it of list) interactCells.add(it.y * W + it.x);
    };
    putInteract(room.notes);
    putInteract(room.portals);
    if (room.library) putInteract([room.library]);
    if (room.sign) putInteract([room.sign]);

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const idx = ty * W + tx;
        if (!room.explored[idx]) continue;
        const px = Math.round(tx * TILE + OFF_X);
        const py = Math.round(ty * TILE + OFF_Y);
        const isWall = room.walls.has(idx);
        if (isWall) {
          ctx.drawImage(spr.wall, px, py);
        } else {
          const variant = (tx + ty + (seedBase % 3)) % 3;
          ctx.drawImage(spr.floors[variant], px, py);
          if ((tx + ty) % 5 !== 1 && !interactCells.has(idx)) {
            const dc = hashStr(`${seedBase}:${tx}:${ty}`) % 1000;
            if (dc < 220) ctx.drawImage(spr.decor[dc % spr.decor.length], px, py);
          }
        }
        if (!room.visible[idx]) {
          ctx.fillStyle = 'rgba(4,5,10,0.62)';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }

    const vis = (x, y) => room.visible[y * W + x];

    for (const pt of room.portals) {
      if (!vis(pt.x, pt.y)) continue;
      const px = Math.round(pt.x * TILE + OFF_X);
      const py = Math.round(pt.y * TILE + OFF_Y);
      ctx.drawImage(pt.kind === 'back' ? spr.gateBack : spr.gate, px, py);
      const wave = Math.sin(this.time * 4 + pt.x * 3) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.4 * wave})`;
      ctx.fillRect(px + 2, py + 2 + ((wave * 4) | 0), 4, 1);
      if (pt.kind === 'back') ctx.drawImage(spr.upArrow, px, py - 8);
    }

    for (const note of room.notes) {
      if (!vis(note.x, note.y)) continue;
      const px = Math.round(note.x * TILE + OFF_X);
      let py = Math.round(note.y * TILE + OFF_Y);
      const collected = this.collected.has(note.node.path);
      if (!collected) py += Math.round(Math.sin(this.time * 2.6 + note.seed) * 1);
      if (collected) {
        ctx.globalAlpha = 0.25;
      } else if (guarded) {
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = 'rgba(90,30,140,0.5)';
        ctx.fillRect(px - 1, py - 1, 10, 10);
        const pulse = Math.sin(this.time * 3 + note.seed) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,70,120,${0.25 + 0.5 * pulse})`;
        ctx.fillRect(px + 1, py + 1, 6, 6);
      }
      ctx.drawImage(spr.note, px, py);
      ctx.globalAlpha = 1;
      if (!collected) {
        const s = (this.time * 5 + note.seed) % 6;
        if (s < 2) ctx.fillStyle = '#ffffff';
        else ctx.fillStyle = '#ffe08a';
        ctx.fillRect(px + 2 + ((s * 3) % 4), py + 4, 1, 1);
      }
    }

    if (room.library && vis(room.library.x, room.library.y)) {
      ctx.drawImage(spr.library, Math.round(room.library.x * TILE + OFF_X), Math.round(room.library.y * TILE + OFF_Y));
    }
    if (room.sign && vis(room.sign.x, room.sign.y)) {
      ctx.drawImage(spr.sign, Math.round(room.sign.x * TILE + OFF_X), Math.round(room.sign.y * TILE + OFF_Y));
    }

    for (const m of room.monsters) {
      if (m.dying) continue;
      const idx = Math.floor(m.y) * W + Math.floor(m.x);
      if (!room.visible[idx]) continue;
      this.renderMonster(m);
    }

    const b = room.boss;
    if (b && vis(Math.floor(b.x), Math.floor(b.y))) {
      const dir = this.frames;
      void dir;
      const bob = b.dead ? 0 : Math.sin(this.time * 2.2 + b.seed) * 1;
      const s = this.screenOf(b.x, b.y);
      ctx.globalAlpha = b.dead ? 0.35 : 1;
      ctx.drawImage(spr.boss, s.x - 8, s.y - 9 + Math.round(bob));
      ctx.globalAlpha = 1;
      if (!b.dead) {
        const flash = Math.sin(this.time * 7) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,106,74,${0.2 + 0.4 * flash})`;
        ctx.fillRect(s.x - 8, s.y - 9 + Math.round(bob), 16, 2);
        ctx.fillRect(s.x - 8, s.y + 5 + Math.round(bob), 16, 2);
      }
    }

    this.renderParticles();
    this.renderPlayer();

    const map = this.renderMinimapBuffer();
    this.mctx.putImageData(map, 0, 0);
  }

  renderMonster(m) {
    const ctx = this.ctx;
    const spr = this.room.spr;
    const bob = Math.sin(this.time * 4 + m.seed) * 1;
    const s = this.screenOf(m.x, m.y);
    if (m.type.name === 'limaçon') {
      ctx.drawImage(spr.slime, s.x - 4, s.y - 5 + Math.round(bob));
    } else {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (this.player.x < m.x) ctx.scale(-1, 1);
      ctx.drawImage(spr.bat, -4, -5 + Math.round(bob * 1.5));
      ctx.restore();
    }
    if (m.hp < m.type.hp || m.kick) {
      ctx.fillStyle = '#191b2c';
      ctx.fillRect(s.x - 5, s.y - 9, 10, 2);
      ctx.fillStyle = '#ff6a4a';
      ctx.fillRect(s.x - 4, s.y - 8, (m.hp / m.type.hp) * 8, 1);
    }
  }

  renderParticles() {
    const ctx = this.ctx;
    const room = this.room;
    const spr = room.spr;
    for (const p of room.particles) {
      const idx = Math.floor(p.y) * W + Math.floor(p.x);
      if (!room.visible[idx]) continue;
      const s = this.screenOf(p.x, p.y);
      const pulse = Math.sin(this.time * p.speed + p.seed) * 0.5 + 0.5;
      ctx.globalAlpha = 0.25 + 0.5 * pulse;
      ctx.drawImage(spr.wisp, s.x - 4, s.y - 4);
      ctx.globalAlpha = 1;
    }
  }

  renderPlayer() {
    const ctx = this.ctx;
    const p = this.player;
    const px = Math.round(p.x * TILE + OFF_X) - 6;
    const py = Math.round(p.y * TILE + OFF_Y) - 6;
    const frame = this.walking ? Math.floor(this.walkT * 10) % 2 : 0;
    const bob = this.walking ? Math.sin(this.walkT * 16) : 0;

    ctx.save();
    if (p.facing === 2) {
      ctx.translate(px + 6, py + 6);
      ctx.scale(-1, 1);
      ctx.translate(-(px + 6), -(py + 6));
    }
    ctx.drawImage(this.frames[frame], px, py + Math.round(bob));
    ctx.restore();

    if (this.attackT > 0) {
      const dir = FACING[p.facing];
      const cx = p.x * TILE + OFF_X;
      const cy = p.y * TILE + OFF_Y;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const t = this.attackT / 0.22;
      const reach = (6 + (7 * (1 - t))) * 1;
      const sw = FACING[p.facing].y !== 0 ? 2 : 3 + Math.round((1 - t) * 2);
      const sh = FACING[p.facing].y !== 0 ? 3 + Math.round((1 - t) * 2) : 2;
      const sx = cx + dir.x * reach - (dir.x !== 0 ? 1 : 0);
      const sy = cy + dir.y * reach - (dir.y !== 0 ? 1 : 0);
      ctx.fillRect(Math.round(sx), Math.round(sy), sw, sh);
    }

    if (p.invuln > 0 && Math.floor(this.time * 14) % 2 === 0) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.frames[frame], px, py + Math.round(bob));
      ctx.globalAlpha = 1;
    }
  }

  renderMinimapBuffer() {
    const room = this.room;
    const buf = this._mmBuf || (this._mmBuf = this.mctx.createImageData(W, H));
    const d = buf.data;
    for (let i = 0; i < W * H; i++) {
      const ty = (i / W) | 0;
      const tx = i % W;
      if (!room.explored[i]) {
        d[i * 4] = 3;
        d[i * 4 + 1] = 4;
        d[i * 4 + 2] = 8;
        d[i * 4 + 3] = 255;
        continue;
      }
      const isWall = room.walls.has(i);
      let r = 46, g = 70, b = 42;
      if (isWall) {
        r = 90; g = 96; b = 104;
      }
      if (!room.visible[i]) {
        r = Math.round(r * 0.45);
        g = Math.round(g * 0.45);
        b = Math.round(b * 0.45);
      }
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
    const vis = (x, y) => y >= 0 && y < H && room.visible[y * W + x];
    for (const pt of room.portals) {
      if (!vis(pt.x, pt.y)) continue;
      const i = (pt.y * W + pt.x) * 4;
      d[i] = 255; d[i + 1] = 210; d[i + 2] = 63; d[i + 3] = 255;
    }
    for (const note of room.notes) {
      if (this.collected.has(note.node.path)) continue;
      if (!vis(note.x, note.y)) continue;
      const i = (note.y * W + note.x) * 4;
      d[i] = 255; d[i + 1] = 224; d[i + 2] = 138; d[i + 3] = 255;
    }
    if (room.library && vis(room.library.x, room.library.y)) {
      const i = (room.library.y * W + room.library.x) * 4;
      d[i] = 180; d[i + 1] = 120; d[i + 2] = 60; d[i + 3] = 255;
    }
    if (room.boss && !room.boss.dead && vis(Math.floor(room.boss.x), Math.floor(room.boss.y))) {
      const i = (Math.floor(room.boss.y) * W + Math.floor(room.boss.x)) * 4;
      d[i] = 255; d[i + 1] = 60; d[i + 2] = 80; d[i + 3] = 255;
    }
    const pi = (Math.floor(this.player.y) * W + Math.floor(this.player.x)) * 4;
    d[pi] = 74; d[pi + 1] = 255; d[pi + 2] = 216; d[pi + 3] = 255;
    return buf;
  }
}