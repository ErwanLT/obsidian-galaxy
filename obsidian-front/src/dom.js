import { TYPE_COLOR } from './universe.js';

/** Échappe le HTML — les noms de notes viennent du disque de l'utilisateur. */
export function esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Pastille de couleur correspondant au type d'astre. */
export function dot(visualType, cls = 'child-dot') {
  return `<span class="${cls}" style="background:${TYPE_COLOR[visualType] || '#fff'}"></span>`;
}
