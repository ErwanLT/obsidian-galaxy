import { hashStr } from './universe.js';

const LEGACY_KEY = 'obsidian-rpg8-progress';
const MODE_KEY = 'obsidian-quest:mode';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // stockage indisponible (navigation privée, quota) : le jeu reste jouable sans sauvegarde
  }
}

const valid = p => p && Array.isArray(p.collected) && Array.isArray(p.stack);

// Identifiant stable d'un vault : son nom + le dossier parent de ses premières entrées.
export function vaultIdOf(data) {
  const first = (data.children || []).find(c => c.path);
  const dir = first ? first.path.replace(/[\\/][^\\/]*$/, '') : '';
  return hashStr(`${data.name || ''}|${dir}`).toString(36);
}

export function storeFor(vaultId) {
  const key = `obsidian-quest:${vaultId}`;
  return {
    load() {
      const own = read(key);
      if (valid(own)) return own;
      const legacy = read(LEGACY_KEY);
      return valid(legacy) ? legacy : null;
    },
    save(p) {
      write(key, JSON.stringify(p));
      write(LEGACY_KEY, null);
    },
    clear() {
      write(key, null);
      write(LEGACY_KEY, null);
    },
  };
}

export function loadMode(fallback) {
  try {
    return localStorage.getItem(MODE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function saveMode(mode) {
  write(MODE_KEY, mode);
}
