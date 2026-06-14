'use strict';
// Test du moteur : scenario a 2 joueurs (A et B) jouant en soul-link synchronise.
const { SoulSyncEngine } = require('./engine');

const e = new SoulSyncEngine();
function step(label, notes) {
  console.log('\n# ' + label);
  for (const n of notes) {
    const extra = n.causedBy ? ` (cause: ${n.causedBy.playerId}/${n.causedBy.mon.name})` : '';
    console.log(`   -> [${n.kind}] ${n.playerId} : ${n.mon ? n.mon.name : ''}${extra}`);
  }
  if (notes.length === 0) console.log('   (aucune notif)');
}

step('A capture #1 Gruikui',   e.applyEvent('A', { type:'catch', order:1, pid:100, species:498, name:'Gruikui',    level:5 }));
step('A capture #2 Ratentif',  e.applyEvent('A', { type:'catch', order:2, pid:101, species:504, name:'Ratentif',   level:2 }));
step('B capture #1 Bulbizarre',e.applyEvent('B', { type:'catch', order:1, pid:200, species:1,   name:'Bulbizarre', level:5 }));
step('B capture #2 Salameche', e.applyEvent('B', { type:'catch', order:2, pid:201, species:4,   name:'Salameche',  level:5 }));

console.log('\n# Liens (paires par ordre) :');
console.log('  ', JSON.stringify(e.links()));

step('A : Gruikui (#1) meurt -> doit tuer Bulbizarre (B #1) en cascade',
     e.applyEvent('A', { type:'death', pid:100 }));

step('A : Ratentif (#2) meurt -> cascade Salameche (B #2) + GAME OVER des deux equipes',
     e.applyEvent('A', { type:'death', pid:101 }));

step('Doublon : re-mort de Gruikui (doit etre ignore)',
     e.applyEvent('A', { type:'death', pid:100 }));

step('Clause d\'espece : A recapture un Gruikui (#498)',
     e.applyEvent('A', { type:'catch', order:3, pid:102, species:498, name:'Gruikui', level:6 }));

console.log('\n# Etat final A :', JSON.stringify(e.snapshot('A')));
console.log('# Etat final B :', JSON.stringify(e.snapshot('B')));
