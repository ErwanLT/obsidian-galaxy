import { describe, it, expect } from 'vitest';
import { demoUniverse, prune, rankNotes, indexUniverse, ancestorsOf, annotate } from '../src/universe.js';
import { orbitLayout, beltLayout, placeMoons, discLayout } from '../src/layout.js';
import { hashFor, nodeForHash } from '../src/url.js';
import { flattenUniverse, searchEntries, fold } from '../src/search.js';
import { kelvinColor, starTemperature, seededRandom, bodyRadius } from '../src/objects.js';
import { layoutConstellation } from '../src/constellation.js';

const md = (path, kb, links = []) => ({ name: path.split('/').pop(), path: `/vault/${path}.md`, type: 'MARKDOWN_FILE', size: kb * 1024, links: links.map(l => `/vault/${l}.md`), children: [] });
const dir = (path, children) => ({ name: path.split('/').pop(), path: `/vault/${path}`, type: 'DIRECTORY', depth: path.split('/').length - 1, markdownCount: 0, children });

function vault() {
  const data = {
    name: 'vault',
    children: [
      dir('.obsidian', [md('.obsidian/cfg', 1)]),
      dir('Vide', [dir('Vide/Sous', [])]),
      dir('Java', [md('Java/Intro', 4, ['Java/Spring/Boot']), dir('Java/Spring', [md('Java/Spring/Boot', 40, ['Java/Intro'])])]),
      dir('Été', [md('Été/Écho', 2)]),
      ...Array.from({ length: 10 }, (_, i) => md(`n${i}`, 1 + i)),
    ],
  };
  prune(data);
  data.children = data.children.map(annotate);
  rankNotes(data);
  return indexUniverse(data);
}

describe('données du vault', () => {
  const v = vault();
  const get = p => v._index.byPath.get(`/vault/${p}`);

  it('masque les dossiers cachés et vides', () => {
    expect(v.children.filter(c => c.type === 'DIRECTORY').map(c => c.name)).toEqual(['Java', 'Été']);
  });

  it('résout liens et rétroliens, et les ancêtres', () => {
    expect(get('Java/Intro.md')._out.map(n => n.name)).toEqual(['Boot']);
    expect(get('Java/Spring/Boot.md')._in.map(n => n.name)).toEqual(['Intro']);
    expect(ancestorsOf(get('Java/Spring/Boot.md')).map(n => n.name)).toEqual(['Java', 'Spring']);
    expect(v._index.vaultDir).toBe('/vault');
  });

  it('classe la note la plus lourde comme légendaire', () => {
    expect(get('Java/Spring/Boot.md').rarity).toBe('legendaire');
    expect(get('n0.md').rarity).toBe('commune');
  });
});

describe('URL', () => {
  const v = vault();
  it('fait l’aller-retour nœud → adresse → nœud, accents et espaces compris', () => {
    for (const n of [...v._index.notes, ...v.children]) {
      const h = hashFor(n, v._index.vaultDir);
      expect(h.startsWith('#/')).toBe(true);
      expect(nodeForHash(h, v._index)).toBe(n);
    }
    expect(hashFor(null, '/vault')).toBe('#/');
    expect(nodeForHash('#/inexistant', v._index)).toBeNull();
  });
});

describe('recherche', () => {
  const entries = flattenUniverse(vault());
  it('ignore les accents et la casse, début de nom en premier', () => {
    expect(fold('Écho Été')).toBe('echo ete');
    expect(searchEntries(entries, 'echo').map(e => e.node.name)).toEqual(['Écho']);
    const r = searchEntries(entries, 'n');
    expect(r[0].node.name.startsWith('n')).toBe(true);
    expect(searchEntries(entries, '   ')).toEqual([]);
  });
});

describe('disposition des orbites', () => {
  const ring = (pos, i) => Math.hypot(pos[i].x, pos[i].z);

  it('orbitLayout : un rayon par astre, sans chevauchement, et reproductible', () => {
    const sizes = [12, 4, 8, 6, 10];
    const a = orbitLayout(5, 40, 200, sizes, seededRandom(7));
    const b = orbitLayout(5, 40, 200, sizes, seededRandom(7));
    expect(a.positions.map(p => p.toArray())).toEqual(b.positions.map(p => p.toArray()));
    const radii = sizes.map((_, i) => ({ r: ring(a.positions, i), s: sizes[i] })).sort((x, y) => x.r - y.r);
    for (let k = 1; k < radii.length; k++) expect(radii[k].r - radii[k - 1].r).toBeGreaterThanOrEqual(radii[k].s + radii[k - 1].s);
  });

  it('beltLayout : une orbite propre à chaque corps, compacte, voisines éloignées en angle', () => {
    const n = 47;
    const sizes = Array.from({ length: n }, (_, i) => 5 + (i % 4));
    const { positions, planes, shapes } = beltLayout(n, 60, sizes, seededRandom(3));
    const radii = positions.map((_, i) => ring(positions, i));
    expect(new Set(radii.map(r => r.toFixed(3))).size).toBe(n);          // aucun rayon partagé
    expect(new Set(planes).size).toBe(n);                                  // un plan par corps
    expect(new Set(shapes.map(s => s.ecc.toFixed(5))).size).toBeGreaterThan(n * 0.9);
    const sorted = radii.slice().sort((a, b) => a - b);
    for (let k = 1; k < n; k++) expect(sorted[k] - sorted[k - 1]).toBeGreaterThan(2 - 1e-9);
    expect(sorted[n - 1] - sorted[0]).toBeLessThan(200);                   // reste compacte
    // Deux orbites voisines ne démarrent pas au même endroit.
    const byR = positions.map((p, i) => ({ p, r: radii[i] })).sort((a, b) => a.r - b.r);
    for (let k = 1; k < n; k++) expect(byR[k].p.distanceTo(byR[k - 1].p)).toBeGreaterThan(sizes[0]);
  });

  it('placeMoons : une orbite distincte par note, même au-delà du seuil', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, path: `/v/n${i}.md`, type: 'MARKDOWN_FILE', size: 2048, visualType: 'moon' }));
    const { positions } = placeMoons(files, 60, 130, seededRandom(1));
    const radii = new Set(positions.map((_, i) => ring(positions, i).toFixed(2)));
    expect(radii.size).toBe(files.length);
    expect(Math.min(...positions.map((_, i) => ring(positions, i)))).toBeGreaterThan(60);
    expect(files.map(bodyRadius).every(r => r > 0)).toBe(true);
  });

  it('discLayout répartit les dossiers racine sans doublon', () => {
    const pts = discLayout(10).map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    expect(new Set(pts).size).toBe(10);
  });
});

describe('réalisme', () => {
  it('température : naine rouge rouge, étoile chaude bleutée', () => {
    const red = kelvinColor(3000);
    const hot = kelvinColor(10000);
    expect(red.r).toBeGreaterThan(red.b);
    expect(hot.b).toBeGreaterThan(hot.r * 0.95);
    expect(starTemperature({ markdownCount: 0 })).toBeLessThan(starTemperature({ markdownCount: 150 }));
  });
});

describe('constellation', () => {
  it('positions finies, reproductibles, notes liées plus proches que la moyenne', () => {
    const v = demoUniverse();
    const notes = v._index.notes;
    const groups = [...v.children, v];
    const top = n => { let p = n; while (p._parent && p._parent._parent) p = p._parent; return p; };
    const groupOf = n => Math.max(0, groups.indexOf(top(n)));
    const a = layoutConstellation(notes, groupOf, groups);
    const b = layoutConstellation(notes, groupOf, groups);
    expect(a.map(p => p.toArray())).toEqual(b.map(p => p.toArray()));
    expect(a.every(p => Number.isFinite(p.x + p.y + p.z))).toBe(true);
    const idx = new Map(notes.map((n, i) => [n, i]));
    let linked = 0, nl = 0, all = 0, na = 0;
    notes.forEach((n, i) => {
      for (const t of n._out) { linked += a[i].distanceTo(a[idx.get(t)]); nl++; }
      notes.forEach((_, j) => { if (j > i) { all += a[i].distanceTo(a[j]); na++; } });
    });
    expect(linked / nl).toBeLessThan(all / na);
  });
});

describe('chemin entre deux notes', async () => {
  const { shortestPath } = await import('../src/graph.js');
  const mk = name => ({ name, _out: [], _in: [] });
  const link = (a, b) => { a._out.push(b); b._in.push(a); };
  const [a, b, c, d, e, iso] = ['a', 'b', 'c', 'd', 'e', 'iso'].map(mk);
  link(a, b); link(b, c); link(c, d); link(a, e); link(e, d);   // deux chemins a→d, longueur 3 et 2
  it('prend le plus court, dans les deux sens de lien', () => {
    expect(shortestPath(a, d).map(n => n.name)).toEqual(['a', 'e', 'd']);
    expect(shortestPath(d, a).map(n => n.name)).toEqual(['d', 'e', 'a']);
    expect(shortestPath(c, e).length).toBe(3);
  });
  it('renvoie la note seule vers elle-même, et rien sans chemin', () => {
    expect(shortestPath(a, a)).toEqual([a]);
    expect(shortestPath(a, iso)).toEqual([]);
  });
});

describe('mini-carte', async () => {
  const { radialLayout } = await import('../src/minimap.js');
  it('place chaque dossier, la racine au centre, plus loin à chaque niveau', () => {
    const v = demoUniverse();
    const pos = radialLayout(v);
    const dirs = [];
    const walk = n => { if (n.type !== 'MARKDOWN_FILE') { dirs.push(n); (n.children || []).forEach(walk); } };
    walk(v);
    expect(pos.size).toBe(dirs.length);
    const dist = n => Math.hypot(pos.get(n).x - 84, pos.get(n).y - 84);
    expect(dist(v)).toBe(0);
    for (const n of dirs) if (n._parent && n._parent !== v) expect(dist(n)).toBeGreaterThan(dist(n._parent));
  });
});
