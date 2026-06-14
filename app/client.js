'use strict';
// Mode CLIENT (CLI). Se connecte à l'hôte, envoie ses évènements, reçoit les notifs.
//   node client.js --name TonPseudo --host ws://IP:PORT [--events <chemin>]
const path = require('path');
const WebSocket = require('ws');
const { EventBridge } = require('./bridge');
const { parseArgs } = require('./util');
const { printNote } = require('./notify');

const args = parseArgs(process.argv.slice(2));
const NAME = args.name || 'Joueur';
const HOST = (args.host || 'ws://127.0.0.1:58787').replace(/^(?!ws:\/\/|wss:\/\/)/, 'ws://');
const EVENTS = args.events || path.resolve(__dirname, '..', 'data', 'soulsync_events.jsonl');

console.log('========================================');
console.log('  SoulSync — CLIENT');
console.log('========================================');
console.log(`Joueur (toi) : ${NAME}`);
console.log(`Connexion à : ${HOST}\n`);

let ws = null;
let queue = [];

function sendEvent(ev) {
  const msg = JSON.stringify({ type: 'event', player: NAME, event: ev });
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
  else queue.push(msg);
}

function connect() {
  ws = new WebSocket(HOST);
  ws.on('open', () => {
    console.log('✅ Connecté à l\'hôte.');
    ws.send(JSON.stringify({ type: 'hello', player: NAME }));
    for (const m of queue) ws.send(m);
    queue = [];
  });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (_) { return; }
    if (msg.type === 'notif') for (const n of msg.notes) printNote(n);
    // msg.type === 'state' : pour le futur dashboard
  });
  ws.on('close', () => { console.log('🔌 Déconnecté. Nouvelle tentative dans 3s…'); setTimeout(connect, 3000); });
  ws.on('error', (e) => { console.log('⚠️  Réseau :', e.message); });
}

connect();

// Envoie tous les évènements du tracker local (historique + nouveaux) ; le moteur déduplique.
const bridge = new EventBridge(EVENTS).start({ replayExisting: true });
bridge.on('event', (ev) => sendEvent(ev));

process.on('SIGINT', () => { console.log('\nDéconnexion.'); process.exit(0); });
