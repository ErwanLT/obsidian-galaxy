import { MONSTER_TYPES, spawnMonster } from './worldgen.js';

// Comportements des créatures et du gardien. Chaque attaque dangereuse est
// annoncée (posture, « ! », zone rouge au sol) pour laisser le temps d'esquiver.

const TAU = Math.PI * 2;
const SHOT_SPEED = 5.2;
const BOSS_AGGRO = 7;

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const contactRadius = m => (m.mini ? 0.5 : m.kind === 'charger' ? 0.7 : 0.62);

function applyKick(g, e, dt, k = 1) {
  e.x += e.kick.x * dt * k;
  e.y += e.kick.y * dt * k;
  if (!g.canStand(e.x, e.y)) {
    e.x -= e.kick.x * dt * k;
    e.y -= e.kick.y * dt * k;
  }
  e.kick.x *= 0.86;
  e.kick.y *= 0.86;
  if (Math.hypot(e.kick.x, e.kick.y) < 0.05) e.kick = null;
}

function wander(g, m, dt) {
  m.turnT -= dt;
  if (m.turnT <= 0) {
    m.turnT = 1.2 + Math.random() * 2;
    m.angle = Math.random() * TAU;
  }
  g.moveToward(m, m.x + Math.cos(m.angle), m.y + Math.sin(m.angle), m.speed * 0.4, dt);
}

// Avance en ligne droite ; renvoie false si un mur (ou la zone sûre) l'arrête.
function dashStep(g, e, speed, dt) {
  const nx = e.x + e.dir.x * speed * dt;
  const ny = e.y + e.dir.y * speed * dt;
  if (!g.canStand(nx, ny) || g.inSafe(nx, ny)) return false;
  e.x = nx;
  e.y = ny;
  return true;
}

function stun(g, e, dur) {
  e.state = 'stun';
  e.timer = dur;
  g.sfx.thud();
  g.shake(e.maxHp > 10 ? 3.5 : 2, 0.25);
  g.burst(e.x + e.dir.x * 0.4, e.y + e.dir.y * 0.4, '#e8d8b8', 10, 3);
  g.float(e.x, e.y - 0.8, 'étourdi', '#ffd23f');
  g.stats.stuns++;
  g.dirty = true;
}

export function updateMonster(g, m, dt) {
  const p = g.player;
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (m.flash) m.flash = Math.max(0, m.flash - dt);

  if (m.kick) {
    applyKick(g, m, dt);
  } else {
    const seen = g.isVisible(m.x, m.y);
    const fd = g.fieldDist(m);
    if (seen && d < m.aggro) m.hunting = true;
    else if (m.hunting && (fd < 0 || fd > m.aggro * 2)) m.hunting = false;

    if (!m.hunting && !m.state) wander(g, m, dt);
    else if (m.kind === 'archer') archer(g, m, dt, d, dx, dy, seen);
    else if (m.kind === 'charger') charger(g, m, dt, d, dx, dy, seen);
    else if (m.kind === 'knight') knight(g, m, dt, dx, dy);
    else g.chase(m, dt, m.speed);
  }

  if (d < contactRadius(m)) g.damagePlayer(m.state === 'dash' ? m.dmg + 1 : m.dmg, m.x, m.y, m);
}

// Garde ses distances, tourne autour du joueur et tire après un temps de visée.
function archer(g, m, dt, d, dx, dy, seen) {
  m.shootT = (m.shootT ?? 0.8 + Math.random()) - dt;
  if (m.state === 'aim') {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.state = null;
      m.shootT = 1.5 + Math.random() * 0.9;
      shoot(g, m.x, m.y, Math.atan2(dy, dx), SHOT_SPEED, m.dmg);
    }
    return;
  }
  if (!seen) {
    g.chase(m, dt, m.speed);
    return;
  }
  if (m.strafe === undefined || Math.random() < dt * 0.4) m.strafe = Math.random() < 0.5 ? -1 : 1;
  if (d < 3.2) g.moveToward(m, m.x - dx, m.y - dy, m.speed, dt);
  else if (d > 5.5) g.chase(m, dt, m.speed);
  else g.moveToward(m, m.x - dy * m.strafe, m.y + dx * m.strafe, m.speed * 0.5, dt);
  if (m.shootT <= 0 && d < 8) {
    m.state = 'aim';
    m.timer = 0.45 * g.windupScale();
    g.sfx.aim();
  }
}

// S'arrête, gratte le sol (« ! »), puis fonce en ligne droite. Contre un mur : étourdi.
function charger(g, m, dt, d, dx, dy, seen) {
  if (m.state === 'windup') {
    m.timer -= dt;
    if (m.timer <= 0) {
      // Assez long pour dépasser le joueur : esquivé, il finit souvent dans un mur.
      m.state = 'dash';
      m.timer = 0.9;
      g.sfx.charge();
    }
    return;
  }
  if (m.state === 'dash') {
    m.timer -= dt;
    if (!dashStep(g, m, 9, dt)) stun(g, m, 1.3);
    else if (m.timer <= 0) {
      m.state = 'rest';
      m.timer = 0.6;
    }
    if (Math.random() < 0.5) g.burst(m.x - m.dir.x * 0.4, m.y - m.dir.y * 0.4, '#a08a6a', 1, 1);
    return;
  }
  if (m.state === 'stun' || m.state === 'rest') {
    m.timer -= dt;
    if (m.timer <= 0) m.state = null;
    return;
  }
  g.chase(m, dt, m.speed);
  m.cd = (m.cd ?? 0.6) - dt;
  if (seen && d < 5.5 && m.cd <= 0) {
    m.state = 'windup';
    m.timer = 0.6 * g.windupScale();
    m.dir = { x: dx / d, y: dy / d };
    m.cd = 2.4;
    g.sfx.windup();
  }
}

// Bouclier frontal qui pivote lentement : il faut le contourner.
function knight(g, m, dt, dx, dy) {
  const target = Math.atan2(dy, dx);
  if (m.face === undefined) m.face = target;
  const turn = 1.7 * dt;
  m.face += Math.max(-turn, Math.min(turn, angleDiff(target, m.face)));
  g.chase(m, dt, m.speed);
}

export function splitOnDeath(g, m) {
  if (m.kind !== 'splitter') return;
  for (const side of [-1, 1]) {
    const mini = spawnMonster(MONSTER_TYPES.slime, m.x + side * 0.3, m.y, 0);
    Object.assign(mini, { hp: 1, maxHp: 1, xp: 1, mini: true, hunting: true, name: 'gelée' });
    mini.kick = { x: side * 3, y: (Math.random() - 0.5) * 2 };
    g.room.monsters.push(mini);
  }
}

// ── Projectiles ─────────────────────────────────────────────────────

export function shoot(g, x, y, angle, speed, dmg) {
  g.room.projectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, owner: 'enemy', dmg, t: 0 });
  g.sfx.shoot();
}

export function updateProjectiles(g, dt) {
  const room = g.room;
  const p = g.player;
  room.projectiles = room.projectiles.filter(s => {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.t > 4 || g.isWall(Math.floor(s.x), Math.floor(s.y))) {
      g.burst(s.x, s.y, s.owner === 'enemy' ? '#ff4a8a' : '#4affd8', 3, 2);
      return false;
    }
    if (s.owner === 'enemy') {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 0.4) {
        g.damagePlayer(s.dmg, s.x - s.vx, s.y - s.vy);
        return false;
      }
      return true;
    }
    for (const m of room.monsters) {
      if (!m.dying && Math.hypot(s.x - m.x, s.y - m.y) < 0.5) {
        g.hurt(m, s.dmg, s.x - s.vx, s.y - s.vy);
        return false;
      }
    }
    const b = room.boss;
    if (b && !b.dead && Math.hypot(s.x - b.x, s.y - b.y) < 0.8) {
      g.hurt(b, s.dmg, s.x - s.vx, s.y - s.vy);
      return false;
    }
    return true;
  });
}

// ── Gardien ─────────────────────────────────────────────────────────
// Phase 1 : poursuite, charge annoncée, frappes au sol annoncées.
// Phase 2 (≤ 50 % PV) : plus rapide, invoque des serviteurs, ajoute une salve de projectiles.

function wallDistance(g, x, y, dir, max = 14) {
  let k = 0;
  while (k < max && g.canStand(x + dir.x * (k + 0.5), y + dir.y * (k + 0.5))) k += 0.5;
  return k;
}

function pickAttack(b) {
  const options = b.phase2 ? ['charge', 'slam', 'volley'] : ['charge', 'slam'];
  const choices = options.filter(o => o !== b.last);
  b.last = choices[(Math.random() * choices.length) | 0];
  return b.last;
}

export function updateBoss(g, b, dt) {
  const room = g.room;
  const p = g.player;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (b.flash) b.flash = Math.max(0, b.flash - dt);

  if (b.kick && b.state !== 'charge') applyKick(g, b, dt, 0.5);

  if (!b.hunting) {
    if (g.isVisible(b.x, b.y) && d < BOSS_AGGRO) {
      b.hunting = true;
      b.state = 'chase';
      b.timer = 1.2;
      g.sfx.bossRoar();
    }
  } else {
    // Réveillé par un coup d'épée avant de nous avoir vu : il entre en chasse.
    if (!b.state) {
      b.state = 'chase';
      b.timer = 1.2;
    }
    if (!b.phase2 && b.hp <= b.maxHp / 2) enrage(g, b);
    runBossState(g, b, dt, d, dx, dy);
  }

  const reach = b.state === 'charge' ? 0.9 : 0.68;
  if (d < reach) g.damagePlayer(b.state === 'charge' ? b.dmg + 1 : b.dmg, b.x, b.y, b);

  room.telegraphs = room.telegraphs.filter(t => (t.t += dt) < t.dur);
}

function enrage(g, b) {
  b.phase2 = true;
  b.speed *= 1.3;
  g.sfx.bossRoar();
  g.shake(4, 0.5);
  g.float(b.x, b.y - 1.2, 'ENRAGÉ', '#ff6a4a');
  g.burst(b.x, b.y, '#ff6a4a', 24, 5);
  for (const side of [-1, 1]) {
    const type = Math.random() < 0.5 ? MONSTER_TYPES.slime : MONSTER_TYPES.wisp;
    let x = b.x + side * 1.2;
    let y = b.y;
    if (!g.canStand(x, y)) {
      x = b.x;
      y = b.y + side * 1.2;
    }
    if (!g.canStand(x, y)) continue;
    const m = spawnMonster(type, x, y, b.depth || 0);
    m.hunting = true;
    g.room.monsters.push(m);
    g.burst(x, y, '#c77bff', 10, 3);
  }
}

function runBossState(g, b, dt, d, dx, dy) {
  const room = g.room;
  const fast = b.phase2 ? 0.75 : 1;
  b.timer -= dt;

  switch (b.state) {
    case 'chase':
      g.chase(b, dt, b.speed);
      if (b.timer <= 0) startAttack(g, b, d, dx, dy, fast);
      break;
    case 'windCharge':
      if (b.timer <= 0) {
        b.state = 'charge';
        b.timer = 0.9;
        g.sfx.charge();
      }
      break;
    case 'charge':
      if (!dashStep(g, b, 10, dt)) {
        stun(g, b, 1.6);
      } else if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = 0.5;
      }
      if (Math.random() < 0.6) g.burst(b.x - b.dir.x * 0.6, b.y - b.dir.y * 0.6, '#8a6ab0', 1, 1.5);
      break;
    case 'windSlam':
      if (b.timer <= 0) {
        for (const c of b.marks) {
          g.burst(c.x, c.y, '#ff6a4a', 10, 4);
          if (Math.hypot(g.player.x - c.x, g.player.y - c.y) < c.r) g.damagePlayer(b.dmg, c.x, c.y);
        }
        room.telegraphs = room.telegraphs.filter(t => !b.marks.includes(t));
        g.sfx.slam();
        g.shake(3, 0.3);
        b.state = 'recover';
        b.timer = 0.6;
      }
      break;
    case 'windVolley':
      if (b.timer <= 0) {
        const n = 10;
        const off = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          shoot(g, b.x + Math.cos(a) * 0.7, b.y + Math.sin(a) * 0.7, a, 4.2, 1);
        }
        b.state = 'recover';
        b.timer = 0.7;
      }
      break;
    default:
      if (b.timer <= 0) {
        b.state = 'chase';
        b.timer = (1.6 + Math.random()) * fast;
      }
  }
}

function startAttack(g, b, d, dx, dy, fast) {
  const room = g.room;
  const kind = pickAttack(b);
  fast *= g.windupScale();
  g.sfx.windup();
  if (kind === 'charge') {
    b.dir = { x: dx / d, y: dy / d };
    b.state = 'windCharge';
    b.timer = 0.8 * fast;
    room.telegraphs.push({ kind: 'line', x: b.x, y: b.y, dir: b.dir, len: wallDistance(g, b.x, b.y, b.dir), t: 0, dur: b.timer });
  } else if (kind === 'slam') {
    const p = g.player;
    const spots = [[0, 0]];
    if (b.phase2) spots.push([2, 0], [-2, 0], [0, 2], [0, -2]);
    b.marks = spots.map(([ox, oy]) => ({ kind: 'circle', x: p.x + ox, y: p.y + oy, r: 1.3, t: 0, dur: 1.0 * fast }));
    room.telegraphs.push(...b.marks);
    b.state = 'windSlam';
    b.timer = 1.0 * fast;
  } else {
    b.state = 'windVolley';
    b.timer = 0.6;
  }
}
