import { hashStr } from './universe.js';
import { mulberry32, shuffle } from './worldgen.js';

// Trois notes du jour, tirées à partir de la date : jusqu'à deux à relire parmi celles
// déjà collectées (révision du vault), le reste à découvrir.

export function today(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function pickDaily(notes, collected, date, n = 3) {
  const pool = shuffle(notes.slice().sort((a, b) => (a.path < b.path ? -1 : 1)), mulberry32(hashStr(`daily:${date}`)));
  const known = pool.filter(x => collected.has(x.path));
  const fresh = pool.filter(x => !collected.has(x.path));
  const picked = known.slice(0, Math.min(2, n));
  for (const x of fresh) {
    if (picked.length >= n) break;
    picked.push(x);
  }
  for (const x of known.slice(picked.length)) {
    if (picked.length >= n) break;
    if (!picked.includes(x)) picked.push(x);
  }
  return picked.map(x => x.path);
}
