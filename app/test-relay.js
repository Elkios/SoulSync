'use strict';
// Test du serveur relais : 1 hôte + 2 clients dans une room, relai des messages + présence.
const WebSocket = require('ws');
const { startRelay } = require('./relay');

const PORT = 58790;
let passed = 0;
function ok(label, cond) {
  if (!cond) { console.error('   ❌ ' + label); process.exit(1); }
  console.log('   ✅ ' + label); passed++;
}

// Petit client : connecte, expose send() + next(predicate) qui attend un message.
function client(name) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (_) { return; }
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  const api = {
    name, ws,
    open: () => new Promise((r) => ws.on('open', r)),
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (pred, ms = 2000) => new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error(name + ' timeout en attente d\'un message')), ms);
    }),
    close: () => ws.close()
  };
  return api;
}

(async () => {
  const relay = startRelay({ port: PORT, onLog: () => {} });
  await new Promise((r) => relay.wss.on('listening', r));

  // 1) L'hôte crée une room
  const host = client('Hôte');
  await host.open();
  host.send({ t: 'create', name: 'Hôte' });
  const joined = await host.next((m) => m.t === 'joined');
  const code = joined.room;
  ok('hôte reçoit un code de room (' + code + ')', typeof code === 'string' && code.length === 6);
  ok('hôte est marqué host', joined.host === joined.you);

  // 2) Deux clients rejoignent
  const a = client('Alice'); await a.open();
  a.send({ t: 'join', room: code, name: 'Alice' });
  const aJoined = await a.next((m) => m.t === 'joined');
  ok('Alice rejoint la room', aJoined.room === code);
  ok('Alice voit l\'hôte comme host', aJoined.host === joined.you);

  const presA = await host.next((m) => m.t === 'presence' && m.event === 'join' && m.client.name === 'Alice');
  ok('hôte reçoit la présence d\'Alice', !!presA);

  const b = client('Bob'); await b.open();
  b.send({ t: 'join', room: code, name: 'Bob' });
  const bJoined = await b.next((m) => m.t === 'joined');
  ok('Bob rejoint, roster = 3', bJoined.members.length === 3);

  // 3) Un client diffuse un message -> reçu par l'hôte et l'autre client, PAS par l'émetteur
  a.send({ t: 'msg', data: { type: 'event', player: 'Alice', event: { type: 'catch', pid: 1 } } });
  const hostGot = await host.next((m) => m.t === 'msg' && m.data && m.data.type === 'event');
  ok('hôte reçoit l\'event d\'Alice', hostGot.data.player === 'Alice');
  const bGot = await b.next((m) => m.t === 'msg' && m.data && m.data.type === 'event');
  ok('Bob reçoit aussi (broadcast)', bGot.from === aJoined.you);

  // 4) L'hôte diffuse l'état -> reçu par les 2 clients
  host.send({ t: 'msg', data: { type: 'state', players: [] } });
  const aState = await a.next((m) => m.t === 'msg' && m.data && m.data.type === 'state');
  const bState = await b.next((m) => m.t === 'msg' && m.data && m.data.type === 'state');
  ok('Alice reçoit l\'état de l\'hôte', !!aState);
  ok('Bob reçoit l\'état de l\'hôte', !!bState);

  // 5) Room introuvable
  const c = client('Perdu'); await c.open();
  c.send({ t: 'join', room: 'ZZZZZZ', name: 'Perdu' });
  const err = await c.next((m) => m.t === 'error');
  ok('room inconnue -> erreur no_room', err.code === 'no_room');

  // 6) Départ d'un client -> présence leave chez l'hôte
  b.close();
  const leave = await host.next((m) => m.t === 'presence' && m.event === 'leave');
  ok('départ de Bob signalé à l\'hôte', !!leave);

  host.close(); a.close(); c.close();
  relay.close();
  console.log(`\n🎉 ${passed} assertions OK — le relais route correctement.\n`);
  process.exit(0);
})().catch((e) => { console.error('ERREUR: ' + e.message); process.exit(1); });
