import './style.css';
import { fetchUniverse, buildDemoWorld, buildWorld } from './universe.js';
import { Game } from './game.js';
import { ACHIEVEMENTS, achievementTest } from './achieve.js';
import * as Sfx from './sfx.js';
import * as prog from './progress.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mctx = document.getElementById('minimap').getContext('2d');

const el = {
  boot: document.getElementById('boot'),
  bootMsg: document.getElementById('boot-msg'),
  bootActions: document.getElementById('boot-actions'),
  bootRetry: document.getElementById('boot-retry'),
  bootDemo: document.getElementById('boot-demo'),
  roomName: document.getElementById('room-name'),
  roomPath: document.getElementById('room-path'),
  crumb: document.getElementById('crumb'),
  stCol: document.getElementById('st-col'),
  stRooms: document.getElementById('st-rooms'),
  stIn: document.getElementById('st-inroom'),
  prompt: document.getElementById('prompt'),
  toast: document.getElementById('toast'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  hearts: document.getElementById('hearts'),
  xp: document.getElementById('xp'),
  bossbar: document.getElementById('bossbar'),
  bossName: document.getElementById('boss-name'),
  bossFill: document.getElementById('boss-fill'),
  death: document.getElementById('death'),
  deathRetry: document.getElementById('death-retry'),
  achCount: document.getElementById('ach-count'),
  btnInv: document.getElementById('btn-inv'),
  btnAch: document.getElementById('btn-ach'),
};

const hearts = [];
for (let i = 0; i < 5; i++) {
  const s = document.createElement('span');
  s.textContent = '♥';
  el.hearts.appendChild(s);
  hearts.push(s);
}

const keys = new Set();

const game = new Game(
  ctx,
  mctx,
  {
    onRoom: (node) => {
      updateHud(node);
      save();
      el.prompt.hidden = true;
    },
    onCollect: (note) => {
      save();
      openGrimoire(note);
      updateHud(game.room.node);
    },
    onLibrary: (node) => openLibrary(node),
    onRoutes: (node, extras) => openRoutes(node, extras),
    onLevelUp: (level) => {
      showToast(`niveau ${level} ! +1 ♥`);
    },
    onBossDefeat: (node) => {
      showToast('gardien vaincu — les parchemins sont libres');
    },
    onDeath: () => {
      el.death.hidden = false;
    },
    onBlocked: (msg) => showToast(msg),
  },
  Sfx,
);

function save() {
  prog.saveProgress({
    collected: [...game.collected],
    stack: [...game.stack],
    pos: { x: game.player.x, y: game.player.y },
    hp: game.player.hp,
    xp: game.player.xp,
    bosses: [...game.defeatedBosses],
    achievements: [...game.achieved],
    stats: { kills: game.stats.kills, deaths: game.stats.deaths },
  });
}

el.modalClose.addEventListener('click', closeModal);
el.deathRetry.addEventListener('click', () => {
  el.death.hidden = true;
  game.respawn();
});

window.addEventListener('beforeunload', save);

function updateHud(node) {
  el.roomName.textContent = node.name;
  el.roomPath.textContent = node.path || node.id || '';
  el.stCol.textContent = game.collected.size;
  el.stRooms.textContent = game.visited.size;
  el.stIn.textContent = game.room ? game.room.notes.length : 0;

  el.crumb.textContent = '';
  game.stack.forEach((key, i) => {
    const n = game.byPath.get(key);
    if (!n) return;
    const seg = document.createElement('span');
    seg.className = 'crumb-seg';
    seg.textContent = n.name;
    if (i === game.stack.length - 1) {
      seg.classList.add('crumb-cur');
    } else {
      seg.addEventListener('click', () => game.goTo(key));
    }
    el.crumb.appendChild(seg);
  });
}

function updateVitals() {
  const hp = Math.max(0, Math.min(hearts.length, game.player.hp));
  for (let i = 0; i < hearts.length; i++) {
    hearts[i].className = i < hp ? 'on' : 'off';
  }
  el.xp.textContent = `Lv ${game.player.level} · ${game.player.xp} XP`;
  const b = game.room && game.room.boss;
  if (b && !b.dead) {
    el.bossbar.hidden = false;
    el.bossName.textContent = b.name;
    el.bossFill.style.width = `${(Math.max(0, b.hp) / b.maxHp) * 100}%`;
  } else {
    el.bossbar.hidden = true;
  }
}

function openGrimoire(note) {
  const metaLines = [
    ['chemin', note.path || note.id || ''],
    ['taille', `${Math.max(1, Math.round((note.size || 0) / 1024))} ko`],
    ['liens', `${(note.links || []).length}`],
    ['profondeur', `${note.depth}`],
  ];

  el.modalTitle.textContent = 'Grimoire — parchemin';
  const root = document.createElement('div');
  root.className = 'grimoire';

  const name = document.createElement('div');
  name.className = 'g-name';
  name.textContent = note.name;
  root.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'g-meta';
  for (const [k, v] of metaLines) {
    const row = document.createElement('div');
    row.className = 'g-row';
    const kk = document.createElement('span');
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.textContent = v;
    row.append(kk, vv);
    meta.appendChild(row);
  }
  root.appendChild(meta);

  const hint = document.createElement('div');
  hint.className = 'g-hint';
  hint.textContent = 'une mémoire gagnée sur le donjon.';
  root.appendChild(hint);

  const open = document.createElement('button');
  open.className = 'btn btn-gold';
  open.textContent = 'ouvrir dans Obsidian';
  open.addEventListener('click', () => openInObsidian(note.path));
  root.appendChild(open);

  el.modalBody.replaceChildren(root);
  el.modal.hidden = false;
  Sfx.sfx.open();
}

function openLibrary(node) {
  const lib = game.room && game.room.library;
  const notes = (lib && lib.notes) || [];
  el.modalTitle.textContent = 'Bibliothèque — mémoires en rafale';
  const root = document.createElement('div');
  root.className = 'list';

  const info = document.createElement('div');
  info.className = 'list-info';
  info.textContent = `${notes.length} parchemin(s) empilé(s) dans cette pièce.`;
  root.appendChild(info);

  const list = document.createElement('div');
  list.className = 'list-rows';
  const rows = notes.map(note => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const nm = document.createElement('span');
    nm.textContent = note.name;
    const sub = document.createElement('span');
    sub.className = 'list-sub';
    sub.textContent = note.path || '';
    const go = document.createElement('button');
    go.className = 'btn btn-mini';
    go.textContent = 'ouvrir';
    go.addEventListener('click', () => openGrimoire(note));
    row.append(nm, sub, go);
    return row;
  });
  if (rows.length) list.append(...rows);
  else root.appendChild(document.createTextNode('aucune mémoire à lire.'));
  root.appendChild(list);

  el.modalBody.replaceChildren(root);
  el.modal.hidden = false;
}

function openRoutes(node, extras) {
  el.modalTitle.textContent = 'Routes — portes lointaines';
  const root = document.createElement('div');
  root.className = 'list';

  const info = document.createElement('div');
  info.className = 'list-info';
  info.textContent = 'des couloirs trop nombreux pour le donjon : emprunte l’une de ces routes.';
  root.appendChild(info);

  const list = document.createElement('div');
  list.className = 'list-rows';
  const rows = extras.map(child => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const nm = document.createElement('span');
    nm.textContent = child.name;
    const sub = document.createElement('span');
    sub.className = 'list-sub';
    sub.textContent = child.path || '';
    const go = document.createElement('button');
    go.className = 'btn btn-mini';
    go.textContent = 'voyager';
    go.addEventListener('click', () => {
      closeModal();
      Sfx.sfx.door();
      game.goTo(child._key);
    });
    row.append(nm, sub, go);
    return row;
  });
  list.append(...rows);
  root.appendChild(list);

  el.modalBody.replaceChildren(root);
  el.modal.hidden = false;
}

function openInObsidian(path) {
  if (!path) return;
  const uri = `obsidian://open?path=${encodeURIComponent(path)}`;
  try {
    window.location.href = uri;
  } catch (e) {
    showToast('impossible d’ouvrir Obsidian');
  }
}

function openInventory() {
  const nodes = [...game.collected]
    .map(p => game.byPath.get(p))
    .filter(Boolean)
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  el.modalTitle.textContent = `Inventaire — ${nodes.length} mémoire(s)`;
  const root = document.createElement('div');
  root.className = 'list';

  const info = document.createElement('div');
  info.className = 'list-info';
  info.textContent =
    nodes.length
      ? 'relis une mémoire pour la rouvrir dans Obsidian.'
      : 'aucune mémoire trouvée — explore le donjon et lis les parchemins.';
  root.appendChild(info);

  const list = document.createElement('div');
  list.className = 'list-rows';
  for (const note of nodes) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const nm = document.createElement('span');
    nm.textContent = note.name;
    const sub = document.createElement('span');
    sub.className = 'list-sub';
    sub.textContent = note.path || '';
    const relire = document.createElement('button');
    relire.className = 'btn btn-mini';
    relire.textContent = 'relire';
    relire.addEventListener('click', () => openGrimoire(note));
    const ouvrir = document.createElement('button');
    ouvrir.className = 'btn btn-mini';
    ouvrir.textContent = 'obsidian';
    ouvrir.addEventListener('click', () => openInObsidian(note.path));
    row.append(nm, sub, relire, ouvrir);
    list.appendChild(row);
  }
  if (!nodes.length) root.appendChild(document.createTextNode(''));
  root.appendChild(list);

  el.modalBody.replaceChildren(root);
  el.modal.hidden = false;
  Sfx.sfx.open();
}

function openSucces() {
  const unlocked = game.achieved.size;
  el.modalTitle.textContent = `Succès — ${unlocked}/${ACHIEVEMENTS.length}`;
  const root = document.createElement('div');
  root.className = 'list';

  const info = document.createElement('div');
  info.className = 'list-info';
  info.textContent = `${unlocked} exploit(s) gravé(s) dans la pierre du donjon.`;
  root.appendChild(info);

  const grid = document.createElement('div');
  grid.className = 'ach-grid';
  for (const a of ACHIEVEMENTS) {
    const got = game.achieved.has(a.id);
    const cell = document.createElement('div');
    cell.className = got ? 'ach-cell on' : 'ach-cell';
    const ic = document.createElement('div');
    ic.className = 'ach-icon';
    ic.textContent = got ? a.icon : '?';
    const nm = document.createElement('div');
    nm.className = 'ach-name';
    nm.textContent = got ? a.name : 'succès inconnu';
    const de = document.createElement('div');
    de.className = 'ach-desc';
    de.textContent = got ? a.desc : 'accomplis encore des exploits…';
    cell.append(ic, nm, de);
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  el.modalBody.replaceChildren(root);
  el.modal.hidden = false;
  Sfx.sfx.open();
}

function checkAchievements() {
  const s = {
    notes: game.collected.size,
    rooms: game.visited.size,
    level: game.player.level,
    bosses: game.defeatedBosses.size,
    kills: game.stats.kills,
    deaths: game.stats.deaths,
    revealed: game.isRoomFullyRevealed(),
  };
  for (const a of ACHIEVEMENTS) {
    if (game.achieved.has(a.id)) continue;
    if (achievementTest(a.id, s)) {
      game.achieved.add(a.id);
      save();
      showToast(`★ succès débloqué : ${a.name}`);
      Sfx.sfx.levelUp();
    }
  }
  const n = `${game.achieved.size}/${ACHIEVEMENTS.length}`;
  if (el.achCount.textContent !== n) el.achCount.textContent = n;
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.toast.hidden = true;
  }, 1800);
}

function closeModal() {
  if (el.modal.hidden) return;
  el.modal.hidden = true;
  Sfx.sfx.close();
}

function refreshPrompt() {
  const it = game.prompt;
  if (!it || el.modal.hidden === false) {
    el.prompt.hidden = true;
    return;
  }
  el.prompt.hidden = false;
  el.prompt.textContent = it.label;
  const s = game.screenOf(it.x + 0.5, it.y + 0.5);
  el.prompt.style.left = `${(s.x / 320) * 100}%`;
  el.prompt.style.top = `${(s.y / 192) * 100}%`;
}

function updateMute() {
  const muted = Sfx.isMuted();
  document.getElementById('controls').classList.toggle('muted', muted);
  showToast(muted ? 'son coupé' : 'son activé');
}

canvas.addEventListener('pointerdown', () => {
  Sfx.ensureContext();
  game.interact();
});

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  Sfx.ensureContext();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  keys.add(e.code);

  if (e.code === 'KeyE' || e.code === 'Enter') {
    if (el.modal.hidden === false) dismissOrDefault();
    else game.interact();
  }
  if (e.code === 'Space' || e.code === 'KeyJ') {
    if (el.modal.hidden === false) dismissOrDefault();
    else game.attack();
  }
  if (e.code === 'Tab') {
    if (el.modal.hidden === false) closeModal();
    else if (game.room && game.room.sign) {
      Sfx.sfx.open();
      openRoutes(game.room.node, game.room.sign.extras);
    } else {
      Sfx.sfx.error();
      showToast('aucune route à l’horizon');
    }
  }
  if (e.code === 'KeyM') {
    Sfx.setMuted(!Sfx.isMuted());
    updateMute();
  }
  if (e.code === 'KeyI') {
    if (el.modal.hidden === false) closeModal();
    openInventory();
  }
  if (e.code === 'KeyK') {
    if (el.modal.hidden === false) closeModal();
    openSucces();
  }
  if (e.code === 'Escape' && el.modal.hidden === false) closeModal();
});

function dismissOrDefault() {
  const btn = el.modalBody.querySelector('.btn-gold');
  if (btn) btn.click();
  else closeModal();
}

window.addEventListener('keyup', e => keys.delete(e.code));

async function boot(kind = 'real') {
  if (boot._busy) return;
  boot._busy = true;
  el.boot.hidden = false;
  el.bootMsg.textContent = 'ouverture du donjon…';
  el.bootActions.hidden = true;
  try {
    const data = kind === 'demo' ? buildDemoWorld() : await fetchUniverse();
    const world = buildWorld(data);
    game.setWorld(world);
    const p = prog.loadProgress();
    if (p && kind !== 'demo') game.restore(p);
    else game.goTo(world.root._key);
    el.boot.hidden = true;
    if (kind === 'demo') showToast('mode démo — données fictives');
  } catch (err) {
    console.error(err);
    el.bootMsg.textContent =
      'donjon verrouillé — API inaccessible.\nLance obsidian-back (./mvnw spring-boot:run), puis réessaie.';
    el.bootActions.hidden = false;
  } finally {
    boot._busy = false;
  }
}

el.bootRetry.addEventListener('click', () => boot('real'));
el.bootDemo.addEventListener('click', () => boot('demo'));
el.btnInv.addEventListener('click', () => {
  el.modal.hidden === false ? closeModal() : openInventory();
});
el.btnAch.addEventListener('click', () => {
  el.modal.hidden === false ? closeModal() : openSucces();
});

window.__obsidianQuest = { game };

let prev = performance.now();
let frame = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  frame++;

  game.tick(keys, dt);
  game.render();
  refreshPrompt();
  updateVitals();
  checkAchievements();

  if (frame % 60 === 0) save();

  requestAnimationFrame(loop);
}

boot();
requestAnimationFrame(loop);