import { describe, it, expect } from 'vitest';
import { PERKS, rollPerks, perkTotal } from '../src/perks.js';
import { mulberry32 } from '../src/worldgen.js';

describe('dons', () => {
  it('propose 3 dons distincts', () => {
    const r = rollPerks({}, 3, mulberry32(1));
    expect(r).toHaveLength(3);
    expect(new Set(r.map(p => p.id)).size).toBe(3);
  });

  it('ne repropose pas un don au maximum', () => {
    const owned = Object.fromEntries(PERKS.filter(p => p.id !== 'blade').map(p => [p.id, p.max]));
    for (let s = 0; s < 20; s++) expect(rollPerks(owned, 3, mulberry32(s)).map(p => p.id)).toEqual(['blade']);
    owned.blade = 3;
    expect(rollPerks(owned)).toEqual([]);
    expect(perkTotal(owned)).toBe(PERKS.reduce((a, p) => a + p.max, 0));
  });
});
