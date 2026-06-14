'use strict';
//
// Phase A (solo, local) : surveille les evenements du tracker Lua et les affiche
// en direct dans la console. Prouve que le pont Lua -> Node fonctionne.
// (Le reseau entre joueurs viendra ensuite, par-dessus le meme moteur.)
//
const path = require('path');
const { EventBridge } = require('./bridge');
const { SoulSyncEngine } = require('./engine');

const DATA = path.resolve(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA, 'soulsync_events.jsonl');
const ME = 'moi';

const engine = new SoulSyncEngine();

console.log('========================================');
console.log('  SoulSync — pont local (Phase A)');
console.log('========================================');
console.log('En ecoute de :', EVENTS_FILE);
console.log('Dans BizHawk : (re)lance le script Lua, capture / fais tomber un Pokemon.');
console.log('Ctrl+C pour quitter.\n');

const bridge = new EventBridge(EVENTS_FILE).start({ replayExisting: true });

bridge.on('event', (ev) => {
  const notes = engine.applyEvent(ME, ev);
  if (!ev._live) return; // on n'annonce pas les vieux evenements rejoues au demarrage
  for (const n of notes) printNote(n);
});

function printNote(n) {
  switch (n.kind) {
    case 'catch':
      console.log(`🟢  CAPTURE #${n.mon.order} : ${n.mon.name} (Niv.${n.mon.level})`);
      break;
    case 'death':
      console.log(`💀  MORT : ${n.mon.name} (lien #${n.mon.order ?? '?'})`);
      break;
    case 'cascade':
      console.log(`🔗💀  CASCADE : ${n.mon.name} (${n.playerId}) meurt aussi — lie a #${n.mon.order}`);
      break;
    case 'species-clash':
      console.log(`⚠️  CLAUSE D'ESPECE : ${n.mon.name} deja capture (espece #${n.species})`);
      break;
    case 'gameover':
      console.log(`☠️  GAME OVER — toute l'equipe de ${n.playerId} est tombee.`);
      break;
  }
}

process.on('SIGINT', () => { bridge.stop(); console.log('\nArret.'); process.exit(0); });
