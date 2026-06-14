'use strict';
//
// Unifie les modes HÔTE et CLIENT en une "session" qui émet les mêmes évènements
// pour l'interface : 'state' (équipes de tous + liens), 'notes' (notifications),
// 'log' (messages de connexion). L'UI Electron n'a plus qu'à écouter ça.
//
const path = require('path');
const EventEmitter = require('events');
const WebSocket = require('ws');
const { startServer } = require('./server');
const { EventBridge } = require('./bridge');
const { StateWatcher } = require('./statewatch');

function createSession({ mode, name, port = 58787, hostUrl, eventsFile, stateFile, rules }) {
  const em = new EventEmitter();
  stateFile = stateFile || path.join(path.dirname(eventsFile), 'soulsync_state.json');

  if (mode === 'host') {
    const srv = startServer({
      name, port, eventsFile, stateFile, rules,
      onNotes: (notes) => em.emit('notes', notes),
      onLog: (m) => em.emit('log', m),
      onState: (state) => em.emit('state', state),
      onLobby: (players) => em.emit('lobby', players)
    });
    em.isHost = true;
    em.close = () => srv.close();
    em.setRomReady = (v) => srv.setHostRomReady(v);
    em.startGame = (presetB64, settings) => srv.startGame(presetB64, settings);
    em.broadcastMsg = (msg) => srv.broadcast(msg);
    em.setRules = (r) => srv.setRules(r);
    em.revive = (pid) => srv.revive(name, pid);      // l'hôte ranime un de SES Pokémon
    em.reviveFor = (playerId, pid) => srv.revive(playerId, pid); // ou celui d'un autre
    em.resetGame = () => srv.resetGame();
    em.reloadFromEvents = () => srv.reloadFromEvents();
    em.getRules = () => srv.engine.rules;
    em.emit('log', `Hôte démarré (port ${port})`);
  } else {
    let ws = null;
    let queue = [];
    const url = (hostUrl || '').replace(/^(?!wss?:\/\/)/, 'ws://');

    let bridge = new EventBridge(eventsFile).start({ replayExisting: true });
    bridge.on('event', (ev) => send(ev));

    // PV en direct : on les envoie à l'hôte à chaque changement (pas de file d'attente,
    // le prochain tick renverra l'état à jour si la connexion n'est pas prête).
    const sw = new StateWatcher(stateFile).start((obj) => {
      const m = JSON.stringify({ type: 'hp', player: name, party: obj.party || [] });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(m);
    });

    // silent = évènement rejoué au démarrage / de reprise : reconstruit l'état sans notifier.
    function send(ev) {
      const silent = ev._live === false || !!ev.resume;
      const m = JSON.stringify({ type: 'event', player: name, event: ev, silent });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(m); else queue.push(m);
    }

    function connect() {
      em.emit('conn', { state: 'connecting', url });
      ws = new WebSocket(url);
      ws.on('open', () => {
        em.emit('log', 'Connecté à l\'hôte.');
        em.emit('conn', { state: 'connected' });
        ws.send(JSON.stringify({ type: 'hello', player: name }));
        for (const m of queue) ws.send(m);
        queue = [];
      });
      ws.on('message', (data) => {
        let msg; try { msg = JSON.parse(data.toString()); } catch (_) { return; }
        if (msg.type === 'notif') em.emit('notes', msg.notes);
        else if (msg.type === 'state') em.emit('state', { players: msg.players, links: msg.links, rules: msg.rules });
        else if (msg.type === 'lobby') em.emit('lobby', msg.players);
        else if (msg.type === 'rules') em.emit('rules', msg.rules);
        else if (msg.type === 'reset') em.emit('reset');
        else if (msg.type === 'start-game') em.emit('start-game', { presetB64: msg.presetB64, settings: msg.settings });
        else if (msg.type === 'save-game') em.emit('save-game', { gameId: msg.gameId, name: msg.name });
        else if (msg.type === 'load-game') em.emit('load-game', { gameId: msg.gameId });
      });
      ws.on('close', () => {
        em.emit('log', 'Déconnecté. Nouvelle tentative dans 3s…');
        em.emit('conn', { state: 'disconnected' });
        setTimeout(connect, 3000);
      });
      ws.on('error', (e) => {
        em.emit('log', 'Réseau : ' + e.message);
        em.emit('conn', { state: 'error', message: e.message });
      });
    }
    connect();
    em.isHost = false;
    em.setRomReady = (ready) => {
      const m = JSON.stringify({ type: 'rom-status', player: name, ready: !!ready });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(m);
    };
    // Le client demande à l'hôte de ranimer un de SES Pokémon (l'hôte fait foi).
    em.revive = (pid) => {
      const m = JSON.stringify({ type: 'revive', player: name, pid });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(m);
    };
    // Reprise : on rejoue le fichier d'évènements restauré (envoyé en silencieux à l'hôte).
    em.reloadBridge = () => {
      try { bridge.stop(); } catch (_) {}
      bridge = new EventBridge(eventsFile).start({ replayExisting: true });
      bridge.on('event', (ev) => send(ev));
    };
    em.close = () => { bridge.stop(); sw.stop(); if (ws) ws.close(); };
  }

  return em;
}

module.exports = { createSession };
