import { hashStr } from './universe.js';

const CACHE = new Map();

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

const THEMES = [
  { name: 'sentier',   floor: '#4a7d3a', floor2: '#416c33', wall: '#39403f', wall2: '#2c3231', door: '#ffd23f',  accent: '#ffe08a', fol: '#6ca049', rock: '#7d7d85', glow: '#b7ef7a' },
  { name: 'grotte',    floor: '#6a6a72', floor2: '#5e5e66', wall: '#3a3a42', wall2: '#2e2e35', door: '#ff9a3c',  accent: '#ffb35c', fol: '#565660', rock: '#8a8a92', glow: '#ffcf8a' },
  { name: 'salledor',  floor: '#b8893c', floor2: '#a67c33', wall: '#7a5a2e', wall2: '#6a4e26', door: '#ffd23f',  accent: '#ffe08a', fol: '#7a5a2e', rock: '#caa04f', glow: '#ffe08a' },
  { name: 'arcane',    floor: '#3c3a6a', floor2: '#343260', wall: '#23204a', wall2: '#1c1940', door: '#c77bff',  accent: '#dca8ff', fol: '#4a48a0', rock: '#6a68b0', glow: '#dca8ff' },
  { name: 'glace',     floor: '#8fd4e6', floor2: '#7ec2d6', wall: '#3e6a7a', wall2: '#335a68', door: '#7ef0ff',  accent: '#baf8ff', fol: '#9fe0ee', rock: '#bfefff', glow: '#eafcff' },
  { name: 'braises',   floor: '#8a4a2e', floor2: '#7a4026', wall: '#4a2014', wall2: '#3e1a10', door: '#ff9a3c',  accent: '#ffc46a', fol: '#a05a38', rock: '#b06a44', glow: '#ff9a3c' },
  { name: 'tombes',    floor: '#5a5a56', floor2: '#50504c', wall: '#26262e', wall2: '#1e1e26', door: '#7dff6a',  accent: '#a8ff9a', fol: '#6a6a66', rock: '#7a7a76', glow: '#9fffbe' },
  { name: 'cosmos',    floor: '#2a2a54', floor2: '#242448', wall: '#12122e', wall2: '#0c0c24', door: '#4affd8',  accent: '#86ffe8', fol: '#3a3a74', rock: '#4a4884', glow: '#86ffe8' },
];

function monsterSet(base, eliteColor) {
  return { base, elite: tint(base, eliteColor, 0.5), white: tint(base, '#ffffff', 1) };
}

function tint(src, color, alpha) {
  const c = mk(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function getTheme(key) {
  return THEMES[hashStr(key) % THEMES.length];
}

export function makeThemeSprites(theme) {
  const id = theme.name;
  if (CACHE.has(id)) return CACHE.get(id);

  const floorSprites = [0, 1, 2].map(variant => {
    const c = mk(8, 8);
    const ctx = c.getContext('2d');
    ctx.fillStyle = theme.floor;
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = theme.floor2;
    const dots = [[2, 2], [5, 1], [7, 4], [1, 6], [4, 7], [6, 6]];
    dots.forEach(([x, y], i) => {
      if ((i + variant) % 3 === 0) ctx.fillRect(x, y, 1, 1);
    });
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillRect(0, 0, 1, 8);
    return c;
  });

  const wallC = mk(8, 8);
  const wctx = wallC.getContext('2d');
  rect(wctx, 0, 0, 8, 8, theme.wall);
  wctx.fillStyle = theme.wall2;
  rect(wctx, 0, 3, 8, 1);
  rect(wctx, 0, 7, 8, 1);
  rect(wctx, 3, 0, 1, 3);
  rect(wctx, 1, 4, 1, 3);
  rect(wctx, 5, 4, 1, 3);

  const gateC = mk(8, 8);
  const gctx = gateC.getContext('2d');
  rect(gctx, 0, 0, 8, 8, '#14141c');
  rect(gctx, 1, 2, 6, 6, '#1e1e2a');
  rect(gctx, 2, 1, 4, 7, theme.door);
  rect(gctx, 3, 0, 2, 1, theme.door);

  const gateBackC = mk(8, 8);
  const gbctx = gateBackC.getContext('2d');
  rect(gbctx, 0, 0, 8, 8, '#14141c');
  rect(gbctx, 1, 2, 6, 6, '#1e1e2a');
  rect(gbctx, 2, 1, 4, 7, theme.door);
  rect(gbctx, 3, 0, 2, 1, theme.door);
  rect(gbctx, 3, 2, 2, 2, theme.accent);
  rect(gbctx, 4, 2, 1, 3, '#14141c');
  rect(gbctx, 3, 4, 2, 1, '#14141c');

  const scroll = (body, roll, seal) => {
    const c = mk(8, 8);
    const nctx = c.getContext('2d');
    rect(nctx, 1, 2, 6, 5, body);
    rect(nctx, 0, 1, 8, 2, roll);
    rect(nctx, 2, 2, 4, 1, seal);
    rect(nctx, 3, 1, 2, 1, seal);
    return c;
  };
  const noteC = scroll('#5a3410', '#c48a2a', '#ffe08a');
  const noteRareC = scroll('#1e3a5a', '#3a8ad8', '#9fe0ff');
  const noteLegendC = scroll('#3a1a5a', '#b04ae8', '#ffe08a');

  const libraryC = mk(8, 8);
  const lctx = libraryC.getContext('2d');
  rect(lctx, 0, 0, 8, 8, '#3a2412');
  rect(lctx, 1, 1, 2, 3, '#6a2e4a');
  rect(lctx, 3, 1, 2, 3, '#2e4a6a');
  rect(lctx, 5, 1, 2, 3, '#4a6a2e');
  rect(lctx, 1, 5, 2, 2, '#5a342a');
  rect(lctx, 3, 5, 2, 2, '#2a4a5a');
  rect(lctx, 5, 5, 2, 2, '#7a4a1a');

  const signC = mk(8, 8);
  const sctx = signC.getContext('2d');
  rect(sctx, 3, 5, 2, 3, '#4a3a2a');
  rect(sctx, 1, 1, 6, 4, '#6a5a3a');
  rect(sctx, 2, 2, 4, 2, theme.accent);

  const bushC = mk(8, 8);
  const bctx = bushC.getContext('2d');
  rect(bctx, 2, 4, 4, 3, theme.fol);
  rect(bctx, 3, 3, 2, 1, theme.fol);
  rect(bctx, 1, 5, 6, 2, theme.fol);

  const rockC = mk(8, 8);
  const rctx = rockC.getContext('2d');
  rect(rctx, 2, 4, 4, 3, theme.rock);
  rect(rctx, 3, 3, 2, 1, theme.rock);

  const crystalC = mk(8, 8);
  const cctx = crystalC.getContext('2d');
  rect(cctx, 3, 2, 2, 4, theme.accent);
  rect(cctx, 2, 4, 4, 2, theme.accent);

  const flowerC = mk(8, 8);
  const fctx = flowerC.getContext('2d');
  rect(fctx, 3, 4, 2, 3, theme.fol);
  rect(fctx, 2, 4, 1, 1, theme.accent);
  rect(fctx, 5, 3, 1, 1, theme.accent);
  rect(fctx, 3, 2, 1, 1, theme.accent);
  rect(fctx, 3, 1, 2, 2, theme.accent);

  const shroomC = mk(8, 8);
  const shctx = shroomC.getContext('2d');
  rect(shctx, 3, 4, 2, 3, '#e8d8b8');
  rect(shctx, 2, 2, 4, 3, theme.accent);
  rect(shctx, 2, 1, 1, 1, theme.accent);
  rect(shctx, 5, 1, 1, 1, theme.accent);

  const tuftC = mk(8, 8);
  const tctx = tuftC.getContext('2d');
  rect(tctx, 1, 6, 1, 2, theme.fol);
  rect(tctx, 3, 5, 1, 3, theme.fol);
  rect(tctx, 5, 6, 1, 2, theme.fol);

  const skullC = mk(8, 8);
  const skctx = skullC.getContext('2d');
  rect(skctx, 2, 3, 4, 4, '#d8d4c8');
  rect(skctx, 3, 1, 2, 2, '#d8d4c8');
  rect(skctx, 2, 5, 1, 1, '#20232e');
  rect(skctx, 5, 5, 1, 1, '#20232e');
  rect(skctx, 3, 6, 2, 1, '#20232e');

  const critterC = mk(8, 8);
  const crctx = critterC.getContext('2d');
  rect(crctx, 1, 5, 6, 2, '#3a3e52');
  rect(crctx, 2, 3, 4, 2, '#3a3e52');
  rect(crctx, 2, 4, 1, 1, theme.glow);
  rect(crctx, 5, 4, 1, 1, theme.glow);
  rect(crctx, 3, 7, 1, 1, '#2a2d3c');
  rect(crctx, 5, 7, 1, 1, '#2a2d3c');

  const wispC = mk(8, 8);
  const wctx2 = wispC.getContext('2d');
  wctx2.fillStyle = theme.glow;
  wctx2.fillRect(3, 3, 2, 2);
  wctx2.fillStyle = 'rgba(255,255,255,0.85)';
  wctx2.fillRect(3, 3, 1, 1);

  const slimeC = mk(8, 8);
  const slctx = slimeC.getContext('2d');
  rect(slctx, 1, 3, 6, 2, '#5a8a3a');
  rect(slctx, 2, 5, 4, 2, '#5a8a3a');
  rect(slctx, 0, 4, 8, 1, '#5a8a3a');
  rect(slctx, 2, 2, 4, 2, '#79b94f');
  rect(slctx, 3, 4, 2, 1, '#79b94f');
  rect(slctx, 3, 5, 1, 1, '#b7ef7a');
  rect(slctx, 6, 6, 1, 1, '#b7ef7a');
  rect(slctx, 2, 4, 1, 1, '#14181e');
  rect(slctx, 5, 4, 1, 1, '#14181e');

  const batC = mk(8, 8);
  const batctx = batC.getContext('2d');
  rect(batctx, 0, 3, 8, 4, '#24263a');
  rect(batctx, 2, 1, 4, 3, '#24263a');
  rect(batctx, 3, 2, 2, 3, '#3a3e5a');
  rect(batctx, 3, 3, 1, 1, theme.glow);
  rect(batctx, 5, 3, 1, 1, theme.glow);
  rect(batctx, 3, 2, 1, 1, '#ff6a4a');
  rect(batctx, 5, 2, 1, 1, '#ff6a4a');
  rect(batctx, 1, 4, 1, 2, '#1a1c2c');
  rect(batctx, 6, 4, 1, 2, '#1a1c2c');
  rect(batctx, 3, 7, 2, 1, '#2f2c3e');

  const bossC = mk(16, 16);
  const b2ctx = bossC.getContext('2d');
  rect(b2ctx, 2, 5, 12, 9, '#14141e');
  rect(b2ctx, 4, 2, 8, 4, '#14141e');
  rect(b2ctx, 6, 0, 2, 3, '#e8d8b8');
  rect(b2ctx, 8, 0, 2, 3, '#e8d8b8');
  rect(b2ctx, 4, 0, 1, 2, '#e8d8b8');
  rect(b2ctx, 11, 0, 1, 2, '#e8d8b8');
  rect(b2ctx, 3, 4, 10, 10, '#5a2e7a');
  rect(b2ctx, 5, 2, 6, 3, '#5a2e7a');
  rect(b2ctx, 5, 10, 6, 4, '#3a1e52');
  rect(b2ctx, 5, 6, 2, 3, '#ff6a4a');
  rect(b2ctx, 9, 6, 2, 3, '#ff6a4a');
  rect(b2ctx, 6, 11, 4, 1, '#14141e');

  const upArrowC = mk(8, 8);
  const actx = upArrowC.getContext('2d');
  actx.fillStyle = theme.accent;
  actx.fillRect(3, 2, 2, 1);
  actx.fillRect(2, 3, 4, 1);
  actx.fillRect(1, 4, 6, 1);
  actx.fillRect(3, 5, 2, 2);

  const archerC = mk(8, 8);
  const arctx = archerC.getContext('2d');
  rect(arctx, 2, 1, 4, 3, '#3a3550');
  rect(arctx, 3, 2, 2, 2, '#d8d4c8');
  rect(arctx, 3, 3, 1, 1, '#ff4a8a');
  rect(arctx, 1, 4, 5, 3, '#4a4466');
  rect(arctx, 2, 7, 1, 1, '#2a2638');
  rect(arctx, 4, 7, 1, 1, '#2a2638');
  rect(arctx, 7, 2, 1, 5, '#a07a4a');
  rect(arctx, 6, 1, 1, 1, '#a07a4a');
  rect(arctx, 6, 7, 1, 1, '#a07a4a');
  rect(arctx, 6, 2, 1, 5, 'rgba(232,216,184,0.6)');

  const chargerC = mk(8, 8);
  const chctx = chargerC.getContext('2d');
  rect(chctx, 0, 3, 6, 4, '#7a5a3a');
  rect(chctx, 1, 2, 3, 1, '#6a4a2e');
  rect(chctx, 5, 2, 3, 3, '#8a6a42');
  rect(chctx, 4, 1, 2, 1, '#e8d8b8');
  rect(chctx, 7, 1, 1, 2, '#e8d8b8');
  rect(chctx, 6, 3, 1, 1, '#ff4a4a');
  rect(chctx, 7, 4, 1, 1, '#3a2a1a');
  rect(chctx, 1, 7, 1, 1, '#3a2a1a');
  rect(chctx, 4, 7, 1, 1, '#3a2a1a');

  const knightC = mk(8, 8);
  const kctx = knightC.getContext('2d');
  rect(kctx, 2, 0, 4, 4, '#8a8a96');
  rect(kctx, 2, 2, 4, 1, '#ffd23f');
  rect(kctx, 3, 0, 2, 1, '#b0b0bc');
  rect(kctx, 1, 4, 6, 3, '#6a6a76');
  rect(kctx, 3, 4, 2, 3, '#8a8a96');
  rect(kctx, 2, 7, 1, 1, '#3a3a44');
  rect(kctx, 5, 7, 1, 1, '#3a3a44');

  const shotC = mk(4, 4);
  const shctx2 = shotC.getContext('2d');
  rect(shctx2, 1, 0, 2, 4, '#ff4a8a');
  rect(shctx2, 0, 1, 4, 2, '#ff4a8a');
  rect(shctx2, 1, 1, 2, 2, '#ffd0e0');

  const reflectC = tint(shotC, '#4affd8', 0.85);

  const keyC = mk(8, 8);
  const kyctx = keyC.getContext('2d');
  rect(kyctx, 1, 1, 3, 3, '#ffd23f');
  rect(kyctx, 2, 2, 1, 1, '#14141c');
  rect(kyctx, 3, 3, 4, 1, '#ffd23f');
  rect(kyctx, 5, 4, 1, 2, '#ffd23f');
  rect(kyctx, 6, 4, 1, 1, '#ffd23f');
  rect(kyctx, 1, 1, 1, 1, '#fff4c0');

  const chestC = mk(8, 8);
  const cctx2 = chestC.getContext('2d');
  rect(cctx2, 0, 2, 8, 6, '#6a3e1a');
  rect(cctx2, 0, 2, 8, 2, '#8a5428');
  rect(cctx2, 0, 4, 8, 1, '#c8a040');
  rect(cctx2, 0, 2, 1, 6, '#c8a040');
  rect(cctx2, 7, 2, 1, 6, '#c8a040');
  rect(cctx2, 3, 4, 2, 2, '#ffd23f');
  rect(cctx2, 3, 5, 2, 1, '#14141c');

  const doorC = mk(8, 8);
  const dctx = doorC.getContext('2d');
  rect(dctx, 0, 0, 8, 8, '#3a2412');
  rect(dctx, 1, 0, 2, 8, '#5a3a1e');
  rect(dctx, 5, 0, 2, 8, '#5a3a1e');
  rect(dctx, 0, 2, 8, 1, '#7a7a86');
  rect(dctx, 0, 6, 8, 1, '#7a7a86');
  rect(dctx, 3, 3, 2, 3, '#c8a040');
  rect(dctx, 3, 4, 2, 1, '#14141c');

  const heartC = mk(8, 8);
  const hctx = heartC.getContext('2d');
  rect(hctx, 1, 2, 2, 1, '#ff6a6a');
  rect(hctx, 5, 2, 2, 1, '#ff6a6a');
  rect(hctx, 1, 3, 6, 2, '#ff6a6a');
  rect(hctx, 2, 5, 4, 1, '#ff6a6a');
  rect(hctx, 3, 6, 2, 1, '#ff6a6a');
  rect(hctx, 2, 3, 1, 1, '#ffd0d0');

  const sprites = {
    floors: floorSprites,
    wall: wallC,
    gate: gateC,
    gateBack: gateBackC,
    note: noteC,
    notes: { commune: noteC, rare: noteRareC, legendaire: noteLegendC },
    heart: heartC,
    key: keyC,
    chest: chestC,
    door: doorC,
    library: libraryC,
    sign: signC,
    decor: [bushC, rockC, crystalC, flowerC, shroomC, tuftC, skullC],
    wisp: wispC,
    critter: critterC,
    slime: slimeC,
    bat: batC,
    // Par type de créature : sprite normal, variante enragée, silhouette blanche (impact).
    mon: {
      slime: monsterSet(slimeC, '#ff3a5a'),
      wisp: monsterSet(batC, '#c77bff'),
      archer: monsterSet(archerC, '#ff3a5a'),
      charger: monsterSet(chargerC, '#ff3a5a'),
      splitter: monsterSet(tint(slimeC, '#4ac8ff', 0.6), '#c77bff'),
      knight: monsterSet(knightC, '#ff3a5a'),
    },
    bossWhite: tint(bossC, '#ffffff', 1),
    shot: shotC,
    shotReflected: reflectC,
    boss: bossC,
    upArrow: upArrowC,
  };

  CACHE.set(id, sprites);
  return sprites;
}

function makePlayerFrames() {
  const id = '__player__';
  if (CACHE.has(id)) return CACHE.get(id);

  const frames = [0, 1].map(lift => {
    const c = mk(12, 12);
    const ctx = c.getContext('2d');
    const O = '#191b2c';
    const S = '#f4b183';
    const H = '#232050';
    const T = '#2fbf71';
    const B = '#4a2f1d';
    const G = '#ffe08a';

    rect(ctx, 0, 0, 12, 12, 'transparent');

    rect(ctx, 3, 1, 6, 6, O);
    rect(ctx, 4, 2, 4, 1, H);
    rect(ctx, 3, 2, 1, 2, H);
    rect(ctx, 8, 2, 1, 2, H);
    rect(ctx, 4, 4, 4, 3, S);
    rect(ctx, 4, 5, 1, 1, O);
    rect(ctx, 7, 5, 1, 1, O);

    const legL = lift ? 0 : 1;
    const legR = lift ? 1 : 0;

    rect(ctx, 2, 7, 8, 3, O);
    rect(ctx, 3, 7, 6, 2, T);
    rect(ctx, 3, 9, 6, 1, G);
    rect(ctx, 1, 7, 1, 2, S);
    rect(ctx, 10, 7, 1, 2, S);

    rect(ctx, 3, 10 - legL, 2, 2, B);
    rect(ctx, 7, 10 - legR, 2, 2, B);

    return c;
  });

  CACHE.set(id, frames);
  return frames;
}

export { THEMES, makePlayerFrames };