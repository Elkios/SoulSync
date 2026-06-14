'use strict';
//
// Cœur du serveur SoulSync (mode hôte). Réutilisé par host.js (CLI) et les tests.
// - fait tourner le moteur de règles (source de vérité unique) ;
// - lit les évènements LOCAUX de l'hôte (son propre tracker Lua) via un bridge ;
// - reçoit les évènements des clients (potes) par WebSocket ;
// - diffuse à tous : les notifications (catch/death/cascade/gameover) + l'état complet.
//
const { WebSocketServer } = require('ws');
const { EventBridge } = require('./bridge');
const { StateWatcher } = require('./statewatch');
const { SoulSyncEngine } = require('./engine');

function startServer({ name = 'Hote', port = 58787, eventsFile = null, stateFile = null, rules = null,
                       onNotes = () => {}, onLog = () => {}, onState = () => {}, onLobby = () => {} } = {}) {
  const engine = new SoulSyncEngine(rules);
  const clients = new Set();
  const wss = new WebSocketServer({ port });
  const hostState = { romReady: false };

  // Gère les erreurs du serveur (sinon EADDRINUSE plante tout le process).
  wss.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      onLog(`⚠️ Port ${port} déjà utilisé — un autre SoulSync (ou host.bat) tourne déjà. Ferme-le et relance.`);
    } else {
      onLog('⚠️ Erreur serveur : ' + (err && err.message || err));
    }
  });

  function broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(s);
  }

  function buildState() {
    return { players: engine.playerIds().map((id) => engine.snapshot(id)), links: engine.links(), rules: engine.rules };
  }

  function broadcastState() {
    const state = buildState();
    broadcast({ type: 'state', players: state.players, links: state.links, rules: state.rules });
    onState(state);
  }

  // Lobby : l'hôte + les clients connectés, avec leur statut "ROM prête".
  function buildLobby() {
    const players = [{ name, romReady: hostState.romReady, isHost: true }];
    for (const ws of clients) players.push({ name: ws.playerId || '?', romReady: !!ws.romReady, isHost: false });
    return players;
  }
  function broadcastLobby() {
    const players = buildLobby();
    broadcast({ type: 'lobby', players, port });
    onLobby(players);
  }

  // Applique un évènement. silent = on construit l'état sans notifier (rejeu d'historique).
  function ingest(playerId, ev, silent) {
    const notes = engine.applyEvent(playerId, ev);
    if (!silent) {
      if (notes.length) { onNotes(notes); broadcast({ type: 'notif', notes }); }
      broadcastState();
    }
    return notes;
  }

  // Bridge local : les évènements de l'hôte lui-même.
  // Un évènement est "silencieux" (pas de notif) s'il est rejoué au démarrage
  // (!_live) ou marqué reprise (resume) — pour reconstruire l'état sans spam.
  let bridge = null;
  function startBridge() {
    if (!eventsFile) return;
    bridge = new EventBridge(eventsFile).start({ replayExisting: true });
    bridge.on('event', (ev) => ingest(name, ev, !ev._live || !!ev.resume));
  }
  startBridge();

  // PV en direct de l'hôte (depuis son propre soulsync_state.json)
  let stateWatcher = null;
  if (stateFile) {
    stateWatcher = new StateWatcher(stateFile).start((obj) => {
      engine.updateHp(name, obj.party || []);
      broadcastState();
    });
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }
      if (msg.type === 'hello') {
        ws.playerId = msg.player || 'Joueur';
        onLog(`➕ ${ws.playerId} connecté (${clients.size} client(s)).`);
        broadcastLobby();
        broadcastState();
      } else if (msg.type === 'rom-status') {
        ws.romReady = !!msg.ready;
        broadcastLobby();
      } else if (msg.type === 'event') {
        // silent = reprise/rejeu : on reconstruit l'état sans notifier.
        ingest(msg.player || ws.playerId || 'Joueur', msg.event, !!msg.silent || !!(msg.event && msg.event.resume));
      } else if (msg.type === 'revive') {
        const notes = engine.revive(msg.player || ws.playerId || 'Joueur', msg.pid);
        if (notes.length) { onNotes(notes); broadcast({ type: 'notif', notes }); }
        broadcastState();
      } else if (msg.type === 'hp') {
        engine.updateHp(msg.player || ws.playerId || 'Joueur', msg.party || []);
        broadcastState();
      }
    });
    ws.on('close', () => { clients.delete(ws); onLog(`➖ ${ws.playerId || '?'} déconnecté.`); broadcastLobby(); });
    ws.on('error', () => {});
  });

  // Change les règles en direct (hôte) et resynchronise tout le monde.
  function setRules(r) {
    engine.setRules(r);
    broadcast({ type: 'rules', rules: engine.rules });
    broadcastState();
    return engine.rules;
  }

  // Nouvelle partie : on repart d'un état vierge et on prévient les clients.
  function resetGame() {
    engine.reset();
    if (bridge) { bridge.stop(); }      // l'appelant tronque le fichier d'évènements
    startBridge();                      // repart proprement (offset au début du fichier vidé)
    broadcast({ type: 'reset' });
    broadcastState();
  }

  // Reprise : on reconstruit l'état en rejouant le fichier d'évènements restauré (silencieux).
  function reloadFromEvents() {
    engine.reset();
    if (bridge) { bridge.stop(); }
    startBridge();
    broadcastState();
  }

  return {
    engine, wss, broadcast, broadcastState, ingest, broadcastLobby,
    setHostRomReady: (v) => { hostState.romReady = !!v; broadcastLobby(); },
    startGame: (presetB64, settings) => broadcast({ type: 'start-game', presetB64, settings }),
    setRules,
    revive: (playerId, pid) => {
      const notes = engine.revive(playerId, pid);
      if (notes.length) { onNotes(notes); broadcast({ type: 'notif', notes }); }
      broadcastState();
      return notes;
    },
    resetGame,
    reloadFromEvents,
    close: () => { if (bridge) bridge.stop(); if (stateWatcher) stateWatcher.stop(); wss.close(); }
  };
}

module.exports = { startServer };
