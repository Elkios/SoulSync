'use strict';
//
// Moteur de regles Nuzlocke + Soul Link.
// Agnostique du joueur : on lui envoie des evenements taggues par playerId.
// Il maintient l'etat de chaque joueur et applique les regles :
//   - Nuzlocke : une mort est definitive.
//   - Soul Link : les Pokemon de meme ORDRE de capture sont lies (apparies).
//                 Quand l'un meurt, ses partenaires lies meurent aussi (cascade).
//   - Clause d'espece : alerte si une meme espece est capturee 2x (a travers les paires).
//   - Game over : quand toute l'equipe "vivante" d'un joueur est morte.
//
// Les REGLES sont configurables (this.rules) et peuvent etre changees en direct
// par l'hote (setRules). Notamment :
//   - soulLink           : active/desactive la cascade entre joueurs lies.
//   - speciesClause      : active/desactive l'alerte de doublon d'espece.
//   - protectFirstBattle : "1er combat non eliminatoire" — tant que c'est true,
//                          les morts ne comptent PAS (ni cascade ni game over) ;
//                          l'hote leve la protection apres le 1er combat du rival.
//
// applyEvent() renvoie une liste de "notifications" a afficher / diffuser.

const DEFAULT_RULES = {
  soulLink: true,            // cascade de morts entre Pokemon lies (meme ordre)
  speciesClause: true,       // alerte si une espece est capturee 2x chez un joueur
  protectFirstBattle: false  // 1er combat non eliminatoire (morts ignorees tant que true)
};

class SoulSyncEngine {
  constructor(rules) {
    /** playerId -> etat joueur */
    this.players = new Map();
    this.rules = Object.assign({}, DEFAULT_RULES, rules || {});
  }

  /** Remplace/fusionne la config de regles. Renvoie la config a jour. */
  setRules(rules) {
    if (rules && typeof rules === 'object') Object.assign(this.rules, rules);
    return this.rules;
  }

  /** Repart d'un etat vierge (nouvelle partie), en conservant les regles. */
  reset() {
    this.players = new Map();
  }

  _player(playerId) {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        id: playerId,
        byPid: new Map(),     // pid -> mon
        byOrder: new Map(),   // ordre de capture -> mon
        dead: new Set(),      // pids morts
        speciesSeen: new Map(), // species -> pid (pour la clause d'espece)
        hp: new Map(),        // pid -> { hp, maxhp } (PV en direct, depuis le Lua)
        inParty: new Set()    // pids actuellement dans l'équipe (le reste = en boîte)
      });
    }
    return this.players.get(playerId);
  }

  /** Liste des joueurs connus. */
  playerIds() {
    return [...this.players.keys()];
  }

  /**
   * Applique un evenement. ev = { type:'catch'|'death'|'evolve'|'revive', order, pid, species, name, level, slot }
   * Renvoie un tableau de notifications :
   *   { kind:'catch'|'death'|'cascade'|'species-clash'|'gameover'|'evolve'|'revive'|'protected', playerId, mon, ... }
   */
  applyEvent(playerId, ev) {
    const p = this._player(playerId);
    const notes = [];
    if (!ev || typeof ev.type !== 'string') return notes;

    if (ev.type === 'catch') {
      if (ev.pid == null || p.byPid.has(ev.pid)) {
        // PID deja connu : on met juste a jour le niveau/espece si fournis (rejeu/reprise)
        const known = p.byPid.get(ev.pid);
        if (known) {
          if (ev.level != null) known.level = ev.level;
          if (ev.species != null && ev.species !== 0) known.species = ev.species;
          if (ev.name) known.name = ev.name;
          if (ev.dead) p.dead.add(ev.pid); // restauration d'un mort connu (reprise)
        }
        return notes;
      }
      const mon = {
        pid: ev.pid,
        order: ev.order,
        species: ev.species,
        name: ev.name || ('#' + ev.species),
        level: ev.level
      };
      p.byPid.set(mon.pid, mon);
      if (mon.order != null) p.byOrder.set(mon.order, mon);
      if (ev.dead) { p.dead.add(mon.pid); return notes; } // reprise : mort restaure, pas de notif
      notes.push({ kind: 'catch', playerId, mon });

      // Clause d'espece (au sein d'un meme joueur)
      if (this.rules.speciesClause && mon.species != null) {
        if (p.speciesSeen.has(mon.species)) {
          notes.push({ kind: 'species-clash', playerId, mon, species: mon.species });
        } else {
          p.speciesSeen.set(mon.species, mon.pid);
        }
      } else if (mon.species != null && !p.speciesSeen.has(mon.species)) {
        p.speciesSeen.set(mon.species, mon.pid);
      }
    } else if (ev.type === 'evolve') {
      // Evolution : un PID connu change d'espece (et souvent de nom).
      const mon = p.byPid.get(ev.pid);
      if (!mon || ev.species == null) return notes;
      const from = mon.name;
      const fromSpecies = mon.species;
      mon.species = ev.species;
      if (ev.name) mon.name = ev.name;
      if (ev.level != null) mon.level = ev.level;
      if (fromSpecies !== ev.species) {
        notes.push({ kind: 'evolve', playerId, mon, from, fromSpecies });
      }
    } else if (ev.type === 'revive') {
      // Resurrection manuelle (ex : mort lors d'un combat "qui ne compte pas").
      return this.revive(playerId, ev.pid);
    } else if (ev.type === 'death') {
      if (ev.pid == null || p.dead.has(ev.pid)) return notes; // deja mort

      // Protection "1er combat" : la mort est ignoree (ni cascade, ni game over).
      if (this.rules.protectFirstBattle) {
        const mon = p.byPid.get(ev.pid) || { pid: ev.pid, name: ev.name || '?', level: ev.level };
        notes.push({ kind: 'protected', playerId, mon });
        return notes;
      }

      p.dead.add(ev.pid);
      const mon = p.byPid.get(ev.pid) || {
        pid: ev.pid, order: ev.order ?? null, name: ev.name || '?', level: ev.level
      };
      notes.push({ kind: 'death', playerId, mon });

      // Cascade Soul Link : tout partenaire de meme ordre meurt aussi
      const order = mon.order;
      if (this.rules.soulLink && order != null) {
        for (const [otherId, op] of this.players) {
          if (otherId === playerId) continue;
          const partner = op.byOrder.get(order);
          if (partner && !op.dead.has(partner.pid)) {
            op.dead.add(partner.pid);
            notes.push({ kind: 'cascade', playerId: otherId, mon: partner, causedBy: { playerId, mon } });
          }
        }
      }

      // Game over : tous les Pokemon connus de ce joueur sont morts (et il en a au moins 1)
      for (const id of this.playerIds()) {
        if (this._isWipedOut(id)) {
          notes.push({ kind: 'gameover', playerId: id });
        }
      }
    }
    return notes;
  }

  /**
   * Ressuscite un Pokemon (et ses partenaires lies morts par cascade).
   * Renvoie les notifications 'revive'.
   */
  revive(playerId, pid) {
    const notes = [];
    const p = this.players.get(playerId);
    if (!p || pid == null || !p.dead.has(pid)) return notes;
    p.dead.delete(pid);
    p._gameOverNotified = false;
    const mon = p.byPid.get(pid) || { pid };
    notes.push({ kind: 'revive', playerId, mon });

    // Re-cascade : on ranime aussi les partenaires lies (memes regles que la mort).
    const order = mon.order;
    if (this.rules.soulLink && order != null) {
      for (const [otherId, op] of this.players) {
        if (otherId === playerId) continue;
        const partner = op.byOrder.get(order);
        if (partner && op.dead.has(partner.pid)) {
          op.dead.delete(partner.pid);
          op._gameOverNotified = false;
          notes.push({ kind: 'revive', playerId: otherId, mon: partner, causedBy: { playerId, mon } });
        }
      }
    }
    return notes;
  }

  _isWipedOut(playerId) {
    const p = this.players.get(playerId);
    if (!p || p.byPid.size === 0) return false;
    for (const pid of p.byPid.keys()) {
      if (!p.dead.has(pid)) return false; // au moins un vivant
    }
    // Eviter de re-notifier : on marque une seule fois
    if (p._gameOverNotified) return false;
    p._gameOverNotified = true;
    return true;
  }

  /** Met à jour les PV (et le niveau/espece) en direct d'un joueur (depuis le tracker Lua). */
  updateHp(playerId, party) {
    if (!Array.isArray(party)) return;
    const p = this._player(playerId);
    const present = new Set();
    for (const m of party) {
      if (m && m.pid != null) {
        p.hp.set(m.pid, { hp: m.hp, maxhp: m.maxhp });
        present.add(m.pid);
        const mon = p.byPid.get(m.pid);
        if (mon) {
          if (m.level != null) mon.level = m.level;                 // niveau en direct
          if (m.species != null && m.species !== 0) mon.species = m.species; // evolution (secours)
        }
      }
    }
    if (present.size > 0) p.inParty = present; // qui est dans l'équipe maintenant
  }

  /** Etat resume d'un joueur (pour affichage/dashboard). */
  snapshot(playerId) {
    const p = this.players.get(playerId);
    if (!p) return { playerId, mons: [] };
    const mons = [...p.byPid.values()]
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))
      .map(m => {
        const h = p.hp.get(m.pid) || {};
        const dead = p.dead.has(m.pid);
        const boxed = !dead && p.inParty.size > 0 && !p.inParty.has(m.pid);
        return { ...m, dead, boxed, hp: h.hp ?? null, maxhp: h.maxhp ?? null };
      });
    return { playerId, mons };
  }

  /** Renvoie les paires liees (par ordre) entre tous les joueurs. */
  links() {
    const orders = new Set();
    for (const p of this.players.values())
      for (const o of p.byOrder.keys()) orders.add(o);
    const result = [];
    for (const o of [...orders].sort((a, b) => a - b)) {
      const members = [];
      for (const [id, p] of this.players) {
        const mon = p.byOrder.get(o);
        if (mon) members.push({ playerId: id, name: mon.name, pid: mon.pid, dead: p.dead.has(mon.pid) });
      }
      result.push({ order: o, members });
    }
    return result;
  }
}

module.exports = { SoulSyncEngine, DEFAULT_RULES };
