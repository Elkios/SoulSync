'use strict';
//
// Pont Lua -> Node. Surveille un fichier JSONL (1 evenement par ligne) ecrit
// par le tracker Lua, et emet chaque evenement parse.
//
// Evenements 'event' : l'objet JSON parse, avec un champ _live :
//   - false : ligne deja presente au demarrage (rejouee pour reconstruire l'etat)
//   - true  : ligne ajoutee en direct (a notifier)
//
const fs = require('fs');
const EventEmitter = require('events');

class EventBridge extends EventEmitter {
  constructor(filePath, { pollMs = 300 } = {}) {
    super();
    this.filePath = filePath;
    this.pollMs = pollMs;
    this.offset = 0;
    this.buffer = '';
    this._timer = null;
  }

  start({ replayExisting = true } = {}) {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      this.offset = Buffer.byteLength(content, 'utf8');
      if (replayExisting) this._consume(content, false);
    } catch (_) {
      this.offset = 0; // le fichier n'existe pas encore : on attendra qu'il apparaisse
    }
    this._timer = setInterval(() => this._poll(), this.pollMs);
    return this;
  }

  _poll() {
    let stat;
    try { stat = fs.statSync(this.filePath); } catch (_) { return; }
    if (stat.size < this.offset) { this.offset = 0; this.buffer = ''; } // fichier reset/tronque
    if (stat.size === this.offset) return;

    const fd = fs.openSync(this.filePath, 'r');
    const len = stat.size - this.offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, this.offset);
    fs.closeSync(fd);
    this.offset = stat.size;
    this._consume(buf.toString('utf8'), true);
  }

  _consume(text, live) {
    this.buffer += text;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (_) { continue; }
      ev._live = live;
      this.emit('event', ev);
    }
  }

  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }
}

module.exports = { EventBridge };
