import * as THREE from 'three';
import { disposeTree, kelvinColor, seededRandom } from './objects.js';

/**
 * Vue constellation : tout le vault d'un coup d'œil.
 *
 * Chaque note est une étoile, chaque lien un filament. La position vient d'une
 * simulation de forces (les notes liées s'attirent, toutes se repoussent, chaque
 * dossier racine forme un amas autour de son centre) ; la taille et l'éclat
 * viennent du nombre de citations. Couleurs : une température d'étoile par amas.
 */

const CLUSTER_TEMPS = [9800, 5600, 3900, 7400, 4600, 12000, 6400, 3400, 8600, 5000];
const CLUSTER_RADIUS = 230;
const LINK_LENGTH = 26;
const DIM = 0.12;

/** Positions par simulation de forces, déterministe (graine fixe). */
export function layoutConstellation(notes, groupOf, groups) {
  const n = notes.length;
  const rnd = seededRandom(0xc0ffee);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const centers = groups.map((_, k) => {
    // Centres des amas sur une sphère de Fibonacci aplatie (lecture « carte du ciel »).
    const y = groups.length > 1 ? 1 - (2 * (k + 0.5)) / groups.length : 0;
    const r = Math.sqrt(1 - y * y);
    const a = k * Math.PI * (3 - Math.sqrt(5));
    return new THREE.Vector3(Math.cos(a) * r, y * 0.45, Math.sin(a) * r).multiplyScalar(CLUSTER_RADIUS);
  });
  const index = new Map(notes.map((nd, i) => [nd, i]));
  const pos = notes.map(nd => centers[groupOf(nd)].clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(45)));
  const edges = [];
  for (const nd of notes) {
    for (const t of nd._out || []) {
      const j = index.get(t);
      if (j !== undefined) edges.push([index.get(nd), j]);
    }
  }

  // Au-delà de quelques centaines de notes, la répulsion est échantillonnée.
  const iterations = n > 800 ? 90 : 220;
  const sample = n > 800 ? 160 : n;
  const force = notes.map(() => new THREE.Vector3());
  const d = new THREE.Vector3();
  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    for (const f of force) f.set(0, 0, 0);
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < sample; s++) {
        const j = sample === n ? s : (rnd() * n) | 0;
        if (j === i) continue;
        d.subVectors(pos[i], pos[j]);
        const dist2 = Math.max(d.lengthSq(), 4);
        if (dist2 > 160 * 160) continue;
        force[i].addScaledVector(d, (900 * (n / sample)) / (dist2 * Math.sqrt(dist2)));
      }
      force[i].addScaledVector(d.subVectors(centers[groupOf(notes[i])], pos[i]), 0.012);
    }
    for (const [a, b] of edges) {
      d.subVectors(pos[b], pos[a]);
      const dist = Math.max(d.length(), 0.1);
      const k = ((dist - LINK_LENGTH) / dist) * 0.06;
      force[a].addScaledVector(d, k);
      force[b].addScaledVector(d, -k);
    }
    for (let i = 0; i < n; i++) {
      const f = force[i];
      const len = f.length();
      const max = 8 * cool + 0.5;
      if (len > max) f.multiplyScalar(max / len);
      pos[i].add(f);
    }
  }
  return pos;
}

export class Constellation {
  constructor(scene, universe) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const notes = universe._index.notes;
    const tops = (universe.children || []).filter(c => c.type !== 'MARKDOWN_FILE');
    const topOf = nd => {
      let p = nd;
      while (p._parent && p._parent._parent) p = p._parent;
      return p;
    };
    const groups = [...tops, universe];   // dernier groupe : notes posées à la racine
    const groupIndex = new Map(groups.map((g, k) => [g, k]));
    const groupOf = nd => groupIndex.get(topOf(nd)) ?? groups.length - 1;

    this.notes = notes;
    this.groups = groups;
    this.groupOf = groupOf;
    const pos = layoutConstellation(notes, groupOf, groups);
    this.positions = pos;
    this.index = new Map(notes.map((nd, i) => [nd, i]));

    // Étoiles : taille et éclat selon les citations reçues.
    const n = notes.length;
    const posArr = new Float32Array(n * 3);
    const colArr = new Float32Array(n * 3);
    const sizeArr = new Float32Array(n);
    this.baseColors = new Float32Array(n * 3);
    notes.forEach((nd, i) => {
      posArr.set([pos[i].x, pos[i].y, pos[i].z], i * 3);
      const c = kelvinColor(CLUSTER_TEMPS[groupOf(nd) % CLUSTER_TEMPS.length]);
      const cites = (nd._in || []).length;
      const glow = 0.45 + Math.min(1, Math.log2(1 + cites) / 4) * 0.55;
      this.baseColors.set([c.r * glow, c.g * glow, c.b * glow], i * 3);
      sizeArr[i] = 5 + Math.log2(1 + cites) * 3.2 + (nd.rarity === 'legendaire' ? 3 : nd.rarity === 'rare' ? 1.5 : 0);
    });
    colArr.set(this.baseColors);
    this.sizes = sizeArr;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Taille en perspective, avec un minimum : une note ne disparaît jamais.
          gl_PointSize = max(size * (900.0 / -mv.z), 3.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.18, 0.0, d);
          float halo = smoothstep(0.5, 0.0, d) * 0.45;
          gl_FragColor = vec4(vColor * (core * 1.6 + halo), core + halo);
        }
      `,
    }));
    this.group.add(this.points);

    // Filaments : un seul objet pour tous les liens.
    const seen = new Set();
    const linePos = [];
    const lineCol = [];
    this.edges = [];
    notes.forEach((nd, i) => {
      for (const t of nd._out || []) {
        const j = this.index.get(t);
        if (j === undefined) continue;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push([i, j]);
        linePos.push(pos[i].x, pos[i].y, pos[i].z, pos[j].x, pos[j].y, pos[j].z);
        lineCol.push(...this.baseColors.slice(i * 3, i * 3 + 3), ...this.baseColors.slice(j * 3, j * 3 + 3));
      }
    });
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lgeo.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
    this.lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(this.lines);
    this.highlight = null;

    // Repères invisibles pour les étiquettes HTML (une par note).
    this.proxies = notes.map((nd, i) => {
      const o = new THREE.Object3D();
      o.position.copy(pos[i]);
      o.userData = { node: nd, visualRadius: this.sizes[i] * 0.35, type: 'star', clickable: true };
      this.group.add(o);
      return o;
    });

    this.focus = null;
    this.filter = 'all';
  }

  bounds() {
    const box = new THREE.Box3().setFromPoints(this.positions);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    return { center, radius };
  }

  proxyOf(note) {
    const i = this.index.get(note);
    return i === undefined ? null : this.proxies[i];
  }

  neighborsOf(note) {
    return [...(note._out || []), ...(note._in || [])].map(t => this.proxyOf(t)).filter(Boolean);
  }

  /** Note sous le pointeur (raycaster déjà orienté), ou null. */
  pick(raycaster, camera) {
    const dist = camera.position.length();
    raycaster.params.Points.threshold = Math.max(2, dist * 0.012);
    const hits = raycaster.intersectObject(this.points, false);
    if (!hits.length) return null;
    hits.sort((a, b) => a.distanceToRay - b.distanceToRay);
    return this.notes[hits[0].index];
  }

  /** Met en avant une note et ses liens (ou rien) ; les autres s'estompent. */
  setFocus(note) {
    if (note === this.focus) return;
    this.focus = note;
    if (this.highlight) {
      this.group.remove(this.highlight);
      disposeTree(this.highlight);
      this.highlight = null;
    }
    if (note) {
      const i = this.index.get(note);
      const pts = [];
      for (const [a, b] of this.edges) {
        if (a !== i && b !== i) continue;
        pts.push(this.positions[a], this.positions[b]);
      }
      if (pts.length) {
        this.highlight = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        this.group.add(this.highlight);
      }
    }
    this.recolor();
  }

  /** Filtre : 'all' | 'orphans' | 'cited' | 'big'. */
  setFilter(kind) {
    this.filter = kind;
    this.recolor();
  }

  matches(nd) {
    switch (this.filter) {
      case 'orphans': return !(nd._out || []).length && !(nd._in || []).length;
      case 'cited': return (nd._in || []).length >= 3;
      case 'big': return nd.rarity === 'legendaire' || nd.rarity === 'rare';
      default: return true;
    }
  }

  recolor() {
    const col = this.points.geometry.attributes.color;
    const linked = this.focus ? new Set([this.focus, ...(this.focus._out || []), ...(this.focus._in || [])]) : null;
    this.notes.forEach((nd, i) => {
      const on = this.matches(nd) && (!linked || linked.has(nd));
      const k = on ? (linked && nd === this.focus ? 1.6 : 1) : DIM;
      col.setXYZ(i, this.baseColors[i * 3] * k, this.baseColors[i * 3 + 1] * k, this.baseColors[i * 3 + 2] * k);
    });
    col.needsUpdate = true;
    this.lines.material.opacity = this.focus ? 0.03 : this.filter === 'all' ? 0.1 : 0.04;
  }

  /** Nombre de notes retenues par le filtre courant. */
  count() {
    return this.notes.filter(nd => this.matches(nd)).length;
  }

  dispose() {
    this.scene.remove(this.group);
    disposeTree(this.group);
  }
}
