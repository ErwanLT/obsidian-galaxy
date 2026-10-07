// Mini-carte : l'arborescence des dossiers en disque (racine au centre, un
// anneau par niveau). Le chemin jusqu'à la vue courante est surligné, un clic
// sur un dossier y emmène.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 168;
const C = SIZE / 2;

const isDir = n => n.type !== 'MARKDOWN_FILE';
const dirsOf = n => (n.children || []).filter(isDir);

/** Positions radiales : chaque dossier reçoit un secteur proportionnel à ses feuilles. */
export function radialLayout(root) {
  const leaves = new Map();
  const count = n => {
    const kids = dirsOf(n);
    const v = kids.length ? kids.reduce((a, k) => a + count(k), 0) : 1;
    leaves.set(n, v);
    return v;
  };
  count(root);
  let maxDepth = 0;
  const depthOf = new Map([[root, 0]]);
  const walk = n => dirsOf(n).forEach(k => {
    depthOf.set(k, depthOf.get(n) + 1);
    maxDepth = Math.max(maxDepth, depthOf.get(k));
    walk(k);
  });
  walk(root);
  const ring = d => (d === 0 ? 0 : 12 + ((C - 16) * d) / Math.max(1, maxDepth));
  const pos = new Map([[root, { x: C, y: C, a: 0 }]]);
  const place = (n, a0, a1) => {
    let a = a0;
    for (const k of dirsOf(n)) {
      const span = ((a1 - a0) * leaves.get(k)) / leaves.get(n);
      const mid = a + span / 2;
      const r = ring(depthOf.get(k));
      pos.set(k, { x: C + Math.cos(mid) * r, y: C + Math.sin(mid) * r, a: mid });
      place(k, a, a + span);
      a += span;
    }
  };
  place(root, -Math.PI / 2, Math.PI * 1.5);
  return pos;
}

export class MiniMap {
  constructor(root, onPick) {
    this.root = root;
    this.onPick = onPick;
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    this.svg.setAttribute('width', SIZE);
    this.svg.setAttribute('height', SIZE);
    root.appendChild(this.svg);
    this.dots = new Map();
    this.edges = new Map();
  }

  setUniverse(universe) {
    this.svg.innerHTML = '';
    this.dots.clear();
    this.edges.clear();
    this.universe = universe;
    const pos = radialLayout(universe);
    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const dotLayer = document.createElementNS(SVG_NS, 'g');
    this.svg.append(edgeLayer, dotLayer);
    for (const [n, p] of pos) {
      if (n._parent && pos.has(n._parent)) {
        const q = pos.get(n._parent);
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', q.x);
        line.setAttribute('y1', q.y);
        line.setAttribute('x2', p.x);
        line.setAttribute('y2', p.y);
        edgeLayer.appendChild(line);
        this.edges.set(n, line);
      }
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      const notes = n.markdownCount || 0;
      dot.setAttribute('r', n === universe ? 4 : Math.min(6, 1.8 + Math.sqrt(notes) * 0.45));
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = n === universe ? 'Univers' : `${n.name} · ${notes} notes`;
      dot.appendChild(title);
      dot.addEventListener('click', () => this.onPick(n === universe ? null : n));
      dotLayer.appendChild(dot);
      this.dots.set(n, dot);
    }
  }

  /** Surligne le chemin de la racine jusqu'au dossier affiché (null = univers). */
  setCurrent(node) {
    const onPath = new Set();
    for (let p = node; p; p = p._parent) onPath.add(p);
    if (this.universe) onPath.add(this.universe);
    for (const [n, dot] of this.dots) {
      dot.classList.toggle('on-path', onPath.has(n));
      dot.classList.toggle('current', n === (node || this.universe));
    }
    for (const [n, line] of this.edges) line.classList.toggle('on-path', onPath.has(n));
  }
}
