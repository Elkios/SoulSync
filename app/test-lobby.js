'use strict';
// Test du lobby : Alice héberge, Bob rejoint, statuts ROM, puis Alice lance la partie.
const WebSocket = require('ws');
const { startServer } = require('./server');

const PORT = 8801;
let lobby = [];
let bobStart = null;

const srv = startServer({ name: 'Alice', port: PORT, onLobby: (players) => { lobby = players; } });

const bob = new WebSocket('ws://127.0.0.1:' + PORT);
bob.on('open', () => {
  bob.send(JSON.stringify({ type: 'hello', player: 'Bob' }));
  setTimeout(() => bob.send(JSON.stringify({ type: 'rom-status', player: 'Bob', ready: true })), 200);
  setTimeout(() => srv.setHostRomReady(true), 300);                          // Alice prête
  setTimeout(() => srv.startGame('UFJFU0VU', { categories: ['wild', 'abilities'] }), 500); // Alice lance
});
bob.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === 'start-game') bobStart = m;
});

setTimeout(() => {
  console.log('Lobby final :', JSON.stringify(lobby));
  const alice = lobby.find((p) => p.name === 'Alice' && p.isHost && p.romReady);
  const bobReady = lobby.find((p) => p.name === 'Bob' && p.romReady);
  console.log('Alice prête (host) :', !!alice, '| Bob prêt :', !!bobReady);
  console.log('Bob a reçu start-game :', bobStart ? ('preset=' + bobStart.presetB64 + ' cats=' + JSON.stringify(bobStart.settings.categories)) : 'NON');
  const ok = !!alice && !!bobReady && bobStart && bobStart.presetB64 === 'UFJFU0VU';
  console.log(ok ? '✅ SUCCÈS lobby + start-game' : '❌ ÉCHEC');
  bob.close(); srv.close(); process.exit(ok ? 0 : 1);
}, 1000);
