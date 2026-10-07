import { TILE, VIEW_W, VIEW_H, FACING } from './game.js';
import { hashStr } from './universe.js';
import { makePlayerFrames } from './sprites.js';

export class Renderer {
  constructor(ctx, mctx) {
    this.ctx = ctx;
    this.mctx = mctx;
    this.frames = makePlayerFrames();
    this.mmBuf = null;
  }

  // `cleared` : clés des dossiers entièrement collectés (pastille sur les portes).
  render(game, cleared) {
    const ctx = this.ctx;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, VIEW_W * TILE, VIEW_H * TILE);
    const room = game.room;
    if (!room) return;

    const fx = game.fx;
    ctx.save();
    if (fx.shakeT > 0) {
      const a = fx.shakeAmp * (fx.shakeT / fx.shakeDur);
      ctx.translate(Math.round((Math.random() * 2 - 1) * a), Math.round((Math.random() * 2 - 1) * a));
    }
    this.renderTiles(game);

    const t = game.time;
    const at = (x, y) => game.screenOf(x, y);
    const seen = (x, y) => game.isVisible(x + 0.5, y + 0.5);

    for (const pt of room.portals) {
      if (!seen(pt.x, pt.y)) continue;
      const s = at(pt.x, pt.y);
      ctx.drawImage(pt.kind === 'back' ? room.spr.gateBack : room.spr.gate, s.x, s.y);
      const wave = Math.sin(t * 4 + pt.x * 3) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.4 * wave})`;
      ctx.fillRect(s.x + 2, s.y + 2 + ((wave * 4) | 0), 4, 1);
      if (pt.kind === 'back') {
        ctx.drawImage(room.spr.upArrow, s.x, pt.front.y < pt.y ? s.y - 8 : s.y + 8);
      } else if (cleared && cleared.has(pt.key)) {
        ctx.fillStyle = '#7dff6a';
        ctx.fillRect(s.x + 3, s.y - 3, 2, 2);
      }
    }

    for (const note of room.notes) {
      if (!seen(note.x, note.y)) continue;
      const s = at(note.x, note.y);
      const collected = game.collected.has(note.node.path);
      const daily = game.isDailyTarget(note.node);
      if (!collected || daily) s.y += Math.round(Math.sin(t * 2.6 + note.seed));
      if (daily) {
        // Note du jour : halo cyan qui tourne, même si elle est déjà collectée.
        for (let i = 0; i < 4; i++) {
          const a = t * 3 + (i * Math.PI) / 2;
          ctx.fillStyle = '#4affd8';
          ctx.fillRect(Math.round(s.x + 4 + Math.cos(a) * 7), Math.round(s.y + 4 + Math.sin(a) * 7), 1, 1);
        }
      }
      if (collected && !daily) {
        ctx.globalAlpha = 0.25;
      } else if (game.noteGuarded(note)) {
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = 'rgba(90,30,140,0.5)';
        ctx.fillRect(s.x - 1, s.y - 1, 10, 10);
        const pulse = Math.sin(t * 3 + note.seed) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,70,120,${0.25 + 0.5 * pulse})`;
        ctx.fillRect(s.x + 1, s.y + 1, 6, 6);
      }
      if (!collected && game.quest === note.node) {
        const pulse = Math.sin(t * 6) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(74,255,216,${0.4 + 0.6 * pulse})`;
        ctx.strokeRect(s.x - 1.5, s.y - 1.5, 11, 11);
      }
      ctx.drawImage(room.spr.notes[note.node._rarity] || room.spr.note, s.x, s.y);
      ctx.globalAlpha = 1;
      if (!collected) {
        const k = (t * 5 + note.seed) % 6;
        ctx.fillStyle = k < 2 ? '#ffffff' : '#ffe08a';
        ctx.fillRect(s.x + 2 + ((k * 3) % 4), s.y + 4, 1, 1);
      }
    }

    if (room.library && seen(room.library.x, room.library.y)) {
      const s = at(room.library.x, room.library.y);
      ctx.drawImage(room.spr.library, s.x, s.y);
    }
    if (room.sign && seen(room.sign.x, room.sign.y)) {
      const s = at(room.sign.x, room.sign.y);
      ctx.drawImage(room.spr.sign, s.x, s.y);
    }
    for (const c of room.chests) {
      if (!seen(c.x, c.y)) continue;
      const s = at(c.x, c.y);
      ctx.drawImage(room.spr.chest, s.x, s.y);
      if (Math.floor(t * 3 + c.x) % 4 === 0) {
        ctx.fillStyle = '#fff4c0';
        ctx.fillRect(s.x + 1 + ((t * 7) % 6 | 0), s.y + 2, 1, 1);
      }
    }
    const echo = game.echo;
    if (echo && echo.sk === `${game.mode}:${room.node._key}` && game.isVisible(echo.x, echo.y)) {
      const s = at(echo.x, echo.y);
      const pulse = Math.sin(t * 4) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(199,123,255,${0.15 + 0.2 * pulse})`;
      ctx.fillRect(s.x - 5, s.y - 5, 10, 10);
      ctx.fillStyle = `rgba(220,168,255,${0.6 + 0.4 * pulse})`;
      ctx.fillRect(s.x - 2, s.y - 3 + Math.round(Math.sin(t * 2) * 1.5), 4, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - 1, s.y - 2 + Math.round(Math.sin(t * 2) * 1.5), 1, 1);
    }
    if (room.key && seen(room.key.x, room.key.y)) {
      const s = at(room.key.x, room.key.y);
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      ctx.fillStyle = `rgba(255,210,63,${0.15 + 0.15 * Math.sin(t * 5)})`;
      ctx.fillRect(s.x - 1, s.y - 1 + bob, 10, 10);
      ctx.drawImage(room.spr.key, s.x, s.y + bob);
    }

    for (const pk of room.pickups) {
      if (!game.isVisible(pk.x, pk.y)) continue;
      if (pk.t > 16 && Math.floor(t * 8) % 2) continue;
      const s = at(pk.x, pk.y);
      ctx.drawImage(room.spr.heart, s.x - 4, s.y - 4 + Math.round(Math.sin(t * 5)));
    }

    this.renderTelegraphs(game);

    for (const m of room.monsters) {
      if (m.dying || !game.isVisible(m.x, m.y)) continue;
      this.renderMonster(game, m);
    }

    const b = room.boss;
    if (b && game.isVisible(b.x, b.y)) {
      const bob = b.dead ? 0 : Math.round(Math.sin(t * 2.2 + b.seed));
      const s = at(b.x, b.y);
      const tremble = b.state === 'windCharge' || b.state === 'windVolley' ? Math.round(Math.sin(t * 60)) : 0;
      ctx.globalAlpha = b.dead ? 0.35 : 1;
      ctx.drawImage(b.flash ? room.spr.bossWhite : room.spr.boss, s.x - 8 + tremble, s.y - 9 + bob);
      ctx.globalAlpha = 1;
      if (b.state === 'stun') this.renderStars(game, s.x, s.y - 12);
      if (b.state === 'windCharge' || b.state === 'windSlam' || b.state === 'windVolley') this.renderAlert(game, s.x, s.y - 14);
      if (!b.dead) {
        const flash = Math.sin(t * 7) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,106,74,${0.2 + 0.4 * flash})`;
        ctx.fillRect(s.x - 8, s.y - 9 + bob, 16, 2);
        ctx.fillRect(s.x - 8, s.y + 5 + bob, 16, 2);
      }
    }

    this.renderParticles(game);
    this.renderOrbs(game);
    this.renderProjectiles(game);
    this.renderGhosts(game);
    this.renderPlayer(game);
    this.renderSparks(game);
    this.renderFloaters(game);
    this.renderQuestArrow(game);
    ctx.restore();
    this.renderMinimap(game);
  }

  renderTiles(game) {
    const ctx = this.ctx;
    const room = game.room;
    const { spr, W, H, walls, explored, visible, bossZone, safe } = room;
    const seedBase = hashStr(room.node.path || room.node.name || room.node.id);
    const guarded = room.boss && !room.boss.dead && bossZone;

    const doors = new Set(room.doors.map(d => d.y * W + d.x));
    const cracks = new Set(room.cracks.map(c => c.y * W + c.x));
    const busy = new Set();
    for (const it of room.notes) busy.add(it.y * W + it.x);
    for (const it of room.portals) busy.add(it.y * W + it.x);
    if (room.library) busy.add(room.library.y * W + room.library.x);
    if (room.sign) busy.add(room.sign.y * W + room.sign.x);

    const cam = game.cam;
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W * TILE) / TILE));
    const y1 = Math.min(H - 1, Math.floor((cam.y + VIEW_H * TILE) / TILE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const idx = ty * W + tx;
        if (!explored[idx]) continue;
        const px = tx * TILE - cam.x;
        const py = ty * TILE - cam.y;
        if (doors.has(idx)) {
          ctx.drawImage(spr.door, px, py);
        } else if (walls[idx]) {
          ctx.drawImage(spr.wall, px, py);
          if (cracks.has(idx)) {
            // Fissure discrète : un indice pour l'œil attentif, pas une flèche.
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(px + 3, py + 1, 1, 2);
            ctx.fillRect(px + 4, py + 3, 1, 2);
            ctx.fillRect(px + 3, py + 5, 1, 2);
            ctx.fillRect(px + 5, py + 4, 1, 1);
          }
        } else {
          ctx.drawImage(spr.floors[(tx + ty + (seedBase % 3)) % 3], px, py);
          if ((tx + ty) % 5 !== 1 && !busy.has(idx)) {
            const dc = hashStr(`${seedBase}:${tx}:${ty}`) % 1000;
            if (dc < 220) ctx.drawImage(spr.decor[dc % spr.decor.length], px, py);
          }
          if (safe && tx >= safe.x1 && tx <= safe.x2 && ty >= safe.y1 && ty <= safe.y2) {
            ctx.fillStyle = 'rgba(255,220,140,0.07)';
            ctx.fillRect(px, py, TILE, TILE);
            const edge = tx === safe.x1 || tx === safe.x2 || ty === safe.y1 || ty === safe.y2;
            if (edge && (tx + ty) % 2 === 0) {
              ctx.fillStyle = `rgba(255,224,138,${0.25 + 0.2 * Math.sin(game.time * 2 + tx + ty)})`;
              ctx.fillRect(px + 3, py + 3, 2, 2);
            }
          }
          if (guarded && tx >= bossZone.x1 && tx <= bossZone.x2 && ty >= bossZone.y1 && ty <= bossZone.y2) {
            ctx.fillStyle = 'rgba(120,30,150,0.22)';
            ctx.fillRect(px, py, TILE, TILE);
          }
        }
        if (!visible[idx]) {
          ctx.fillStyle = 'rgba(4,5,10,0.62)';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  renderMonster(game, m) {
    const ctx = this.ctx;
    const set = game.room.spr.mon[m.kind] || game.room.spr.mon.slime;
    const img = m.flash ? set.white : m.elite ? set.elite : set.base;
    const t = game.time;
    const s = game.screenOf(m.x, m.y);
    let bob = Math.round(Math.sin(t * 4 + m.seed));
    let shiver = 0;
    if (m.state === 'windup' || m.state === 'aim') shiver = Math.round(Math.sin(t * 50));
    if (m.state === 'dash' || m.state === 'stun') bob = 0;
    const flip = m.kind === 'charger' && m.dir && m.state ? m.dir.x < 0 : game.player.x < m.x;
    const size = m.mini ? 6 : 8;

    ctx.save();
    ctx.translate(s.x + shiver, s.y);
    if ((m.kind === 'wisp' || m.kind === 'charger' || m.kind === 'archer') && flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2 - 1 + (m.kind === 'wisp' ? Math.round(bob * 1.5) : bob), size, size);
    ctx.restore();

    if (m.kind === 'knight' && m.face !== undefined) {
      // Bouclier : petit pavé doré devant le chevalier, dans la direction où il regarde.
      const fx = Math.cos(m.face);
      const fy = Math.sin(m.face);
      for (let k = -2; k <= 2; k++) {
        ctx.fillStyle = k === 0 ? '#ffe08a' : '#c8a040';
        ctx.fillRect(Math.round(s.x + fx * 5 - fy * k), Math.round(s.y + fy * 5 + fx * k), 1, 1);
      }
    }
    if (m.state === 'aim') {
      const p = game.screenOf(game.player.x, game.player.y);
      ctx.strokeStyle = `rgba(255,74,138,${0.25 + 0.3 * Math.sin(t * 30)})`;
      ctx.beginPath();
      ctx.moveTo(s.x + 0.5, s.y + 0.5);
      ctx.lineTo(p.x + 0.5, p.y + 0.5);
      ctx.stroke();
    }
    if (m.state === 'windup') this.renderAlert(game, s.x, s.y - 9);
    if (m.state === 'stun') this.renderStars(game, s.x, s.y - 8);

    if (m.hp < m.maxHp || m.kick) {
      ctx.fillStyle = '#191b2c';
      ctx.fillRect(s.x - 5, s.y - 9, 10, 2);
      ctx.fillStyle = m.elite ? '#ff3a8a' : '#ff6a4a';
      ctx.fillRect(s.x - 4, s.y - 8, Math.max(0, (m.hp / m.maxHp) * 8), 1);
    }
  }

  renderAlert(game, x, y) {
    if (Math.floor(game.time * 12) % 2) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#ff4a4a';
    ctx.fillRect(x - 1, y - 4, 2, 4);
    ctx.fillRect(x - 1, y + 1, 2, 1);
  }

  renderStars(game, x, y) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const a = game.time * 6 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = i % 2 ? '#ffd23f' : '#ffffff';
      ctx.fillRect(Math.round(x + Math.cos(a) * 4), Math.round(y + Math.sin(a) * 1.5), 1, 1);
    }
  }

  renderTelegraphs(game) {
    const ctx = this.ctx;
    for (const tg of game.room.telegraphs) {
      const k = Math.min(1, tg.t / tg.dur);
      const s = game.screenOf(tg.x, tg.y);
      // Zone sombre + remplissage rouge qui progresse jusqu'à l'impact, contour qui clignote à la fin.
      const blink = k > 0.75 && Math.floor(game.time * 16) % 2 === 0;
      if (tg.kind === 'circle') {
        const r = tg.r * TILE;
        ctx.fillStyle = 'rgba(20,0,8,0.35)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,50,50,${0.25 + 0.35 * k})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = blink ? '#ffffff' : '#ff3a3a';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(Math.atan2(tg.dir.y, tg.dir.x));
        const L = tg.len * TILE;
        ctx.fillStyle = 'rgba(20,0,8,0.35)';
        ctx.fillRect(0, -5, L, 10);
        ctx.fillStyle = `rgba(255,50,50,${0.25 + 0.35 * k})`;
        ctx.fillRect(0, -5, L * k, 10);
        ctx.fillStyle = blink ? '#ffffff' : '#ff3a3a';
        ctx.fillRect(0, -6, L, 1);
        ctx.fillRect(0, 5, L, 1);
        // chevrons qui défilent dans le sens de la charge
        ctx.fillStyle = 'rgba(255,220,220,0.7)';
        for (let x = (game.time * 40) % 8; x < L - 3; x += 8) {
          ctx.fillRect(Math.round(x), -2, 1, 1);
          ctx.fillRect(Math.round(x) + 1, -1, 1, 2);
          ctx.fillRect(Math.round(x), 1, 1, 1);
        }
        ctx.restore();
      }
    }
  }

  renderProjectiles(game) {
    const ctx = this.ctx;
    const spr = game.room.spr;
    for (const p of game.room.projectiles) {
      const s = game.screenOf(p.x, p.y);
      const img = p.owner === 'enemy' ? spr.shot : spr.shotReflected;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, Math.round(s.x - 2 - p.vx * 0.6), Math.round(s.y - 2 - p.vy * 0.6));
      ctx.globalAlpha = 1;
      ctx.drawImage(img, s.x - 2, s.y - 2);
    }
  }

  renderGhosts(game) {
    const ctx = this.ctx;
    for (const gh of game.fx.ghosts) {
      const c = game.screenOf(gh.x, gh.y);
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - gh.t / 0.25);
      if (gh.facing === 2) {
        ctx.translate(c.x, 0);
        ctx.scale(-1, 1);
        ctx.translate(-c.x, 0);
      }
      ctx.drawImage(this.ghostFrame || (this.ghostFrame = this.makeGhost()), c.x - 6, c.y - 6);
      ctx.restore();
    }
  }

  makeGhost() {
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 12;
    const g = c.getContext('2d');
    g.drawImage(this.frames[0], 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#9fe0ff';
    g.fillRect(0, 0, 12, 12);
    return c;
  }

  renderParticles(game) {
    const ctx = this.ctx;
    const room = game.room;
    for (const p of room.particles) {
      if (!game.isVisible(p.x, p.y)) continue;
      const s = game.screenOf(p.x, p.y);
      const pulse = Math.sin(game.time * p.speed + p.seed) * 0.5 + 0.5;
      ctx.globalAlpha = 0.25 + 0.5 * pulse;
      ctx.drawImage(room.spr.wisp, s.x - 4, s.y - 4);
      ctx.globalAlpha = 1;
    }
  }

  renderPlayer(game) {
    const ctx = this.ctx;
    const p = game.player;
    const c = game.screenOf(p.x, p.y);
    const px = c.x - 6;
    const py = c.y - 6;
    const frame = game.walking ? Math.floor(game.walkT * 10) % 2 : 0;
    const bob = game.walking ? Math.round(Math.sin(game.walkT * 16)) : 0;
    const blink = p.invuln > 0 && Math.floor(game.time * 14) % 2 === 0;

    ctx.save();
    if (p.facing === 2) {
      ctx.translate(px + 6, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(px + 6), 0);
    }
    if (blink) ctx.globalAlpha = 0.45;
    ctx.drawImage(this.frames[frame], px, py + bob);
    ctx.restore();

    if (game.attackT > 0) {
      // Arc balayé de -70° à +70° autour de la direction, avec traînée.
      const dir = FACING[p.facing];
      const base = Math.atan2(dir.y, dir.x);
      const k = 1 - game.attackT / 0.22;
      const head = -1.22 + 2.44 * Math.min(1, k * 1.4);
      for (let i = 0; i < 9; i++) {
        const a = head - i * 0.16;
        if (a < -1.22) break;
        const fade = 1 - i / 9;
        for (const r of [8, 10, 12]) {
          ctx.fillStyle = r === 12 ? `rgba(159,224,255,${0.7 * fade})` : `rgba(255,255,255,${0.9 * fade})`;
          ctx.fillRect(Math.round(c.x + Math.cos(base + a) * r), Math.round(c.y + 1 + Math.sin(base + a) * r), 1, 1);
        }
      }
    }
  }

  renderOrbs(game) {
    const ctx = this.ctx;
    for (const o of game.room.orbs) {
      const s = game.screenOf(o.x, o.y);
      const glow = Math.sin(game.time * 10 + o.seed) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(125,255,106,${0.25 + 0.25 * glow})`;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      ctx.fillStyle = '#d8ffb0';
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
  }

  renderSparks(game) {
    const ctx = this.ctx;
    for (const p of game.fx.sparks) {
      const s = game.screenOf(p.x, p.y);
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      const size = p.t < p.life * 0.4 ? 2 : 1;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  renderFloaters(game) {
    const ctx = this.ctx;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const f of game.fx.floaters) {
      const k = f.t / f.life;
      const s = game.screenOf(f.x, f.y);
      const y = Math.round(s.y - 10 * Math.sqrt(k));
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, s.x + 1, y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, y);
    }
    ctx.globalAlpha = 1;
  }

  renderQuestArrow(game) {
    const d = game.questDir;
    if (!d) return;
    const ctx = this.ctx;
    const c = game.screenOf(game.player.x, game.player.y);
    const pulse = Math.sin(game.time * 6) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(74,255,216,${0.55 + 0.45 * pulse})`;
    for (let k = 0; k < 3; k++) {
      const r = 10 + k * 2;
      const size = 3 - k;
      ctx.fillRect(Math.round(c.x + d.x * r - size / 2), Math.round(c.y + d.y * r - size / 2), size, size);
    }
  }

  renderMinimap(game) {
    const room = game.room;
    const { W, H, walls, explored, visible } = room;
    const canvas = this.mctx.canvas;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      this.mmBuf = null;
    }
    const buf = this.mmBuf || (this.mmBuf = this.mctx.createImageData(W, H));
    const d = buf.data;
    const put = (x, y, r, g, b) => {
      const i = (y * W + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    };
    for (let i = 0; i < W * H; i++) {
      const x = i % W;
      const y = (i / W) | 0;
      if (!explored[i]) {
        put(x, y, 3, 4, 8);
        continue;
      }
      let [r, g, b] = walls[i] ? [90, 96, 104] : [46, 70, 42];
      if (!visible[i]) {
        r = Math.round(r * 0.45);
        g = Math.round(g * 0.45);
        b = Math.round(b * 0.45);
      }
      put(x, y, r, g, b);
    }
    const known = (x, y) => explored[y * W + x];
    // Reliques de cartographie : révèlent parchemins, coffres et fissures même inexplorés.
    if (game.relic('compass')) for (const n of room.notes) if (!game.collected.has(n.node.path)) put(n.x, n.y, 255, 224, 138);
    if (game.relic('cartog')) {
      for (const c of room.chests) put(c.x, c.y, 255, 170, 60);
      for (const c of room.cracks) put(c.x, c.y, 159, 224, 255);
    }
    for (const n of room.notes) if (game.isDailyTarget(n.node) && known(n.x, n.y)) put(n.x, n.y, 74, 255, 216);
    if (game.echo && game.echo.sk === `${game.mode}:${room.node._key}`) put(Math.floor(game.echo.x), Math.floor(game.echo.y), 199, 123, 255);
    for (const pt of room.portals) if (known(pt.x, pt.y)) put(pt.x, pt.y, 255, 210, 63);
    for (const n of room.notes) {
      if (!game.collected.has(n.node.path) && known(n.x, n.y)) put(n.x, n.y, 255, 224, 138);
    }
    if (room.library && known(room.library.x, room.library.y)) put(room.library.x, room.library.y, 180, 120, 60);
    if (room.sign && known(room.sign.x, room.sign.y)) put(room.sign.x, room.sign.y, 220, 200, 140);
    for (const d of room.doors) if (known(d.x, d.y)) put(d.x, d.y, 200, 90, 40);
    for (const c of room.chests) if (known(c.x, c.y)) put(c.x, c.y, 255, 170, 60);
    if (room.key && known(room.key.x, room.key.y)) put(room.key.x, room.key.y, 255, 240, 120);
    const b = room.boss;
    if (b && !b.dead && game.isVisible(b.x, b.y)) put(Math.floor(b.x), Math.floor(b.y), 255, 60, 80);
    const wp = room.questWp;
    if (wp && Math.floor(game.time * 3) % 2) put(wp.x, wp.y, 74, 160, 255);
    put(Math.floor(game.player.x), Math.floor(game.player.y), 74, 255, 216);
    this.mctx.putImageData(buf, 0, 0);
  }
}
