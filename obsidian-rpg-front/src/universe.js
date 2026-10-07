const API_BASE = '/api';

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function fetchUniverse() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}/universe`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function buildDemoWorld() {
  const md = (name, size, links = []) => ({
    id: name,
    name,
    path: `/demo/${name}.md`,
    type: 'MARKDOWN_FILE',
    depth: 2,
    markdownCount: 0,
    size: size * 1024,
    links,
    children: [],
  });
  const dir = (name, children) => ({
    id: name,
    name,
    path: `/demo/${name}`,
    type: 'DIRECTORY',
    depth: 1,
    markdownCount: children.filter(c => c.type === 'MARKDOWN_FILE').length,
    size: 0,
    links: [],
    children,
  });

  return {
    name: 'Vault Démos',
    children: [
      dir('Forêt des souvenirs', [
        md('La clé de voûte', 42),
        md('Brouillard', 18),
        md('Sentier de brume', 96, ['/demo/Brouillard.md', '/demo/La clé de voûte.md']),
        dir('Clairière', [
          md('Fleur de lune', 61, ['/demo/Brouillard.md']),
          md('Pierre gravée', 7),
        ]),
      ]),
      dir('Caves de l’archive', [
        md('Tablette oubliée', 221, ['/demo/Fleur de lune.md']),
        md('Registre des ombres', 154),
        dir('Abysses', [
          md('Rumeur ancienne', 33),
          md('Écho des murs', 88),
        ]),
      ]),
      dir('Atelier du scribe', [
        md('Encres et cartouches', 45),
        md('Grammaire des runes', 310, ['/demo/Tablette oubliée.md']),
      ]),
      dir('Tour de guet', [
        md('Carte du royaume', 540),
      ]),
    ],
  };
}

export const RARITY = {
  commune: { label: 'commune', xp: 1 },
  rare: { label: 'rare', xp: 2 },
  legendaire: { label: 'légendaire', xp: 4 },
};

// Indexe l'arbre et dérive tout ce que le jeu exploite : profondeur, rétroliens,
// rareté (selon la taille relative), orphelins et totaux de notes par dossier.
// Dossiers cachés (.obsidian, .idea, .trash…) et dossiers sans aucune note :
// ils ne feraient que des portes vers des salles vides.
function prune(n) {
  n.children = (n.children || []).filter(c => {
    if (c.type === 'MARKDOWN_FILE') return true;
    if ((c.name || '').startsWith('.')) return false;
    prune(c);
    return c.children.length > 0;
  });
}

export function buildWorld(root) {
  prune(root);
  const byPath = new Map();
  const notes = [];
  const dirs = [];

  const walk = (n, parent) => {
    n.children = n.children || [];
    n._parent = parent;
    n._depth = parent ? parent._depth + 1 : 0;
    n._key = n.path || n.id || n.name;
    if (n._key) byPath.set(n._key, n);
    if (n.type === 'MARKDOWN_FILE') notes.push(n);
    else dirs.push(n);
    for (const c of n.children) walk(c, n);
  };
  walk(root, null);

  for (const n of notes) {
    n._links = [];
    n._backlinks = [];
  }
  for (const n of notes) {
    const seen = new Set();
    for (const link of n.links || []) {
      const t = byPath.get(link);
      if (!t || t === n || t.type !== 'MARKDOWN_FILE' || seen.has(t)) continue;
      seen.add(t);
      n._links.push(t);
      t._backlinks.push(n);
    }
  }

  const sizes = notes.map(n => n.size || 0).sort((a, b) => a - b);
  const at = q => sizes[Math.floor(q * (sizes.length - 1))];
  const p75 = sizes.length >= 4 ? at(0.75) : Infinity;
  const p95 = sizes.length >= 10 ? at(0.95) : Infinity;
  for (const n of notes) {
    const s = n.size || 0;
    n._rarity = s > 0 && s >= p95 ? 'legendaire' : s > 0 && s >= p75 ? 'rare' : 'commune';
    n._orphan = n._links.length === 0 && n._backlinks.length === 0;
  }

  const total = n => {
    if (n.type === 'MARKDOWN_FILE') return 1;
    n._direct = 0;
    n._total = 0;
    for (const c of n.children) {
      if (c.type === 'MARKDOWN_FILE') n._direct++;
      n._total += total(c);
    }
    return n._total;
  };
  total(root);

  return { root, byPath, notes, dirs };
}

export function isAncestor(a, b) {
  for (let p = b; p; p = p._parent) if (p === a) return true;
  return false;
}

// Enfant direct de `ancestor` sur le chemin qui mène à `node`.
export function childToward(ancestor, node) {
  let p = node;
  while (p && p._parent !== ancestor) p = p._parent;
  return p || null;
}
