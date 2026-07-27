/**
 * universe.js — Data layer
 * Fetches vault hierarchy from obsidian-back and maps it to visual space types.
 */

const API_BASE = '';

export const NodeType = { DIRECTORY: 'DIRECTORY', MARKDOWN_FILE: 'MARKDOWN_FILE' };
export const VisualType = { GALAXY: 'galaxy', SOLAR_SYSTEM: 'solar-system', PLANET: 'planet', MOON: 'moon' };

/** Map a node to its visual space type */
export function getVisualType(node) {
  if (node.type === NodeType.MARKDOWN_FILE) return VisualType.MOON;
  switch (node.depth) {
    case 0: return VisualType.GALAXY;
    case 1: return VisualType.SOLAR_SYSTEM;
    default: return VisualType.PLANET;
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
  [VisualType.GALAXY]:       '🌌',
  [VisualType.SOLAR_SYSTEM]: '☀️',
  [VisualType.PLANET]:       '🪐',
  [VisualType.MOON]:         '🌙',
};

export const TYPE_LABEL = {
  [VisualType.GALAXY]:       'Galaxie',
  [VisualType.SOLAR_SYSTEM]: 'Système Solaire',
  [VisualType.PLANET]:       'Planète',
  [VisualType.MOON]:         'Lune',
};

/** Couleur d'accent par type — reprise dans le HUD (pastilles, légende,
 *  badges) et dans les labels 3D pour que les deux se répondent. */
export const TYPE_COLOR = {
  [VisualType.GALAXY]:       '#A78BFA',
  [VisualType.SOLAR_SYSTEM]: '#22D3EE',
  [VisualType.PLANET]:       '#FBBF24',
  [VisualType.MOON]:         '#34D399',
};
