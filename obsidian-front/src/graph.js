// Graphe des liens entre notes, parcouru sans tenir compte du sens du lien.

const neighbors = n => [...(n._out || []), ...(n._in || [])];

/**
 * Plus court chemin (en nombre de liens) de `from` à `to`, extrémités comprises.
 * [] si les deux notes ne sont reliées par aucune chaîne de liens.
 */
export function shortestPath(from, to) {
  if (!from || !to) return [];
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const nb of neighbors(cur)) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === to) {
        const path = [to];
        for (let p = cur; p; p = prev.get(p)) path.unshift(p);
        return path;
      }
      queue.push(nb);
    }
  }
  return [];
}
