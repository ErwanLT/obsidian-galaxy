const KEY = 'obsidian-rpg8-progress';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.collected) || !Array.isArray(p.stack)) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
  }
}