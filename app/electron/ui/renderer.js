'use strict';
const $ = (s) => document.querySelector(s);

let uiMode = 'host';   // 'host' | 'client' | 'solo'
let lastConfig = null;
let me = '';
let latestState = { players: [], links: [] };
const playerOrder = [];

// Spec FULL CUSTOM du randomizer : chaque contrôle se mappe à une clé GenPreset.
//  type 'mode' -> <select> (options {v,t}) ; 'flag' -> case ; 'int' -> curseur ; 'tweak' -> case (bit de miscTweaks)
const M = (v, t) => ({ v, t });
const RANDO_GROUPS = [
  { title: '🌿 Pokémon sauvages', items: [
    { type: 'mode', key: 'mode.wild', label: 'Pokémon sauvages', def: 1,
      options: [M(0, 'Inchangés'), M(1, 'Aléatoires'), M(2, '1-pour-1 par zone'), M(3, 'Global 1-pour-1')] },
    { type: 'mode', key: 'mode.wildRestriction', label: 'Restriction', def: 0,
      options: [M(0, 'Aucune'), M(1, 'Force similaire'), M(2, 'Tous capturables'), M(3, 'Thème de type/zone')] },
    { type: 'flag', key: 'flag.useTimeBasedEncounters', label: "Rencontres selon l'heure", def: false },
    { type: 'flag', key: 'flag.blockWildLegendaries', label: 'Bannir les légendaires sauvages', def: false },
    { type: 'flag', key: 'flag.randomizeWildHeldItems', label: 'Objets tenus aléatoires (sauvages)', def: false },
    { type: 'int', key: 'int.minimumCatchRateLevel', label: 'Taux de capture minimum', def: 0, min: 0, max: 5, suffix: ' (0=off)' }
  ] },
  { title: '🥊 Dresseurs', items: [
    { type: 'mode', key: 'mode.trainers', label: 'Équipes des dresseurs', def: 1,
      options: [M(0, 'Inchangées'), M(1, 'Aléatoires'), M(2, 'Réparties'), M(3, 'Run principal'), M(4, 'Thème de type'), M(5, 'Thème type (Arènes/C4)')] },
    { type: 'int', key: 'int.trainersLevelModifier', label: 'Difficulté — niveaux', def: 0, min: -50, max: 50, step: 5, suffix: '%' },
    { type: 'flag', key: 'flag.trainersForceFullyEvolved', label: 'Forcer les évolutions finales', def: false },
    { type: 'int', key: 'int.forceFullyEvolvedLevel', label: '↳ à partir du niveau', def: 30, min: 1, max: 65 },
    { type: 'flag', key: 'flag.rivalCarriesStarter', label: 'Le rival garde un contre-starter', def: false },
    { type: 'flag', key: 'flag.betterTrainerMovesets', label: 'Meilleurs movesets des dresseurs', def: false },
    { type: 'flag', key: 'flag.doubleBattleMode', label: 'Mode double combat partout', def: false },
    { type: 'int', key: 'int.additionalBoss', label: 'Pokémon en + (boss)', def: 0, min: 0, max: 5 },
    { type: 'int', key: 'int.additionalImportant', label: 'Pokémon en + (importants)', def: 0, min: 0, max: 5 },
    { type: 'int', key: 'int.additionalRegular', label: 'Pokémon en + (normaux)', def: 0, min: 0, max: 5 },
    { type: 'flag', key: 'flag.shinyChance', label: 'Chance de shiny chez les dresseurs', def: false },
    { type: 'flag', key: 'flag.heldItemsBoss', label: 'Objets tenus aléatoires (boss)', def: false },
    { type: 'flag', key: 'flag.heldItemsImportant', label: 'Objets tenus aléatoires (importants)', def: false },
    { type: 'flag', key: 'flag.heldItemsRegular', label: 'Objets tenus aléatoires (normaux)', def: false },
    { type: 'flag', key: 'flag.trainersBlockLegendaries', label: 'Bannir les légendaires (dresseurs)', def: false },
    { type: 'flag', key: 'flag.trainersBlockEarlyWonderGuard', label: 'Bloquer Garde Mystik (anti-cheese)', def: false }
  ] },
  { title: '🎒 Starters, fixes & échanges', items: [
    { type: 'mode', key: 'mode.starters', label: 'Starters', def: 2,
      options: [M(0, 'Inchangés'), M(2, 'Complètement aléatoires'), M(3, 'Avec 2 évolutions')] },
    { type: 'flag', key: 'flag.randomizeStartersHeldItems', label: 'Objet tenu par le starter', def: false },
    { type: 'mode', key: 'mode.statics', label: 'Légendaires / Pokémon fixes', def: 0,
      options: [M(0, 'Inchangés'), M(1, 'Aléatoires similaires'), M(2, 'Complètement aléatoires'), M(3, 'Force similaire')] },
    { type: 'mode', key: 'mode.trades', label: 'Échanges en jeu', def: 0,
      options: [M(0, 'Inchangés'), M(1, 'Donné'), M(2, 'Donné + demandé')] }
  ] },
  { title: '🧬 Données des Pokémon', items: [
    { type: 'mode', key: 'mode.abilities', label: 'Talents', def: 0, options: [M(0, 'Inchangés'), M(1, 'Aléatoires')] },
    { type: 'mode', key: 'mode.types', label: 'Types', def: 0,
      options: [M(0, 'Inchangés'), M(1, 'Aléatoires (suit évolutions)'), M(2, 'Complètement aléatoires')] },
    { type: 'mode', key: 'mode.stats', label: 'Statistiques de base', def: 0,
      options: [M(0, 'Inchangées'), M(1, 'Mélangées'), M(2, 'Aléatoires')] },
    { type: 'mode', key: 'mode.evolutions', label: 'Évolutions', def: 0,
      options: [M(0, 'Inchangées'), M(1, 'Aléatoires'), M(2, 'Aléatoires à chaque niveau')] }
  ] },
  { title: '⚔️ Attaques & movesets', items: [
    { type: 'mode', key: 'mode.movesets', label: 'Attaques apprises', def: 0,
      options: [M(0, 'Inchangées'), M(1, 'Aléa (préf. même type)'), M(2, 'Complètement aléa'), M(3, 'Métronome only')] },
    { type: 'flag', key: 'flag.movesetsForceGoodDamaging', label: 'Garantir une attaque offensive', def: false },
    { type: 'int', key: 'int.guaranteedMoveCount', label: 'Attaques garanties au départ', def: 0, min: 0, max: 4, suffix: ' (0=off)' }
  ] },
  { title: '💿 CT & Maîtres des capacités', items: [
    { type: 'mode', key: 'mode.tms', label: 'CT (capacités techniques)', def: 0, options: [M(0, 'Inchangées'), M(1, 'Aléatoires')] },
    { type: 'mode', key: 'mode.tmCompat', label: 'Compatibilité CT/CS', def: 0,
      options: [M(0, 'Inchangée'), M(1, 'Aléa (préf. type)'), M(2, 'Complètement aléa'), M(3, 'Pleine compatibilité')] },
    { type: 'mode', key: 'mode.tutors', label: 'Maîtres des capacités', def: 0, options: [M(0, 'Inchangés'), M(1, 'Aléatoires')] },
    { type: 'mode', key: 'mode.tutorCompat', label: 'Compatibilité tutors', def: 0,
      options: [M(0, 'Inchangée'), M(1, 'Aléa (préf. type)'), M(2, 'Complètement aléa'), M(3, 'Pleine compatibilité')] }
  ] },
  { title: '🛍️ Objets', items: [
    { type: 'mode', key: 'mode.fielditems', label: 'Objets au sol', def: 0,
      options: [M(0, 'Inchangés'), M(1, 'Mélangés'), M(2, 'Aléatoires'), M(3, 'Aléatoires équilibrés')] },
    { type: 'mode', key: 'mode.shopitems', label: 'Objets en boutique', def: 0,
      options: [M(0, 'Inchangés'), M(1, 'Mélangés'), M(2, 'Aléatoires')] },
    { type: 'mode', key: 'mode.pickup', label: 'Objets ramassés (Ramassage)', def: 0, options: [M(0, 'Inchangés'), M(1, 'Aléatoires')] }
  ] },
  { title: '⚙️ Réglages divers', items: [
    { type: 'tweak', key: 'challengeMode', bit: 512, label: '🔥 Mode Difficile (Challenge Mode)', def: false },
    { type: 'tweak', key: 'fastestText', bit: 8, label: '⚡ Texte ultra-rapide', def: false },
    { type: 'tweak', key: 'nationalDex', bit: 128, label: '📕 Pokédex national au départ', def: false }
  ] }
];

// Règles activables (Nuzlocke / Soul Link). L'hôte les définit ; tout le monde les voit.
const RULES = [
  { key: 'protectFirstBattle', label: '🛡️ 1er combat non éliminatoire', def: true,
    hint: "Les morts ne comptent pas tant que c'est actif. Lève-le après le 1er combat du rival (bouton dans la partie)." },
  { key: 'soulLink', label: '🔗 Soul Link (morts liées en cascade)', def: true,
    hint: "Quand un Pokémon meurt, son partenaire lié chez les autres meurt aussi." },
  { key: 'speciesClause', label: "⚠️ Clause d'espèce", def: true,
    hint: "Alerte si une même espèce est capturée 2 fois." }
];
let currentRules = { protectFirstBattle: true, soulLink: true, speciesClause: true };

// ---------- ACCUEIL (3 modes) ----------
function setupLog(t) { $('#setup-log').textContent = t || ''; }
function pseudo() { return ($('#pseudo').value || '').trim() || 'Joueur'; }

$('#m-host').onclick = () => startSession('host');
$('#m-solo').onclick = () => startSession('solo');
$('#m-join').onclick = () => { $('#join-row').style.display = 'flex'; $('#hostip').focus(); };
$('#join-go').onclick = () => {
  const ip = ($('#hostip').value || '').trim();
  if (!ip) { setupLog("Entre l'IP:port de l'hôte."); return; }
  startSession('client', ip);
};

async function startSession(mode, hostip) {
  uiMode = mode;
  me = pseudo();
  if (!window.soulsync) { setupLog('(aperçu — lance via SoulSync.bat pour jouer)'); return; }
  const cfg = mode === 'client'
    ? { mode: 'client', name: me, hostUrl: hostip }
    : { mode: 'host', name: me, port: 58787 };   // solo = hôte local
  setupLog('Démarrage…');
  const res = await window.soulsync.startSession(cfg);
  if (!res || !res.ok) { setupLog('Erreur : ' + ((res && res.error) || '?')); return; }
  enterLobby();
}

// ---------- LOBBY ----------
function enterLobby() {
  $('#setup').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
  $('#lobby-me').textContent = '👤 ' + me;
  const isHostUI = (uiMode === 'host' || uiMode === 'solo');
  $('#lobby-role').textContent = uiMode === 'host' ? '🖥️ Hôte' : (uiMode === 'solo' ? '🎮 Solo' : '🔗 Client');

  const lc = $('#lobby-conn');
  if (lc) {
    if (uiMode === 'solo') { lc.style.display = 'none'; }
    else if (uiMode === 'client') { lc.style.display = ''; setLobbyConn('connecting'); }
    else { lc.style.display = ''; lc.textContent = '👥 0 pote connecté'; lc.classList.add('off'); }
  }

  if (uiMode === 'host') {
    $('#share-box').classList.remove('hidden');
    $('#share-link').textContent = 'Analyse du réseau… (UPnP, IP publique)';
    window.soulsync.netDiagnostics().then(renderNetDiag).catch(() => {
      $('#share-link').textContent = 'Diagnostic réseau indisponible';
    });
  } else {
    $('#share-box').classList.add('hidden');
  }

  renderRules(isHostUI);
  $('#rules-who').textContent = isHostUI ? '' : "(définies par l'hôte)";
  renderSettings(isHostUI);
  $('#settings-who').textContent = isHostUI ? '' : "(définis par l'hôte)";
  $('#lobby-play').style.display = isHostUI ? 'block' : 'none';
  $('#lobby-wait').classList.toggle('hidden', isHostUI);
  if (uiMode === 'solo') $('#player-list').innerHTML = '';

  // Reprendre une partie sauvegardée (hôte/solo uniquement)
  if (isHostUI && window.soulsync) window.soulsync.listSaves().then((s) => renderResumeList(s || []));
  else $('#resume-section').classList.add('hidden');
}

function renderResumeList(saves) {
  const sec = $('#resume-section'); const list = $('#resume-list');
  if (!sec || !list) return;
  if (!saves.length) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  list.innerHTML = '';
  for (const s of saves) {
    const d = s.date ? new Date(s.date).toLocaleString('fr-FR') : '';
    const row = document.createElement('div');
    row.className = 'resume-row';
    row.innerHTML = `<div class="resume-info"><b>${esc(s.name || s.gameId)}</b><span class="resume-date">${d}</span></div>` +
      `<button class="big-btn resume-go" data-id="${esc(s.gameId)}">▶️ Reprendre</button>`;
    list.appendChild(row);
  }
  list.querySelectorAll('.resume-go').forEach((b) => { b.onclick = () => resumeGame(b.dataset.id); });
}

async function resumeGame(gameId) {
  if (!window.soulsync) return;
  showRando('▶️ Reprise de la partie…');
  const res = await window.soulsync.hostResumeGame({ gameId });
  if (res && res.ok) { setRando("✅ C'est reparti !"); goDashboard(); setTimeout(hideRando, 2600); }
  else { setRando('❌ ' + ((res && res.error) || 'Erreur')); setTimeout(hideRando, 6000); }
}

// Config par défaut (depuis la spec) — sert au 1er rendu et au fallback.
function defaultConfig() {
  const cfg = { romName: 'SoulSync', miscTweaks: 0 };
  for (const g of RANDO_GROUPS) for (const it of g.items) {
    if (it.type === 'mode' || it.type === 'int') cfg[it.key] = it.def;
    else if (it.type === 'flag') cfg[it.key] = it.def;
    else if (it.type === 'tweak' && it.def) cfg.miscTweaks |= it.bit;
  }
  return cfg;
}

function renderSettings(editable) {
  const c = $('#settings-list');
  if (!c) return;
  c.innerHTML = '';
  if (!editable) {
    c.innerHTML = '<div class="settings-readonly">🎲 Les réglages du randomizer sont définis par l\'hôte.</div>';
    return;
  }
  const dis = ''; // hôte = éditable
  for (const g of RANDO_GROUPS) {
    const h = document.createElement('div');
    h.className = 'settings-group';
    h.textContent = g.title;
    c.appendChild(h);
    for (const it of g.items) {
      const row = document.createElement('label');
      row.className = 'setting-row rando-row';
      if (it.type === 'mode') {
        const opts = it.options.map((o) => `<option value="${o.v}" ${o.v === it.def ? 'selected' : ''}>${esc(o.t)}</option>`).join('');
        row.innerHTML = `<span class="rando-label">${esc(it.label)}</span><select data-mode="${it.key}" ${dis}>${opts}</select>`;
      } else if (it.type === 'int') {
        row.innerHTML = `<span class="rando-label">${esc(it.label)}</span>` +
          `<span class="rando-slider"><input type="range" data-int="${it.key}" min="${it.min}" max="${it.max}" step="${it.step || 1}" value="${it.def}" ${dis}>` +
          `<b class="rando-val">${it.def}${esc(it.suffix || '')}</b></span>`;
      } else { // flag / tweak
        const attr = it.type === 'tweak' ? `data-tweak="${it.key}" data-bit="${it.bit}"` : `data-flag="${it.key}"`;
        row.innerHTML = `<input type="checkbox" ${attr} ${it.def ? 'checked' : ''} ${dis}><span>${esc(it.label)}</span>`;
      }
      c.appendChild(row);
    }
  }
  // Met à jour l'affichage des curseurs en direct.
  c.querySelectorAll('input[data-int]').forEach((sl) => {
    const suffix = (RANDO_GROUPS.flatMap((g) => g.items).find((i) => i.key === sl.dataset.int) || {}).suffix || '';
    const val = sl.parentElement.querySelector('.rando-val');
    sl.oninput = () => { val.textContent = sl.value + suffix; };
  });
}

// Lit l'UI -> objet config plat pour GenPreset (clés mode.* / flag.* / int.* + miscTweaks).
function collectRandoConfig() {
  const c = $('#settings-list');
  if (!c || c.querySelector('.settings-readonly')) return lastConfig || defaultConfig();
  const cfg = { romName: 'SoulSync', miscTweaks: 0 };
  c.querySelectorAll('select[data-mode]').forEach((s) => { cfg[s.dataset.mode] = parseInt(s.value, 10); });
  c.querySelectorAll('input[data-int]').forEach((s) => { cfg[s.dataset.int] = parseInt(s.value, 10); });
  c.querySelectorAll('input[data-flag]').forEach((s) => { cfg[s.dataset.flag] = s.checked; });
  c.querySelectorAll('input[data-tweak]').forEach((s) => { if (s.checked) cfg.miscTweaks |= parseInt(s.dataset.bit, 10); });
  return cfg;
}

function renderRules(editable) {
  const c = $('#rules-list');
  if (!c) return;
  c.innerHTML = '';
  for (const r of RULES) {
    const on = (currentRules[r.key] !== undefined) ? currentRules[r.key] : r.def;
    const row = document.createElement('label');
    row.className = 'setting-row rule-row' + (editable ? '' : ' disabled');
    row.innerHTML = `<input type="checkbox" data-rule="${r.key}" ${on ? 'checked' : ''} ${editable ? '' : 'disabled'}>` +
      `<span>${r.label}<small class="rule-hint">${esc(r.hint)}</small></span>`;
    c.appendChild(row);
  }
}
function checkedRules() {
  const o = {};
  for (const r of RULES) o[r.key] = r.def;
  const c = $('#rules-list');
  if (c) c.querySelectorAll('input[data-rule]').forEach((i) => { o[i.dataset.rule] = i.checked; });
  return o;
}
function updateProtectBtn() {
  const b = $('#protect-btn');
  if (!b) return;
  const on = !!currentRules.protectFirstBattle;
  b.textContent = on ? '🛡️ 1er combat : ON' : '⚔️ 1er combat : OFF';
  b.classList.toggle('on', on);
}

function renderPlayers(players) {
  if (uiMode === 'solo') return;
  const c = $('#player-list');
  if (!c) return;
  c.innerHTML = '';
  for (const p of players || []) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const status = p.romReady ? '<span class="pstatus ready">✅ ROM prête</span>' : '<span class="pstatus wait">⏳ pas de ROM</span>';
    const host = p.isHost ? '<span class="phost">HÔTE</span>' : '';
    row.innerHTML = `<span class="pname">${esc(p.name)}</span>${host}${status}`;
    c.appendChild(row);
  }
  if (uiMode === 'host') {
    const others = (players || []).filter((p) => !p.isHost).length;
    const el = $('#lobby-conn');
    if (el) {
      el.textContent = '👥 ' + others + ' pote' + (others > 1 ? 's' : '') + ' connecté' + (others > 1 ? 's' : '');
      el.classList.toggle('ok', others > 0);
      el.classList.toggle('off', others === 0);
    }
  }
}

function renderNetDiag(d) {
  if (!d || d.error) { $('#share-link').textContent = 'Diagnostic réseau indisponible'; return; }
  const port = d.port;
  const rec = d.recommended;
  const link = rec ? ('soulsync://join?host=' + rec + ':' + port) : '';
  $('#share-link').textContent = link || '(aucune adresse joignable)';
  $('#copy-link').onclick = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    $('#copy-link').textContent = '✅ Copié !';
    setTimeout(() => { $('#copy-link').textContent = '📋 Copier le lien'; }, 1500);
  };

  const lanIp = d.lan[0];
  $('#net-lan').innerHTML = lanIp
    ? `<span class="nd ok">●</span> <b>Réseau local</b> — <code>${lanIp}:${port}</code> <span class="nd-note">même Wi-Fi</span>`
    : `<span class="nd off">●</span> <b>Réseau local</b> — non détecté`;

  const ts = d.tailscale[0];
  $('#net-tailscale').innerHTML = ts
    ? `<span class="nd ok">●</span> <b>Tailscale</b> — <code>${ts}:${port}</code> <span class="nd-note">à distance ✅</span>`
    : `<span class="nd off">●</span> <b>Tailscale</b> — non installé`;

  const inet = d.upnp && d.upnp.ok && d.publicIp;
  if (inet) {
    $('#net-internet').innerHTML = `<span class="nd ok">●</span> <b>Internet (UPnP)</b> — <code>${d.publicIp}:${port}</code> <span class="nd-note">joignable ✅</span>`;
  } else if (d.publicIp) {
    const plink = `soulsync://join?host=${d.publicIp}:${port}`;
    $('#net-internet').innerHTML = `<span class="nd warn">●</span> <b>Internet</b> — <code>${d.publicIp}:${port}</code> <button class="mini-copy" data-link="${plink}">📋 lien</button> <span class="nd-note">si tu ouvres le port sur ta box</span>`;
  } else {
    $('#net-internet').innerHTML = `<span class="nd off">●</span> <b>Internet</b> — IP publique introuvable`;
  }
  document.querySelectorAll('.mini-copy').forEach((b) => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.link); b.textContent = '✅'; setTimeout(() => { b.textContent = '📋 lien'; }, 1200); };
  });

  let hint;
  if (d.scope === 'tailscale') hint = '✅ Tailscale détecté — ce lien marche partout (LAN et à distance).';
  else if (d.scope === 'internet') hint = '✅ Port ouvert automatiquement (UPnP) — ce lien marche depuis Internet.';
  else if (d.scope === 'lan') hint = "ℹ️ Ce lien marche sur ton réseau local. Pour jouer À DISTANCE, 2 options : (A) le plus simple — installez tous Tailscale (tailscale.com), l'adresse Tailscale apparaîtra ici toute seule ; (B) ouvre le port " + port + " (TCP) sur ta box vers ce PC, puis partage le « lien Internet » ci-dessus.";
  else hint = '⚠️ Aucune adresse joignable détectée — vérifie ta connexion réseau.';
  $('#net-hint').textContent = hint;
}

function setLobbyConn(state, msg) {
  const el = $('#lobby-conn'); if (!el) return;
  el.classList.remove('ok', 'off');
  if (state === 'connected') {
    el.textContent = '✅ Connecté'; el.classList.add('ok');
    $('#lobby-wait').textContent = "⏳ En attente que l'hôte lance la partie…";
  } else if (state === 'connecting') {
    el.textContent = '🔌 Connexion…';
  } else {
    el.textContent = '❌ Non connecté'; el.classList.add('off');
    $('#lobby-wait').textContent = "❌ Connexion à l'hôte échouée — vérifie l'adresse/IP, et que l'hôte a autorisé SoulSync dans le pare-feu." + (msg ? ' (' + msg + ')' : '');
  }
}

$('#lobby-rom').onclick = async () => {
  if (!window.soulsync) return;
  const p = await window.soulsync.pickRom();
  if (p && p.ok) {
    $('#rom-name').textContent = '✅ ' + p.romPath.split(/[\\/]/).pop();
    window.soulsync.setRomReady(true);
  }
};

$('#lobby-play').onclick = async () => {
  if (!window.soulsync) return;
  // Vérifie qu'on a bien une ROM avant de lancer (sinon rien ne se passerait)
  let rom = await window.soulsync.getRom();
  if (!rom) {
    const p = await window.soulsync.pickRom();
    if (!p || !p.ok) { toast('death', "📁 Choisis ta ROM avant de lancer."); return; }
    $('#rom-name').textContent = '✅ ' + p.romPath.split(/[\\/]/).pop();
    window.soulsync.setRomReady(true);
  }
  lastConfig = collectRandoConfig();
  currentRules = checkedRules();
  updateProtectBtn();
  showRando('🎲 Préparation… (randomisation, ~30 s)');
  const res = await window.soulsync.hostStartGame({ config: lastConfig, rules: currentRules });
  if (res && res.ok) { setRando("✅ C'est parti !"); goDashboard(); setTimeout(hideRando, 2600); }
  else { setRando('❌ ' + ((res && res.error) || 'Erreur inconnue')); }
};

function goDashboard() {
  $('#lobby').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#role-tag').textContent = uiMode === 'host' ? '🖥️ Hôte' : (uiMode === 'solo' ? '🎮 Solo' : '🔗 Client');
  $('#me-tag').textContent = '👤 ' + me;
  const isHostUI = (uiMode === 'host' || uiMode === 'solo');
  if ($('#save-btn')) $('#save-btn').style.display = isHostUI ? '' : 'none';
  if ($('#protect-btn')) { $('#protect-btn').style.display = isHostUI ? '' : 'none'; updateProtectBtn(); }
  setConn(true);
}

// Bouton "protection 1er combat" : lève/remet la protection en direct (hôte/solo).
if ($('#protect-btn')) $('#protect-btn').onclick = async () => {
  if (!window.soulsync || !window.soulsync.hostSetRules) return;
  const next = !currentRules.protectFirstBattle;
  currentRules.protectFirstBattle = next;
  updateProtectBtn();
  await window.soulsync.hostSetRules({ protectFirstBattle: next });
  toast(next ? 'cascade' : 'catch',
    next ? '🛡️ Protection 1er combat ACTIVÉE (les morts ne comptent pas)'
         : '⚔️ Protection levée — à partir de maintenant, les morts comptent !');
};

// Sauvegarde : modal de nom (hôte/solo)
if ($('#save-btn')) $('#save-btn').onclick = () => {
  $('#save-name').value = '';
  $('#save-modal').classList.remove('hidden');
  $('#save-name').focus();
};
if ($('#save-cancel')) $('#save-cancel').onclick = () => $('#save-modal').classList.add('hidden');
if ($('#save-ok')) $('#save-ok').onclick = async () => {
  if (!window.soulsync) return;
  const name = ($('#save-name').value || '').trim() || 'Partie';
  $('#save-modal').classList.add('hidden');
  const res = await window.soulsync.hostSaveGame({ name });
  if (res && res.ok) toast('catch', '💾 Partie sauvegardée : ' + name);
  else toast('death', '❌ Sauvegarde échouée : ' + ((res && res.error) || ''));
};

// ---------- SESSION EVENTS ----------
if (window.soulsync) {
  window.soulsync.onLog((m) => {
    const isError = /⚠️|déjà utilisé|erreur/i.test(m);
    const ok = /(connect|démarré)/i.test(m) && !/déconnect/i.test(m) && !isError;
    setConn(ok);
    if (isError) toast('death', m);
  });
  window.soulsync.onState((s) => {
    latestState = s || latestState;
    if (s && s.rules) { Object.assign(currentRules, s.rules); updateProtectBtn(); }
    render();
  });
  window.soulsync.onNotes((notes) => { for (const n of notes) handleNote(n); });
  window.soulsync.onLobby((players) => renderPlayers(players));
  window.soulsync.onRules((rules) => {
    if (!rules) return;
    Object.assign(currentRules, rules);
    updateProtectBtn();
    if (!$('#lobby').classList.contains('hidden')) renderRules(uiMode === 'host' || uiMode === 'solo');
  });
  window.soulsync.onReset(() => {
    latestState = { players: [], links: [] };
    playerOrder.length = 0;
    render();
  });
  window.soulsync.onConn((info) => { if (uiMode === 'client') setLobbyConn(info.state, info.message); });
  if (window.soulsync.onUpdate) window.soulsync.onUpdate(handleUpdate);
  window.soulsync.onGameStarting(() => showRando("🎲 L'hôte a lancé — randomisation…"));
  window.soulsync.onRandoDone((res) => {
    if (res && res.ok) { setRando("✅ C'est parti !"); goDashboard(); setTimeout(hideRando, 2600); }
    else { setRando('❌ ' + ((res && res.error) || 'Erreur')); setTimeout(hideRando, 6000); }
  });
  window.soulsync.onDeepLink((url) => {
    const host = parseJoinHost(url);
    if (!host) return;
    if (!$('#setup').classList.contains('hidden')) {       // seulement si pas encore en partie
      $('#join-row').style.display = 'flex';
      $('#hostip').value = host;
      if (($('#pseudo').value || '').trim()) startSession('client', host);
      else { setupLog('Lien reçu ✅ — entre ton pseudo puis clique Rejoindre.'); $('#pseudo').focus(); }
    }
  });
}

function parseJoinHost(url) {
  try { return new URL(url).searchParams.get('host'); } catch (_) { return null; }
}

function setConn(ok) {
  const el = $('#conn-tag'); if (!el) return;
  el.textContent = ok ? '● connecté' : '○ hors-ligne';
  el.classList.toggle('ok', !!ok); el.classList.toggle('off', !ok);
}

// ---------- BOARD ----------
function render() {
  for (const p of latestState.players) if (!playerOrder.includes(p.playerId)) playerOrder.push(p.playerId);
  const players = playerOrder.filter((id) => latestState.players.some((p) => p.playerId === id));
  const board = $('#board');
  if (players.length === 0) {
    board.innerHTML = '<div class="empty-hint">En attente des équipes… capture ton premier Pokémon 🎮</div>';
    return;
  }

  const byPlayer = {};
  let maxOrder = 0;
  for (const p of latestState.players) {
    const map = {};
    for (const m of p.mons) if (m.order != null) { map[m.order] = m; if (m.order > maxOrder) maxOrder = m.order; }
    byPlayer[p.playerId] = map;
  }

  const cols = `64px repeat(${players.length}, minmax(180px, 1fr))`;
  let html = `<div class="board-grid" style="grid-template-columns:${cols}">`;
  html += `<div class="col-title corner">Lien</div>`;
  for (const id of players) html += `<div class="col-title">${id === me ? '⭐ ' : ''}${esc(id)}</div>`;

  for (let o = 1; o <= maxOrder; o++) {
    if (!players.some((id) => byPlayer[id][o])) continue;
    html += `<div class="order-cell">🔗</div>`;
    for (const id of players) {
      const m = byPlayer[id][o];
      html += m ? monCard(m, id) : '<div class="mon empty"></div>';
    }
  }
  html += '</div>';
  board.innerHTML = html;
  board.querySelectorAll('.mon-sprite').forEach((img) => img.addEventListener('error', spriteFallback));
  board.querySelectorAll('.revive-btn').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); doRevive(b.dataset.player, Number(b.dataset.pid)); };
  });
}

// Ranime un Pokémon mort. Hôte/solo : n'importe qui. Client : seulement les siens.
async function doRevive(playerId, pid) {
  if (!window.soulsync || !window.soulsync.reviveMon) return;
  await window.soulsync.reviveMon({ playerId, pid });
}

// Repli de sprite : animé -> statique Gen5 -> défaut -> masqué (CSP-safe, pas d'inline).
function spriteFallback() {
  if (this.dataset.fb1) { this.src = this.dataset.fb1; this.dataset.fb1 = ''; }
  else if (this.dataset.fb2) { this.src = this.dataset.fb2; this.dataset.fb2 = ''; }
  else { this.style.visibility = 'hidden'; }
}

const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
function monCard(m, playerId) {
  const animated = `${SPR}/versions/generation-v/black-white/animated/${m.species}.gif`;
  const fb1 = `${SPR}/versions/generation-v/black-white/${m.species}.png`;
  const fb2 = `${SPR}/${m.species}.png`;
  const hp = hpData(m);
  const dead = m.dead ? ' dead' : '';
  const boxed = (!m.dead && m.boxed) ? ' boxed' : '';
  const crit = (!m.dead && !m.boxed && hp.pct > 0 && hp.pct <= 20) ? ' crit' : '';
  const badge = boxed ? '<div class="box-badge">📦 boîte</div>' : '';
  const link = (m.order != null) ? `<div class="link-badge">${m.order}</div>` : '';
  // Bouton "ranimer" sur un mort, si on en a le droit (hôte/solo = tous, client = les siens).
  const canRevive = m.dead && (uiMode === 'host' || uiMode === 'solo' || playerId === me);
  const revive = canRevive
    ? `<button class="revive-btn" data-player="${esc(playerId)}" data-pid="${m.pid}" title="Ranimer ce Pokémon">💚 Ranimer</button>`
    : '';
  return `<div class="mon${dead}${boxed}${crit}">
    ${link}${badge}
    <div class="mon-plate">
      <img class="mon-sprite" src="${animated}" data-fb1="${fb1}" data-fb2="${fb2}" alt="">
      ${revive}
    </div>
    <div class="mon-info">
      <div class="mon-name">${esc(m.name)}</div>
      <div class="hpwrap"><span class="pv">HP</span><div class="hpbar"><i class="${hp.cls}" style="width:${hp.pct}%"></i></div></div>
      <div class="mon-foot"><span class="mon-lv">Niv. ${m.level != null ? m.level : '?'}</span><span class="hpnum">${hp.label}</span></div>
    </div>
  </div>`;
}

// Calcule l'état de la barre de PV : pourcentage, libellé "h/m", couleur.
function hpData(m) {
  if (m.dead) return { pct: 0, label: (m.maxhp ? '0/' + m.maxhp : '0'), cls: 'red' };
  if (m.hp != null && m.maxhp) {
    const pct = Math.max(0, Math.min(100, Math.round((m.hp / m.maxhp) * 100)));
    return { pct, label: m.hp + '/' + m.maxhp, cls: pct > 50 ? 'green' : (pct > 20 ? 'yellow' : 'red') };
  }
  return { pct: 100, label: '', cls: 'green' }; // pas encore de données PV
}

// ---------- NOTIFICATIONS ----------
function playSound(kind) {
  const A = window.SoulSyncAudio;
  if (!A) return;
  if (kind === 'catch') A.caught();
  else if (kind === 'death') A.death();
  else if (kind === 'cascade') A.cascade();
  else if (kind === 'gameover') A.gameover();
  else if (kind === 'evolve' || kind === 'revive') A.caught();
  else if (kind === 'species-clash' || kind === 'protected') A.blip();
}

(function () {
  const mb = document.querySelector('#mute-btn');
  if (!mb) return;
  mb.onclick = () => {
    const A = window.SoulSyncAudio;
    if (!A) return;
    mb.textContent = A.setMuted(!A.isMuted()) ? '🔇' : '🔊';
  };
})();

function handleNote(n) {
  playSound(n.kind);
  let cls = '', txt = '';
  switch (n.kind) {
    case 'catch':   cls = 'catch';   txt = `🟢 ${esc(n.playerId)} capture ${esc(n.mon.name)} (#${n.mon.order})`; break;
    case 'death':   cls = 'death';   txt = `💀 ${esc(n.playerId)} : ${esc(n.mon.name)} est mort`; break;
    case 'cascade': cls = 'cascade'; txt = `🔗💀 Cascade : ${esc(n.mon.name)} (${esc(n.playerId)}) meurt aussi`; break;
    case 'species-clash': cls = 'death'; txt = `⚠️ Doublon d'espèce : ${esc(n.mon.name)} (${esc(n.playerId)})`; break;
    case 'evolve':  cls = 'catch';   txt = `✨ ${esc(n.playerId)} : ${esc(n.from || '?')} évolue en ${esc(n.mon.name)} !`; break;
    case 'revive':  cls = 'catch';   txt = `💚 ${esc(n.playerId)} : ${esc(n.mon.name)} revient à la vie !`; break;
    case 'protected': cls = 'cascade'; txt = `🛡️ ${esc(n.playerId)} : ${esc(n.mon.name)} K.O. — protégé (1er combat), ça ne compte pas.`; break;
    case 'gameover': showGameOver(n.playerId); return;
    default: return;
  }
  toast(cls, txt);
}

function toast(cls, txt) {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = txt;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

// ---------- AUTO-UPDATE ----------
function handleUpdate(u) {
  if (!u) return;
  if (u.state === 'available') toast('catch', '⬇️ Mise à jour v' + (u.version || '') + ' en téléchargement…');
  else if (u.state === 'ready') showUpdateBanner(u.version);
  // 'progress' / 'error' : silencieux (pas de réseau = on ne dérange pas)
}
function showUpdateBanner(version) {
  if (document.getElementById('update-banner')) return;
  const b = document.createElement('div');
  b.id = 'update-banner';
  b.className = 'update-banner';
  b.innerHTML = '<span>✅ Mise à jour ' + (version ? ('v' + esc(version) + ' ') : '') + 'prête !</span>' +
    '<button id="update-restart">🔄 Redémarrer maintenant</button>' +
    '<button id="update-later" title="Plus tard">✕</button>';
  document.body.appendChild(b);
  document.getElementById('update-restart').onclick = () => { if (window.soulsync && window.soulsync.installUpdate) window.soulsync.installUpdate(); };
  document.getElementById('update-later').onclick = () => b.remove();
}

function showGameOver(playerId) {
  $('#go-sub').textContent = `L'équipe de ${playerId} est tombée.`;
  $('#gameover').classList.remove('hidden');
  const r = $('#go-restart');
  if (r) r.style.display = (uiMode === 'host' || uiMode === 'solo') ? 'block' : 'none';
}
$('#go-close').onclick = () => $('#gameover').classList.add('hidden');
if ($('#go-restart')) $('#go-restart').onclick = async () => {
  if (!window.soulsync) return;
  $('#gameover').classList.add('hidden');
  showRando('🎲 Nouvelle partie…');
  const res = await window.soulsync.hostStartGame({ config: lastConfig || defaultConfig(), rules: currentRules });
  if (res && res.ok) { setRando("✅ C'est reparti !"); setTimeout(hideRando, 2600); }
  else { setRando('❌ ' + ((res && res.error) || 'Erreur')); setTimeout(hideRando, 6000); }
};

// ---------- LAUNCHER (randomizer 1-clic) ----------
function showRando(m) { setRando(m); $('#rando').classList.remove('hidden'); }
function setRando(m) { const el = $('#rando-msg'); if (el) el.textContent = m; }
function hideRando() { $('#rando').classList.add('hidden'); }
if ($('#rando')) $('#rando').addEventListener('click', hideRando); // clic = fermer (utile sur erreur)

if (window.soulsync && $('#play-btn')) {
  $('#rom-btn').onclick = async () => {
    const p = await window.soulsync.pickRom();
    if (p && p.ok) toast('catch', '📁 ROM enregistrée : ' + p.romPath.split(/[\\/]/).pop());
  };
  $('#play-btn').onclick = async () => {
    let rom = await window.soulsync.getRom();
    if (!rom) {
      const p = await window.soulsync.pickRom();
      if (!p || !p.ok) return;
      rom = p.romPath;
    }
    showRando('🎲 Préparation…');
    const res = await window.soulsync.randomizePlay();
    if (res && res.ok) { setRando('✅ C\'est parti ! BizHawk se lance…'); setTimeout(hideRando, 2600); }
    else { setRando('❌ ' + ((res && res.error) || 'Erreur')); setTimeout(hideRando, 6000); }
  };
  window.soulsync.onRandoLog((m) => setRando(m));
  const arrangeBtn = $('#arrange-btn');
  if (arrangeBtn) arrangeBtn.onclick = () => window.soulsync.arrangeWindows();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- MODE DÉMO (aperçu hors Electron : ajoute ?demo à l'URL) ----------
if (!window.soulsync && location.search.includes('demo')) {
  $('#setup').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  me = 'mathys';
  $('#role-tag').textContent = '🖥️ Hôte';
  $('#me-tag').textContent = '👤 mathys';
  setConn(true);
  latestState = {
    players: [
      { playerId: 'mathys', mons: [
        { pid: 1, order: 1, species: 498, name: 'Gruikui', level: 8, dead: false, hp: 25, maxhp: 27 },
        { pid: 2, order: 2, species: 504, name: 'Ratentif', level: 6, dead: false, hp: 9, maxhp: 22 },
        { pid: 3, order: 3, species: 509, name: 'Chacripan', level: 5, dead: true, hp: 0, maxhp: 15 }
      ] },
      { playerId: 'flo', mons: [
        { pid: 11, order: 1, species: 495, name: 'Vipélierre', level: 8, dead: false, boxed: true, hp: 28, maxhp: 30 },
        { pid: 12, order: 2, species: 506, name: 'Ponchiot', level: 7, dead: false, hp: 4, maxhp: 24 },
        { pid: 13, order: 3, species: 519, name: 'Poftale', level: 5, dead: true, hp: 0, maxhp: 19 }
      ] }
    ],
    links: []
  };
  render();
  setTimeout(() => handleNote({ kind: 'cascade', playerId: 'flo', mon: { name: 'Poftale', order: 3 } }), 400);
}
