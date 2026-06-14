'use strict';
//
// Résolution centralisée des chemins.
//   RES  = ressources LECTURE SEULE (BizHawk, JRE, jar UPR, source du tracker, .class).
//   DATA = données MODIFIABLES (évènements, sauvegardes, ROM randomisée, config, presets).
//
// - En dev / portable : RES = DATA = racine du projet (comportement historique).
// - Une fois installé (electron-builder NSIS) : RES = process.resourcesPath (lecture seule),
//   DATA = app.getPath('userData') (toujours accessible en écriture).
//
const path = require('path');
const fs = require('fs');

let electronApp = null;
try { electronApp = require('electron').app; } catch (_) { /* hors Electron (CLI/tests) */ }

const DEV_ROOT = path.resolve(__dirname, '..');             // app/.. = racine projet
const packaged = !!(electronApp && electronApp.isPackaged);

// Ressources lecture seule
const RES = packaged ? process.resourcesPath : DEV_ROOT;

// Racine des données modifiables
function resolveDataRoot() {
  if (packaged && electronApp) { try { return electronApp.getPath('userData'); } catch (_) {} }
  return DEV_ROOT;
}
const DATA = resolveDataRoot();

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }

const DATA_DIR = path.join(DATA, 'data');       // échange Lua <-> app
const SAVES_DIR = path.join(DATA, 'saves');     // sauvegardes de parties
const ROMS_DIR = path.join(DATA, 'roms');       // ROM randomisée (sortie)
const RANDO_DIR = path.join(DATA, 'randomizer'); // config + presets générés
[DATA_DIR, SAVES_DIR, ROMS_DIR, RANDO_DIR].forEach(ensureDir);

module.exports = {
  RES, DATA, packaged,

  // --- Lecture seule (ressources) ---
  JAR: path.join(RES, 'tools', 'upr', 'PokeRandoZX.jar'),
  PRESET_CLASSES: path.join(RES, 'tools', 'preset', 'out'),
  TRACKER_SRC: path.join(RES, 'tracker', 'soulsync_tracker.lua'), // modèle (non modifié)
  SPECIES_FILE: path.join(RES, 'tracker', 'species_fr.lua'),

  // --- Modifiable (données utilisateur) ---
  DATA_DIR, SAVES_DIR, ROMS_DIR, RANDO_DIR,
  EVENTS_FILE: path.join(DATA_DIR, 'soulsync_events.jsonl'),
  STATE_FILE: path.join(DATA_DIR, 'soulsync_state.json'),
  TRACKER_RUN: path.join(DATA_DIR, 'soulsync_tracker.lua'),       // copie réécrite, lancée par BizHawk
  CONFIG: path.join(RANDO_DIR, 'config.json'),
  PRESET: path.join(RANDO_DIR, 'soulsync-preset.rnqs'),
  PRESET_PROPS: path.join(RANDO_DIR, 'soulsync-preset.properties'),

  ensureDir
};
