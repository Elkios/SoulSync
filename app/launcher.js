'use strict';
//
// Launcher 1-clic : randomise la ROM du joueur (UPR CLI) puis lance BizHawk
// avec la ROM randomisée + le tracker Lua. Tout est local à la machine du joueur.
//
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JAR = path.join(ROOT, 'tools', 'upr', 'PokeRandoZX.jar');
const PRESET = path.join(ROOT, 'app', 'randomizer', 'soulsync-preset.rnqs');
const TRACKER = path.join(ROOT, 'tracker', 'soulsync_tracker.lua');

// Réécrit les chemins ABSOLUS du tracker Lua (OUT_DIR + SPECIES_FILE) pour qu'ils
// pointent vers le dossier de CETTE machine (sinon le Lua écrit dans un chemin
// codé en dur qui n'existe pas chez les autres → aucune sync).
function prepareTracker() {
  try {
    let lua = fs.readFileSync(TRACKER, 'utf8');
    const dataDir = path.join(ROOT, 'data') + path.sep;
    const speciesFile = path.join(ROOT, 'tracker', 'species_fr.lua');
    lua = lua.replace(/local OUT_DIR = \[\[[^\]]*\]\]/, 'local OUT_DIR = [[' + dataDir + ']]');
    lua = lua.replace(/local SPECIES_FILE = \[\[[^\]]*\]\]/, 'local SPECIES_FILE = [[' + speciesFile + ']]');
    fs.writeFileSync(TRACKER, lua);
  } catch (_) {}
}

// Trouve l'exécutable Java : JRE embarqué (jre/bin/java.exe) en priorité, sinon le 'java' du système.
function findJava() {
  const bundled = path.join(ROOT, 'jre', 'bin', 'java.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'java';
}

// Trouve EmuHawk.exe : dossier embarqué "emulator/", sinon un dossier "BizHawk-*/".
function findEmu() {
  const bundled = path.join(ROOT, 'emulator', 'EmuHawk.exe');
  if (fs.existsSync(bundled)) return bundled;
  try {
    for (const d of fs.readdirSync(ROOT)) {
      if (/^BizHawk/i.test(d)) {
        const exe = path.join(ROOT, d, 'EmuHawk.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch (_) {}
  return path.join(ROOT, 'BizHawk-2.11.1-win-x64', 'EmuHawk.exe');
}
const OUT_ROM = path.join(ROOT, 'roms', 'soulsync-randomized.nds');
const CONFIG = path.join(ROOT, 'app', 'randomizer', 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (_) { return {}; }
}
function writeConfig(c) {
  try { fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); } catch (_) {}
}

function checkEnv() {
  const missing = [];
  if (!fs.existsSync(JAR)) missing.push('UPR (randomizer)');
  if (!fs.existsSync(PRESET)) missing.push('preset de randomisation');
  if (!fs.existsSync(findEmu())) missing.push('BizHawk');
  if (!fs.existsSync(TRACKER)) missing.push('tracker Lua');
  return missing;
}

// Randomise la ROM puis lance BizHawk. onLog(msg) = progression vers l'UI.
function randomizeAndPlay(romPath, onLog) {
  return new Promise((resolve) => {
    const missing = checkEnv();
    if (missing.length) return resolve({ ok: false, error: 'Éléments manquants : ' + missing.join(', ') });
    if (!romPath || !fs.existsSync(romPath)) {
      return resolve({ ok: false, error: 'ROM de base introuvable — choisis-la d\'abord.' });
    }

    onLog('🎲 Randomisation en cours… (~30 s, ne ferme pas la fenêtre)');
    const args = ['-Xmx2048M', '-jar', JAR, 'cli', '-s', PRESET, '-i', romPath, '-o', OUT_ROM];
    let proc;
    try {
      proc = spawn(findJava(), args, { windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, error: 'Java introuvable : ' + e.message });
    }
    let errBuf = '';
    proc.stderr.on('data', (d) => { errBuf += d.toString(); });
    proc.on('error', (e) => resolve({ ok: false, error: 'Java/UPR : ' + e.message }));
    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(OUT_ROM)) {
        const tail = errBuf.trim().split('\n').pop() || ('code ' + code);
        return resolve({ ok: false, error: 'Échec de la randomisation : ' + tail });
      }
      onLog('✅ ROM randomisée — lancement du jeu…');
      prepareTracker(); // chemins du tracker corrects pour CETTE machine
      try {
        const emu = spawn(findEmu(), [OUT_ROM, '--lua=' + TRACKER], { detached: true, stdio: 'ignore' });
        emu.unref();
        resolve({ ok: true });
      } catch (ex) {
        resolve({ ok: false, error: 'Lancement BizHawk : ' + ex.message });
      }
    });
  });
}

const PRESET_CLASSES = path.join(ROOT, 'tools', 'preset', 'out');
const PRESET_PROPS = path.join(ROOT, 'app', 'randomizer', 'soulsync-preset.properties');

// Écrit la config full-custom en fichier .properties (clé=valeur) lu par GenPreset.
// config = objet plat { "mode.wild":1, "flag.shinyChance":true, "int.trainersLevelModifier":20, "miscTweaks":512, ... }
function writeProps(config) {
  const cfg = (config && typeof config === 'object') ? config : {};
  const lines = ['romName=SoulSync'];
  for (const k of Object.keys(cfg)) {
    if (k === 'romName') continue;
    const v = cfg[k];
    if (v === undefined || v === null) continue;
    lines.push(k + '=' + (v === true ? 'true' : v === false ? 'false' : String(v)));
  }
  fs.writeFileSync(PRESET_PROPS, lines.join('\n') + '\n');
}

// (HÔTE) Génère le preset .rnqs depuis la config full-custom, renvoie ses octets en base64.
// Rétro-compat : si on reçoit un tableau (anciennes catégories), on active leur mode "aléatoire".
function generatePreset(config) {
  return new Promise((resolve) => {
    let cfg = config;
    if (Array.isArray(config)) {
      cfg = {};
      const MAP = { wild: 'mode.wild', trainers: 'mode.trainers', starters: 'mode.starters',
        statics: 'mode.statics', trades: 'mode.trades', abilities: 'mode.abilities', types: 'mode.types',
        stats: 'mode.stats', evolutions: 'mode.evolutions', movesets: 'mode.movesets', tms: 'mode.tms',
        tutors: 'mode.tutors', fielditems: 'mode.fielditems', shopitems: 'mode.shopitems', pickup: 'mode.pickup' };
      for (const c of config) if (MAP[c]) cfg[MAP[c]] = (c === 'starters' || c === 'types' || c === 'stats') ? 2 : 1;
    }
    try { writeProps(cfg); } catch (e) { return resolve({ ok: false, error: 'config preset : ' + e.message }); }
    const args = ['-cp', JAR + path.delimiter + PRESET_CLASSES, 'GenPreset', PRESET, PRESET_PROPS];
    let proc;
    try { proc = spawn(findJava(), args, { windowsHide: true }); }
    catch (e) { return resolve({ ok: false, error: 'Java : ' + e.message }); }
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => resolve({ ok: false, error: 'Java : ' + e.message }));
    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(PRESET)) {
        return resolve({ ok: false, error: 'Génération du preset échouée : ' + (err.trim().split('\n').pop() || code) });
      }
      try { resolve({ ok: true, b64: fs.readFileSync(PRESET).toString('base64') }); }
      catch (e) { resolve({ ok: false, error: e.message }); }
    });
  });
}

// (CLIENT) Écrit le preset reçu de l'hôte (base64) à l'emplacement attendu.
function writePreset(b64) {
  try { fs.writeFileSync(PRESET, Buffer.from(b64, 'base64')); return true; } catch (_) { return false; }
}

// ----------------- SAUVEGARDE / REPRISE DE PARTIE -----------------
const SAVES_DIR = path.join(ROOT, 'saves');
const EVENTS_FILE = path.join(ROOT, 'data', 'soulsync_events.jsonl');

// Emplacement de la sauvegarde DANS le jeu (SRAM) gérée par BizHawk pour notre ROM.
function saveRamPath() {
  const bizDir = path.dirname(findEmu()); // .../BizHawk-.../
  return path.join(bizDir, 'NDS', 'SaveRAM', 'soulsync-randomized.SaveRAM');
}

function sanitizeId(s) {
  return (String(s || 'partie').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 40)) || 'partie';
}

// Sauvegarde la partie courante (ROM + progression + roster) sous gameId.
function saveGame(gameId, name) {
  try {
    const dir = path.join(SAVES_DIR, gameId);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(OUT_ROM)) fs.copyFileSync(OUT_ROM, path.join(dir, 'randomized.nds'));
    const sram = saveRamPath();
    if (fs.existsSync(sram)) fs.copyFileSync(sram, path.join(dir, 'progress.SaveRAM'));
    if (fs.existsSync(EVENTS_FILE)) fs.copyFileSync(EVENTS_FILE, path.join(dir, 'events.jsonl'));
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ gameId, name: name || gameId, date: new Date().toISOString() }));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Liste les sauvegardes locales (les plus récentes d'abord).
function listSaves() {
  try {
    if (!fs.existsSync(SAVES_DIR)) return [];
    return fs.readdirSync(SAVES_DIR)
      .map((id) => { try { return JSON.parse(fs.readFileSync(path.join(SAVES_DIR, id, 'meta.json'), 'utf8')); } catch (_) { return null; } })
      .filter(Boolean)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  } catch (_) { return []; }
}

// Restaure une sauvegarde (ROM + progression + roster) sur cette machine.
function loadGame(gameId) {
  try {
    const dir = path.join(SAVES_DIR, gameId);
    if (!fs.existsSync(dir)) return { ok: false, error: 'sauvegarde introuvable sur cette machine' };
    const rom = path.join(dir, 'randomized.nds');
    if (fs.existsSync(rom)) fs.copyFileSync(rom, OUT_ROM);
    const sram = path.join(dir, 'progress.SaveRAM');
    if (fs.existsSync(sram)) { const dst = saveRamPath(); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(sram, dst); }
    const ev = path.join(dir, 'events.jsonl');
    if (fs.existsSync(ev)) fs.copyFileSync(ev, EVENTS_FILE);
    else fs.writeFileSync(EVENTS_FILE, '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Relance la ROM déjà en place (restaurée) SANS re-randomiser.
function resumePlay(onLog) {
  return new Promise((resolve) => {
    if (!fs.existsSync(OUT_ROM)) return resolve({ ok: false, error: 'ROM de la sauvegarde introuvable' });
    onLog('▶️ Reprise de la partie…');
    prepareTracker();
    try {
      const emu = spawn(findEmu(), [OUT_ROM, '--lua=' + TRACKER], { detached: true, stdio: 'ignore' });
      emu.unref();
      resolve({ ok: true });
    } catch (ex) { resolve({ ok: false, error: 'Lancement BizHawk : ' + ex.message }); }
  });
}

module.exports = {
  randomizeAndPlay, generatePreset, writePreset, resumePlay,
  saveGame, listSaves, loadGame, sanitizeId,
  readConfig, writeConfig, ROMS_DIR: path.join(ROOT, 'roms')
};
