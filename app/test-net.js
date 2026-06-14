'use strict';
// Test réseau : un hôte (Alice) + un client (Bob) sur localhost.
// Vérifie que la mort d'un Pokémon d'Alice déclenche la cascade chez Bob,
// et que Bob reçoit bien la notification via le réseau.
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { startServer } = require('./server');

const PORT = 8799;
const tmpAlice = path.join(os.tmpdir(), 'ss_alice_' + process.pid + '.jsonl');
fs.writeFileSync(tmpAlice, '');

const received = []; // notifs reçues par Bob

const srv = startServer({ name: 'Alice', port: PORT, eventsFile: tmpAlice,
  onNotes: () => {}, onLog: (m) => console.log('[hote]', m) });

function aliceCatch(o, pid, sp, name, lvl) {
  fs.appendFileSync(tmpAlice, JSON.stringify({ type: 'catch', order: o, pid, species: sp, name, level: lvl }) + '\n');
}
function aliceDeath(pid) {
  fs.appendFileSync(tmpAlice, JSON.stringify({ type: 'death', pid }) + '\n');
}

const bob = new WebSocket('ws://127.0.0.1:' + PORT);
bob.on('open', () => {
  bob.send(JSON.stringify({ type: 'hello', player: 'Bob' }));
  // Captures synchronisées : Alice #1,#2 ; Bob #1,#2
  aliceCatch(1, 100, 498, 'Gruikui', 5);
  aliceCatch(2, 101, 504, 'Ratentif', 2);
  bob.send(JSON.stringify({ type: 'event', player: 'Bob', event: { type: 'catch', order: 1, pid: 200, species: 1, name: 'Bulbizarre', level: 5 } }));
  bob.send(JSON.stringify({ type: 'event', player: 'Bob', event: { type: 'catch', order: 2, pid: 201, species: 4, name: 'Salameche', level: 5 } }));
  // Au bout d'1s : le Gruikui d'Alice (#1) meurt -> cascade sur le Bulbizarre de Bob (#1)
  setTimeout(() => aliceDeath(100), 1000);
});

bob.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'notif') {
    for (const n of msg.notes) {
      received.push(n);
      console.log('[Bob reçoit]', n.kind, '-', n.playerId, n.mon ? n.mon.name : '');
    }
  }
});

setTimeout(() => {
  const cascade = received.find((n) => n.kind === 'cascade' && n.mon && n.mon.name === 'Bulbizarre');
  console.log('\n==============================');
  console.log(cascade
    ? '✅ SUCCÈS : Bob a reçu la cascade (son Bulbizarre meurt avec le Gruikui d\'Alice).'
    : '❌ ÉCHEC : pas de cascade reçue par Bob.');
  console.log('==============================');
  bob.close();
  srv.close();
  try { fs.unlinkSync(tmpAlice); } catch (_) {}
  process.exit(cascade ? 0 : 1);
}, 2500);
