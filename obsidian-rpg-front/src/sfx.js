let ctx = null;
let gainNode = null;
let muted = false;

export function init() {
  if (ctx) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  gainNode = ctx.createGain();
  gainNode.gain.value = 0.28;
  gainNode.connect(ctx.destination);
  return ctx;
}

export function ensureContext() {
  const c = init();
  if (c && c.state === 'suspended') c.resume();
  return c;
}

export function setMuted(m) {
  muted = m;
  if (gainNode) gainNode.gain.value = m ? 0 : 0.28;
}

export function isMuted() {
  return muted;
}

// Contexte et bus maître partagés avec la musique (le mute coupe tout).
export function audio() {
  return ctx ? { ctx, out: gainNode } : null;
}

function blip(freq, dur, type = 'square', vol = 1, delay = 0, slide = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(gainNode);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol = 1, delay = 0, lowpass = 800) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(gainNode);
  src.start(t);
}

export const sfx = {
  step() {
    blip(150 + Math.random() * 50, 0.04, 'square', 0.06, 0, -40);
  },
  pickup() {
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.09, 'square', 0.45, i * 0.07));
  },
  door() {
    [392, 494, 587, 740].forEach((f, i) => blip(f, 0.12, 'triangle', 0.55, i * 0.09));
  },
  back() {
    [466, 349, 262, 196].forEach((f, i) => blip(f, 0.13, 'triangle', 0.55, i * 0.09));
  },
  error() {
    blip(110, 0.16, 'sawtooth', 0.4, 0, -60);
  },
  open() {
    blip(880, 0.06, 'square', 0.35);
    blip(1320, 0.08, 'square', 0.3, 0.06);
  },
  close() {
    blip(440, 0.05, 'square', 0.28);
  },
  warp() {
    [294, 349, 440, 523, 659].forEach((f, i) => blip(f, 0.1, 'triangle', 0.5, i * 0.06, 120));
  },
  sword() {
    noise(0.14, 0.4, 0, 2400);
    blip(660, 0.1, 'sawtooth', 0.22, 0, 380);
  },
  hit() {
    noise(0.06, 0.5, 0, 1400);
    blip(180, 0.07, 'square', 0.3, 0, -90);
  },
  kill() {
    noise(0.14, 0.4, 0, 900);
    blip(330, 0.2, 'triangle', 0.4, 0, -180);
  },
  hurt() {
    noise(0.12, 0.5, 0, 700);
    blip(140, 0.22, 'sawtooth', 0.4, 0, -70);
  },
  levelUp() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, 0.12, 'square', 0.4, i * 0.09));
  },
  dodge() {
    noise(0.12, 0.25, 0, 1800);
    blip(300, 0.1, 'triangle', 0.15, 0, 260);
  },
  aim() {
    blip(520, 0.3, 'triangle', 0.12, 0, 400);
  },
  shoot() {
    blip(880, 0.08, 'square', 0.18, 0, -500);
  },
  reflect() {
    blip(1568, 0.06, 'square', 0.3);
    blip(2093, 0.1, 'triangle', 0.3, 0.05);
  },
  clang() {
    blip(1200, 0.08, 'square', 0.3, 0, -300);
    noise(0.05, 0.3, 0, 5000);
  },
  windup() {
    blip(160, 0.45, 'sawtooth', 0.22, 0, 220);
  },
  charge() {
    noise(0.3, 0.35, 0, 600);
    blip(110, 0.25, 'sawtooth', 0.3, 0, -40);
  },
  thud() {
    noise(0.18, 0.55, 0, 400);
    blip(70, 0.2, 'square', 0.45, 0, -30);
  },
  slam() {
    noise(0.4, 0.6, 0, 500);
    blip(55, 0.35, 'sawtooth', 0.5, 0, -20);
  },
  key() {
    [784, 988, 1175, 1568].forEach((f, i) => blip(f, 0.1, 'triangle', 0.4, i * 0.06));
  },
  unlock() {
    blip(220, 0.08, 'square', 0.4);
    blip(330, 0.08, 'square', 0.35, 0.08);
    noise(0.35, 0.4, 0.12, 700);
    [392, 523, 659, 784].forEach((f, i) => blip(f, 0.14, 'triangle', 0.4, 0.2 + i * 0.08));
  },
  chest() {
    noise(0.1, 0.3, 0, 1200);
    [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, 0.08, 'square', 0.35, 0.08 + i * 0.05));
  },
  xp() {
    blip(1320 + Math.random() * 200, 0.05, 'square', 0.18);
  },
  heal() {
    blip(880, 0.08, 'triangle', 0.4);
    blip(1174, 0.14, 'triangle', 0.4, 0.08);
  },
  bossRoar() {
    blip(98, 0.5, 'sawtooth', 0.6, 0, -40);
    blip(73, 0.6, 'sawtooth', 0.5, 0.1, -30);
    noise(0.5, 0.35, 0, 500);
  },
  bossKill() {
    noise(0.5, 0.5, 0, 600);
    [220, 277, 330, 440, 554, 660].forEach((f, i) => blip(f, 0.16, 'square', 0.42, i * 0.1));
  },
};