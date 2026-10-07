// Tutoriel contextuel : chaque astuce s'affiche une seule fois, au moment où elle sert.
// `when(game)` est évalué régulièrement ; l'ordre de la liste fait la priorité.

const near = (g, x, y, r) => Math.hypot(x + 0.5 - g.player.x, y + 0.5 - g.player.y) < r;
const seenTile = (g, x, y) => g.isVisible(x + 0.5, y + 0.5);

export const HINTS = [
  { id: 'move', when: g => g.time > 1, text: 'ZQSD / flèches : se déplacer · E : interagir · la zone dorée est sûre' },
  { id: 'telegraph', when: g => g.room.telegraphs.length > 0 || g.room.monsters.some(m => (m.state === 'windup' || m.state === 'aim') && g.isVisible(m.x, m.y)), text: 'attaque annoncée ! SHIFT pour esquiver : on est intouchable pendant la roulade' },
  { id: 'enemy', when: g => g.room.monsters.some(m => m.hunting && g.isVisible(m.x, m.y)), text: 'ESPACE : épée · SHIFT : esquive · les orbes vertes donnent de l’XP' },
  { id: 'note', when: g => g.room.notes.some(n => !g.collected.has(n.node.path) && seenTile(g, n.x, n.y)), text: 'un parchemin ! approche-toi et appuie sur E pour le collecter' },
  { id: 'door', when: g => g.room.doors.some(d => seenTile(g, d.x, d.y)), text: 'porte scellée : le gardien est derrière, la clé est ailleurs dans l’étage' },
  { id: 'crack', when: g => g.room.cracks.some(c => seenTile(g, c.x, c.y) && near(g, c.x, c.y, 3)), text: 'ce mur a l’air fissuré… un coup d’épée ?' },
  { id: 'chest', when: g => g.room.chests.some(c => seenTile(g, c.x, c.y)), text: 'un coffre ! E pour l’ouvrir' },
  { id: 'portal', when: g => g.prompt && g.prompt.kind === 'portal', text: 'chaque porte mène à un sous-dossier · la porte fléchée remonte' },
  { id: 'search', when: g => g.collected.size >= 3, text: 'F : chercher une note et se faire guider · T : carte du vault · I : inventaire' },
  { id: 'daily', when: g => g.collected.size >= 5 && g.daily, text: '3 notes du jour t’attendent (halo cyan) : F pour les voir, une récompense au bout' },
];

export function nextHint(game) {
  for (const h of HINTS) {
    if (!game.hints.has(h.id) && h.when(game)) return h;
  }
  return null;
}
