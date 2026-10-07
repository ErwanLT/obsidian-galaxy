import './style.css';
import { fetchUniverse, buildDemoWorld, buildWorld, RARITY } from './universe.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { CLASSIC, DUNGEON } from './worldgen.js';
import { ACHIEVEMENTS } from './achieve.js';
import { PERK_BY_ID, rollPerks, perkTotal } from './perks.js';
import { RELICS } from './relics.js';
import { nextHint } from './hints.js';
import { folderProgress, pct, searchNotes, xpForLevel } from './nav.js';
import { h, button, row, list, Modal } from './ui.js';
import { setupTouch } from './touch.js';
import * as Sfx from './sfx.js';
import * as Music from './music.js';
import * as prog from './progress.js';

const $ = id => document.getElementById(id);
const canvas = $('game');

const el = {
  boot: $('boot'),
  bootMsg: $('boot-msg'),
  bootActions: $('boot-actions'),
  roomName: $('room-name'),
  roomPath: $('room-path'),
  quest: $('quest'),
  crumb: $('crumb'),
  stCol: $('st-col'),
  stRooms: $('st-rooms'),
  stIn: $('st-inroom'),
  prompt: $('prompt'),
  toast: $('toast'),
  hearts: $('hearts'),
  xp: $('xp'),
  bossbar: $('bossbar'),
  bossName: $('boss-name'),
  bossFill: $('boss-fill'),
  death: $('death'),
  deathMsg: $('death-msg'),
  deathRetry: $('death-retry'),
  achCount: $('ach-count'),
  modeLabel: $('mode-label'),
  controls: $('controls'),
  hint: $('hint'),
};

const keys = new Set();
const renderer = new Renderer(canvas.getContext('2d'), $('minimap').getContext('2d'));
let store = null;
let progress = { total: new Map(), direct: new Map() };
let cleared = new Set();
let grimoireNote = null;
let libraryNotes = null;

const MUSIC_KEY = 'obsidian-quest:music';
try {
  Music.setEnabled(localStorage.getItem(MUSIC_KEY) !== 'off');
} catch {
  // préférence indisponible : musique activée par défaut
}

const modal = new Modal(
  { root: $('modal'), title: $('modal-title'), body: $('modal-body'), close: $('modal-close') },
  {
    onOpen: () => keys.clear(),
    onClose: () => {
      grimoireNote = null;
      Sfx.sfx.close();
      canvas.focus({ preventScroll: true });
    },
  },
);

const game = new Game(
  {
    onRoom: () => {
      el.prompt.hidden = true;
      Music.play(game.room.theme.name);
      save();
    },
    // Ramasser ne coupe plus l'action : un message, et le Grimoire reste dans l'inventaire.
    onCollect: (note, fresh) => {
      if (modal.isOpen && modal.kind === 'library') openLibrary(libraryNotes);
      else if (!fresh) openGrimoire(note);
      if (fresh) {
        const rare = note._rarity !== 'commune' ? ` — ${RARITY[note._rarity].label} !` : '';
        showToast(`✦ ${note.name}${rare}  ·  I pour relire`);
      }
    },
    onLibrary: notes => openLibrary(notes),
    onRoutes: extras => openRoutes(extras),
    onLevelUp: (level, gain) => showToast(gain > 0 ? `niveau ${level} ! +${gain} ♥ max` : `niveau ${level} !`),
    onBossDefeat: () => showToast('gardien vaincu — les parchemins sont libres'),
    onQuestDone: note => showToast(`quête accomplie : ${note.name}`),
    onDeath: (node, lost) => {
      keys.clear();
      const where = game.mode === DUNGEON ? 'le donjon t’a ramené à l’entrée de l’étage.' : 'le donjon t’a ramené aux portes de la salle.';
      el.deathMsg.textContent = lost > 0 ? `${where}\ntu as laissé un écho de ${lost} XP là où tu es tombé : va le reprendre.` : where;
      el.death.hidden = false;
      el.deathRetry.focus();
    },
    onBlocked: msg => showToast(msg),
    onKey: () => showToast('⚷ clé de la voûte — trouve la porte scellée'),
    onRelic: (relic, count) => showToast(`${relic.icon} relique ${count > 1 ? 'renforcée' : 'obtenue'} : ${relic.name} — ${relic.desc}`),
    onSeal: (folder, n) => showToast(`✓ dossier « ${folder.name} » complété — sceau ${n} (+${Math.round(game.sealXpBonus() * 100)} % XP, +${game.sealHearts()} ♥)`),
    onDailyDone: () => showToast('★ notes du jour terminées — un don et des orbes en récompense !'),
    onChest: (loot, secret) => showToast(`${secret ? '▣ coffre caché' : '▣ coffre'} : ${loot}`),
  },
  Sfx.sfx,
);

function save() {
  if (store && game.room) store.save(game.snapshot());
}

// ── HUD ─────────────────────────────────────────────────────────

function refreshProgress() {
  progress = folderProgress(game.byPath, game.collected);
  cleared = new Set();
  for (const d of game.world.dirs) {
    if (d._total > 0 && (progress.total.get(d) || 0) >= d._total) cleared.add(d._key);
  }
}

function updateHud() {
  const node = game.room.node;
  el.roomName.textContent = node.name;
  el.roomPath.textContent = node.path || node.id || '';
  el.stCol.textContent = `${game.collected.size}/${game.world.notes.length}`;
  el.stRooms.textContent = `${game.visited.size}/${game.world.dirs.length}`;
  el.stIn.textContent = `${progress.direct.get(node) || 0}/${node._direct || 0}`;
  el.modeLabel.textContent = game.mode;
  $('st-key').hidden = !(game.room.state.hasKey && game.room.doors.length);

  if (game.quest) {
    el.quest.hidden = false;
    el.quest.textContent = `> quête : ${game.quest.name}`;
  } else {
    el.quest.hidden = true;
  }

  el.crumb.replaceChildren();
  game.stack.forEach((key, i) => {
    const n = game.byPath.get(key);
    if (!n) return;
    const done = progress.total.get(n) || 0;
    const seg = h('span', 'crumb-seg', n.name);
    seg.title = `${done}/${n._total} parchemins (${pct(done, n._total)} %)`;
    if (cleared.has(key)) seg.classList.add('crumb-done');
    if (i === game.stack.length - 1) {
      seg.classList.add('crumb-cur');
      seg.textContent = `${n.name} · ${pct(done, n._total)}%`;
    } else {
      seg.addEventListener('click', () => {
        Sfx.sfx.back();
        game.goTo(key);
      });
    }
    el.crumb.appendChild(seg);
  });
}

let heartSpans = [];
function updateVitals() {
  const p = game.player;
  if (heartSpans.length !== p.maxHp) {
    heartSpans = Array.from({ length: p.maxHp }, () => h('span', null, '♥'));
    el.hearts.replaceChildren(...heartSpans);
  }
  const hp = Math.max(0, Math.min(p.maxHp, p.hp));
  heartSpans.forEach((s, i) => {
    const cls = i < hp ? 'on' : 'off';
    if (s.className !== cls) s.className = cls;
  });
  const next = xpForLevel(p.level + 1);
  const xpText = `Lv ${p.level} · ${p.xp}/${next} XP`;
  if (el.xp.textContent !== xpText) el.xp.textContent = xpText;

  const b = game.room && game.room.boss;
  if (b && !b.dead && (b.hunting || game.isVisible(b.x, b.y))) {
    el.bossbar.hidden = false;
    el.bossName.textContent = b.name;
    el.bossFill.style.width = `${(Math.max(0, b.hp) / b.maxHp) * 100}%`;
  } else {
    el.bossbar.hidden = true;
  }
}

function achievementStats() {
  let legendary = 0;
  let orphans = 0;
  for (const path of game.collected) {
    const n = game.byPath.get(path);
    if (!n) continue;
    if (n._rarity === 'legendaire') legendary++;
    if (n._orphan) orphans++;
  }
  let clearedRooms = 0;
  for (const [dir, count] of progress.direct) if (dir._direct > 0 && count >= dir._direct) clearedRooms++;
  let depth = 0;
  for (const key of game.visited) depth = Math.max(depth, (game.byPath.get(key) || {})._depth || 0);
  return {
    notes: game.collected.size,
    rooms: game.visited.size,
    level: game.player.level,
    bosses: game.defeatedBosses.size,
    kills: game.stats.kills,
    deaths: game.stats.deaths,
    links: game.stats.links,
    relics: Object.values(game.relics).reduce((a, b) => a + b, 0),
    seals: game.seals,
    dailies: game.stats.dailies,
    echoes: game.stats.echoes,
    chests: game.stats.chests,
    secrets: game.stats.secrets,
    unlocks: game.stats.unlocks,
    perks: perkTotal(game.perks),
    reflects: game.stats.reflects,
    dodges: game.stats.dodges,
    stuns: game.stats.stuns,
    revealed: game.isRoomFullyRevealed(),
    legendary,
    orphans,
    cleared: clearedRooms,
    depth,
  };
}

function checkAchievements() {
  const s = achievementStats();
  for (const a of ACHIEVEMENTS) {
    if (game.achieved.has(a.id) || !a.test(s)) continue;
    game.achieved.add(a.id);
    showToast(`★ succès débloqué : ${a.name}`);
    Sfx.sfx.levelUp();
  }
  el.achCount.textContent = `${game.achieved.size}/${ACHIEVEMENTS.length}`;
}

// Appelé seulement quand l'état de progression change (collecte, kill, salle…).
function onProgressChanged() {
  refreshProgress();
  checkAchievements();
  updateHud();
  save();
}

// File de messages : un succès ne doit pas effacer le parchemin qu'on vient de ramasser.
const toasts = [];
let toastTimer = 0;
function showToast(msg) {
  if (toasts.includes(msg) || (el.toast.textContent === msg && !el.toast.hidden)) return;
  toasts.push(msg);
  if (toasts.length > 4) toasts.splice(0, toasts.length - 4);
  if (!toastTimer) nextToast();
}

function nextToast() {
  const msg = toasts.shift();
  if (!msg) {
    el.toast.hidden = true;
    toastTimer = 0;
    return;
  }
  el.toast.textContent = msg;
  el.toast.hidden = false;
  toastTimer = setTimeout(nextToast, toasts.length ? 1400 : 2000);
}

function refreshPrompt() {
  const it = game.prompt;
  if (!it || isPaused()) {
    el.prompt.hidden = true;
    return;
  }
  el.prompt.hidden = false;
  if (el.prompt.textContent !== it.label) el.prompt.textContent = it.label;
  const s = game.screenOf(it.x + 0.5, it.y);
  el.prompt.style.left = `${(s.x / 320) * 100}%`;
  el.prompt.style.top = `${(s.y / 192) * 100}%`;
}

// ── Fenêtres ────────────────────────────────────────────────────

const rarityLabel = n => (RARITY[n._rarity] || RARITY.commune).label;
const folderName = n => (n._parent ? n._parent.name : '');

function openInObsidian(path) {
  if (!path) return;
  window.location.href = `obsidian://open?path=${encodeURIComponent(path)}`;
}

function openGrimoire(note) {
  const root = h('div', 'grimoire');
  root.appendChild(h('div', `g-name rar-${note._rarity}`, note.name));

  const meta = h('div', 'g-meta');
  const metaRows = [
    ['rareté', rarityLabel(note)],
    ['chemin', note.path || note.id || ''],
    ['taille', `${Math.max(1, Math.round((note.size || 0) / 1024))} ko`],
    ['liens', `${note._links.length} sortant(s) · ${note._backlinks.length} entrant(s)`],
    ['profondeur', `${note._depth}`],
  ];
  if (note._orphan) metaRows.push(['statut', 'orpheline — aucun lien']);
  for (const [k, v] of metaRows) {
    const r = h('div', 'g-row');
    r.append(h('span', null, k), h('span', null, v));
    meta.appendChild(r);
  }
  root.appendChild(meta);

  const linked = [
    ...note._links.map(n => ['>', n]),
    ...note._backlinks.filter(n => !note._links.includes(n)).map(n => ['<', n]),
  ];
  if (linked.length) {
    root.appendChild(h('div', 'g-hint', 'fils de mémoire — suis-les pour te téléporter :'));
    root.appendChild(list(linked.map(([dir, n]) => row({
      name: `${dir} ${game.collected.has(n.path) ? '✦ ' : ''}${n.name}`,
      sub: folderName(n),
      cls: `rar-${n._rarity}`,
      actions: [{
        label: 'suivre',
        onClick: () => {
          modal.close();
          game.followLink(n);
        },
      }],
    }))));
  } else {
    root.appendChild(h('div', 'g-hint', 'une mémoire gagnée sur le donjon.'));
  }

  const actions = h('div', 'g-actions');
  actions.append(
    button('ouvrir dans Obsidian (O)', () => openInObsidian(note.path), 'btn btn-gold'),
    button('fermer (E)', () => modal.close(), 'btn btn-ghost'),
  );
  root.appendChild(actions);

  modal.open('grimoire', 'Grimoire — parchemin', root);
  grimoireNote = note;
  Sfx.sfx.open();
}

function openLibrary(notes) {
  libraryNotes = notes;
  const root = h('div', 'list');
  const left = notes.filter(n => !game.collected.has(n.path)).length;
  root.appendChild(h('div', 'list-info', `${left}/${notes.length} parchemin(s) encore à prendre. Prendre un parchemin le collecte.`));
  root.appendChild(list(notes.map(note => {
    const got = game.collected.has(note.path);
    return row({
      name: `${got ? '✦ ' : ''}${note.name}`,
      sub: rarityLabel(note),
      cls: `rar-${note._rarity}`,
      actions: got
        ? [{ label: 'relire', onClick: () => openGrimoire(note) }]
        : [{ label: 'prendre', onClick: () => game.collectNote(note) }],
    });
  }), 'aucune mémoire à lire.'));
  modal.open('library', 'Bibliothèque — mémoires en rafale', root);
}

function openRoutes(extras) {
  const root = h('div', 'list');
  root.appendChild(h('div', 'list-info', 'des couloirs trop nombreux pour le donjon : emprunte l’une de ces routes.'));
  root.appendChild(list(extras.map(child => row({
    name: child.name,
    sub: `${pct(progress.total.get(child) || 0, child._total)} %`,
    actions: [{
      label: 'voyager',
      onClick: () => {
        modal.close();
        Sfx.sfx.door();
        game.goTo(child._key);
      },
    }],
  }))));
  modal.open('routes', 'Routes — portes lointaines', root);
}

function openInventory() {
  const nodes = [...game.collected]
    .map(p => game.byPath.get(p))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const root = h('div', 'list');
  root.appendChild(relicsPanel());
  root.appendChild(h('div', 'list-info', nodes.length
    ? 'relis une mémoire ou rouvre-la dans Obsidian.'
    : 'aucune mémoire trouvée — explore le donjon et lis les parchemins.'));
  const filter = h('input', 'field');
  filter.placeholder = 'filtrer…';
  filter.setAttribute('aria-label', 'filtrer l’inventaire');
  root.appendChild(filter);
  const box = h('div');
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = q ? nodes.filter(n => n.name.toLowerCase().includes(q)) : nodes;
    box.replaceChildren(list(shown.map(note => row({
      name: note.name,
      sub: `${rarityLabel(note)} · ${folderName(note)}`,
      cls: `rar-${note._rarity}`,
      actions: [
        { label: 'relire', onClick: () => openGrimoire(note) },
        { label: 'obsidian', onClick: () => openInObsidian(note.path) },
      ],
    })), q ? 'aucun résultat.' : ''));
  };
  filter.addEventListener('input', draw);
  draw();
  root.appendChild(box);
  modal.open('inventory', `Inventaire — ${nodes.length} mémoire(s)`, root, { focus: nodes.length ? filter : null });
  Sfx.sfx.open();
}

function relicsPanel() {
  const box = h('div', 'relics');
  const owned = RELICS.filter(r => game.relic(r.id));
  box.appendChild(h('div', 'relics-title', `reliques ${owned.length}/${RELICS.length} · sceaux ${game.seals} (+${Math.round(game.sealXpBonus() * 100)} % XP, +${game.sealHearts()} ♥)`));
  const grid = h('div', 'relic-grid');
  for (const r of RELICS) {
    const n = game.relic(r.id);
    const cell = h('div', n ? 'relic on' : 'relic', n ? r.icon : '?');
    cell.title = n ? `${r.name}${n > 1 ? ` ×${n}` : ''} — ${r.desc}` : 'relique inconnue — cachée dans une note légendaire';
    if (n > 1) cell.appendChild(h('span', 'relic-n', `${n}`));
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  if (!owned.length) box.appendChild(h('div', 'list-sub', 'les notes légendaires (violettes) renferment des reliques.'));
  return box;
}

function openSucces() {
  const unlocked = game.achieved.size;
  const root = h('div', 'list');
  root.appendChild(h('div', 'list-info', `${unlocked} exploit(s) gravé(s) dans la pierre du donjon.`));
  const grid = h('div', 'ach-grid');
  for (const a of ACHIEVEMENTS) {
    const got = game.achieved.has(a.id);
    const cell = h('div', got ? 'ach-cell on' : 'ach-cell');
    cell.append(
      h('div', 'ach-icon', got ? a.icon : '?'),
      h('div', 'ach-name', got ? a.name : 'succès inconnu'),
      h('div', 'ach-desc', got ? a.desc : 'accomplis encore des exploits…'),
    );
    grid.appendChild(cell);
  }
  root.appendChild(grid);
  modal.open('succes', `Succès — ${unlocked}/${ACHIEVEMENTS.length}`, root);
  Sfx.sfx.open();
}

function openMap() {
  const root = h('div', 'list');
  root.appendChild(h('div', 'list-info', `les salles déjà visitées sont accessibles en voyage rapide. ✓ = dossier complété (sceaux : ${game.seals}).`));
  const rows = [];
  const walk = (dir) => {
    const done = progress.total.get(dir) || 0;
    const visited = game.visited.has(dir._key);
    const here = game.room.node === dir;
    const actions = visited && !here
      ? [{
        label: 'voyager',
        onClick: () => {
          modal.close();
          Sfx.sfx.warp();
          game.goTo(dir._key);
        },
      }]
      : [];
    rows.push(row({
      name: `${here ? '◆ ' : cleared.has(dir._key) ? '✓ ' : ''}${visited ? dir.name : `${dir.name} (inexploré)`}`,
      sub: `${done}/${dir._total} · ${pct(done, dir._total)}%`,
      cls: visited ? (here ? 'map-here' : '') : 'map-unknown',
      indent: dir._depth,
      actions,
    }));
    for (const c of dir.children) if (c.type !== 'MARKDOWN_FILE') walk(c);
  };
  walk(game.world.root);
  root.appendChild(list(rows));

  const foot = h('div', 'g-actions');
  foot.append(
    button(`mode : ${game.mode} > ${otherMode()} (G)`, () => {
      toggleMode();
      openMap();
    }, 'btn btn-ghost'),
    button('nouvelle partie', newGame, 'btn btn-danger'),
  );
  root.appendChild(foot);
  modal.open('map', 'Carte du vault', root);
  Sfx.sfx.open();
}

function dailyPanel() {
  const d = game.daily;
  const box = h('div', 'daily');
  if (!d) return box;
  box.appendChild(h('div', 'relics-title', `notes du jour ${d.done.size}/${d.targets.length}${d.rewarded ? ' — terminé ✓' : ' — un don à la clé'}`));
  box.appendChild(list(d.targets.map(path => game.byPath.get(path)).filter(Boolean).map(note => {
    const done = d.done.has(note.path);
    const known = game.collected.has(note.path);
    return row({
      name: `${done ? '✓ ' : ''}${note.name}`,
      sub: `${known ? 'à relire' : 'à découvrir'} · ${folderName(note)}`,
      cls: done ? 'map-unknown' : 'daily-row',
      actions: done ? [] : [{
        label: 'guider',
        onClick: () => {
          game.setQuest(note);
          modal.close();
          showToast(`quête : ${known ? 'relire' : 'trouver'} « ${note.name} »`);
        },
      }],
    });
  })));
  return box;
}

function openSearch() {
  const root = h('div', 'list');
  root.appendChild(dailyPanel());
  if (game.quest) {
    const info = h('div', 'quest-info');
    info.append(
      h('span', null, `quête en cours : ${game.quest.name}`),
      button('abandonner', () => {
        game.setQuest(null);
        openSearch();
      }),
    );
    root.appendChild(info);
  }
  const input = h('input', 'field');
  input.placeholder = 'nom d’une note…';
  input.setAttribute('aria-label', 'chercher une note');
  root.appendChild(input);
  const box = h('div');
  const draw = () => {
    const found = searchNotes(game.world.notes, input.value);
    box.replaceChildren(list(found.map(note => {
      const got = game.collected.has(note.path);
      return row({
        name: `${got ? '✦ ' : ''}${note.name}`,
        sub: folderName(note),
        cls: `rar-${note._rarity}`,
        actions: got
          ? [{ label: 'relire', onClick: () => openGrimoire(note) }]
          : [{
            label: 'guider',
            onClick: () => {
              game.setQuest(note);
              modal.close();
              showToast(`quête : trouver « ${note.name} »`);
            },
          }],
      });
    }), input.value.trim() ? 'aucune note ne correspond.' : 'tape quelques lettres.'));
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const first = box.querySelector('.list-row button');
    if (first) first.click();
  });
  draw();
  root.appendChild(box);
  modal.open('search', 'Chercher une mémoire', root, { focus: input });
}

// Les dons tirés restent les mêmes tant qu'on n'a pas choisi (pas de relance en fermant).
let perkChoices = null;
function openPerks() {
  if (!perkChoices) perkChoices = rollPerks(game.perks, 3);
  if (!perkChoices.length) {
    game.pendingPerks = 0;
    perkChoices = null;
    return;
  }
  const root = h('div', 'perks');
  const more = game.pendingPerks > 1 ? `${game.pendingPerks} dons à choisir. ` : '';
  root.appendChild(h('div', 'list-info', `${more}choisis un don — touches 1, 2, 3 ou clic.`));
  const grid = h('div', 'perk-grid');
  perkChoices.forEach((pk, i) => {
    const card = button('', () => pickPerk(pk.id), 'perk-card');
    card.append(
      h('div', 'perk-key', `${i + 1}`),
      h('div', 'perk-icon', pk.icon),
      h('div', 'perk-name', pk.name),
      h('div', 'perk-desc', pk.desc),
      h('div', 'perk-lvl', `niv. ${game.perk(pk.id) + 1} / ${pk.max}`),
    );
    grid.appendChild(card);
  });
  root.appendChild(grid);
  modal.open('perks', `Niveau ${game.player.level} — choisis un don`, root, { focus: grid.firstChild, locked: true });
  Sfx.sfx.open();
}

function pickPerk(id) {
  game.choosePerk(id);
  perkChoices = null;
  modal.close(true);
  showToast(`don obtenu : ${PERK_BY_ID[id].name}`);
}

const PANELS = { KeyI: ['inventory', openInventory], KeyK: ['succes', openSucces], KeyT: ['map', openMap], KeyF: ['search', openSearch] };

function togglePanel(code) {
  const [kind, open] = PANELS[code];
  if (modal.isOpen && modal.kind === kind) modal.close();
  else open();
}

function otherMode() {
  return game.mode === DUNGEON ? CLASSIC : DUNGEON;
}

function toggleMode() {
  const m = otherMode();
  game.setMode(m);
  prog.saveMode(m);
  showToast(m === DUNGEON ? 'mode donjon — étages de chambres et couloirs' : 'mode salle — une pièce par dossier');
}

function newGame() {
  if (!window.confirm('Effacer la progression de ce vault et recommencer ?')) return;
  modal.close();
  if (store) store.clear();
  game.newGame();
  showToast('nouvelle partie');
}

// ── Entrées ─────────────────────────────────────────────────────

let hintTimer = 0;
function checkHint() {
  if (!el.hint.hidden) return;
  const hint = nextHint(game);
  if (!hint) return;
  game.hints.add(hint.id);
  el.hint.textContent = hint.text;
  el.hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    el.hint.hidden = true;
  }, 6000);
  save();
}

function isPaused() {
  return modal.isOpen || !el.death.hidden || !el.boot.hidden;
}

const ACTION_CODES = new Set(['ShiftLeft', 'ShiftRight', 'KeyE', 'Enter', 'Space', 'KeyJ', 'Tab', 'KeyM', 'KeyN', 'KeyG', 'KeyI', 'KeyK', 'KeyT', 'KeyF', 'Slash']);

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  Sfx.ensureContext();

  if (modal.isOpen && modal.kind === 'perks') {
    if (e.code === 'Tab') return modal.trapTab(e);
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined && perkChoices && perkChoices[n] && !e.repeat) pickPerk(perkChoices[n].id);
    return;
  }

  if (modal.isOpen) {
    if (e.code === 'Escape') {
      e.preventDefault();
      modal.close();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Tab') return modal.trapTab(e);
    if (e.repeat) return;
    if (e.code === 'KeyE') return modal.close();
    if (e.code === 'KeyO' && grimoireNote) return openInObsidian(grimoireNote.path);
    if (e.code === 'KeyG' && modal.kind === 'map') {
      toggleMode();
      return openMap();
    }
    if (PANELS[e.code]) {
      e.preventDefault();
      togglePanel(e.code);
    }
    return;
  }
  if (!el.death.hidden || !el.boot.hidden) return;

  // Empêche aussi la touche d'ouverture d'un panneau d'être tapée dans son champ de saisie.
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab', 'Slash'].includes(e.code) || PANELS[e.code] || e.key === '/') {
    e.preventDefault();
  }
  if (e.repeat && ACTION_CODES.has(e.code)) return;
  keys.add(e.code);

  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') game.dodge(keys);
  else if (e.code === 'KeyE' || e.code === 'Enter') game.interact();
  else if (e.code === 'Space' || e.code === 'KeyJ') game.attack();
  else if (e.code === 'Tab') {
    if (game.room && game.room.sign) {
      Sfx.sfx.open();
      openRoutes(game.room.sign.extras);
    } else {
      Sfx.sfx.error();
      showToast('aucune route à l’horizon');
    }
  } else if (e.code === 'KeyM') {
    Sfx.setMuted(!Sfx.isMuted());
    el.controls.classList.toggle('muted', Sfx.isMuted());
    showToast(Sfx.isMuted() ? 'son coupé' : 'son activé');
  } else if (e.code === 'KeyN') {
    Music.setEnabled(!Music.isEnabled());
    try {
      localStorage.setItem(MUSIC_KEY, Music.isEnabled() ? 'on' : 'off');
    } catch {
      // préférence non mémorisée
    }
    showToast(Music.isEnabled() ? 'musique activée' : 'musique coupée');
  } else if (e.code === 'KeyG') toggleMode();
  else if (e.code === 'Slash' || e.key === '/') togglePanel('KeyF');
  else if (PANELS[e.code]) togglePanel(e.code);
});

window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  keys.clear();
  if (document.hidden) save();
});
window.addEventListener('beforeunload', save);

canvas.addEventListener('pointerdown', () => {
  Sfx.ensureContext();
  game.interact();
});

el.deathRetry.addEventListener('click', () => {
  el.death.hidden = true;
  game.respawn();
  canvas.focus({ preventScroll: true });
});

const hudButton = (id, fn) => $(id).addEventListener('click', e => {
  e.currentTarget.blur();
  Sfx.ensureContext();
  fn();
});
hudButton('btn-inv', () => togglePanel('KeyI'));
hudButton('btn-ach', () => togglePanel('KeyK'));
hudButton('btn-map', () => togglePanel('KeyT'));
hudButton('btn-search', () => togglePanel('KeyF'));
hudButton('btn-mode', toggleMode);

if (setupTouch($('touch'), keys, { attack: () => game.attack(), interact: () => game.interact(), dodge: () => game.dodge(keys) })) {
  el.controls.hidden = true;
}

// ── Démarrage ───────────────────────────────────────────────────

let booting = false;
async function boot(kind = 'real') {
  if (booting) return;
  booting = true;
  el.boot.hidden = false;
  el.bootMsg.textContent = 'ouverture du donjon…';
  el.bootActions.hidden = true;
  try {
    const demo = kind === 'demo';
    const data = demo ? buildDemoWorld() : await fetchUniverse();
    const world = buildWorld(data);
    game.setWorld(world);
    game.resetProgress();
    game.mode = prog.loadMode(DUNGEON);
    store = demo ? null : prog.storeFor(prog.vaultIdOf(data));
    const saved = store && store.load();
    if (saved) game.restore(saved);
    else game.newGame();
    el.boot.hidden = true;
    canvas.focus({ preventScroll: true });
    if (demo) showToast('mode démo — données fictives, rien n’est sauvegardé');
  } catch (err) {
    console.error(err);
    el.bootMsg.textContent =
      'donjon verrouillé — API inaccessible.\nLance obsidian-back (./mvnw spring-boot:run), puis réessaie.';
    el.bootActions.hidden = false;
  } finally {
    booting = false;
  }
}

$('boot-retry').addEventListener('click', () => boot('real'));
$('boot-demo').addEventListener('click', () => boot('demo'));

window.__obsidianQuest = { game, sfx: Sfx, music: Music };

let prev = performance.now();
let frame = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  frame++;

  game.paused = isPaused();
  game.tick(keys, dt);
  const b = game.room && game.room.boss;
  Music.setIntensity(b && !b.dead && b.hunting && !game.dead ? 1 : 0);
  if (game.dirty && game.room) {
    game.dirty = false;
    onProgressChanged();
  }
  if (game.pendingPerks > 0 && game.room && !game.dead && !isPaused()) openPerks();
  if (frame % 20 === 0 && game.room && !isPaused() && !game.dead) checkHint();
  renderer.render(game, cleared);
  refreshPrompt();
  if (game.room) updateVitals();
  if (frame % 120 === 0) save();

  requestAnimationFrame(loop);
}

boot();
requestAnimationFrame(loop);
