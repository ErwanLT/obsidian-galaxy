import { describe, expect, it } from 'vitest';
import { buildCore, lithologies, flatten, stripTitle, publishedAt } from '../src/data.js';
import { layoutTray, layerAt, fitScale, thickness, MIN_LAYER } from '../src/layout.js';
import { matcher } from '../src/filter.js';
import { obsidianUrl, relativeAge } from '../src/panel.js';

const V = '/v/Vault';
const note = (path, props = {}, extra = {}) => ({
  type: 'MARKDOWN_FILE',
  name: path.split('/').pop(),
  path: `${V}/${path}.md`,
  words: 100,
  links: [],
  tags: [],
  properties: props,
  children: [],
  ...extra,
});
const dir = (name, children) => ({ type: 'DIRECTORY', name, path: `${V}/${name}`, children });

function universe() {
  return {
    name: 'Vault',
    children: [
      dir('Back', [
        note('Back/a', { published_at: '2026-03-01' }, { links: [`${V}/Back/b.md`, `${V}/Back/b.md`, `${V}/IA/c.md`] }),
        note('Back/b', { published_at: '2025-01-10' }, { words: 400 }),
        note('Back/brouillon', { status: 'Draft' }),
      ]),
      dir('IA', [note('IA/c', { published_at: '2026-03-02', title: 'Le titre C' }, { tags: ['IA', 'llm/claude'] })]),
      note('orpheline'),
      dir('.obsidian', [note('.obsidian/x')]),
    ],
  };
}

describe('données', () => {
  it('lit la date de publication et ignore les dates invalides', () => {
    expect(publishedAt({ properties: { published_at: '2026-03-01' } })).toBe(Date.UTC(2026, 2, 1, 12));
    expect(publishedAt({ properties: { published_at: 'bientôt' } })).toBeNull();
    expect(publishedAt({})).toBeNull();
  });

  it('empile meubles, strates (récentes en haut) puis socle', () => {
    const core = buildCore(universe());
    expect(core.layers.map(l => l.node.name)).toEqual(['brouillon', 'c', 'a', 'b', 'orpheline']);
    expect(core.layers.map(l => l.zone)).toEqual(['meuble', 'strate', 'strate', 'strate', 'socle']);
    expect(core.layers[1].name).toBe('Le titre C');
    const [, , a] = core.layers;
    expect(a.from).toBe(200);
    expect(a.to).toBe(300);
    expect(core.totalWords).toBe(800);
  });

  it('dédoublonne les liens et renseigne les deux sens', () => {
    const core = buildCore(universe());
    const a = core.layers.find(l => l.node.name === 'a');
    const b = core.layers.find(l => l.node.name === 'b');
    expect(a.out.map(l => l.node.name)).toEqual(['b', 'c']);
    expect(b.in).toEqual([a]);
    expect(core.links).toBe(2);
  });

  it('repère les lacunes de plus de deux mois', () => {
    const core = buildCore(universe());
    expect(core.hiatuses).toHaveLength(1);
    expect(core.hiatuses[0].older.node.name).toBe('b');
    expect(core.hiatuses[0].days).toBeGreaterThan(400);
  });

  it('découpe les dossiers dominants en sous-dossiers et regroupe les rares', () => {
    const notes = [
      ...Array.from({ length: 6 }, (_, i) => ({ folders: ['Back', 'Java'], i })),
      ...Array.from({ length: 6 }, (_, i) => ({ folders: ['Back', 'Quarkus'], i })),
      ...Array.from({ length: 4 }, (_, i) => ({ folders: ['IA'], i })),
      { folders: ['Cloud'] },
    ];
    const { groups, of } = lithologies(notes);
    expect(groups.map(g => g.key).sort()).toEqual(['Back/Java', 'Back/Quarkus', 'IA', 'divers']);
    expect(of(notes.at(-1)).key).toBe('divers');
  });

  it('ignore les dossiers cachés', () => {
    expect(flatten(universe()).some(n => n.node.name === 'x')).toBe(false);
  });

  it("retire le titre en tête d'extrait", () => {
    expect(stripTitle('La Taverne GraphQL : découvrir GraphQL Dans les auberges…', ['La Taverne GraphQL : découvrir GraphQL']))
      .toBe('Dans les auberges…');
    expect(stripTitle('Autre chose', ['Titre'])).toBe('Autre chose');
  });
});

describe('mise en caisse', () => {
  it("l'échelle remplit la longueur demandée", () => {
    const layers = [{ words: 0 }, { words: 100 }, { words: 900 }];
    const k = fitScale(layers, 500);
    const total = layers.reduce((s, l) => s + thickness(l, k), 0);
    expect(total).toBeCloseTo(500, 0);
    expect(thickness(layers[0], k)).toBe(MIN_LAYER);
  });

  it('coupe une couche à cheval sur deux tronçons et retrouve la couche sous le pointeur', () => {
    const core = buildCore(universe());
    const tray = layoutTray(core, 3 * 64 + 2 * 34, 200, { minMedian: 0 });
    expect(tray.columns.length).toBeGreaterThan(1);
    const pieces = core.layers.flatMap(l => l.pieces);
    const covered = pieces.reduce((s, p) => s + p.y1 - p.y0, 0);
    expect(covered).toBeCloseTo(tray.total - 10, 3);   // le jeu des meubles n'est pas une couche
    const split = core.layers.find(l => l.pieces.length > 1);
    expect(split.pieces[0].cutBottom).toBe(true);
    const p = core.layers[2].pieces[0];
    expect(layerAt(tray, p.x + 5, (p.y0 + p.y1) / 2)).toBe(core.layers[2]);
    expect(layerAt(tray, p.x + 64 + 10, p.y0)).toBeNull();
  });
});

describe('filtre', () => {
  const core = buildCore(universe());
  const names = q => core.layers.filter(matcher(q)).map(l => l.node.name);
  it('par #tag, y compris les tags imbriqués', () => {
    expect(names('#llm')).toEqual(['c']);
    expect(names('#ia')).toEqual(['c']);
  });
  it('par dossier, guillemets compris', () => {
    expect(names('dossier:Back')).toEqual(['brouillon', 'a', 'b']);
    expect(names('dossier:"Back"')).toEqual(['brouillon', 'a', 'b']);
  });
  it('par mots, sans accents ni casse', () => {
    expect(names('TITRE')).toEqual(['c']);
    expect(matcher('  ')).toBeNull();
  });
});

describe('fiche', () => {
  it('construit le lien obsidian:// relatif au vault', () => {
    const l = { path: '/Users/me/Obsidian Vault/Back/Java/Note é.md' };
    expect(obsidianUrl('Obsidian Vault', l)).toBe('obsidian://open?vault=Obsidian%20Vault&file=Back%2FJava%2FNote%20%C3%A9');
  });
  it("exprime l'âge en français", () => {
    const now = Date.UTC(2026, 9, 7);
    expect(relativeAge(now - 3 * 86_400_000, now)).toBe('il y a 3 jours');
    expect(relativeAge(now - 400 * 86_400_000, now)).toBe("l’année dernière");
  });
});
