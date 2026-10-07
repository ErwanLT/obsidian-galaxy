// Filtre des couches : mots du titre, #tag, dossier:chemin. Tous les termes doivent correspondre.

const fold = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matcher(query) {
  // « dossier:"Back/Java/Spring Boot" » : les guillemets gardent les espaces.
  const terms = ((query || '').match(/[^\s"]+:"[^"]*"?|"[^"]*"?|\S+/g) || []).map(t => t.replace(/"/g, '')).filter(Boolean);
  if (!terms.length) return null;
  const tests = terms.map(term => {
    if (term.startsWith('#') && term.length > 1) {
      const t = fold(term.slice(1));
      return l => l.tags.some(x => fold(x) === t || fold(x).startsWith(`${t}/`));
    }
    if (term.startsWith('dossier:')) {
      const k = fold(term.slice(8));
      return l => fold(l.litho.key) === k || fold(l.folders.join('/')).startsWith(k);
    }
    const t = fold(term);
    return l => fold(l.name).includes(t) || l.tags.some(x => fold(x).includes(t)) || l.folders.some(f => fold(f).includes(t));
  });
  return l => tests.every(f => f(l));
}
