'use strict';
// Test des nouvelles règles : protection 1er combat, résurrection, évolution, toggles.
const assert = require('assert');
const { SoulSyncEngine } = require('./engine');

function kinds(notes) { return notes.map((n) => n.kind); }
let passed = 0;
function ok(label, cond) {
  if (!cond) { console.error('   ❌ ' + label); throw new Error('FAIL: ' + label); }
  console.log('   ✅ ' + label); passed++;
}

console.log('\n=== 1. Protection 1er combat ===');
{
  const e = new SoulSyncEngine({ protectFirstBattle: true });
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.applyEvent('B', { type: 'catch', order: 1, pid: 2, species: 1, name: 'Bulbizarre', level: 5 });
  const n = e.applyEvent('A', { type: 'death', pid: 1 });
  ok('mort protégée -> note "protected"', kinds(n).includes('protected'));
  ok('mort protégée -> Gruikui PAS mort', !e.snapshot('A').mons[0].dead);
  ok('mort protégée -> pas de cascade sur B', !e.snapshot('B').mons[0].dead);
}

console.log('\n=== 2. Lever la protection (setRules) puis mort réelle ===');
{
  const e = new SoulSyncEngine({ protectFirstBattle: true });
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.applyEvent('B', { type: 'catch', order: 1, pid: 2, species: 1, name: 'Bulbizarre', level: 5 });
  e.setRules({ protectFirstBattle: false });
  const n = e.applyEvent('A', { type: 'death', pid: 1 });
  ok('protection levée -> mort réelle', kinds(n).includes('death'));
  ok('protection levée -> cascade sur B', kinds(n).includes('cascade'));
  ok('protection levée -> Bulbizarre mort', e.snapshot('B').mons[0].dead);
}

console.log('\n=== 3. Résurrection (avec re-cascade) ===');
{
  const e = new SoulSyncEngine();
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.applyEvent('B', { type: 'catch', order: 1, pid: 2, species: 1, name: 'Bulbizarre', level: 5 });
  e.applyEvent('A', { type: 'death', pid: 1 }); // tue 1 + cascade 2
  ok('avant revive : A mort', e.snapshot('A').mons[0].dead);
  ok('avant revive : B mort (cascade)', e.snapshot('B').mons[0].dead);
  const n = e.revive('A', 1);
  ok('revive -> note "revive" pour A', n.some((x) => x.kind === 'revive' && x.playerId === 'A'));
  ok('revive -> re-cascade ranime B', n.some((x) => x.kind === 'revive' && x.playerId === 'B'));
  ok('après revive : A vivant', !e.snapshot('A').mons[0].dead);
  ok('après revive : B vivant', !e.snapshot('B').mons[0].dead);
}

console.log('\n=== 4. Évolution (espèce + nom mis à jour) ===');
{
  const e = new SoulSyncEngine();
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  const n = e.applyEvent('A', { type: 'evolve', pid: 1, species: 499, name: 'Grotichon', level: 17 });
  ok('evolve -> note "evolve"', kinds(n).includes('evolve'));
  const mon = e.snapshot('A').mons[0];
  ok('evolve -> espèce mise à jour (499)', mon.species === 499);
  ok('evolve -> nom mis à jour (Grotichon)', mon.name === 'Grotichon');
  ok('evolve -> ancien nom conservé dans la note', n.find((x) => x.kind === 'evolve').from === 'Gruikui');
}

console.log('\n=== 5. Désactiver Soul Link (pas de cascade) ===');
{
  const e = new SoulSyncEngine({ soulLink: false });
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.applyEvent('B', { type: 'catch', order: 1, pid: 2, species: 1, name: 'Bulbizarre', level: 5 });
  const n = e.applyEvent('A', { type: 'death', pid: 1 });
  ok('soulLink off -> mort sans cascade', kinds(n).includes('death') && !kinds(n).includes('cascade'));
  ok('soulLink off -> B reste vivant', !e.snapshot('B').mons[0].dead);
}

console.log('\n=== 6. Niveau en direct via updateHp ===');
{
  const e = new SoulSyncEngine();
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.updateHp('A', [{ pid: 1, hp: 20, maxhp: 22, level: 9, species: 498 }]);
  const mon = e.snapshot('A').mons[0];
  ok('updateHp -> niveau passé à 9', mon.level === 9);
  ok('updateHp -> PV à jour 20/22', mon.hp === 20 && mon.maxhp === 22);
}

console.log('\n=== 7. Reset (nouvelle partie) garde les règles ===');
{
  const e = new SoulSyncEngine({ soulLink: false });
  e.applyEvent('A', { type: 'catch', order: 1, pid: 1, species: 498, name: 'Gruikui', level: 5 });
  e.reset();
  ok('reset -> plus aucun joueur', e.playerIds().length === 0);
  ok('reset -> règles conservées (soulLink=false)', e.rules.soulLink === false);
}

console.log(`\n🎉 ${passed} assertions OK.\n`);
