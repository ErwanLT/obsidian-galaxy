// Adresse de la vue : #/Dossier/Sous-dossier ou #/Dossier/note.md, relative au vault.
// Recharger garde la position, un lien se partage, précédent/suivant fonctionnent.

const sepOf = dir => (dir.includes('\\') && !dir.includes('/') ? '\\' : '/');

export function hashFor(node, vaultDir) {
  if (!node || !node.path) return '#/';
  let rel = vaultDir && node.path.startsWith(vaultDir) ? node.path.slice(vaultDir.length) : node.path;
  rel = rel.replace(/^[\\/]+/, '');
  return `#/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

export function nodeForHash(hash, index) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw || !index) return null;
  const rel = raw.split('/').map(s => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }).join(sepOf(index.vaultDir));
  return index.byPath.get(`${index.vaultDir}${sepOf(index.vaultDir)}${rel}`) || null;
}
