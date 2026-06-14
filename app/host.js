'use strict';
// Mode HÔTE (CLI). Un joueur lance ça ; les autres s'y connectent.
//   node host.js --name TonPseudo [--port 58787] [--events <chemin>]
const path = require('path');
const { startServer } = require('./server');
const { parseArgs, localIps } = require('./util');
const { printNote } = require('./notify');

const args = parseArgs(process.argv.slice(2));
const NAME = args.name || 'Hote';
const PORT = parseInt(args.port || '58787', 10);
const EVENTS = args.events || path.resolve(__dirname, '..', 'data', 'soulsync_events.jsonl');
const STATE = args.state || path.resolve(__dirname, '..', 'data', 'soulsync_state.json');

console.log('========================================');
console.log('  SoulSync — HÔTE');
console.log('========================================');
console.log(`Joueur (toi) : ${NAME}`);
console.log(`Port : ${PORT}`);
const ips = localIps();
if (ips.length) {
  console.log('Tes potes se connectent avec l\'une de ces adresses :');
  for (const ip of ips) console.log(`   ${ip}:${PORT}`);
} else {
  console.log('(Aucune IP réseau détectée — vérifie ta connexion / LAN virtuel)');
}
console.log('\nEn attente des potes…  (Ctrl+C pour quitter)\n');

startServer({
  name: NAME,
  port: PORT,
  eventsFile: EVENTS,
  stateFile: STATE,
  onNotes: (notes) => notes.forEach(printNote),
  onLog: (m) => console.log(m)
});

process.on('SIGINT', () => { console.log('\nArrêt de l\'hôte.'); process.exit(0); });
