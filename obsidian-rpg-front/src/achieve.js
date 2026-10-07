export const ACHIEVEMENTS = [
  { id: 'firstNote', icon: '✦', name: 'Premier parchemin', desc: 'obtenir sa première mémoire.' },
  { id: 'note10', icon: '✦', name: 'Collectionneur', desc: 'obtenir 10 parchemins.' },
  { id: 'note25', icon: '✦', name: 'Archiviste', desc: 'obtenir 25 parchemins.' },
  { id: 'visit5', icon: '☗', name: 'Pérégrin', desc: 'visiter 5 salles du donjon.' },
  { id: 'visit15', icon: '☗', name: 'Explorateur', desc: 'visiter 15 salles.' },
  { id: 'reveal', icon: '◉', name: 'Cartographe', desc: 'révéler entièrement une salle.' },
  { id: 'kill1', icon: '⚔', name: 'Épée novice', desc: 'vaincre une créature.' },
  { id: 'kill10', icon: '⚔', name: 'Tueur de donjon', desc: 'vaincre 10 créatures.' },
  { id: 'boss1', icon: '♛', name: 'Brise-voûte', desc: 'vaincre son premier gardien.' },
  { id: 'boss3', icon: '♛', name: 'Grand justicier', desc: 'vaincre 3 gardiens.' },
  { id: 'lvl3', icon: '★', name: 'Aguerri', desc: 'atteindre le niveau 3.' },
  { id: 'lvl5', icon: '★', name: 'Légende', desc: 'atteindre le niveau 5.' },
  { id: 'death1', icon: '☠', name: 'Phénix', desc: 'survivre une première fois à la mort.' },
];

export function achievementTest(id, s) {
  switch (id) {
    case 'firstNote': return s.notes >= 1;
    case 'note10': return s.notes >= 10;
    case 'note25': return s.notes >= 25;
    case 'visit5': return s.rooms >= 5;
    case 'visit15': return s.rooms >= 15;
    case 'reveal': return s.revealed === true;
    case 'kill1': return s.kills >= 1;
    case 'kill10': return s.kills >= 10;
    case 'boss1': return s.bosses >= 1;
    case 'boss3': return s.bosses >= 3;
    case 'lvl3': return s.level >= 3;
    case 'lvl5': return s.level >= 5;
    case 'death1': return s.deaths >= 1;
    default: return false;
  }
}