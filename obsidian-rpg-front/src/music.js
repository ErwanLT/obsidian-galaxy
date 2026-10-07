import { audio } from './sfx.js';
import { hashStr } from './universe.js';
import { mulberry32 } from './worldgen.js';

// Musique chiptune générée : chaque thème de salle a sa gamme, son tempo et une
// progression d'accords tirée de son nom. L'intensité (0 → 1) ajoute percussions,
// arpèges doublés et accélère le tempo quand le gardien chasse.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

const STYLES = {
  sentier: { scale: 'major', root: 48, bpm: 112 },
  grotte: { scale: 'minor', root: 45, bpm: 96 },
  salledor: { scale: 'mixolydian', root: 50, bpm: 118 },
  arcane: { scale: 'dorian', root: 47, bpm: 104 },
  glace: { scale: 'lydian', root: 52, bpm: 90 },
  braises: { scale: 'phrygian', root: 45, bpm: 124 },
  tombes: { scale: 'harmonic', root: 43, bpm: 84 },
  cosmos: { scale: 'lydian', root: 46, bpm: 100 },
};

const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [5, 3, 0, 4], [0, 2, 3, 4]];
const LOOKAHEAD = 0.25;
const MUSIC_VOL = 0.5;

const freq = m => 440 * Math.pow(2, (m - 69) / 12);

let style = null;
let song = null;
let bus = null;
let step = 0;
let nextTime = 0;
let intensity = 0;
let enabled = true;
let timer = null;

function compose(name) {
  const st = STYLES[name] || STYLES.sentier;
  const rand = mulberry32(hashStr(`music:${name}`));
  const prog = PROGRESSIONS[(rand() * PROGRESSIONS.length) | 0];
  // Mélodie : 64 pas (4 mesures), notes de la gamme proches de l'accord courant.
  const melody = [];
  for (let i = 0; i < 64; i++) {
    const chord = prog[(i / 16) | 0];
    const play = i % 4 === 0 ? rand() < 0.55 : i % 2 === 0 ? rand() < 0.25 : false;
    melody.push(play ? chord + [0, 2, 4, 7, 1, 3][(rand() * 6) | 0] : null);
  }
  return { st, prog, melody };
}

function degree(st, d, octave) {
  const sc = SCALES[st.scale];
  const n = sc.length;
  const o = Math.floor(d / n);
  return st.root + octave * 12 + sc[((d % n) + n) % n] + o * 12;
}

function tone(ctx, t, f, dur, type, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(ctx, t, vol) {
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start(t);
}

function kick(ctx, t, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.17);
}

function scheduleStep(ctx, t, dur) {
  const { st, prog, melody } = song;
  const i = step % 64;
  const s16 = i % 16;
  const chord = prog[(i / 16) | 0];
  const hot = intensity > 0.5;

  if (s16 === 0 || s16 === 8 || (hot && (s16 === 4 || s16 === 12))) {
    tone(ctx, t, freq(degree(st, chord, hot ? -1 : 0)), dur * 3.5, 'triangle', 0.32);
  }
  if (i % (hot ? 1 : 2) === 0) {
    const arp = [0, 2, 4, 7][(i / (hot ? 1 : 2)) % 4];
    tone(ctx, t, freq(degree(st, chord + arp, 2)), dur * 0.9, 'square', hot ? 0.05 : 0.035);
  }
  if (melody[i] != null) {
    tone(ctx, t, freq(degree(st, melody[i], 2)), dur * 1.8, 'triangle', 0.12);
  }
  if (hot) {
    if (s16 % 2 === 0) hat(ctx, t, s16 % 4 === 2 ? 0.12 : 0.06);
    if (s16 === 0 || s16 === 6 || s16 === 8) kick(ctx, t, 0.5);
  }
}

function pump() {
  const a = audio();
  if (!a || !song || !enabled) return;
  const { ctx, out } = a;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = MUSIC_VOL;
    bus.connect(out);
  }
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const bpm = song.st.bpm * (intensity > 0.5 ? 1.15 : 1);
    const dur = 60 / bpm / 4;
    scheduleStep(ctx, nextTime, dur);
    nextTime += dur;
    step++;
  }
}

export function play(themeName) {
  if (style === themeName) return;
  style = themeName;
  song = compose(themeName);
  step = 0;
  nextTime = 0;
  if (!timer) timer = setInterval(pump, 60);
}

export function setIntensity(x) {
  intensity = x;
}

export function setEnabled(on) {
  enabled = on;
  if (bus) bus.gain.value = on ? MUSIC_VOL : 0;
}

export function isEnabled() {
  return enabled;
}
