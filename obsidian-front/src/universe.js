/**
 * universe.js — Data layer
 * Fetches vault hierarchy from obsidian-back and maps it to visual space types.
 */

// Passe par le proxy Vite (/api → obsidian-back) : même origine, pas de CORS.
const API_BASE = '/api';

export const NodeType = { DIRECTORY: 'DIRECTORY', MARKDOWN_FILE: 'MARKDOWN_FILE' };

/**
 * Taxonomie astrophysique réaliste, du plus grand au plus petit :
 * superamas → amas → galaxie → étoile → planète → planète naine → petit corps,
 * et lune pour les notes (.md).
 */
export const VisualType = {
  SUPERCLUSTER: 'supercluster',
  CLUSTER: 'cluster',
  GALAXY: 'galaxy',
  STAR: 'star',
  PLANET: 'planet',
  DWARF_PLANET: 'dwarf-planet',
  SMALL_BODY: 'small-body',
  MOON: 'moon',
};

/** Map a node to its visual space type (by directory depth) */
export function getVisualType(node) {
  if (node.type === NodeType.MARKDOWN_FILE) return VisualType.MOON;
  switch (node.depth) {
    case 0: return VisualType.SUPERCLUSTER;
    case 1: return VisualType.CLUSTER;
    case 2: return VisualType.GALAXY;
    // Au-delà de la galaxie, tout dossier est une planète texturée : dans un
    // vault réel les dossiers profonds (topics) valent bien des planètes, et
    // c'est ce niveau qui rend les planètes uniques visibles.
    default: return VisualType.PLANET;
  }
}

/** Recursively annotate every node with .visualType */
export function annotate(node) {
  node.visualType = getVisualType(node);
  if (node.children) node.children.forEach(annotate);
  return node;
}

// Dossiers cachés (.obsidian, .idea, .trash…) et dossiers sans aucune note :
// ils ne feraient que des astres vides.
export function prune(node) {
  node.children = (node.children || []).filter(c => {
    if (c.type === NodeType.MARKDOWN_FILE) return true;
    if ((c.name || '').startsWith('.')) return false;
    prune(c);
    return c.children.length > 0;
  });
  return node;
}

/**
 * Rareté d'une note selon sa taille relative dans le vault (même règle que le
 * RPG) : top 5 % légendaire, top 25 % rare.
 */
export function rankNotes(root) {
  const notes = [];
  const walk = n => {
    if (n.type === NodeType.MARKDOWN_FILE) notes.push(n);
    (n.children || []).forEach(walk);
  };
  walk(root);
  const sizes = notes.map(n => n.size || 0).sort((a, b) => a - b);
  const at = q => sizes[Math.floor(q * (sizes.length - 1))];
  const p75 = sizes.length >= 4 ? at(0.75) : Infinity;
  const p95 = sizes.length >= 10 ? at(0.95) : Infinity;
  for (const n of notes) {
    const sz = n.size || 0;
    n.rarity = sz > 0 && sz >= p95 ? 'legendaire' : sz > 0 && sz >= p75 ? 'rare' : 'commune';
  }
}

/**
 * Index du vault, construit une fois : parent de chaque nœud, accès par chemin,
 * liens sortants/entrants résolus en nœuds. Évite de reparcourir les listes de
 * liens à chaque vue (la détection des liens comparait chaque paire d'astres).
 */
export function indexUniverse(data) {
  const byPath = new Map();
  const notes = [];
  const walk = (n, parent) => {
    n._parent = parent;
    if (n.path) byPath.set(n.path, n);
    if (n.type === NodeType.MARKDOWN_FILE) notes.push(n);
    (n.children || []).forEach(c => walk(c, n));
  };
  walk(data, null);
  for (const n of notes) {
    n._out = [];
    n._in = [];
  }
  for (const n of notes) {
    const seen = new Set();
    for (const link of n.links || []) {
      const t = byPath.get(link);
      if (!t || t === n || t.type !== NodeType.MARKDOWN_FILE || seen.has(t)) continue;
      seen.add(t);
      n._out.push(t);
      t._in.push(n);
    }
  }
  // Ancienneté : rang de chaque note selon sa dernière modification (0 = la plus
  // récente, 1 = la plus ancienne). Absent si le back ne fournit pas les dates.
  const dated = notes.filter(n => n.modified > 0).sort((a, b) => b.modified - a.modified);
  dated.forEach((n, i) => { n._ageRank = dated.length > 1 ? i / (dated.length - 1) : 0; });
  const created = notes.map(n => n.created).filter(t => t > 0);
  const timeline = created.length ? { from: Math.min(...created), to: Math.max(...created) } : null;
  const tagCount = new Map();
  for (const n of notes) {
    for (const t of n.tags || []) {
      const key = t.toLowerCase();
      tagCount.set(key, { tag: t, count: (tagCount.get(key)?.count || 0) + 1 });
    }
  }
  const tags = [...tagCount.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  // Racine du vault : dossier parent des premières entrées (sert aux URL courtes).
  const first = (data.children || []).find(c => c.path);
  const vaultDir = first ? first.path.replace(/[\\/][^\\/]*$/, '') : '';
  data._index = { byPath, notes, vaultDir, hasDates: dated.length > 0, timeline, tags };
  return data;
}

/** Ancêtres d'un nœud, de la racine (exclue) au parent direct. */
export function ancestorsOf(node) {
  const out = [];
  for (let p = node._parent; p && p._parent; p = p._parent) out.unshift(p);
  return out;
}

function prepare(data) {
  prune(data);
  data.children = data.children.map(annotate);
  rankNotes(data);
  indexUniverse(data);
  return data;
}

/** Fetch and annotate the full universe from the API */
export async function fetchUniverse() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE}/universe`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return prepare(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Petit univers fictif, pour explorer sans le back. */
export function demoUniverse() {
  const DAY = 86400000;
  const now = Date.now();
  const md = (dir, name, kb, depth, links = [], tags = [], ageDays = kb) => ({
    id: `${dir}/${name}`, name, path: `/demo/${dir}/${name}.md`, type: NodeType.MARKDOWN_FILE,
    depth, markdownCount: 0, size: kb * 1024, links: links.map(l => `/demo/${l}.md`), children: [],
    tags, words: kb * 140, excerpt: `Note de démonstration « ${name} » : quelques lignes pour illustrer l'extrait affiché dans le panneau.`,
    created: now - (ageDays + 30) * DAY, modified: now - ageDays * DAY,
  });
  const dir = (path, depth, children) => ({
    id: path, name: path.split('/').pop(), path: `/demo/${path}`, type: NodeType.DIRECTORY, depth,
    markdownCount: children.reduce((a, c) => a + (c.type === NodeType.MARKDOWN_FILE ? 1 : c.markdownCount), 0),
    size: 0, links: [], children,
  });
  return prepare({
    name: 'Vault démo',
    children: [
      dir('Projets', 0, [
        md('Projets', 'Roadmap', 24, 1, ['Projets/Idées', 'Lectures/Clean Code'], ['projet', 'planning'], 2),
        md('Projets', 'Idées', 9, 1),
        dir('Projets/Galaxie', 1, [
          md('Projets/Galaxie', 'Rendu 3D', 41, 2, ['Lectures/Shaders'], ['3d', 'projet'], 5),
          md('Projets/Galaxie', 'Navigation', 18, 2, ['Projets/Galaxie/Rendu 3D']),
          dir('Projets/Galaxie/Archives', 2, [md('Projets/Galaxie/Archives', 'V1', 6, 3)]),
        ]),
      ]),
      dir('Lectures', 0, [
        md('Lectures', 'Clean Code', 33, 1),
        md('Lectures', 'Shaders', 57, 1, ['Projets/Galaxie/Rendu 3D'], ['3d', 'lecture'], 200),
        md('Lectures', 'DDD', 12, 1),
      ]),
      dir('Journal', 0, [md('Journal', '2026-10-07', 3, 1, ['Projets/Roadmap']), md('Journal', '2026-10-06', 4, 1)]),
    ],
  });
}

export const TYPE_EMOJI = {
  [VisualType.SUPERCLUSTER]: '🕸️',
  [VisualType.CLUSTER]:      '🌠',
  [VisualType.GALAXY]:       '🌌',
  [VisualType.STAR]:         '☀️',
  [VisualType.PLANET]:       '🪐',
  [VisualType.DWARF_PLANET]: '🪨',
  [VisualType.SMALL_BODY]:   '☄️',
  [VisualType.MOON]:         '🌙',
};

export const TYPE_LABEL = {
  [VisualType.SUPERCLUSTER]: 'Superamas',
  [VisualType.CLUSTER]:      'Amas de galaxies',
  [VisualType.GALAXY]:       'Galaxie',
  [VisualType.STAR]:         'Système stellaire',
  [VisualType.PLANET]:       'Planète',
  [VisualType.DWARF_PLANET]: 'Planète naine',
  [VisualType.SMALL_BODY]:   'Petit corps',
  [VisualType.MOON]:         'Lune',
};

/** Couleur d'accent par type — reprise dans le HUD (pastilles, légende,
 *  badges) et dans les labels 3D pour que les deux se répondent. */
export const TYPE_COLOR = {
  [VisualType.SUPERCLUSTER]: '#6D28D9',
  [VisualType.CLUSTER]:      '#8B5CF6',
  [VisualType.GALAXY]:       '#A78BFA',
  [VisualType.STAR]:         '#22D3EE',
  [VisualType.PLANET]:       '#FBBF24',
  [VisualType.DWARF_PLANET]: '#F9A8D4',
  [VisualType.SMALL_BODY]:   '#9CA3AF',
  [VisualType.MOON]:         '#34D399',
};