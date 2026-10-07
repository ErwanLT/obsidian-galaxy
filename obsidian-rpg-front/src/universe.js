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

export function buildWorld(root) {
  const byPath = new Map();
  const walk = (n, parent) => {
    n._parent = parent;
    n._key = n.path || n.id || n.name;
    if (n._key) byPath.set(n._key, n);
    for (const c of n.children || []) walk(c, n);
  };
  walk(root, null);
  return { root, byPath };
}