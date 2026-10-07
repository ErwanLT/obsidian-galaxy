import * as THREE from 'three';
import { disposeTree } from './objects.js';

/**
 * Liens entre notes.
 *
 * - Dans la vue : un filament entre deux astres liés (une note, ou le dossier
 *   en orbite qui contient la note liée).
 * - Hors de la vue : quand un astre est sélectionné, des « portails » (boutons
 *   HTML, un par dossier lié ailleurs dans le vault) s'ouvrent en éventail à
 *   l'écran, du côté gauche — le panneau d'infos occupe la droite — reliés à
 *   l'astre par un trait. Un clic emmène vers la note.
 */

const LINE_IDLE = 0.06;
const LINE_ACTIVE = 0.85;
const MAX_PORTALS = 8;
const FAN_RADIUS = 150;        // px entre l'astre et ses portails
const FAN_FROM = Math.PI * 0.62;
const FAN_TO = Math.PI * 1.38;
const SVG_NS = 'http://www.w3.org/2000/svg';
const _v = new THREE.Vector3();

export class LinkGraph {
  constructor(scene, portalRoot, onPortal) {
    this.scene = scene;
    this.portalRoot = portalRoot;
    this.onPortal = onPortal;
    this.lines = [];
    this.external = new Map();   // objet → notes liées hors de la vue
    this.portalAnchor = null;
    this.portals = [];
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('portal-rays');
    portalRoot.appendChild(this.svg);
  }

  /** Construit les filaments de la vue courante à partir de l'index des liens. */
  build(objects) {
    this.clear();
    const inView = new Map();
    for (const o of objects) if (o.userData.clickable && o.userData.node) inView.set(o.userData.node, o);
    // Astre de la vue qui représente un nœud : lui-même, ou le dossier qui le contient.
    const holder = node => {
      for (let p = node; p; p = p._parent) {
        const o = inView.get(p);
        if (o) return o;
      }
      return null;
    };
    const pairs = new Set();
    for (const [node, obj] of inView) {
      if (node.type !== 'MARKDOWN_FILE') continue;
      const ext = [];
      for (const t of [...(node._out || []), ...(node._in || [])]) {
        const other = holder(t);
        if (other === obj) continue;
        if (!other) {
          if (!ext.includes(t)) ext.push(t);
          continue;
        }
        const key = obj.id < other.id ? `${obj.id}:${other.id}` : `${other.id}:${obj.id}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        this.addLine(obj, other);
      }
      if (ext.length) this.external.set(obj, ext);
    }
  }

  addLine(objA, objB) {
    const geometry = new THREE.BufferGeometry().setFromPoints([objA.position.clone(), objB.position.clone()]);
    const material = new THREE.LineBasicMaterial({
      color: 0x34D399, transparent: true, opacity: LINE_IDLE,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.lines.push({ line, objA, objB, material });
  }

  /** Astres liés à `obj` dans la vue (pour mettre leurs étiquettes en avant). */
  neighbors(obj) {
    const out = [];
    for (const c of this.lines) {
      if (c.objA === obj) out.push(c.objB);
      if (c.objB === obj) out.push(c.objA);
    }
    return out;
  }

  clear() {
    for (const c of this.lines) {
      this.scene.remove(c.line);
      disposeTree(c.line);
    }
    this.lines = [];
    this.external = new Map();
    this.clearPortals();
  }

  clearPortals() {
    for (const p of this.portals) {
      p.ray.remove();
      p.el.remove();
    }
    this.portals = [];
    this.portalAnchor = null;
  }

  /** (Re)crée les portails de l'astre sélectionné. */
  setPortals(anchor) {
    if (anchor === this.portalAnchor) return;
    this.clearPortals();
    this.portalAnchor = anchor;
    const ext = anchor && this.external.get(anchor);
    if (!ext) return;

    const groups = new Map();
    for (const t of ext) {
      const folder = t._parent;
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder).push(t);
    }
    const list = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_PORTALS);
    list.forEach(([folder, notes], k) => {
      const angle = list.length === 1 ? Math.PI : FAN_FROM + ((FAN_TO - FAN_FROM) * k) / (list.length - 1);
      const ray = document.createElementNS(SVG_NS, 'line');
      this.svg.appendChild(ray);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'portal';
      const label = notes.length > 1 ? `${folder.name} · ${notes.length} notes` : notes[0].name;
      el.textContent = `↗ ${label}`;
      el.title = notes.map(n => n.name).join('\n');
      el.addEventListener('click', () => this.onPortal(notes, folder));
      this.portalRoot.appendChild(el);
      this.portals.push({ ray, el, angle, w: 0, h: 0 });
    });
  }

  /** Suivi des astres en orbite, opacité selon la sélection, position des portails. */
  update(selected, hovered, camera, size) {
    const anchor = selected || hovered;
    for (const c of this.lines) {
      const p = c.line.geometry.attributes.position.array;
      p[0] = c.objA.position.x; p[1] = c.objA.position.y; p[2] = c.objA.position.z;
      p[3] = c.objB.position.x; p[4] = c.objB.position.y; p[5] = c.objB.position.z;
      c.line.geometry.attributes.position.needsUpdate = true;
      const lit = anchor && (c.objA === anchor || c.objB === anchor);
      const target = !anchor ? LINE_IDLE : lit ? LINE_ACTIVE : 0.02;
      c.material.opacity = THREE.MathUtils.lerp(c.material.opacity, target, 0.12);
    }

    if (!this.portalAnchor) return;
    _v.copy(this.portalAnchor.position).project(camera);
    const offscreen = _v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1;
    this.svg.classList.toggle('is-hidden', offscreen);
    const ax = (_v.x + 1) / 2 * size.w;
    const ay = (1 - _v.y) / 2 * size.h;
    for (const p of this.portals) {
      p.el.classList.toggle('is-hidden', offscreen);
      if (offscreen) continue;
      if (!p.w) {
        p.w = p.el.offsetWidth;
        p.h = p.el.offsetHeight;
      }
      // Bouton en éventail à gauche de l'astre, maintenu dans l'écran.
      let x = ax + Math.cos(p.angle) * FAN_RADIUS;
      let y = ay + Math.sin(p.angle) * FAN_RADIUS * 0.75;
      x = Math.min(Math.max(x, p.w / 2 + 8), size.w - p.w / 2 - 8);
      y = Math.min(Math.max(y, 80), size.h - 24);
      p.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      p.ray.setAttribute('x1', ax);
      p.ray.setAttribute('y1', ay);
      p.ray.setAttribute('x2', x);
      p.ray.setAttribute('y2', y);
    }
  }
}
