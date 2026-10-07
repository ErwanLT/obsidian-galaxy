import { hashStr } from './universe.js';
import { mulberry32, shuffle } from './worldgen.js';

// Chaque note légendaire du vault porte une relique : un effet passif permanent.
// `stack` : l'effet se cumule si plusieurs légendaires portent la même relique.

export const RELICS = [
  { id: 'aegis', icon: '◈', name: 'Égide du scribe', desc: 'le premier coup reçu dans chaque salle est annulé.', stack: true },
  { id: 'ember', icon: '✹', name: 'Braise vive', desc: 'tes coups enflamment : +1 dégât une seconde plus tard.', stack: true },
  { id: 'quill', icon: '✎', name: 'Plume acérée', desc: '15 % de coups critiques (dégâts ×2).', stack: true },
  { id: 'thorns', icon: '✱', name: 'Reliure d’épines', desc: 'qui te touche au corps à corps subit 1 dégât.', stack: true },
  { id: 'lantern', icon: '☼', name: 'Lanterne d’archiviste', desc: 'vision +1 case.', stack: true },
  { id: 'compass', icon: '✧', name: 'Boussole d’encre', desc: 'les parchemins de l’étage apparaissent sur la mini-carte.', stack: false },
  { id: 'cartog', icon: '▦', name: 'Carte annotée', desc: 'coffres et murs fissurés apparaissent sur la mini-carte.', stack: false },
  { id: 'feather', icon: '❦', name: 'Plume de phénix', desc: 'entrer dans un dossier jamais visité rend 1 ♥.', stack: true },
  { id: 'hourglass', icon: '⧗', name: 'Sablier figé', desc: 'les attaques ennemies s’annoncent 25 % plus longtemps.', stack: true },
  { id: 'scholar', icon: '✒', name: 'Encrier d’érudit', desc: '+25 % d’XP des parchemins.', stack: true },
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]));

// Attribution déterministe et variée : toutes les reliques sortent avant qu'une se répète,
// et seules les reliques cumulables peuvent se répéter.
export function assignRelics(world) {
  const legend = world.notes
    .filter(n => n._rarity === 'legendaire')
    .sort((a, b) => hashStr(a.path || a.name) - hashStr(b.path || b.name));
  const order = shuffle(RELICS.slice(), mulberry32(hashStr(`relics:${world.root.name}`)));
  const stackable = order.filter(r => r.stack);
  legend.forEach((n, i) => {
    n._relic = (i < order.length ? order[i] : stackable[(i - order.length) % stackable.length]).id;
  });
}

// Nombre d'exemplaires de chaque relique parmi les notes collectées.
export function relicCounts(byPath, collected) {
  const out = {};
  for (const path of collected) {
    const n = byPath.get(path);
    if (n && n._relic) out[n._relic] = (out[n._relic] || 0) + 1;
  }
  return out;
}
