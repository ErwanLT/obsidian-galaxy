import { describe, it, expect } from 'vitest';
import { buildWorld, buildDemoWorld } from '../src/universe.js';
import { RELICS, assignRelics, relicCounts } from '../src/relics.js';
import { pickDaily, today } from '../src/daily.js';

function vault(nLegend) {
  const children = Array.from({ length: 200 }, (_, i) => ({
    name: `n${i}`, path: `/v/n${i}.md`, type: 'MARKDOWN_FILE', size: (i < nLegend ? 10000 : 1 + (i % 50)) * 1024,
  }));
  return buildWorld({ name: 'v', children });
}

describe('reliques', () => {
  it('donne une relique à chaque légendaire, toutes différentes avant de se répéter', () => {
    const w = vault(14);
    assignRelics(w);
    const legend = w.notes.filter(n => n._rarity === 'legendaire');
    expect(legend.length).toBeGreaterThan(RELICS.length);
    const ids = legend.map(n => n._relic);
    expect(new Set(ids).size).toBe(RELICS.length);
    for (const r of RELICS.filter(x => !x.stack)) expect(ids.filter(id => id === r.id)).toHaveLength(1);
    expect(w.notes.filter(n => n._rarity !== 'legendaire').every(n => !n._relic)).toBe(true);
  });

  it('compte les reliques des notes collectées, de façon stable', () => {
    const a = vault(14);
    const b = vault(14);
    assignRelics(a);
    assignRelics(b);
    expect(a.notes.map(n => n._relic)).toEqual(b.notes.map(n => n._relic));
    const legend = a.notes.filter(n => n._relic);
    const counts = relicCounts(a.byPath, legend.slice(0, 3).map(n => n.path));
    expect(Object.values(counts).reduce((x, y) => x + y, 0)).toBe(3);
  });
});

describe('notes du jour', () => {
  const w = buildWorld(buildDemoWorld());
  it('sont stables pour une date et changent d’un jour à l’autre', () => {
    const a = pickDaily(w.notes, new Set(), '2026-10-07');
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(pickDaily(w.notes, new Set(), '2026-10-07')).toEqual(a);
    expect(pickDaily(w.notes, new Set(), '2026-10-08')).not.toEqual(a);
  });

  it('mêlent révision (déjà collectées) et découverte', () => {
    const collected = new Set(w.notes.slice(0, 6).map(n => n.path));
    const picked = pickDaily(w.notes, collected, '2026-10-07');
    expect(picked.filter(p => collected.has(p))).toHaveLength(2);
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
