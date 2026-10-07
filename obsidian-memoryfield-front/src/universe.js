// universe.js — charge l'arbre de mémoires, le dispose en champ et construit
// le graphe de liens. Tout est déterministe à partir du contenu reçu.

const API_BASE = 'http://localhost:8080';

export const KEY = Symbol('node');

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function fetchUniverse() {
  const res = await fetch(`${API_BASE}/api/universe`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Dispose récursivement les cœurs (dossiers) en spirale de Fermat : chaque
 * dossier rayonne ses sous-dossiers autour de lui, la dispersion rétrécit
 * avec la profondeur → amas de cœurs qui emboîtent leurs nids.
 */
function placeCores(root, R) {
  root.x = 0;
  root.y = 0;
  root._spread = R;
  const walk = (node, x, y, spread) => {
    node.x = x;
    node.y = y;
    node._spread = spread;
    const dirs = node.children.filter(c => c.type === 'DIRECTORY');
    const n = dirs.length;
    const phase = (hashStr(node.path || node.name) % 360) * (Math.PI / 180);
    dirs.forEach((d, i) => {
      const r = spread * 0.9 * Math.sqrt((i + 0.5) / Math.max(n, 1));
      const a = GOLDEN * i + phase;
      walk(d, x + Math.cos(a) * r, y + Math.sin(a) * r, spread * 0.62);
    });
  };
  walk(root, root.x, root.y, R);
}

/**
 * Construit la scène « champ » : liste des braises (notes), liste des cœurs
 * (dossiers), position d'ancrage de chaque note auprès de son cœur, liens.
 */
export function buildField(root) {
  placeCores(root, 90);

  // Registre par chemin (pour résoudre les liens, qui sont des chemins absolus)
  const byPath = new Map();
  const cores = [];
  const collect = (n, parent) => {
    n._parent = parent;
    if (n.path) byPath.set(n.path, n);
    if (n.type === 'DIRECTORY') cores.push(n);
    const siblings = n.children;
    for (const idx in siblings) {
      const c = siblings[idx];
      c._siblingIndex = +idx;
      collect(c, n);
    }
  };
  collect(root, null);
  root._siblingIndex = 0;

  // Relief vertical : chaque nœud flotte en strate selon sa profondeur —
  // les amas de dossiers profonds s'élèvent, donnant du volume au champ.
  // Centré sur z=0 : les strates basses plongent en négatif, on creuse la
  // profondeur de part et d'autre du plan du regard.
  let maxDepth = 0;
  for (const n of byPath.values()) maxDepth = Math.max(maxDepth, n.depth || 0);
  maxDepth = Math.max(maxDepth, root.depth || 0);
  const STEP = 14;
  for (const n of byPath.values()) n._z = ((n.depth || 0) - maxDepth / 2) * STEP;
  root._z = ((root.depth || 0) - maxDepth / 2) * STEP;

  // La racine est elle aussi un cœur (chef-lieu aux coordonnées 0,0)
  root._hue = 0.10;
  cores.push(root);

  // Teinte de chaque cœur, et notes = braises
  const notes = [];
  for (const n of byPath.values()) {
    if (n.type !== 'MARKDOWN_FILE') continue;
    if (!n._parent) continue; // sécurité : une note a toujours un dossier
    let hue = (hashStr(n._parent.path || n._parent.name) % 1000) / 1000;
    const jitter = ((hashStr(n.path) % 40) - 20) / 500;
    n.hue = (hue + jitter + 1) % 1;
    n.degree = 0;
    notes.push(n);
  }
  for (const n of byPath.values()) if (n.type === 'DIRECTORY') n._hue = (hashStr(n.path || n.name) % 1000) / 1000;

  // Ancrage de chaque note auprès de son cœur (angle + rayon), indexé parmi
  // les SEULES notes du cœur (l'ordre des frères dossiers ne compte pas).
  const filesByCore = new Map();
  for (const core of [root, ...cores]) {
    filesByCore.set(core, core.children.filter(c => c.type === 'MARKDOWN_FILE'));
  }
  const seq = new Map();
  for (const note of notes) {
    const core = note._parent;
    const files = filesByCore.get(core);
    const i = seq.get(core) || 0;
    seq.set(core, i + 1);
    const n = Math.max(files.length, 1);
    const spread = Math.max(4, (core._spread || 20) * 0.55);
    note._anchor = {
      angle: GOLDEN * i,
      r: spread * 0.9 * Math.sqrt((i + 0.5) / n),
      wobble: hashStr(note.path) % 6283 / 1000,
    };
  }

  // Liens : chemins absolus → braises, arêtes uniques non orientées
  const edges = [];
  const seen = new Set();
  for (const note of notes) {
    for (const target of note.links || []) {
      const t = byPath.get(target);
      if (!t || t.type !== 'MARKDOWN_FILE' || t === note) continue;
      const key = [note.path, t.path].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: note, b: t });
      note.degree++;
      t.degree++;
    }
  }

  const degreeMax = Math.max(1, ...notes.map(n => n.degree));

  return { root, byPath, cores, notes, edges, degreeMax };
}