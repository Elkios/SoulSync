'use strict';
//
// Serveur RELAIS SoulSync — supprime le besoin d'ouvrir des ports.
// Au lieu que l'hôte écoute (port-forwarding), TOUT LE MONDE (hôte inclus) se
// connecte EN SORTIE à ce relais. Le relais ne fait que router les messages au
// sein d'une "room" (salon) identifiée par un code court partageable.
//
// Il est volontairement "bête" : il ne comprend pas les payloads Pokémon, il les
// relaie. L'hôte reste la source de vérité (le moteur de règles tourne chez lui).
//
// Lancement :
//   - local  : `node relay.js`            (écoute sur le port 58788)
//   - distant: déployable tel quel (Render/Railway/VPS) ; le port vient de $PORT.
//
// Protocole (enveloppe JSON) :
//   client -> relais : {t:'create',name} | {t:'join',room,name} | {t:'msg',data}
//                      | {t:'to',target,data} | {t:'leave'} | {t:'ping'}
//   relais -> client : {t:'joined',room,you,host,members} | {t:'presence',event,client}
//                      | {t:'host',client} | {t:'msg',from,data} | {t:'error',code} | {t:'pong'}
//
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L (lisible à l'oral)
const ROOM_MAX = 4;        // 4 joueurs max (Soul Link)
const GC_GRACE_MS = 60000; // délai avant suppression d'une room vidée (reconnexion)

function makeCode() {
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function startRelay({ port = 58788, onLog = () => {} } = {}) {
  const wss = new WebSocketServer({ port });
  const rooms = new Map(); // code -> { hostId, members: Map<id, ws>, gcTimer }

  wss.on('error', (err) => onLog('⚠️ relais : ' + (err && err.message || err)));
  wss.on('listening', () => onLog('Relais SoulSync à l\'écoute sur le port ' + port));

  function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (_) {} } }
  function roster(room) {
    return [...room.members.values()].map((w) => ({ id: w.id, name: w.name || '?', host: w.id === room.hostId }));
  }
  function broadcast(room, obj, exceptId) {
    for (const [id, ws] of room.members) if (id !== exceptId) send(ws, obj);
  }

  function leaveRoom(ws) {
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    room.members.delete(ws.id);
    if (room.members.size === 0) {
      // On garde la room un court instant (reconnexion de l'hôte) puis on la supprime.
      room.gcTimer = setTimeout(() => { if (room.members.size === 0) rooms.delete(ws.room); }, GC_GRACE_MS);
    } else {
      if (room.hostId === ws.id) {
        room.hostId = room.members.keys().next().value; // ré-élit le plus ancien restant
        broadcast(room, { t: 'host', client: room.hostId });
      }
      broadcast(room, { t: 'presence', event: 'leave', client: { id: ws.id, name: ws.name } });
    }
    ws.room = null;
  }

  wss.on('connection', (ws) => {
    ws.id = 'c_' + crypto.randomBytes(4).toString('hex');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }

      if (m.t === 'create') {
        if (ws.room) leaveRoom(ws);
        let code; do { code = makeCode(); } while (rooms.has(code));
        const room = { hostId: ws.id, members: new Map([[ws.id, ws]]) };
        rooms.set(code, room);
        ws.room = code; ws.name = m.name || 'Hôte';
        onLog(`🆕 room ${code} créée par ${ws.name}`);
        return send(ws, { t: 'joined', room: code, you: ws.id, host: ws.id, members: roster(room) });
      }

      if (m.t === 'join') {
        const code = String(m.room || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'error', code: 'no_room' });
        if (room.members.size >= ROOM_MAX) return send(ws, { t: 'error', code: 'room_full' });
        if (room.gcTimer) { clearTimeout(room.gcTimer); room.gcTimer = null; }
        if (ws.room && ws.room !== code) leaveRoom(ws);
        room.members.set(ws.id, ws);
        ws.room = code; ws.name = m.name || 'Joueur';
        onLog(`➕ ${ws.name} rejoint ${code} (${room.members.size})`);
        send(ws, { t: 'joined', room: code, you: ws.id, host: room.hostId, members: roster(room) });
        return broadcast(room, { t: 'presence', event: 'join', client: { id: ws.id, name: ws.name } }, ws.id);
      }

      if (m.t === 'msg' || m.t === 'to') {
        const room = rooms.get(ws.room);
        if (!room) return;
        const out = { t: 'msg', from: ws.id, name: ws.name, data: m.data };
        if (m.t === 'to') { const peer = room.members.get(m.target); return peer && send(peer, out); }
        return broadcast(room, out, ws.id);
      }

      if (m.t === 'leave') return leaveRoom(ws);
      if (m.t === 'ping') return send(ws, { t: 'pong' });
    });

    ws.on('close', () => leaveRoom(ws));
    ws.on('error', () => {});
  });

  // Heartbeat : coupe les connexions mortes (NAT qui drop les TCP inactifs).
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
    }
  }, 30000);
  wss.on('close', () => clearInterval(hb));

  return {
    wss, rooms,
    roomCount: () => rooms.size,
    close: () => { clearInterval(hb); wss.close(); }
  };
}

module.exports = { startRelay, makeCode };

// Lancement direct en ligne de commande : `node relay.js [port]`
if (require.main === module) {
  const port = parseInt(process.env.PORT || process.argv[2] || '58788', 10);
  startRelay({ port, onLog: (m) => console.log('[relay] ' + m) });
}
