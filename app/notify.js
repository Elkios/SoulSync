'use strict';
// Formatage commun des notifications (hote + client).

function formatNote(n) {
  switch (n.kind) {
    case 'catch':
      return `🟢  CAPTURE #${n.mon.order} : ${n.mon.name} (Niv.${n.mon.level})  [${n.playerId}]`;
    case 'death':
      return `💀  MORT : ${n.mon.name} (lien #${n.mon.order ?? '?'})  [${n.playerId}]`;
    case 'cascade':
      return `🔗💀  CASCADE : ${n.mon.name} de ${n.playerId} meurt aussi (lié à #${n.mon.order})`;
    case 'species-clash':
      return `⚠️  CLAUSE D'ESPECE : ${n.mon.name} (espèce #${n.species}) déjà capturé  [${n.playerId}]`;
    case 'gameover':
      return `☠️  GAME OVER — l'équipe de ${n.playerId} est tombée.`;
    default:
      return null;
  }
}

function printNote(n) {
  const s = formatNote(n);
  if (s) console.log(s);
}

module.exports = { formatNote, printNote };
