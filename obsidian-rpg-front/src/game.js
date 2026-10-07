import { generateRoom, DUNGEON, inRect } from './worldgen.js';
import { getTheme, makeThemeSprites } from './sprites.js';
import { bfsField, stepDown, lineOfSight, questWaypoint, levelFromXp, maxHpFor, xpForLevel } from './nav.js';
import { RARITY, childToward, isAncestor } from './universe.js';
import { updateMonster, updateBoss, updateProjectiles, splitOnDeath, angleDiff } from './creatures.js';
import { PERK_BY_ID } from './perks.js';
import { RELIC_BY_ID, assignRelics, relicCounts } from './relics.js';
import { pickDaily, today } from './daily.js';

export const TILE = 8;
export const VIEW_W = 40;
export const VIEW_H = 24;
const SPEED = 4.2;
const SIGHT = 6.5;
const ATTACK_CD = 0.32;
const ATTACK_MAX = 2.2;
const ATTACK_HALF = 0.7;
const DROP_CHANCE = 0.2;
const DODGE_TIME = 0.22;
const DODGE_SPEED = 11;
const DODGE_CD = 0.75;
const SHIELD_ARC = 1.0;
const ECHO_SHARE = 0.5;
const LINK_XP = 3;
const ORB_DELAY = 0.35;
const MAGNET = 2.6;
const CAM_PAD_X = 8;
const CAM_PAD_TOP = 24;
const CAM_PAD_BOTTOM = 20;

export const FACING = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const center = c => ({ x: c.x + 0.5, y: c.y + 0.5 });
const NEAR = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [2, 0], [-2, 0], [0, -2]];

function freshPlayer() {
  return { x: 0, y: 0, facing: 0, hp: maxHpFor(1), maxHp: maxHpFor(1), xp: 0, level: 1, invuln: 0, kx: 0, ky: 0 };
}

export class Game {
  constructor(callbacks, sfx) {
    this.cb = callbacks || {};
    this.sfx = sfx;
    this.mode = DUNGEON;
    this.world = null;
    this.byPath = null;
    this.room = null;
    this.roomState = new Map();
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.paused = false;
    this.resetProgress();
  }

  resetProgress() {
    this.stack = [];
    this.visited = new Set();
    this.collected = new Set();
    this.defeatedBosses = new Set();
    this.achieved = new Set();
    this.stats = { kills: 0, deaths: 0, links: 0, reflects: 0, dodges: 0, stuns: 0, chests: 0, secrets: 0, unlocks: 0, dailies: 0, echoes: 0 };
    this.perks = {};
    this.pendingPerks = 0;
    this.phoenixUsed = false;
    this.relics = {};
    this.seals = 0;
    this.threads = new Set();
    this.daily = null;
    this.echo = null;
    this.hints = new Set();
    this.aegisLeft = 0;
    this.xpFrac = 0;
    this.player = freshPlayer();
    this.quest = null;
    this.questDir = null;
    this.roomState = new Map();
    this.dead = false;
    this.walking = false;
    this.walkT = 0;
    this.stepAccum = 0;
    this.attackCd = 0;
    this.attackT = 0;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.prompt = null;
    this.dirty = true;
    this.clearFx();
  }

  clearFx() {
    this.fx = { hitstop: 0, shakeT: 0, shakeDur: 1, shakeAmp: 0, floaters: [], sparks: [], ghosts: [] };
  }

  // ── Effets : purement visuels, aucun impact sur la logique ─────────

  shake(amp, dur) {
    const fx = this.fx;
    if (amp >= fx.shakeAmp * (fx.shakeT / fx.shakeDur)) {
      fx.shakeAmp = amp;
      fx.shakeT = dur;
      fx.shakeDur = dur;
    }
  }

  freeze(t) {
    this.fx.hitstop = Math.max(this.fx.hitstop, t);
  }

  float(x, y, text, color) {
    this.fx.floaters.push({ x, y, text, color, t: 0, life: 0.8 });
  }

  burst(x, y, color, n, speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0, life: 0.35 + Math.random() * 0.35 });
    }
  }

  updateFx(dt) {
    const fx = this.fx;
    fx.shakeT = Math.max(0, fx.shakeT - dt);
    fx.floaters = fx.floaters.filter(f => (f.t += dt) < f.life);
    fx.ghosts = fx.ghosts.filter(gh => (gh.t += dt) < 0.25);
    fx.sparks = fx.sparks.filter(s => {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;
      return s.t < s.life;
    });
  }

  inSafe(x, y) {
    return !!this.room && inRect(this.room.safe, Math.floor(x), Math.floor(y));
  }

  setWorld(world) {
    this.world = world;
    this.byPath = world.byPath;
    this.roomState = new Map();
    assignRelics(world);
  }

  newGame() {
    this.resetProgress();
    this.refreshBonuses();
    this.ensureDaily();
    this.goTo(this.world.root._key, { from: null });
  }

  restore(p) {
    const has = path => this.byPath.has(path);
    for (const path of p.collected || []) if (has(path)) this.collected.add(path);
    for (const b of p.bosses || []) if (has(b)) this.defeatedBosses.add(b);
    for (const v of p.visited || []) if (has(v)) this.visited.add(v);
    for (const a of p.achievements || []) this.achieved.add(a);
    for (const k of Object.keys(this.stats)) this.stats[k] = (p.stats && p.stats[k]) || 0;
    for (const [id, n] of Object.entries(p.perks || {})) if (PERK_BY_ID[id]) this.perks[id] = n;
    for (const t of p.threads || []) if (has(t)) this.threads.add(t);
    for (const h of p.hints || []) this.hints.add(h);
    if (p.daily && p.daily.date === today()) {
      this.daily = { date: p.daily.date, targets: p.daily.targets.filter(has), done: new Set((p.daily.done || []).filter(has)), rewarded: !!p.daily.rewarded };
    }
    if (p.echo && p.echo.xp > 0) this.echo = { ...p.echo };
    const pl = this.player;
    pl.xp = p.xp || 0;
    pl.level = levelFromXp(pl.xp);
    // Anciennes sauvegardes sans dons : on rattrape un don par niveau déjà gagné.
    this.pendingPerks = p.perks ? p.pendingPerks || 0 : pl.level - 1;
    this.refreshBonuses();
    this.ensureDaily();
    pl.hp = p.hp > 0 ? Math.min(pl.maxHp, p.hp) : pl.maxHp;
    for (const [sk, r] of Object.entries(p.rooms || {})) {
      this.roomState.set(sk, {
        explored: null,
        exploredFloor: 0,
        killed: new Set(),
        opened: !!r.o,
        hasKey: !!r.k,
        chests: new Set(r.c || []),
        broken: new Set(r.b || []),
      });
    }
    const q = p.quest && this.byPath.get(p.quest);
    this.quest = q && !this.collected.has(q.path) ? q : null;

    const last = p.stack && p.stack.length ? p.stack[p.stack.length - 1] : null;
    const target = last && has(last) ? last : this.world.root._key;
    const samePlace = target === last && p.mode === this.mode;
    this.goTo(target, { from: null, at: samePlace ? p.pos : null });
  }

  snapshot() {
    return {
      mode: this.mode,
      collected: [...this.collected],
      visited: [...this.visited],
      stack: [...this.stack],
      pos: { x: this.player.x, y: this.player.y },
      hp: this.player.hp,
      xp: this.player.xp,
      bosses: [...this.defeatedBosses],
      achievements: [...this.achieved],
      stats: { ...this.stats },
      quest: this.quest ? this.quest.path : null,
      perks: { ...this.perks },
      pendingPerks: this.pendingPerks,
      rooms: this.durableRooms(),
      threads: [...this.threads],
      hints: [...this.hints],
      daily: this.daily && { date: this.daily.date, targets: this.daily.targets, done: [...this.daily.done], rewarded: this.daily.rewarded },
      echo: this.echo,
    };
  }

  // Portes ouvertes, clés, coffres et murs brisés survivent au rechargement (pas les monstres).
  durableRooms() {
    const out = {};
    for (const [sk, st] of this.roomState) {
      if (!st.opened && !st.hasKey && !st.chests.size && !st.broken.size) continue;
      out[sk] = { o: st.opened ? 1 : 0, k: st.hasKey ? 1 : 0, c: [...st.chests], b: [...st.broken] };
    }
    return out;
  }

  // ── Dons ────────────────────────────────────────────────────────

  perk(id) {
    return this.perks[id] || 0;
  }

  maxHp() {
    return maxHpFor(this.player.level) + this.perk('heart') + this.sealHearts();
  }

  sight() {
    return SIGHT + 1.5 * this.perk('lynx') + this.relic('lantern');
  }

  // ── Bonus tirés du vault : reliques (notes légendaires) et sceaux (dossiers complétés) ──

  relic(id) {
    return this.relics[id] || 0;
  }

  sealHearts() {
    return Math.min(4, Math.floor(this.seals / 2));
  }

  sealXpBonus() {
    return Math.min(0.5, 0.05 * this.seals);
  }

  countSeals() {
    let n = 0;
    for (const d of this.world.dirs) {
      if (!d._direct) continue;
      let got = 0;
      for (const c of d.children) if (c.type === 'MARKDOWN_FILE' && this.collected.has(c.path)) got++;
      if (got >= d._direct) n++;
    }
    return n;
  }

  refreshBonuses() {
    this.relics = relicCounts(this.byPath, this.collected);
    this.seals = this.countSeals();
    const p = this.player;
    p.maxHp = this.maxHp();
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // Temps de préparation des attaques ennemies (relique « Sablier figé »).
  windupScale() {
    return 1 + 0.25 * this.relic('hourglass');
  }

  // ── Notes du jour ───────────────────────────────────────────────

  ensureDaily() {
    const date = today();
    if (this.daily && this.daily.date === date && this.daily.targets.length) return;
    this.daily = { date, targets: pickDaily(this.world.notes, this.collected, date), done: new Set(), rewarded: false };
  }

  isDailyTarget(note) {
    return !!this.daily && this.daily.targets.includes(note.path) && !this.daily.done.has(note.path);
  }

  readDaily(note) {
    if (!this.isDailyTarget(note)) return false;
    const d = this.daily;
    d.done.add(note.path);
    const p = this.player;
    this.float(p.x, p.y - 1.1, `note du jour ${d.done.size}/${d.targets.length}`, '#4affd8');
    this.burst(p.x, p.y, '#4affd8', 14, 4);
    this.sfx.key();
    if (this.quest === note) {
      this.quest = null;
      this.refreshQuest();
    }
    if (d.done.size >= d.targets.length && !d.rewarded) {
      d.rewarded = true;
      this.stats.dailies++;
      this.pendingPerks++;
      this.dropOrbs(p.x, p.y, 10 + 3 * (this.room.node._depth || 0));
      if (this.cb.onDailyDone) this.cb.onDailyDone();
    }
    this.dirty = true;
    return true;
  }

  choosePerk(id) {
    if (!PERK_BY_ID[id] || this.pendingPerks <= 0) return;
    this.perks[id] = this.perk(id) + 1;
    this.pendingPerks--;
    const p = this.player;
    p.maxHp = this.maxHp();
    if (id === 'heart') p.hp = Math.min(p.maxHp, p.hp + 1);
    if (id === 'lynx') this.lastTile = -1;
    this.sfx.levelUp();
    this.burst(p.x, p.y, '#ffd23f', 18, 4);
    this.dirty = true;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.room) this.goTo(this.room.node._key, { from: null });
  }

  // opts.from : nœud d'où l'on vient (par défaut la salle courante) → on réapparaît
  //             devant la porte qui mène vers lui.
  // opts.at   : position exacte (restauration).
  // opts.focus: note à côté de laquelle apparaître (suivi de lien).
  goTo(key, opts = {}) {
    const node = this.byPath && key ? this.byPath.get(key) : null;
    if (!node) return false;
    const prev = 'from' in opts ? opts.from : this.room ? this.room.node : null;
    if (this.room && this.room.orbs.length) {
      const rest = this.room.orbs.reduce((a, o) => a + o.value, 0);
      this.room.orbs = [];
      this.gainXp(rest);
    }
    this.clearFx();

    const stack = [];
    for (let p = node; p; p = p._parent) stack.unshift(p._key);
    this.stack = stack;
    const firstVisit = !this.visited.has(node._key);
    for (const s of stack) this.visited.add(s);

    this.room = this.buildRoom(node);

    let pos = null;
    const at = opts.at;
    if (at && Number.isFinite(at.x) && Number.isFinite(at.y) && this.canStand(at.x, at.y)) pos = { x: at.x, y: at.y };
    if (!pos && opts.focus) pos = this.posNearNote(opts.focus);
    if (!pos && prev) pos = this.arrivalFrom(prev);
    if (!pos) pos = this.room.spawn;

    const pl = this.player;
    pl.x = pos.x;
    pl.y = pos.y;
    pl.kx = 0;
    pl.ky = 0;
    this.attackCd = 0;
    this.attackT = 0;
    this.dodgeT = 0;
    this.phoenixUsed = false;
    this.aegisLeft = this.relic('aegis');
    if (firstVisit && this.relic('feather') && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.relic('feather'));
      this.float(pos.x, pos.y - 1, `+${this.relic('feather')}♥ plume`, '#ff8a8a');
    }
    this.lastTile = -1;
    this.refreshSight();
    this.refreshQuest();
    this.updateCamera();
    this.prompt = this.nearest();
    this.dirty = true;
    if (this.cb.onRoom) this.cb.onRoom(node);
    return true;
  }

  buildRoom(node) {
    const gen = generateRoom(node, { mode: this.mode, bossAllowed: !this.defeatedBosses.has(node._key) });
    const theme = getTheme(node.name || node.path || node.id);
    const sk = `${this.mode}:${node._key}`;
    let st = this.roomState.get(sk);
    if (!st) {
      st = { explored: null, exploredFloor: 0, killed: new Set(), opened: false, hasKey: false, chests: new Set(), broken: new Set() };
      this.roomState.set(sk, st);
    }
    if (!st.explored) st.explored = new Uint8Array(gen.W * gen.H);
    const I = (x, y) => y * gen.W + x;
    // Les portes scellées sont des murs tant qu'elles ne sont pas ouvertes ; les fissures brisées deviennent du sol.
    const walls = gen.walls.slice();
    if (!st.opened) for (const d of gen.doors) walls[I(d.x, d.y)] = 1;
    for (const c of gen.cracks) if (st.broken.has(I(c.x, c.y))) walls[I(c.x, c.y)] = 0;
    const monsters = gen.monsters
      .map((m, id) => ({ ...m, id, hunting: false, kick: null }))
      .filter(m => !st.killed.has(m.id));
    return {
      ...gen,
      walls,
      doors: st.opened ? [] : gen.doors,
      key: st.hasKey || st.opened ? null : gen.key,
      chests: gen.chests.filter(c => !st.chests.has(I(c.x, c.y))),
      cracks: gen.cracks.filter(c => !st.broken.has(I(c.x, c.y))),
      node,
      theme,
      spr: makeThemeSprites(theme),
      state: st,
      explored: st.explored,
      visible: new Uint8Array(gen.W * gen.H),
      monsters,
      boss: gen.boss ? { ...gen.boss, depth: node._depth, dead: false, hunting: false, kick: null } : null,
      pickups: [],
      projectiles: [],
      telegraphs: [],
      orbs: [],
      playerField: null,
      questWp: null,
      questField: null,
    };
  }

  arrivalFrom(prev) {
    const room = this.room;
    if (prev === room.node || !isAncestor(room.node, prev)) return null;
    const child = childToward(room.node, prev);
    const pt = room.portals.find(p => p.kind === 'dir' && p.node === child);
    if (pt) return center(pt.front);
    if (room.sign && room.sign.extras.includes(child)) return this.standNear(room.sign.x, room.sign.y);
    return null;
  }

  posNearNote(note) {
    const room = this.room;
    const e = room.notes.find(n => n.node === note);
    if (e) return this.standNear(e.x, e.y);
    if (room.library && room.library.notes.includes(note)) return this.standNear(room.library.x, room.library.y);
    return null;
  }

  standNear(tx, ty) {
    for (const [dx, dy] of NEAR) {
      const x = tx + dx + 0.5;
      const y = ty + dy + 0.5;
      if (this.canStand(x, y)) return { x, y };
    }
    return null;
  }

  isWall(tx, ty) {
    const r = this.room;
    if (tx < 0 || ty < 0 || tx >= r.W || ty >= r.H) return true;
    return r.walls[ty * r.W + tx] === 1;
  }

  canStand(x, y) {
    if (!this.room) return false;
    const r = 0.22;
    return !(
      this.isWall(Math.floor(x - r), Math.floor(y - r)) ||
      this.isWall(Math.floor(x + r), Math.floor(y - r)) ||
      this.isWall(Math.floor(x - r), Math.floor(y + r)) ||
      this.isWall(Math.floor(x + r), Math.floor(y + r))
    );
  }

  tileOf(e) {
    return { x: Math.floor(e.x), y: Math.floor(e.y) };
  }

  isVisible(x, y) {
    const r = this.room;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= r.W || ty >= r.H) return false;
    return r.visible[ty * r.W + tx] === 1;
  }

  // Recalculée seulement quand le joueur change de case.
  refreshSight() {
    const room = this.room;
    const { W, H, walls, visible, explored } = room;
    const p = this.player;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    const tile = ty * W + tx;
    if (tile === this.lastTile) return;
    this.lastTile = tile;

    visible.fill(0);
    const sight = this.sight();
    const R = Math.ceil(sight);
    const before = room.state.exploredFloor;
    for (let y = Math.max(0, ty - R); y <= Math.min(H - 1, ty + R); y++) {
      for (let x = Math.max(0, tx - R); x <= Math.min(W - 1, tx + R); x++) {
        if ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > sight * sight) continue;
        if (!lineOfSight(walls, W, p.x, p.y, x, y)) continue;
        const i = y * W + x;
        visible[i] = 1;
        if (!explored[i]) {
          explored[i] = 1;
          if (!walls[i]) room.state.exploredFloor++;
        }
      }
    }
    if (before < room.floorCount && room.state.exploredFloor >= room.floorCount) this.dirty = true;
    room.playerField = bfsField(walls, W, H, tx, ty);
  }

  isRoomFullyRevealed() {
    return !!this.room && this.room.state.exploredFloor >= this.room.floorCount;
  }

  setQuest(note) {
    this.quest = note && (!this.collected.has(note.path) || this.isDailyTarget(note)) ? note : null;
    this.refreshQuest();
    this.dirty = true;
  }

  refreshQuest() {
    const room = this.room;
    if (!room) return;
    room.questWp = this.quest ? questWaypoint(room, this.quest) : null;
    room.questField = room.questWp ? bfsField(room.walls, room.W, room.H, room.questWp.x, room.questWp.y) : null;
    const p = this.tileOf(this.player);
    if (room.questField && room.questField[p.y * room.W + p.x] < 0 && room.doors.length) {
      const d = room.doors[0];
      room.questWp = room.key ? { x: room.key.x, y: room.key.y, kind: 'key' } : { x: d.x, y: d.y, kind: 'door' };
      const open = room.walls.slice();
      for (const dd of room.doors) open[dd.y * room.W + dd.x] = 0;
      room.questField = bfsField(open, room.W, room.H, room.questWp.x, room.questWp.y);
    }
  }

  updateQuestDir() {
    const room = this.room;
    this.questDir = null;
    if (!room || !room.questWp || !room.questField) return;
    const p = this.player;
    const { x: tx, y: ty } = this.tileOf(p);
    const here = room.questField[ty * room.W + tx];
    let goal = center(room.questWp);
    if (here > 2) {
      const s = stepDown(room.questField, room.W, room.H, tx, ty);
      if (s) goal = center(s);
    } else if (here >= 0 && here <= 1) {
      return;
    }
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    this.questDir = { x: dx / d, y: dy / d };
  }

  noteGuarded(note) {
    const b = this.room.boss;
    return note.guarded && b && !b.dead;
  }

  nearest() {
    if (!this.room) return null;
    const { x, y } = this.player;
    let best = null;
    let bd = 1.5;
    const consider = (it) => {
      if (!this.isVisible(it.x + 0.5, it.y + 0.5)) return;
      const d = Math.hypot(it.x + 0.5 - x, it.y + 0.5 - y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    };
    for (const note of this.room.notes) {
      if (this.collected.has(note.node.path)) {
        if (this.isDailyTarget(note.node)) consider({ x: note.x, y: note.y, kind: 'daily', note, label: 'E — relire (note du jour)' });
        continue;
      }
      consider({ x: note.x, y: note.y, kind: 'note', note, label: this.noteGuarded(note) ? 'ombre protectrice…' : 'E — lire' });
    }
    for (const pt of this.room.portals) {
      consider({ x: pt.x, y: pt.y, kind: 'portal', portal: pt, label: pt.kind === 'back' ? `E — remonter : ${pt.node.name}` : `E — entrer : ${pt.node.name}` });
    }
    if (this.room.library) consider({ x: this.room.library.x, y: this.room.library.y, kind: 'library', label: 'E — bibliothèque' });
    if (this.room.sign) consider({ x: this.room.sign.x, y: this.room.sign.y, kind: 'sign', label: 'E — routes' });
    for (const c of this.room.chests) consider({ x: c.x, y: c.y, kind: 'chest', chest: c, label: c.secret ? 'E — coffre caché !' : 'E — ouvrir le coffre' });
    const hasKey = this.room.state.hasKey;
    for (const d of this.room.doors) consider({ x: d.x, y: d.y, kind: 'door', label: hasKey ? 'E — déverrouiller' : 'scellée — trouve la clé' });
    return best;
  }

  interact() {
    if (!this.room || this.dead || this.paused) return;
    const it = this.nearest();
    if (!it) {
      this.sfx.error();
      return;
    }
    if (it.kind === 'note') {
      if (this.noteGuarded(it.note)) {
        this.sfx.error();
        if (this.cb.onBlocked) this.cb.onBlocked('Une aura sombre protège ce parchemin. Vaincs le gardien.');
        return;
      }
      this.collectNote(it.note.node);
    } else if (it.kind === 'daily') {
      this.readDaily(it.note.node);
    } else if (it.kind === 'portal') {
      if (it.portal.kind === 'back') this.sfx.back();
      else this.sfx.door();
      this.goTo(it.portal.key);
    } else if (it.kind === 'library') {
      this.sfx.open();
      if (this.cb.onLibrary) this.cb.onLibrary(this.room.library.notes);
    } else if (it.kind === 'sign') {
      this.sfx.open();
      if (this.cb.onRoutes) this.cb.onRoutes(this.room.sign.extras);
    } else if (it.kind === 'chest') {
      this.openChest(it.chest);
    } else if (it.kind === 'door') {
      if (this.room.state.hasKey) this.unlockDoors();
      else {
        this.sfx.error();
        if (this.cb.onBlocked) this.cb.onBlocked('Porte scellée. La clé est quelque part dans cet étage.');
      }
    }
  }

  // ── Clé, portes, coffres, murs fissurés ─────────────────────────

  pickKey() {
    const room = this.room;
    room.state.hasKey = true;
    this.burst(room.key.x + 0.5, room.key.y + 0.5, '#ffd23f', 16, 4);
    this.float(room.key.x + 0.5, room.key.y, 'clé de la voûte', '#ffd23f');
    room.key = null;
    this.sfx.key();
    this.dirty = true;
    this.refreshQuest();
    if (this.cb.onKey) this.cb.onKey();
  }

  unlockDoors() {
    const room = this.room;
    room.state.opened = true;
    for (const d of room.doors) {
      room.walls[d.y * room.W + d.x] = 0;
      this.burst(d.x + 0.5, d.y + 0.5, '#c8a040', 10, 3);
    }
    room.doors = [];
    this.stats.unlocks++;
    this.sfx.unlock();
    this.shake(2.5, 0.3);
    this.float(this.player.x, this.player.y - 1, 'la voûte s’ouvre', '#ffd23f');
    this.lastTile = -1;
    this.refreshSight();
    this.refreshQuest();
    this.dirty = true;
  }

  openChest(chest) {
    const room = this.room;
    room.state.chests.add(chest.y * room.W + chest.x);
    room.chests = room.chests.filter(c => c !== chest);
    this.stats.chests++;
    this.dirty = true;
    this.sfx.chest();
    const cx = chest.x + 0.5;
    const cy = chest.y + 0.5;
    this.burst(cx, cy, '#ffd23f', chest.secret ? 28 : 16, 4.5);
    this.shake(1.5, 0.15);
    const depth = room.node._depth || 0;
    let loot;
    if (chest.secret) {
      this.pendingPerks++;
      this.dropOrbs(cx, cy, 6 + depth * 2);
      loot = 'rune de don : un don de plus !';
    } else {
      const r = Math.random();
      if (r < 0.5) {
        this.dropOrbs(cx, cy, 5 + depth * 2);
        loot = 'une gerbe d’orbes';
      } else if (r < 0.8) {
        room.pickups.push({ x: cx - 0.3, y: cy, kind: 'heart', t: 0 }, { x: cx + 0.3, y: cy, kind: 'heart', t: 0 });
        loot = 'deux cœurs';
      } else {
        const p = this.player;
        this.float(p.x, p.y - 0.9, 'potion !', '#ff8a8a');
        p.hp = p.maxHp;
        this.sfx.heal();
        loot = 'une potion — vie restaurée';
      }
    }
    if (this.cb.onChest) this.cb.onChest(loot, chest.secret);
  }

  breakCrack(c) {
    const room = this.room;
    const i = c.y * room.W + c.x;
    room.walls[i] = 0;
    room.state.broken.add(i);
    room.cracks = room.cracks.filter(k => k !== c);
    this.stats.secrets++;
    this.dirty = true;
    this.sfx.thud();
    this.shake(2.5, 0.25);
    this.burst(c.x + 0.5, c.y + 0.5, '#8a8a92', 16, 4);
    this.float(c.x + 0.5, c.y, 'passage secret !', '#9fe0ff');
    this.lastTile = -1;
    this.refreshSight();
    this.refreshQuest();
  }

  collectNote(note) {
    if (this.collected.has(note.path)) {
      if (this.cb.onCollect) this.cb.onCollect(note, false);
      return;
    }
    this.collected.add(note.path);
    this.sfx.pickup();
    const color = { commune: '#ffe08a', rare: '#9fe0ff', legendaire: '#dca8ff' }[note._rarity] || '#ffe08a';
    this.burst(this.player.x, this.player.y - 0.3, color, note._rarity === 'legendaire' ? 26 : 14, 5);
    this.heal(1);
    this.gainXp((RARITY[note._rarity] || RARITY.commune).xp * (1 + 0.25 * this.relic('scholar')));
    this.dirty = true;
    const seals = this.seals;
    this.refreshBonuses();
    if (note._relic && this.cb.onRelic) this.cb.onRelic(RELIC_BY_ID[note._relic], this.relic(note._relic));
    if (this.seals > seals && this.cb.onSeal) this.cb.onSeal(note._parent, this.seals);
    this.readDaily(note);
    if (this.quest === note) {
      this.quest = null;
      if (this.cb.onQuestDone) this.cb.onQuestDone(note);
    }
    this.refreshQuest();
    if (this.cb.onCollect) this.cb.onCollect(note, true);
  }

  followLink(note) {
    if (!note || !note._parent) return;
    this.stats.links++;
    this.dirty = true;
    this.sfx.warp();
    this.goTo(note._parent._key, { focus: note });
    // Premier passage par ce fil : petite récompense pour tisser le vault.
    if (!this.threads.has(note.path)) {
      this.threads.add(note.path);
      this.gainXp(LINK_XP);
      this.float(this.player.x, this.player.y - 1, `fil tissé +${LINK_XP} XP`, '#9fe0ff');
    }
  }

  attack() {
    if (!this.room || this.dead || this.paused || this.attackCd > 0 || this.dodgeT > 0) return;
    this.attackCd = ATTACK_CD;
    this.attackT = 0.22;
    this.sfx.sword();

    const { x, y } = this.player;
    const dir = FACING[this.player.facing];
    const power = 1 + Math.floor((this.player.level - 1) / 3) + this.perk('blade');
    const range = ATTACK_MAX * (1 + 0.25 * this.perk('reach'));
    const hit = (m, reach = range) => {
      const f = (m.x - x) * dir.x + (m.y - y) * dir.y;
      const p = (m.x - x) * -dir.y + (m.y - y) * dir.x;
      return f >= -0.2 && f <= reach && Math.abs(p) <= ATTACK_HALF;
    };
    for (const c of this.room.cracks.slice()) {
      if (hit({ x: c.x + 0.5, y: c.y + 0.5 }, 1.6)) this.breakCrack(c);
    }
    for (const m of this.room.monsters) {
      if (!m.dying && hit(m)) this.swordHit(m, power, x, y);
    }
    const b = this.room.boss;
    if (b && !b.dead && hit(b)) this.swordHit(b, power, x, y);

    // Un projectile ennemi pris dans l'arc repart vers l'ennemi le plus proche
    // situé devant soi (cône de ~70°), sinon tout droit.
    const facing = Math.atan2(dir.y, dir.x);
    const targets = [...this.room.monsters.filter(m => !m.dying), ...(b && !b.dead ? [b] : [])];
    for (const s of this.room.projectiles) {
      if (s.owner !== 'enemy' || !hit(s, range + 0.4)) continue;
      let aim = facing;
      let best = Infinity;
      for (const t of targets) {
        const a = Math.atan2(t.y - s.y, t.x - s.x);
        const dist = Math.hypot(t.x - s.x, t.y - s.y);
        if (Math.abs(angleDiff(a, facing)) < 1.2 && dist < best) {
          best = dist;
          aim = a;
        }
      }
      s.owner = 'player';
      s.vx = Math.cos(aim) * 8;
      s.vy = Math.sin(aim) * 8;
      s.dmg = (2 + power) * (this.perk('mirror') ? 2 : 1);
      s.t = 0;
      this.stats.reflects++;
      this.dirty = true;
      this.sfx.reflect();
      this.float(s.x, s.y - 0.5, 'renvoi !', '#4affd8');
      this.freeze(0.04);
    }
  }

  // Inflige des dégâts depuis (fromX, fromY) : bouclier frontal, dégâts doublés sur
  // une cible étourdie, interruption des préparations d'attaque.
  swordHit(e, power, x, y) {
    const crit = Math.random() < 0.15 * this.relic('quill');
    if (this.hurt(e, power, x, y, { crit }) && this.relic('ember') && !e.dying && !e.dead) {
      e.burn = { t: 1, dmg: this.relic('ember') };
    }
  }

  // opts.crit : coup critique ; opts.pierce : ignore le bouclier (brûlure, épines).
  hurt(e, dmg, fromX, fromY, { crit: forced = false, pierce = false } = {}) {
    const ang = Math.atan2(fromY - e.y, fromX - e.x);
    if (!pierce && e.kind === 'knight' && e.face !== undefined && Math.abs(angleDiff(ang, e.face)) < SHIELD_ARC) {
      this.sfx.clang();
      this.float(e.x, e.y - 0.6, 'bloqué', '#c8c8d0');
      this.burst(e.x + Math.cos(e.face) * 0.5, e.y + Math.sin(e.face) * 0.5, '#ffd23f', 6, 3);
      this.freeze(0.03);
      const p = this.player;
      if (Math.hypot(p.x - fromX, p.y - fromY) < 0.01) {
        p.kx = Math.cos(ang) * 2;
        p.ky = Math.sin(ang) * 2;
      }
      return false;
    }
    const crit = forced || e.state === 'stun';
    const total = crit ? dmg * 2 : dmg;
    e.hp -= total;
    e.hunting = true;
    e.flash = 0.12;
    if (e.state === 'windup') e.state = null;
    if (e.state !== 'charge') e.kick = { x: -Math.cos(ang) * 1.5, y: -Math.sin(ang) * 1.5 };
    this.sfx.hit();
    this.float(e.x, e.y - 0.6, crit ? `${total}!` : `${total}`, crit ? '#ffd23f' : '#ffffff');
    this.burst(e.x + Math.cos(ang) * 0.3, e.y + Math.sin(ang) * 0.3, '#ffffff', crit ? 8 : 4, 3);
    this.freeze(crit ? 0.08 : 0.05);
    this.shake(crit ? 2.5 : 1.5, 0.12);
    if (e.hp <= 0) {
      if (e === this.room.boss) this.killBoss(e);
      else this.killMonster(e);
    }
    return true;
  }

  // Don « Onde de choc » : repousse et blesse ce qui entoure la fin de la roulade.
  shockwave() {
    const p = this.player;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.fx.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, color: '#9fe0ff', t: 0, life: 0.25 });
    }
    for (const m of this.room.monsters) {
      if (!m.dying && Math.hypot(m.x - p.x, m.y - p.y) < 1.7) this.hurt(m, 1, p.x, p.y);
    }
    const b = this.room.boss;
    if (b && !b.dead && Math.hypot(b.x - p.x, b.y - p.y) < 1.9) this.hurt(b, 1, p.x, p.y);
  }

  dodge(keys) {
    if (!this.room || this.dead || this.paused || this.dodgeCd > 0 || this.dodgeT > 0) return;
    const p = this.player;
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
    if (!dx && !dy) {
      dx = FACING[p.facing].x;
      dy = FACING[p.facing].y;
    }
    const len = Math.hypot(dx, dy);
    this.dodgeDir = { x: dx / len, y: dy / len };
    this.dodgeT = DODGE_TIME;
    this.dodgeCd = DODGE_CD * Math.pow(0.7, this.perk('roll'));
    this.dodgeAvoided = false;
    this.sfx.dodge();
    this.burst(p.x, p.y + 0.3, '#a8a8b8', 5, 2);
  }

  killMonster(m) {
    m.dying = true;
    if (m.id != null) this.room.state.killed.add(m.id);
    this.stats.kills++;
    this.dirty = true;
    this.sfx.kill();
    const color = m.elite ? '#ff3a5a' : { slime: '#79b94f', splitter: '#4ac8ff', charger: '#a07a4a', knight: '#8a8a96', archer: '#6a6488' }[m.kind] || '#8a7ad8';
    this.burst(m.x, m.y, color, 12, 4.5);
    this.shake(2, 0.15);
    if (Math.random() < DROP_CHANCE) this.room.pickups.push({ x: m.x, y: m.y, kind: 'heart', t: 0 });
    if (Math.random() < 0.15 * this.perk('leech')) this.heal(1);
    this.dropOrbs(m.x, m.y, Math.round(m.xp * (1 + 0.2 * this.perk('magnet'))));
    splitOnDeath(this, m);
  }

  dropOrbs(x, y, xp) {
    const n = Math.min(xp, 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const v = 2 + Math.random() * 2;
      const value = Math.floor(xp / n) + (i < xp % n ? 1 : 0);
      this.room.orbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, value, t: 0, seed: Math.random() * 6 });
    }
  }

  killBoss(b) {
    b.dead = true;
    this.sfx.bossKill();
    this.heal(3);
    this.burst(b.x, b.y, '#c77bff', 40, 6);
    this.burst(b.x, b.y, '#ff6a4a', 20, 4);
    this.freeze(0.15);
    this.shake(4, 0.6);
    this.dropOrbs(b.x, b.y, b.xp);
    this.defeatedBosses.add(this.room.node._key);
    this.dirty = true;
    if (this.cb.onBossDefeat) this.cb.onBossDefeat(this.room.node, b);
  }

  gainXp(n, { raw = false } = {}) {
    const p = this.player;
    const total = (raw ? n : n * (1 + this.sealXpBonus())) + this.xpFrac;
    const whole = Math.floor(total);
    this.xpFrac = total - whole;
    p.xp += whole;
    const lvl = levelFromXp(p.xp);
    if (lvl > p.level) {
      const before = p.maxHp;
      this.pendingPerks += lvl - p.level;
      p.level = lvl;
      p.maxHp = this.maxHp();
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before) + 1);
      this.sfx.levelUp();
      this.dirty = true;
      if (this.cb.onLevelUp) this.cb.onLevelUp(lvl, p.maxHp - before);
    }
  }

  heal(n) {
    const p = this.player;
    if (p.hp < p.maxHp) {
      this.sfx.heal();
      this.float(p.x, p.y - 0.9, `+${Math.min(n, p.maxHp - p.hp)}♥`, '#ff8a8a');
    }
    p.hp = Math.min(p.maxHp, p.hp + n);
  }

  tick(keys, dt) {
    this.time += dt;
    if (!this.room || this.paused) return;
    this.updateFx(dt);
    if (this.dead) return;
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      return;
    }

    const p = this.player;
    if (!this.canStand(p.x, p.y)) {
      const s = this.standNear(Math.floor(p.x), Math.floor(p.y)) || this.room.spawn;
      p.x = s.x;
      p.y = s.y;
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    if (p.kx || p.ky) {
      const d = Math.hypot(p.kx, p.ky);
      const step = Math.min(d, 3.4 * dt);
      if (this.canStand(p.x + (p.kx / d) * step, p.y)) p.x += (p.kx / d) * step;
      if (this.canStand(p.x, p.y + (p.ky / d) * step)) p.y += (p.ky / d) * step;
      p.kx *= 0.85;
      p.ky *= 0.85;
      if (Math.hypot(p.kx, p.ky) < 0.05) {
        p.kx = 0;
        p.ky = 0;
      }
    }

    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;

    if (this.dodgeT > 0) {
      // Roulade : rapide, intouchable, et laisse des images rémanentes.
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      if (this.dodgeT === 0 && this.perk('shock')) this.shockwave();
      const step = DODGE_SPEED * dt;
      if (this.canStand(p.x + this.dodgeDir.x * step, p.y)) p.x += this.dodgeDir.x * step;
      if (this.canStand(p.x, p.y + this.dodgeDir.y * step)) p.y += this.dodgeDir.y * step;
      this.fx.ghosts.push({ x: p.x, y: p.y, facing: p.facing, t: 0 });
      this.walking = true;
      this.walkT += dt;
    } else if (dx !== 0 || dy !== 0) {
      if (dx !== 0) p.facing = dx > 0 ? 3 : 2;
      else p.facing = dy > 0 ? 0 : 1;
      const len = Math.hypot(dx, dy);
      const speed = SPEED * (1 + 0.12 * this.perk('swift'));
      const mx = p.x + (dx / len) * speed * dt;
      const my = p.y + (dy / len) * speed * dt;
      if (this.canStand(mx, p.y)) p.x = mx;
      if (this.canStand(p.x, my)) p.y = my;

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

    this.refreshSight();
    this.updateAmbience(dt);
    this.updatePickups(dt);
    this.updateOrbs(dt);
    this.updateCreatures(dt);
    if (this.dead) return;
    this.updateEcho();
    this.prompt = this.nearest();
    this.updateQuestDir();
    this.updateCamera();
  }

  updateCamera() {
    const room = this.room;
    const vw = VIEW_W * TILE;
    const vh = VIEW_H * TILE;
    const mw = room.W * TILE;
    const mh = room.H * TILE;
    const p = this.player;
    // Les marges laissent de l'air sous le HUD (en haut) et la barre de vie (en bas).
    this.cam.x = Math.round(mw <= vw ? -(vw - mw) / 2 : clamp(p.x * TILE - vw / 2, -CAM_PAD_X, mw - vw + CAM_PAD_X));
    this.cam.y = Math.round(mh <= vh ? -(vh - mh) / 2 : clamp(p.y * TILE - vh / 2, -CAM_PAD_TOP, mh - vh + CAM_PAD_BOTTOM));
  }

  screenOf(wx, wy) {
    return { x: Math.round(wx * TILE - this.cam.x), y: Math.round(wy * TILE - this.cam.y) };
  }

  updateAmbience(dt) {
    const room = this.room;
    for (const p of room.particles) {
      const nx = p.x + p.vx * dt * p.speed;
      const ny = p.y + p.vy * dt * p.speed;
      if (this.isWall(Math.floor(nx), Math.floor(p.y))) p.vx = -p.vx;
      else p.x = nx;
      if (this.isWall(Math.floor(p.x), Math.floor(ny))) p.vy = -p.vy;
      else p.y = ny;
    }
  }

  magnet() {
    return MAGNET * (1 + 0.6 * this.perk('magnet'));
  }

  updatePickups(dt) {
    const room = this.room;
    const p = this.player;
    if (room.key && Math.hypot(room.key.x + 0.5 - p.x, room.key.y + 0.5 - p.y) < 0.7) this.pickKey();
    room.pickups = room.pickups.filter(pk => {
      pk.t += dt;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < 0.7) {
        this.heal(1);
        return false;
      }
      if (d < this.magnet() && pk.t > ORB_DELAY) {
        pk.x += ((p.x - pk.x) / d) * 6 * dt;
        pk.y += ((p.y - pk.y) / d) * 6 * dt;
      }
      return pk.t < 20;
    });
  }

  // Les orbes jaillissent, puis filent vers le joueur : jamais d'XP perdue.
  updateOrbs(dt) {
    const room = this.room;
    const p = this.player;
    let got = 0;
    room.orbs = room.orbs.filter(o => {
      o.t += dt;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (o.t > ORB_DELAY) {
        const pull = (d < this.magnet() ? 26 : 9) * dt;
        o.vx += (dx / d) * pull;
        o.vy += (dy / d) * pull;
        o.vx *= 0.92;
        o.vy *= 0.92;
      } else {
        o.vx *= 0.88;
        o.vy *= 0.88;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (d < 0.45 && o.t > ORB_DELAY) {
        got += o.value;
        return false;
      }
      return true;
    });
    if (got) {
      this.sfx.xp();
      this.gainXp(got);
    }
  }

  moveToward(e, gx, gy, speed, dt) {
    const dx = gx - e.x;
    const dy = gy - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const nx = e.x + (dx / d) * speed * dt;
    const ny = e.y + (dy / d) * speed * dt;
    // Les créatures n'entrent pas dans la zone sûre (elles peuvent en sortir).
    const outside = !this.inSafe(e.x, e.y);
    if (this.canStand(nx, e.y) && !(outside && this.inSafe(nx, e.y))) e.x = nx;
    if (this.canStand(e.x, ny) && !(outside && this.inSafe(e.x, ny))) e.y = ny;
  }

  // Poursuite : en ligne droite si la cible est visible, sinon on descend le
  // champ de distance du joueur, ce qui fait suivre les couloirs.
  chase(e, dt, speed) {
    const room = this.room;
    const p = this.player;
    if (this.isVisible(e.x, e.y)) {
      this.moveToward(e, p.x, p.y, speed, dt);
      return;
    }
    const t = this.tileOf(e);
    const s = room.playerField && stepDown(room.playerField, room.W, room.H, t.x, t.y);
    if (s) this.moveToward(e, s.x + 0.5, s.y + 0.5, speed, dt);
  }

  fieldDist(e) {
    const room = this.room;
    const t = this.tileOf(e);
    return room.playerField ? room.playerField[t.y * room.W + t.x] : -1;
  }

  updateCreatures(dt) {
    const room = this.room;
    for (const m of room.monsters.slice()) {
      if (!m.dying) updateMonster(this, m, dt);
    }
    room.monsters = room.monsters.filter(m => !m.dying);
    if (room.boss && !room.boss.dead) updateBoss(this, room.boss, dt);
    updateProjectiles(this, dt);
    for (const e of [...room.monsters, ...(room.boss && !room.boss.dead ? [room.boss] : [])]) {
      if (!e.burn) continue;
      e.burn.t -= dt;
      if (Math.random() < dt * 12) this.fx.sparks.push({ x: e.x + (Math.random() - 0.5) * 0.5, y: e.y, vx: 0, vy: -1.5, color: '#ff9a3c', t: 0, life: 0.4 });
      if (e.burn.t <= 0) {
        const dmg = e.burn.dmg;
        e.burn = null;
        this.hurt(e, dmg, e.x, e.y + 0.01, { pierce: true });
      }
    }
  }

  // Écho : l'XP perdue à la mort attend là où l'on est tombé.
  updateEcho() {
    const e = this.echo;
    if (!e || e.sk !== `${this.mode}:${this.room.node._key}`) return;
    const p = this.player;
    if (Math.hypot(e.x - p.x, e.y - p.y) < 0.7) {
      this.echo = null;
      this.stats.echoes++;
      this.burst(p.x, p.y, '#c77bff', 20, 4);
      this.float(p.x, p.y - 1, `écho récupéré +${e.xp} XP`, '#dca8ff');
      this.sfx.warp();
      this.gainXp(e.xp, { raw: true });
      this.dirty = true;
    }
  }

  damagePlayer(dmg, mx, my, src = null) {
    const p = this.player;
    if (this.dead) return;
    if (this.dodgeT > 0) {
      if (!this.dodgeAvoided) {
        this.dodgeAvoided = true;
        this.stats.dodges++;
        this.dirty = true;
        this.float(p.x, p.y - 0.9, 'esquive', '#9fe0ff');
      }
      return;
    }
    if (p.invuln > 0) return;
    if (src && this.relic('thorns') && !src.dying && !src.dead) this.hurt(src, this.relic('thorns'), p.x, p.y, { pierce: true });
    if (this.aegisLeft > 0) {
      this.aegisLeft--;
      p.invuln = 0.8;
      this.sfx.clang();
      this.float(p.x, p.y - 0.9, 'égide', '#9fe0ff');
      this.burst(p.x, p.y, '#9fe0ff', 12, 3);
      return;
    }
    p.hp -= dmg;
    p.invuln = 1.1;
    this.sfx.hurt();
    this.float(p.x, p.y - 0.9, `-${dmg}`, '#ff6a6a');
    this.burst(p.x, p.y, '#ff6a6a', 8, 3.5);
    this.freeze(0.06);
    this.shake(3, 0.25);
    const ang = Math.atan2(p.y - my, p.x - mx);
    p.kx = Math.cos(ang) * 2.4;
    p.ky = Math.sin(ang) * 2.4;
    if (p.hp <= 0 && this.perk('phoenix') && !this.phoenixUsed) {
      this.phoenixUsed = true;
      p.hp = 1;
      p.invuln = 2;
      this.float(p.x, p.y - 1.2, 'seconde chance', '#ffd23f');
      this.burst(p.x, p.y, '#ffd23f', 24, 5);
      this.sfx.levelUp();
    }
    if (p.hp <= 0) {
      p.hp = 0;
      this.stats.deaths++;
      this.dead = true;
      this.dirty = true;
      this.sfx.error();
      // La moitié de la progression du niveau en cours reste au sol (jamais de niveau perdu).
      const lost = Math.floor((p.xp - xpForLevel(p.level)) * ECHO_SHARE);
      this.echo = lost > 0 ? { sk: `${this.mode}:${this.room.node._key}`, x: p.x, y: p.y, xp: lost } : null;
      p.xp -= Math.max(0, lost);
      if (this.cb.onDeath) this.cb.onDeath(this.room.node, Math.max(0, lost));
    }
  }

  respawn() {
    if (!this.room) return;
    this.dead = false;
    this.player.maxHp = this.maxHp();
    this.player.hp = this.player.maxHp;
    this.player.invuln = 1.5;
    this.goTo(this.room.node._key, { from: null });
    this.sfx.door();
  }
}
