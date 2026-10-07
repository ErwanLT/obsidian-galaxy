// Dons proposés à chaque niveau (1 au choix parmi 3). `max` : nombre de cumuls autorisés.

export const PERKS = [
  { id: 'blade', icon: '⚔', name: 'Lame affûtée', desc: '+1 dégât à l’épée.', max: 3 },
  { id: 'reach', icon: '↔', name: 'Allonge', desc: 'portée de l’épée +25 %.', max: 2 },
  { id: 'swift', icon: '»', name: 'Pas léger', desc: 'vitesse de marche +12 %.', max: 3 },
  { id: 'roll', icon: '≋', name: 'Roulade véloce', desc: 'recharge de l’esquive -30 %.', max: 2 },
  { id: 'leech', icon: '♥', name: 'Vol de vie', desc: '15 % de chances de regagner 1 ♥ par ennemi vaincu.', max: 3 },
  { id: 'heart', icon: '♥', name: 'Cœur robuste', desc: '+1 ♥ maximum.', max: 3 },
  { id: 'magnet', icon: '◎', name: 'Aimant', desc: 'orbes et cœurs attirés de plus loin, +20 % d’XP des créatures.', max: 2 },
  { id: 'shock', icon: '✺', name: 'Onde de choc', desc: 'la fin d’une esquive repousse et blesse les ennemis proches.', max: 1 },
  { id: 'mirror', icon: '↺', name: 'Miroir', desc: 'les projectiles renvoyés font double dégâts.', max: 1 },
  { id: 'phoenix', icon: '✦', name: 'Seconde chance', desc: 'une fois par étage, un coup mortel te laisse à 1 ♥.', max: 1 },
  { id: 'lynx', icon: '◉', name: 'Œil de lynx', desc: 'champ de vision +1,5 case.', max: 2 },
];

export const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

// Tire `n` dons distincts encore cumulables.
export function rollPerks(owned, n = 3, rand = Math.random) {
  const pool = PERKS.filter(p => (owned[p.id] || 0) < p.max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export function perkTotal(owned) {
  return Object.values(owned).reduce((a, b) => a + b, 0);
}
