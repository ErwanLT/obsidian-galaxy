import * as THREE from 'three';

/**
 * Étiquettes HTML posées au-dessus des astres.
 *
 * Remplace les sprites texte de la scène 3D, illisibles dès qu'on s'éloigne :
 * ici la taille reste constante à l'écran, et un placement glouton par priorité
 * masque les étiquettes qui se chevauchent (le dossier passe avant la note,
 * le gros astre avant le petit, l'astre survolé ou sélectionné avant tout).
 */

const _v = new THREE.Vector3();
const GAP = 4;
const TOP_MARGIN = 76;
const SEE_THROUGH = new Set(['galaxy', 'cluster', 'supercluster', 'star']);
// Au-delà, les notes non survolées n'ont plus de nom (lisibilité des gros dossiers).
const MAX_NOTE_LABELS = 10;
const EDGE = 8;

export class LabelLayer {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.visible = true;
  }

  add(obj, node, color, kind) {
    const el = document.createElement('div');
    el.className = `lbl lbl-${kind}`;
    el.textContent = node.name;
    el.style.setProperty('--lbl-color', color);
    this.root.appendChild(el);
    this.items.push({ el, obj, kind, w: 0, h: 0, shown: false });
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('is-off', !v);
  }

  /**
   * @param camera   caméra de la scène
   * @param size     { w, h } du canvas en px CSS
   * @param focus    Set d'objets à afficher en priorité (survol, sélection, liés)
   */
  update(camera, size, focus) {
    if (!this.visible || !this.items.length) return;
    const pxPerUnit = size.h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

    // Mesures d'abord, écritures ensuite : alterner lecture de taille et
    // modification du DOM forçait une mise en page par étiquette.
    for (const it of this.items) {
      if (!it.w) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      }
    }

    const candidates = [];
    for (const it of this.items) {
      it.obj.getWorldPosition(_v);
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) {
        this.hide(it);
        continue;
      }
      const r = ((it.obj.userData.visualRadius ?? 4) * it.obj.scale.x * pxPerUnit) / Math.max(dist, 1e-3);
      const x = (_v.x + 1) / 2 * size.w;
      const y = (1 - _v.y) / 2 * size.h;
      const focused = focus.has(it.obj);
      // Les notes lointaines n'ont d'étiquette qu'au survol ou en lien avec la sélection.
      if (it.kind === 'note' && !focused && r < 6) {
        this.hide(it);
        continue;
      }
      const prio = (focused ? 1e6 : 0) + (it.kind === 'note' ? 0 : 1e4) + r;
      // Au-dessus du disque de l'astre, sans sortir par le haut (sous l'en-tête).
      const top = Math.max(TOP_MARGIN, y - r - GAP - it.h);
      candidates.push({ it, prio, x: x - it.w / 2, y: top, cx: x, cy: y, r, dist });
    }

    // Un astre caché derrière un corps opaque plus proche n'affiche pas son nom
    // (galaxies et étoiles sont lumineuses et translucides : elles ne masquent rien).
    const visible = candidates.filter(c => !candidates.some(o =>
      o !== c && !SEE_THROUGH.has(o.it.obj.userData.type) && o.dist < c.dist && o.r > 6
      && Math.hypot(o.cx - c.cx, o.cy - c.cy) < o.r * 0.9));
    for (const c of candidates) if (!visible.includes(c)) this.hide(c.it);

    visible.sort((a, b) => b.prio - a.prio);
    const placed = [];
    let notes = 0;
    for (const c of visible) {
      if (c.it.kind === 'note' && c.prio < 1e6 && notes >= MAX_NOTE_LABELS) {
        this.hide(c.it);
        continue;
      }
      // Jamais à cheval sur le bord de l'écran.
      c.x = Math.min(Math.max(c.x, EDGE), size.w - c.it.w - EDGE);
      const box = { x1: c.x - 2, y1: c.y - 1, x2: c.x + c.it.w + 2, y2: c.y + c.it.h + 1 };
      if (placed.some(p => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1)) {
        this.hide(c.it);
        continue;
      }
      placed.push(box);
      if (c.it.kind === 'note' && c.prio < 1e6) notes++;
      c.it.el.style.transform = `translate3d(${Math.round(c.x)}px, ${Math.round(c.y)}px, 0)`;
      if (!c.it.shown) {
        c.it.el.classList.add('is-shown');
        c.it.shown = true;
      }
    }
  }

  hide(it) {
    if (!it.shown) return;
    it.el.classList.remove('is-shown');
    it.shown = false;
  }
}
