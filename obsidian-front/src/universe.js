/**
 * universe.js — Data layer
 * Fetches vault hierarchy from obsidian-back and maps it to visual space types.
 */

const API_BASE = 'http://localhost:8080';

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
    case 3: return VisualType.STAR;
    case 4: return VisualType.PLANET;
    case 5: return VisualType.DWARF_PLANET;
    default: return VisualType.SMALL_BODY;
  }
}

/** Recursively annotate every node with .visualType */
export function annotate(node) {
  node.visualType = getVisualType(node);
  if (node.children) node.children.forEach(annotate);
  return node;
}

/** Fetch and annotate the full universe from the API */
export async function fetchUniverse() {
  const url = `${API_BASE}/api/universe`;
  console.log(`[fetchUniverse] Fetching from URL: ${url}`);
  try {
    const res = await fetch(url);
    console.log(`[fetchUniverse] Response received. Status: ${res.status} (${res.statusText})`);
    console.log(`[fetchUniverse] Response URL: ${res.url}`);
    console.log(`[fetchUniverse] Content-Type Header:`, res.headers.get('content-type'));

    const text = await res.text();
    console.log(`[fetchUniverse] Raw response preview (first 200 chars):`, text.substring(0, 200));

    // Try parsing as JSON
    const data = JSON.parse(text);
    data.children = data.children.map(annotate);
    return data;
  } catch (err) {
    console.error(`[fetchUniverse] Error during fetch/parse:`, err);
    throw err;
  }
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