import { describe, it, expect } from 'vitest';
import { buildWorld, buildDemoWorld, childToward } from '../src/universe.js';
import { generateRoom, DUNGEON } from '../src/worldgen.js';
import { folderProgress, questWaypoint, levelFromXp, xpForLevel, maxHpFor, searchNotes, lineOfSight } from '../src/nav.js';

const world = buildWorld(buildDemoWorld());
const node = path => world.byPath.get(path);

describe('buildWorld', () => {
  it('calcule liens, rétroliens, orphelins et totaux', () => {
    const brouillard = node('/demo/Brouillard.md');
    expect(brouillard._backlinks.map(n => n.name).sort()).toEqual(['Fleur de lune', 'Sentier de brume']);
    expect(node('/demo/Sentier de brume.md')._links).toHaveLength(2);
    expect(node('/demo/Pierre gravée.md')._orphan).toBe(true);
    expect(world.root._total).toBe(world.notes.length);
    expect(node('/demo/Forêt des souvenirs')._total).toBe(5);
    expect(node('/demo/Forêt des souvenirs')._direct).toBe(3);
  });

  it('attribue des raretés selon la taille relative', () => {
    expect(node('/demo/Carte du royaume.md')._rarity).toBe('legendaire');
    expect(node('/demo/Pierre gravée.md')._rarity).toBe('commune');
  });
});

describe('progression', () => {
  it('cumule les notes collectées par dossier', () => {
    const p = folderProgress(world.byPath, ['/demo/Fleur de lune.md', '/demo/Brouillard.md']);
    expect(p.total.get(node('/demo/Forêt des souvenirs'))).toBe(2);
    expect(p.direct.get(node('/demo/Forêt des souvenirs'))).toBe(1);
    expect(p.total.get(world.root)).toBe(2);
  });

  it('a une courbe de niveau croissante', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(2))).toBe(2);
    expect(levelFromXp(xpForLevel(5) - 1)).toBe(4);
    expect(maxHpFor(1)).toBe(5);
    expect(maxHpFor(50)).toBe(10);
  });
});

describe('quête', () => {
  const target = node('/demo/Fleur de lune.md');
  const roomOf = n => ({ ...generateRoom(n, { mode: DUNGEON }), node: n });

  it('descend vers le bon sous-dossier, remonte sinon, puis vise la note', () => {
    const foret = roomOf(node('/demo/Forêt des souvenirs'));
    const down = questWaypoint(foret, target);
    const portal = foret.portals.find(p => p.node === childToward(foret.node, target._parent));
    expect(down).toMatchObject({ x: portal.x, y: portal.y });

    const caves = roomOf(node('/demo/Caves de l’archive'));
    const up = questWaypoint(caves, target);
    const back = caves.portals.find(p => p.kind === 'back');
    expect(up).toMatchObject({ x: back.x, y: back.y });

    const clairiere = roomOf(target._parent);
    expect(questWaypoint(clairiere, target).kind).toBe('note');
  });
});

describe('outils', () => {
  it('cherche sans tenir compte des accents', () => {
    expect(searchNotes(world.notes, 'echo').map(n => n.name)).toEqual(['Écho des murs']);
  });

  it('bloque la vue derrière un mur', () => {
    const W = 5;
    const walls = new Uint8Array(25);
    walls[2 * W + 2] = 1;
    expect(lineOfSight(walls, W, 0.5, 2.5, 4, 2)).toBe(false);
    expect(lineOfSight(walls, W, 0.5, 2.5, 2, 2)).toBe(true);
    expect(lineOfSight(walls, W, 0.5, 0.5, 4, 0)).toBe(true);
  });
});
