// Du vault à la carotte : notes datées, lithologies, liens, lacunes.
// Calcul pur, sans DOM : testable et indépendant du rendu.

const DAY = 86_400_000;
// Au-delà de cet écart entre deux publications, la carotte montre une lacune.
export const HIATUS_DAYS = 60;
// 1 mot déposé = 1 mm de sédiment.
export const MM_PER_WORD = 1;

export async function fetchUniverse() {
  const res = await fetch('/api/universe');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Date de dépôt : `published_at` du frontmatter, sinon rien (brouillon ou socle). */
export function publishedAt(node) {
  const raw = node.properties?.published_at;
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const t = Date.parse(`${raw.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

export function isDraft(node) {
  return /^draft$/i.test(node.properties?.status || '');
}

/** Toutes les notes, avec leur chemin de dossiers depuis la racine du vault. */
export function flatten(universe) {
  const notes = [];
  const walk = (node, folders) => {
    if (node.type === 'MARKDOWN_FILE') {
      notes.push({ node, folders });
      return;
    }
    if (node.name.startsWith('.')) return;
    for (const c of node.children || []) walk(c, [...folders, node.name]);
  };
  for (const c of universe.children || []) walk(c, []);
  return notes;
}

/**
 * Lithologies : regroupe les notes par dossier, en découpant les dossiers trop
 * gros (plus d'un quart du vault) en leurs sous-dossiers. Les petits groupes
 * restent dans leur parent. Fonctionne pour n'importe quel vault.
 */
export function lithologies(notes, { share = 0.25, min = 5, rare = 3 } = {}) {
  const total = notes.length;
  const keyOf = new Map(notes.map(n => [n, n.folders.slice(0, 1).join('/') || '(racine)']));
  for (let depth = 1; depth < 4; depth++) {
    const counts = countBy(notes, n => keyOf.get(n));
    for (const [key, count] of counts) {
      if (count <= total * share || key.split('/').length !== depth) continue;
      const members = notes.filter(n => keyOf.get(n) === key);
      const sub = countBy(members, n => n.folders.slice(0, depth + 1).join('/'));
      for (const n of members) {
        const k = n.folders.slice(0, depth + 1).join('/');
        if (n.folders.length > depth && sub.get(k) >= min) keyOf.set(n, k);
      }
    }
  }
  // Les dossiers presque vides rejoignent « divers » : la palette reste lisible.
  const sizes = countBy(notes, n => keyOf.get(n));
  for (const n of notes) if (sizes.get(keyOf.get(n)) < rare) keyOf.set(n, 'divers');
  const groups = [...countBy(notes, n => keyOf.get(n))]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], i) => ({ key, name: key.split('/').pop(), count, index: i }));
  const byKey = new Map(groups.map(g => [g.key, g]));
  return { groups, of: n => byKey.get(keyOf.get(n)) };
}

function countBy(list, f) {
  const m = new Map();
  for (const x of list) m.set(f(x), (m.get(f(x)) || 0) + 1);
  return m;
}

/**
 * La carotte, de la surface vers le fond :
 *   1. sédiments meubles (brouillons), du plus récent au plus ancien modifié ;
 *   2. strates datées, de la plus récente à la plus ancienne ;
 *   3. socle : notes sans date ni statut de brouillon.
 * Chaque couche connaît sa position cumulée en mots (`from`, `to`).
 */
export function buildCore(universe) {
  const notes = flatten(universe);
  const litho = lithologies(notes);
  const layers = notes.map((note, i) => {
    const { node, folders } = note;
    const date = publishedAt(node);
    const zone = date != null ? 'strate' : isDraft(node) ? 'meuble' : 'socle';
    return {
      id: i,
      node,
      name: node.properties?.title || node.name,
      path: node.path,
      folders,
      litho: litho.of(note),
      date,
      zone,
      words: node.words || 0,
      tags: node.tags || [],
      excerpt: stripTitle(node.excerpt || '', [node.properties?.title, node.name]),
      sourceUrl: node.properties?.source_url || null,
      out: [],
      in: [],
    };
  });
  const rank = { meuble: 0, strate: 1, socle: 2 };
  layers.sort((a, b) =>
    rank[a.zone] - rank[b.zone]
    || (b.date ?? b.node.modified ?? 0) - (a.date ?? a.node.modified ?? 0)
    || a.name.localeCompare(b.name, 'fr'));

  let at = 0;
  layers.forEach((l, i) => {
    l.index = i;
    l.from = at;
    at += l.words;
    l.to = at;
  });

  // Liens : chemins absolus côté back.
  const byPath = new Map(layers.map(l => [l.path, l]));
  let links = 0;
  for (const l of layers) {
    for (const p of new Set(l.node.links || [])) {
      const t = byPath.get(p);
      if (!t || t === l) continue;
      l.out.push(t);
      t.in.push(l);
      links++;
    }
  }

  // Fossiles directeurs : les notes les plus citées.
  const cited = [...layers].filter(l => l.in.length >= 4).sort((a, b) => b.in.length - a.in.length).slice(0, 8);
  for (const l of cited) l.fossil = true;

  // Lacunes : longs silences entre deux strates consécutives.
  const hiatuses = [];
  for (let i = 1; i < layers.length; i++) {
    const a = layers[i - 1], b = layers[i];
    if (a.zone !== 'strate' || b.zone !== 'strate') continue;
    const days = Math.round((a.date - b.date) / DAY);
    if (days > HIATUS_DAYS) hiatuses.push({ index: i, days, at: b.from, newer: a, older: b });
  }

  const dated = layers.filter(l => l.zone === 'strate');
  return {
    name: universe.name,
    layers,
    groups: litho.groups,
    hiatuses,
    links,
    totalWords: at,
    span: dated.length ? { newest: dated[0].date, oldest: dated.at(-1).date } : null,
    counts: countBy(layers, l => l.zone),
    hasDates: dated.length > 0,
  };
}

/** L'extrait commence souvent par le titre de la note (son # Titre) : on l'enlève. */
export function stripTitle(excerpt, titles) {
  const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  for (const t of titles) {
    if (!t) continue;
    // La ponctuation compte pour un mot de plus dans l'extrait (« Titre : suite »).
    const tokens = excerpt.split(/\s+/);
    const target = fold(t);
    for (let n = 1; n <= Math.min(tokens.length - 1, target.split(' ').length + 4); n++) {
      if (fold(tokens.slice(0, n).join(' ')) === target) return tokens.slice(n).join(' ');
    }
  }
  return excerpt;
}

/** Profondeur en mètres d'une position cumulée en mots. */
export const depthMeters = words => (words * MM_PER_WORD) / 1000;
