'use strict';
// Pont sécurisé entre l'interface (renderer) et le process principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soulsync', {
  startSession: (cfg) => ipcRenderer.invoke('start-session', cfg),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onNotes: (cb) => ipcRenderer.on('notes', (_e, n) => cb(n)),
  onLog: (cb) => ipcRenderer.on('log', (_e, m) => cb(m)),
  // Launcher 1-clic
  getRom: () => ipcRenderer.invoke('get-rom'),
  pickRom: () => ipcRenderer.invoke('pick-rom'),
  randomizePlay: () => ipcRenderer.invoke('randomize-play'),
  onRandoLog: (cb) => ipcRenderer.on('rando-log', (_e, m) => cb(m)),
  arrangeWindows: () => ipcRenderer.invoke('arrange-windows'),
  hostInfo: () => ipcRenderer.invoke('host-info'),
  netDiagnostics: () => ipcRenderer.invoke('net-diagnostics'),
  // Lobby + démarrage synchronisé
  setRomReady: (ready) => ipcRenderer.invoke('set-rom-ready', ready),
  hostStartGame: (opts) => ipcRenderer.invoke('host-start-game', opts),
  listSaves: () => ipcRenderer.invoke('list-saves'),
  hostSaveGame: (opts) => ipcRenderer.invoke('host-save-game', opts),
  hostResumeGame: (opts) => ipcRenderer.invoke('host-resume-game', opts),
  // Règles + résurrection
  hostSetRules: (rules) => ipcRenderer.invoke('host-set-rules', rules),
  reviveMon: (opts) => ipcRenderer.invoke('revive-mon', opts),
  onRules: (cb) => ipcRenderer.on('rules', (_e, rules) => cb(rules)),
  onReset: (cb) => ipcRenderer.on('reset', () => cb()),
  onLobby: (cb) => ipcRenderer.on('lobby', (_e, players) => cb(players)),
  onConn: (cb) => ipcRenderer.on('conn', (_e, info) => cb(info)),
  onGameStarting: (cb) => ipcRenderer.on('game-starting', () => cb()),
  onRandoDone: (cb) => ipcRenderer.on('rando-done', (_e, res) => cb(res)),
  onDeepLink: (cb) => ipcRenderer.on('deeplink', (_e, url) => cb(url)),
  // Auto-update
  onUpdate: (cb) => ipcRenderer.on('update', (_e, u) => cb(u)),
  installUpdate: () => ipcRenderer.invoke('install-update')
});
