'use strict';
// Process principal Electron : crée la fenêtre, lance la session (hôte/client),
// et relaie state/notes/log vers l'interface.
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createSession } = require('../session');
const launcher = require('../launcher');
const { localIps } = require('../util');
const network = require('../network');

let win = null;
let session = null;

// Repart sur une équipe propre à chaque démarrage de l'app (efface les évènements précédents).
function resetData() {
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  try { fs.writeFileSync(path.join(dataDir, 'soulsync_events.jsonl'), ''); } catch (_) {}
  try { fs.rmSync(path.join(dataDir, 'soulsync_state.json'), { force: true }); } catch (_) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0d1322',
    title: 'SoulSync',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) { win.webContents.send('deeplink', pendingDeepLink); pendingDeepLink = null; }
  });
}

// --- Deeplink soulsync://join?host=IP:port ---
const PROTO = 'soulsync';
if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTO, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTO);
}
let pendingDeepLink = null;
function extractLink(argv) { return (argv || []).find((a) => typeof a === 'string' && a.startsWith(PROTO + '://')) || null; }
function handleDeepLink(url) {
  if (!url) return;
  if (win && win.webContents) win.webContents.send('deeplink', url);
  else pendingDeepLink = url;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    handleDeepLink(extractLink(argv));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.on('open-url', (_e, url) => handleDeepLink(url)); // macOS
  pendingDeepLink = extractLink(process.argv);
  app.whenReady().then(() => { resetData(); createWindow(); });
}
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => {
  if (session) { try { session.close(); } catch (_) {} }
  try { network.closeHostPort(); } catch (_) {}
  app.quit();
});

ipcMain.handle('start-session', (_e, cfg) => {
  if (session) { try { session.close(); } catch (_) {} session = null; }
  const eventsFile = path.resolve(__dirname, '..', '..', 'data', 'soulsync_events.jsonl');
  try {
    session = createSession({ ...cfg, eventsFile });
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
  session.on('state', (state) => { if (win) win.webContents.send('state', state); });
  session.on('notes', (notes) => { if (win) win.webContents.send('notes', notes); });
  session.on('log', (m) => { if (win) win.webContents.send('log', m); });
  session.on('lobby', (players) => { if (win) win.webContents.send('lobby', players); });
  session.on('conn', (info) => { if (win) win.webContents.send('conn', info); });
  session.on('rules', (rules) => { if (win) win.webContents.send('rules', rules); });
  session.on('reset', () => { if (win) win.webContents.send('reset'); });
  // CLIENT : l'hôte a lancé la partie → on reçoit le preset, on randomise et on joue.
  session.on('start-game', async ({ presetB64 }) => {
    if (win) win.webContents.send('game-starting');
    resetData();                 // nouvelle partie : on repart d'évènements vierges
    launcher.writePreset(presetB64);
    const romPath = launcher.readConfig().romPath;
    const res = await launcher.randomizeAndPlay(romPath, (m) => { if (win) win.webContents.send('rando-log', m); });
    if (res && res.ok) setTimeout(arrangeWindows, 1200);
    if (win) win.webContents.send('rando-done', res);
  });
  // CLIENT : l'hôte demande de sauvegarder / de reprendre une partie sauvegardée.
  session.on('save-game', ({ gameId, name }) => { launcher.saveGame(gameId, name); });
  session.on('load-game', async ({ gameId }) => {
    if (win) win.webContents.send('game-starting');
    const lr = launcher.loadGame(gameId);
    if (!lr.ok) { if (win) win.webContents.send('rando-done', lr); return; }
    if (session && session.reloadBridge) session.reloadBridge(); // rejoue l'historique restauré
    const res = await launcher.resumePlay((m) => { if (win) win.webContents.send('rando-log', m); });
    if (res && res.ok) setTimeout(arrangeWindows, 1200);
    if (win) win.webContents.send('rando-done', res);
  });
  return { ok: true, isHost: !!session.isHost };
});

// Agence les 2 fenêtres : BizHawk à gauche, SoulSync à droite, collées.
function arrangeWindows() {
  if (!win) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const bizW = Math.min(560, Math.max(420, Math.round(wa.width * 0.40)));
  win.setBounds({ x: wa.x + bizW, y: wa.y, width: wa.width - bizW, height: wa.height });
  const ps1 = path.join(__dirname, 'arrange-window.ps1');
  try {
    const p = spawn('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1,
        String(wa.x), String(wa.y), String(bizW), String(wa.height)],
      { windowsHide: true, detached: true, stdio: 'ignore' });
    p.unref();
  } catch (_) {}
}

ipcMain.handle('arrange-windows', () => { arrangeWindows(); return { ok: true }; });

ipcMain.handle('host-info', () => ({ ips: localIps(), port: 58787 }));

// Diagnostic réseau complet (LAN, Tailscale, IP publique, UPnP) pour l'hôte.
ipcMain.handle('net-diagnostics', async () => {
  try { return await network.diagnose(58787); }
  catch (e) { return { error: String(e && e.message || e) }; }
});

// --- Launcher 1-clic (randomizer + lancement BizHawk) ---
ipcMain.handle('get-rom', () => launcher.readConfig().romPath || null);

ipcMain.handle('pick-rom', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisis ta ROM Pokémon Noire 2 / Blanche 2 (.nds)',
    defaultPath: launcher.ROMS_DIR,
    filters: [{ name: 'ROM Nintendo DS', extensions: ['nds'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const cfg = launcher.readConfig();
  cfg.romPath = r.filePaths[0];
  launcher.writeConfig(cfg);
  return { ok: true, romPath: r.filePaths[0] };
});

ipcMain.handle('randomize-play', async () => {
  const romPath = launcher.readConfig().romPath;
  const res = await launcher.randomizeAndPlay(romPath, (m) => { if (win) win.webContents.send('rando-log', m); });
  if (res && res.ok) setTimeout(arrangeWindows, 1200); // laisse BizHawk créer sa fenêtre
  return res;
});

// Signale à l'hôte que MA ROM est prête (après l'avoir choisie).
ipcMain.handle('set-rom-ready', (_e, ready) => {
  if (session && session.setRomReady) session.setRomReady(ready !== false);
  return { ok: true };
});

// (HÔTE) Génère le preset depuis les réglages, le diffuse à tous, puis randomise+joue en local.
ipcMain.handle('host-start-game', async (_e, opts) => {
  const config = (opts && opts.config) || (opts && opts.categories) || {};
  const rules = (opts && opts.rules) || null;
  const gp = await launcher.generatePreset(config);
  if (!gp.ok) return { ok: false, error: gp.error };
  // Nouvelle partie : on remet à zéro l'état (évite que l'ancienne équipe réapparaisse).
  resetData();
  if (session && session.setRules && rules) session.setRules(rules);
  if (session && session.resetGame) session.resetGame();
  if (session && session.startGame) session.startGame(gp.b64, { config, rules });
  if (win) win.webContents.send('game-starting');
  const romPath = launcher.readConfig().romPath;
  const res = await launcher.randomizeAndPlay(romPath, (m) => { if (win) win.webContents.send('rando-log', m); });
  if (res && res.ok) setTimeout(arrangeWindows, 1200);
  return res;
});

// (HÔTE) Change les règles en direct (ex : lever la protection "1er combat").
ipcMain.handle('host-set-rules', (_e, rules) => {
  if (session && session.setRules) return { ok: true, rules: session.setRules(rules || {}) };
  return { ok: false };
});

// Ranime un Pokémon. Hôte/solo : n'importe lequel. Client : un des siens (l'hôte fait foi).
ipcMain.handle('revive-mon', (_e, opts) => {
  const pid = opts && opts.pid;
  const playerId = opts && opts.playerId;
  if (!session) return { ok: false };
  if (session.isHost && session.reviveFor && playerId) session.reviveFor(playerId, pid);
  else if (session.revive) session.revive(pid);
  return { ok: true };
});

// --- Sauvegarde / reprise de partie ---
ipcMain.handle('list-saves', () => launcher.listSaves());

// (HÔTE) Sauvegarde la partie courante pour tout le monde.
ipcMain.handle('host-save-game', (_e, opts) => {
  const name = (opts && opts.name) || 'partie';
  const gameId = launcher.sanitizeId(name) + '-' + Date.now();
  const sr = launcher.saveGame(gameId, name);
  if (sr.ok && session && session.broadcastMsg) session.broadcastMsg({ type: 'save-game', gameId, name });
  return Object.assign({ gameId, name }, sr);
});

// (HÔTE) Reprend une partie sauvegardée : restaure + diffuse l'ordre + relance.
ipcMain.handle('host-resume-game', async (_e, opts) => {
  const gameId = opts && opts.gameId;
  if (!gameId) return { ok: false, error: 'aucune sauvegarde sélectionnée' };
  const lr = launcher.loadGame(gameId);
  if (!lr.ok) return lr;
  if (session && session.reloadFromEvents) session.reloadFromEvents(); // reconstruit l'état hôte
  if (session && session.broadcastMsg) session.broadcastMsg({ type: 'load-game', gameId });
  if (win) win.webContents.send('game-starting');
  const res = await launcher.resumePlay((m) => { if (win) win.webContents.send('rando-log', m); });
  if (res && res.ok) setTimeout(arrangeWindows, 1200);
  return res;
});
