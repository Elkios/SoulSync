'use strict';
//
// Surveille le fichier de snapshot live (soulsync_state.json, réécrit par le Lua)
// et appelle un callback avec l'objet parsé quand il change. Sert à remonter les
// PV en direct (le fichier est écrasé, pas appendé — pas de bloat).
//
const fs = require('fs');

class StateWatcher {
  constructor(file, { pollMs = 600 } = {}) {
    this.file = file;
    this.pollMs = pollMs;
    this.last = '';
    this.cb = null;
    this.timer = null;
  }

  start(cb) {
    this.cb = cb;
    this.timer = setInterval(() => this._poll(), this.pollMs);
    return this;
  }

  _poll() {
    let txt;
    try { txt = fs.readFileSync(this.file, 'utf8'); } catch (_) { return; }
    if (txt === this.last) return;
    this.last = txt;
    let obj;
    try { obj = JSON.parse(txt); } catch (_) { return; }
    if (obj && this.cb) this.cb(obj);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = { StateWatcher };
