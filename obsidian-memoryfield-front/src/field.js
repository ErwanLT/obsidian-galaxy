// field.js — le Champ de mémoires : braises (notes), cœurs de nébuleuse
// (dossiers), filaments (liens). Simulation de ressorts : chaque braise
// gravite vers son cœur et se laisse attirer par ses voisines liées.
// GPU only pour le rendu, CPU léger pour la simulation (quelques centaines
// de particules suffisent).

import * as THREE from 'three';
import { buildField, fetchUniverse, hashStr } from './universe.js';

let _nebulaTex = null;
function nebulaTexture() {
  if (_nebulaTex) return _nebulaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _nebulaTex = new THREE.CanvasTexture(c);
  return _nebulaTex;
}

let _ringTex = null;
function ringTexture() {
  if (_ringTex) return _ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 44, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _ringTex = new THREE.CanvasTexture(c);
  return _ringTex;
}

const hsl = (h, s, l, a = 1) => new THREE.Color().setHSL(h % 1, s, l);

export class MemoryField {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.points = null;
    this.positions = null;
    this.cores = [];
    this.coreSprites = [];
    this.links = null;
    this.highlights = null;

    this.velocity = [];
    this.hover = null;
    this.selected = null;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 3.2;
  }

  async load() {
    const data = await fetchUniverse();
    this.field = buildField(data);
    this.build();
    return this.field;
  }

  build() {
    const { notes, cores, edges } = this.field;

    // Adjacence note↔arêtes pour la simulation des filaments
    notes.forEach(n => { n._links = []; });
    edges.forEach(e => {
      e.a._links.push(e);
      e.b._links.push(e);
    });

    // ── Braises : les notes ──────────────────────────────────────────────
    const count = notes.length;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const hot = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    notes.forEach((note, i) => {
      note._idx = i;
      const core = note._parent;
      const a = note._anchor;
      const nx = core.x + Math.cos(a.angle) * a.r;
      const ny = core.y + Math.sin(a.angle) * a.r;
      // Z : strate du dossier + jitter propre + ondulation de la couronne.
      // L'ondulation varie avec l'angle d'ancrage et monte avec le rayon
      // d'orbite → chaque dossier déploie sa rosette en volume, plus de plateaux.
      const zJitter = ((hashStr(note.path) % 501) - 250) / 41; // ≈ ±6
      const corrug = Math.sin(a.angle * 2.5 + a.wobble) * a.r * 0.7;
      note._zOff = (core._z ?? 0) + zJitter + corrug;
      positions[i * 3] = nx;
      positions[i * 3 + 1] = ny;
      positions[i * 3 + 2] = note._zOff;

      const sizeBytes = note.size || 10;
      sizes[i] = 1.4 + Math.min(Math.log2(Math.max(sizeBytes, 6)) * 0.7, 3.4);

      const bright = 0.5 + 0.5 * (note.degree / this.field.degreeMax);
      hot[i] = 0.55 + 0.45 * bright;

      const col = hsl(note.hue, 0.7, 0.62 + 0.2 * bright);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      phases[i] = hashStr(note.path) % 1000 / 1000;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.positions = geo.attributes.position;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSel: { value: 0 },          // 0 = aucune sélection
        uFade: { value: new THREE.Vector3(0, 0, 0) }, // pos voisins proches (pos moyenne, pour réaliser que la sélection est fanée) — remplacé par l'aEase
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aHot;
        attribute vec3 color;
        uniform float uTime;
        varying vec3 vColor;
        varying float vA;
        void main() {
          float tw = 0.72 + 0.28 * sin(uTime * 2.4 + aPhase * 6.2831);
          vA = aHot * tw;
          vColor = color * (0.9 + 0.5 * tw);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vColor;
        varying float vA;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float core = exp(-d * 9.0);
          float halo = smoothstep(0.5, 0.06, d) * 0.22;
          float a = (core + halo) * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * (core * 1.6 + halo * 0.7), a);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    // ── Cœurs de nébuleuse : les dossiers ────────────────────────────────
    const tex = nebulaTexture();
    cores.forEach((core, i) => {
      const size = 5 + Math.sqrt(Math.max(core.markdownCount || 1, 1)) * 6;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: hsl(core._hue, 0.6, 0.55),
        transparent: true, opacity: 0.0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(core.x, core.y, core._z ?? 0);
      sprite.scale.set(size, size, 1);
      sprite.userData = { core, base: size, hue: core._hue };
      this.group.add(sprite);
      this.coreSprites.push(sprite);
      // Repli discret du cœur : léger halo en dessous des braises.
      this.cores.push(core);
    });

    // ── Filaments : les liens ─────────────────────────────────────────────
    this.links = this.buildLinks(edges, 0x555a7d, 0.35);
    this.group.add(this.links);

    // ── Marqueur de survol / sélection ────────────────────────────────────
    const markMat = new THREE.SpriteMaterial({
      map: ringTexture(),
      color: 0xffd9a0,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.marker = new THREE.Sprite(markMat);
    this.marker.scale.set(18, 18, 1);
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  buildLinks(edges, colorHex, opacity) {
    const verts = new Float32Array(edges.length * 6);
    const cols = new Float32Array(edges.length * 6);
    const c = new THREE.Color(colorHex);
    edges.forEach(({ a, b }, k) => {
      const ax = a._parent.x + Math.cos(a._anchor.angle) * a._anchor.r;
      const ay = a._parent.y + Math.sin(a._anchor.angle) * a._anchor.r;
      const bx = b._parent.x + Math.cos(b._anchor.angle) * b._anchor.r;
      const by = b._parent.y + Math.sin(b._anchor.angle) * b._anchor.r;
      verts[k * 6] = ax;
      verts[k * 6 + 1] = ay;
      verts[k * 6 + 2] = a._zOff ?? 0;
      verts[k * 6 + 3] = bx;
      verts[k * 6 + 4] = by;
      verts[k * 6 + 5] = b._zOff ?? 0;
      cols[k * 6] = c.r; cols[k * 6 + 1] = c.g; cols[k * 6 + 2] = c.b;
      cols[k * 6 + 3] = c.r; cols[k * 6 + 4] = c.g; cols[k * 6 + 5] = c.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(g, m);
    lines.frustumCulled = false;
    return lines;
  }

  /** Ré-bâti les filaments de la braise survolée (constellation). */
  setHover(index) {
    if (!this.field) return;
    this.hover = index;
    const { edges } = this.field;
    if (this.highlights) {
      this.group.remove(this.highlights);
      this.highlights.geometry.dispose();
      this.highlights.material.dispose();
      this.highlights = null;
    }
    if (index == null) {
      this.marker.visible = false;
      return;
    }
    const note = this.field.notes[index];
    const links = edges.filter(e => e.a === note || e.b === note);
    this.highlights = this.buildLinks(links, 0xffb347, 0.95);
    this.group.add(this.highlights);
    this.marker.visible = true;
  }

  tick(time, dt) {
    if (!this.field) return;
    const s = this.positions;
    const notes = this.field.notes;
    const D2 = new THREE.Vector3();

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const core = note._parent;
      const a = note._anchor;

      // Foyer qui « respire » : légère variation d'angle lente
      const ang = a.angle + Math.sin(time * 0.05 + a.wobble) * 0.14;
      const homeX = core.x + Math.cos(ang) * a.r;
      const homeY = core.y + Math.sin(ang) * a.r;

      let x = s.array[i * 3];
      let y = s.array[i * 3 + 1];
      let z = s.array[i * 3 + 2];

      // Attraction du foyer (en 3D : la braise flotte à la strate de son cœur)
      x += (homeX - x) * 0.03;
      y += (homeY - y) * 0.03;
      z += (note._zOff - z) * 0.03;

      // Attraction douce des braises liées (sans les faire s'empiler)
      let lx = 0, ly = 0, lz = 0, n = 0;
      for (const e of note._links) {
        const other = e.a === note ? e.b : e.a;
        lx += s.array[other._idx * 3];
        ly += s.array[other._idx * 3 + 1];
        lz += s.array[other._idx * 3 + 2];
        n++;
      }
      if (n > 0) {
        x += (lx / n - x) * 0.02;
        y += (ly / n - y) * 0.02;
        z += (lz / n - z) * 0.02;
      }

      // Dérive organique douce (bruit sinusoïdal, pas de brownien)
      x += Math.sin(time * 0.22 + a.wobble * 40) * 0.05;
      y += Math.cos(time * 0.18 + a.wobble * 30) * 0.05;
      z += Math.sin(time * 0.13 + a.wobble * 20) * 0.05;

      s.array[i * 3] = x;
      s.array[i * 3 + 1] = y;
      s.array[i * 3 + 2] = z;

      if (note.x === undefined) { note.x = x; note.y = y; note.z = z; }
      note.x = x * 0.9 + note.x * 0.1;
      note.y = y * 0.9 + note.y * 0.1;
      note.z = z * 0.9 + note.z * 0.1;
    }

    // Répulsion douce entre braises liées trop proches : les grappes restent
    // vivantes mais ne se moulent pas en une seule tache de lumière.
    const arr = s.array;
    const REPULSION_R = 6;
    for (const { a, b } of this.field.edges) {
      const ax = arr[a._idx * 3], ay = arr[a._idx * 3 + 1];
      const bx = arr[b._idx * 3], by = arr[b._idx * 3 + 1];
      const dx = ax - bx, dy = ay - by;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001 && d < REPULSION_R) {
        const push = (REPULSION_R - d) * 0.03 / d;
        arr[a._idx * 3] = ax + dx * push;
        arr[a._idx * 3 + 1] = ay + dy * push;
        arr[b._idx * 3] = bx - dx * push;
        arr[b._idx * 3 + 1] = by - dy * push;
      }
    }
    s.needsUpdate = true;

    // Marqueur de survol suit sa braise
    if (this.hover != null) {
      const h = this.field.notes[this.hover];
      this.marker.position.set(h.x, h.y, (h.z ?? 0) + 4);
    }

    // Cœurs : pulsation douce de la nébuleuse
    const pulse = 1 + Math.sin(time * 0.8) * 0.05;
    for (const spr of this.coreSprites) {
      spr.material.opacity = Math.min(0.3, 0.14 + (spr.userData.core.markdownCount || 1) * 0.002);
      spr.scale.set(
        spr.userData.base * pulse + 2 * Math.sin(time * 1.7 + spr.userData.hue * 6.28),
        spr.userData.base * pulse,
        1,
      );
    }

    this.points.material.uniforms.uTime.value = time;
    if (this.highlights && this.hover != null) {
      this.updateLinkGeometry(this.highlights, this.field.edges, this.hover);
    }
  }

  updateLinkGeometry(lines, edges, hoverIndex) {
    const pos = lines.geometry.attributes.position.array;
    const note = this.field.notes[hoverIndex];
    let k = 0;
    for (const e of edges) {
      if (e.a !== note && e.b !== note) continue;
      const other = e.a === note ? e.b : e.a;
      pos[k * 6] = note.x; pos[k * 6 + 1] = note.y; pos[k * 6 + 2] = note.z ?? 0;
      pos[k * 6 + 3] = other.x; pos[k * 6 + 4] = other.y; pos[k * 6 + 5] = other.z ?? 0;
      k++;
    }
    lines.geometry.attributes.position.needsUpdate = true;
  }

  /** Renvoie l'index de la braise sous le pointeur, ou null. */
  pick(camera, ndcX, ndcY) {
    if (!this.points) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = this.raycaster.intersectObject(this.points, false);
    if (hits.length === 0) return null;
    return hits[0].index;
  }
}

export function openNote(note) {
  if (!note) return;
  const uri = `obsidian://open?path=${encodeURIComponent(note.path)}`;
  try {
    window.location.href = uri;
  } catch (e) {
    console.warn('Impossible d’ouvrir Obsidian :', e);
  }
}