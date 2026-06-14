--[[============================================================================
  SoulSync Manager — Tracker RAM (Étape 1)
  ----------------------------------------------------------------------------
  Détecte la mort des Pokémon de l'équipe en lisant les PV directement dans la
  RAM de Pokémon Noire 2 / Blanche 2 (Gen 5, NDS).

  Compatible BizHawk (cœur melonDS) ET DeSmuME — l'API est auto-détectée.

  Sorties produites (dans le dossier de travail de l'émulateur, voir OUT_DIR) :
    - soulsync_events.jsonl : 1 ligne JSON par évènement (mort, etc.)
    - soulsync_state.json   : snapshot de l'équipe (rafraîchi régulièrement)
    - overlay à l'écran + logs console

  Adresses vérifiées d'après les scripts PokeStats / yPokeStats (Gen 5).
============================================================================]]--

------------------------------------------------------------------- CONFIG ----

-- Laisse à nil pour l'auto-calibration (recommandé). Sinon force une base, ex:
--   local FORCED_BASE = 0x0221E3EC  -- Noire 2
local FORCED_BASE = nil

-- CALIBRATION GUIDÉE (pour les versions EU/FR/DE/ES/IT/JP dont l'adresse diffère).
-- Si l'overlay reste bloqué sur "en attente" ou affiche de faux chiffres :
--   1) en jeu, soigne ton équipe (PC/Centre) pour avoir PV actuels = PV max,
--   2) note le NIVEAU et les PV de ton 1er Pokémon,
--   3) renseigne-les ci-dessous, sauvegarde le .lua, et relance le script.
-- Le script scanne la RAM, trouve l'adresse exacte, et te l'affiche dans la console.
-- Laisse à nil si l'auto-calibration marche déjà.
local CALIBRATE =  nil
-- exemple : local CALIBRATE = { level = 5, hp = 19, maxhp = 19 }

-- DIAGNOSTIC (mode enquête) : renseigne les stats EXACTES de ton 1er Pokémon,
-- telles qu'affichées sur l'écran résumé (PV max + les 5 stats). La séquence
-- de stats est quasi unique en RAM => localise l'équipe à coup sûr et vérifie
-- que la lecture mémoire marche. Le Pokémon doit être à PV PLEINS (curHP = maxHP).
-- Mets à nil une fois le diagnostic terminé.
local DIAG = nil  -- diagnostic terminé : on passe au RAM Search de BizHawk

-- Dossier de sortie. nil = dossier de travail courant de l'émulateur.
-- On écrit dans le dossier "data/" du projet, que l'app Node lira.
local OUT_DIR = [[C:\Users\pomie\OneDrive\Desktop\Nuzlocke-SoulLink-Randomize\data\]]

-- Fichier des noms FR des Pokémon (généré). Chemin absolu = robuste quel que
-- soit le dossier de travail de l'émulateur. Si introuvable, on affiche "#id".
local SPECIES_FILE = [[C:\Users\pomie\OneDrive\Desktop\Nuzlocke-SoulLink-Randomize\tracker\species_fr.lua]]

-- Toutes les combien de frames on réécrit le snapshot d'équipe (60 = ~1s).
local SNAPSHOT_EVERY = 30

-- Durée d'affichage du flash "mort" à l'écran (en frames).
local DEATH_FLASH_FRAMES = 240

--------------------------------------------------- ADRESSES (Gen 5 / BW2) ----

local SLOT_SIZE = 0xDC      -- 220 octets par Pokémon dans l'équipe
local OFF_PID   = 0x00      -- u32 : identifiant unique du Pokémon
local OFF_LEVEL = 0x8C      -- u8  : niveau
local OFF_HP    = 0x8E      -- u16 : PV actuels   <-- le signal de mort
local OFF_MAXHP = 0x90      -- u16 : PV max
local PARTY_MAX = 6

-- Bases candidates de l'équipe (buffer principal persistant).
-- L'auto-calibration choisit celle qui contient une équipe valide.
local CANDIDATES = {
  { name = "Noire 2",  base = 0x0221E3EC },
  { name = "Blanche 2", base = 0x0221E42C },
}

-- DIAGNOSTIC COMBAT : affiche les PV du slot 0 lus depuis les 4 "modes" (copies
-- de l'équipe). En combat, on regarde lequel baisse EN DIRECT = le buffer de combat.
-- Mets à false une fois le bon buffer identifié.
local DIAG_BATTLE = false
local MODE_BASES = {
  -- Blanche 2 (PAL/FR == US)
  { name = "B2-M1", base = 0x0221E42C },  -- equipe persistante
  { name = "B2-M2", base = 0x02258874 },
  { name = "B2-M3", base = 0x02259DF4 },
  { name = "B2-M4", base = 0x02259334 },
}

----------------------------------------------- ABSTRACTION ÉMULATEUR (API) ----

local EMU
if memory and memory.read_u16_le then
  EMU = "bizhawk"
elseif memory and memory.readword then
  EMU = "desmume"
else
  error("Émulateur non supporté : impossible de trouver l'API mémoire (BizHawk/DeSmuME).")
end

-- BizHawk : on travaille dans le domaine "Main RAM" (offsets 0-based depuis 0x02000000).
local MAINRAM_BASE = 0x02000000
if EMU == "bizhawk" then
  local ok = pcall(function() memory.usememorydomain("Main RAM") end)
  if not ok then
    print("[SoulSync] ERREUR : domaine 'Main RAM' introuvable. Domaines dispo :")
    if memory.getmemorydomainlist then
      for _, d in ipairs(memory.getmemorydomainlist()) do print("   - " .. tostring(d)) end
    end
    error("Charge bien une ROM NDS et relance le script.")
  end
end

local function r8(addr)
  if EMU == "bizhawk" then return memory.read_u8(addr - MAINRAM_BASE)
  else return memory.readbyte(addr) end
end
local function r16(addr)
  if EMU == "bizhawk" then return memory.read_u16_le(addr - MAINRAM_BASE)
  else return memory.readword(addr) end
end
local function r32(addr)
  if EMU == "bizhawk" then return memory.read_u32_le(addr - MAINRAM_BASE)
  else return memory.readdword(addr) end
end

----------------------------------------------- DÉCHIFFREMENT GEN 4/5 (PRNG) ----
-- Les Pokémon sont CHIFFRÉS en RAM. Les stats de combat (niveau, PV...) à partir
-- de l'offset 0x88 sont chiffrées avec un PRNG (LCG) initialisé par le PID.
-- Clé de chaque u16 = bits de poids fort du PRNG. (cf. PKHeX PokeCrypto.)

-- XOR 16 bits. On utilise l'opérateur natif ~ (Lua 5.3+ / BizHawk) si dispo
-- (rapide, AUCUN warning), sinon repli manuel (DeSmuME / Lua 5.1).
local xor16
do
  local ok, f = pcall(function()
    return load("return function(a,b) return (a ~ b) & 0xFFFF end")()
  end)
  if ok and f then
    xor16 = f
  else
    xor16 = function(a, b)
      local res, p = 0, 1
      for _ = 1, 16 do
        local abit, bbit = a % 2, b % 2
        if abit ~= bbit then res = res + p end
        a = (a - abit) / 2; b = (b - bbit) / 2; p = p * 2
      end
      return res
    end
  end
end

-- Multiplication 32 bits sans perte de précision (évite les flottants > 2^53).
local function mul32(a, b)
  local ah = math.floor(a / 65536) % 65536
  local al = a % 65536
  return (((ah * b) % 65536) * 65536 + al * b) % 4294967296
end

-- LCG Gen 4/5 : X = (0x41C64E6D * X + 0x6073) mod 2^32
local function lcgNext(seed)
  return (mul32(seed, 0x41C64E6D) + 0x6073) % 4294967296
end

-- Déchiffre la zone des stats de combat (à partir de 0x88) avec le PID comme graine.
-- Renvoie : level, PV actuels, PV max.  (offsets 0x8C / 0x8E / 0x90)
local function decryptPartyStats(slotAddr)
  local pid = r32(slotAddr + OFF_PID)
  if pid == 0 then return nil end
  local seed = pid
  local s = {}
  for i = 0, 4 do                       -- u16 #0..#4 = status, status, level, curHP, maxHP
    seed = lcgNext(seed)
    local key = math.floor(seed / 65536)  -- PRNG >> 16
    s[i] = xor16(r16(slotAddr + 0x88 + i * 2), key)
  end
  local level = s[2] % 256              -- octet bas de 0x8C
  local curHP = s[3]
  local maxHP = s[4]
  return pid, level, curHP, maxHP
end

-- Table de permutation des 4 blocs (A,B,C,D) selon le PID (cf. PKHeX blockPosition).
-- 24 lignes de 4 : pour chaque ordre, l'indice physique du bloc logique 0..3.
local BLOCKPOS = {
  0,1,2,3, 0,1,3,2, 0,2,1,3, 0,3,1,2, 0,2,3,1, 0,3,2,1,
  1,0,2,3, 1,0,3,2, 2,0,1,3, 3,0,1,2, 2,0,3,1, 3,0,2,1,
  1,2,0,3, 1,3,0,2, 2,1,0,3, 3,1,0,2, 2,3,0,1, 3,2,0,1,
  1,2,3,0, 1,3,2,0, 2,1,3,0, 3,1,2,0, 2,3,1,0, 3,2,1,0,
}

-- Déchiffre un seul u16 de la zone des 4 blocs (à partir de 0x08), graine = checksum.
local function decryptBlockU16(slotAddr, u16index)
  local seed = r16(slotAddr + 0x06)   -- checksum
  local key = 0
  for _ = 0, u16index do
    seed = lcgNext(seed)
    key = math.floor(seed / 65536)
  end
  return xor16(r16(slotAddr + 0x08 + u16index * 2), key)
end

-- Lit l'espèce (n° National Dex). Elle est au début du Bloc A (logique 0),
-- dont la position physique dépend du PID via la table de mélange.
local function readSpeciesAt(slotAddr)
  local pid = r32(slotAddr)
  local sv = (math.floor(pid / 8192) % 32) % 24   -- ((PID >> 13) & 31) % 24
  local physA = BLOCKPOS[sv * 4 + 1]               -- indice physique du Bloc A (Lua 1-based)
  local u16index = physA * 16                       -- (0x20*physA)/2
  return decryptBlockU16(slotAddr, u16index)
end

----------------------------------------------------------- LECTURE ÉQUIPE ----

-- Lit un slot d'équipe (déchiffré). Renvoie une table ou nil si le slot semble vide.
local function readSlot(base, i)
  local a = base + i * SLOT_SIZE
  local pid, level, hp, maxhp = decryptPartyStats(a)
  -- Slot occupé = données cohérentes après déchiffrement
  if not pid or level < 1 or level > 100 or maxhp < 1 or maxhp > 999 or hp > maxhp then
    return nil
  end
  return { pid = pid, level = level, hp = hp, maxhp = maxhp }
end

-- Un base est "valide" si le slot 0 contient un Pokémon cohérent.
local function looksValid(base)
  return readSlot(base, 0) ~= nil
end

-- Scan RAM : cherche un slot dont niveau + PV + PV max correspondent (calibration guidée).
-- Le test du niveau est en premier => court-circuit, donc le scan reste rapide.
local function scanRange(c, startA, endA)
  local matches = {}
  local a = startA
  while a < endA - SLOT_SIZE do
    if r8(a + OFF_LEVEL) == c.level
       and r16(a + OFF_HP) == c.hp
       and r16(a + OFF_MAXHP) == c.maxhp
       and r32(a + OFF_PID) ~= 0 then
      matches[#matches + 1] = a
    end
    a = a + 4   -- structures alignées sur 4 octets
  end
  return matches
end

-- Scan en 2 temps : d'abord la zone Gen 5 connue (rapide), sinon toute la RAM.
local function scanForParty(c)
  local m = scanRange(c, 0x02200000, 0x02270000)
  if #m == 0 then
    print("[SoulSync] Pas trouvé dans la zone habituelle, scan complet de la RAM...")
    m = scanRange(c, 0x02000000, 0x02400000)
  end
  return m
end

-- Dump hexa de quelques octets (pour le diagnostic).
local function hexdump(base, from, to)
  local s = ""
  for off = from, to do s = s .. string.format("%02X ", r8(base + off)) end
  return s
end

-- Renvoie n valeurs u16 consécutives à partir de p, en texte.
local function u16seq(p, n)
  local t = {}
  for i = 0, n - 1 do t[#t + 1] = tostring(r16(p + i * 2)) end
  return table.concat(t, " ")
end

-- DIAGNOSTIC v2 : liste les paires curHP==maxHP collées + le contexte autour,
-- sans présumer de l'ordre des stats. On lit la vraie structure dans le dump.
local function runDiag(d)
  print("===== DIAGNOSTIC SoulSync v2 =====")
  print("Dump @0x02000000 : " .. hexdump(0x02000000, 0, 15))
  print(string.format("Paires [%d,%d] collees (curHP=maxHP) + 7 u16 a partir de la paire :", d.hp, d.hp))
  print("(je cherche les stats 11 12 11 9 11 quelque part dans le contexte)")
  local a, n = 0x02000000, 0
  while a < 0x02400000 - 18 do
    if r16(a) == d.hp and r16(a + 2) == d.hp then
      n = n + 1
      if n <= 30 then
        print(string.format("  @0x%08X  b(-2)=%3d  u16: %s | %s",
          a, r8(a - 2), u16seq(a, 7), u16seq(a + 14, 3)))
      end
    end
    a = a + 2
  end
  print(string.format("Total paires [%d,%d] collees : %d", d.hp, d.hp, n))
  print("===== fin diagnostic =====")
end

local lockedBase = nil   -- adresse verrouillée par la calibration guidée

-- Auto-calibration : trouve la bonne base (version du jeu).
local function findBase()
  if FORCED_BASE then return FORCED_BASE, "forcée" end
  if lockedBase then return lockedBase, "calibrée" end
  for _, c in ipairs(CANDIDATES) do
    if looksValid(c.base) then return c.base, c.name end
  end
  return nil, nil
end

--------------------------------------------------------------- NOMS FR -------

local SPECIES_FR = {}
do
  local ok, t = pcall(dofile, SPECIES_FILE)
  if ok and type(t) == "table" then
    SPECIES_FR = t
    print("[SoulSync] Noms FR chargés (" .. tostring(#SPECIES_FR) .. "+ espèces).")
  else
    print("[SoulSync] Noms FR non chargés (" .. tostring(SPECIES_FILE) .. ") -> affichage #id.")
  end
end

local function speciesName(id)
  return SPECIES_FR[id] or ("#" .. tostring(id))
end

----------------------------------------------------------------- SORTIES ----

local function outPath(filename)
  if OUT_DIR then return OUT_DIR .. filename end
  return filename
end

local function appendEvent(line)
  local f = io.open(outPath("soulsync_events.jsonl"), "a")
  if f then f:write(line .. "\n"); f:close() end
end

local function writeState(json)
  local f = io.open(outPath("soulsync_state.json"), "w")
  if f then f:write(json); f:close() end
end

-- Frame courante (compatible BizHawk / DeSmuME).
local function curFrame()
  if emu and emu.framecount then return emu.framecount() end
  return 0
end

local function logEvent(kind, slot, mon)
  local fr = curFrame()
  local line = string.format(
    '{"type":"%s","slot":%d,"pid":%d,"level":%d,"maxhp":%d,"emu":"%s","frame":%d}',
    kind, slot, mon.pid, mon.level, mon.maxhp, EMU, fr)
  appendEvent(line)
  print(string.format("[SoulSync] %s -> slot %d  PID=%d  Niv.%d", kind, slot, mon.pid, mon.level))
end

local function logCatch(order, slot, mon, species)
  local name = speciesName(species)
  local line = string.format(
    '{"type":"catch","order":%d,"slot":%d,"pid":%d,"species":%d,"name":"%s","level":%d,"emu":"%s","frame":%d}',
    order, slot, mon.pid, species, name, mon.level, EMU, curFrame())
  appendEvent(line)
  print(string.format("[SoulSync] CAPTURE #%d -> %s (#%d, slot %d, Niv.%d)",
    order, name, species, slot, mon.level))
end

-- Évolution : un PID déjà connu change d'espèce. On envoie le nouveau nom + niveau
-- pour que l'interface mette à jour le splash-art et le nom.
local function logEvolve(slot, mon, species)
  local name = speciesName(species)
  local line = string.format(
    '{"type":"evolve","slot":%d,"pid":%d,"species":%d,"name":"%s","level":%d,"emu":"%s","frame":%d}',
    slot, mon.pid, species, name, mon.level, EMU, curFrame())
  appendEvent(line)
  print(string.format("[SoulSync] ÉVOLUTION -> %s (#%d, slot %d, Niv.%d)",
    name, species, slot, mon.level))
end

------------------------------------------------------------------- ÉTAT ------

local base, baseName = nil, nil
local prevHP   = {}   -- [slot] = PV au tick précédent
local deadPID  = {}   -- [pid]  = true  (déjà déclaré mort, ne pas refaire)
local seenPID  = {}   -- [pid]  = species  (Pokémon déjà vus = déjà "capturés")
local caughtCount = 0 -- compteur de captures (= ordre, pour l'appariement soul-link)
local lastDeath = { frame = -99999, pid = 0, slot = -1 }

print("[SoulSync] Tracker démarré (" .. EMU .. "). En attente d'une équipe...")

-- Debug déchiffrement (une seule fois) : montre ce que donnent les 2 adresses candidates
local DEBUG_DECRYPT = false
if DEBUG_DECRYPT then
  print("----- DEBUG déchiffrement (slot 0) -----")
  for _, c in ipairs(CANDIDATES) do
    local pid, lvl, hp, mhp = decryptPartyStats(c.base)
    if pid then
      print(string.format("  %-10s 0x%08X : PID=%d  Niv=%d  PV=%d/%d",
        c.name, c.base, pid, lvl, hp, mhp))
    else
      print(string.format("  %-10s 0x%08X : PID=0 (vide)", c.name, c.base))
    end
  end
  print("----------------------------------------")
end

-- Diagnostic (une seule fois, au démarrage) — prioritaire sur la calibration
if DIAG then
  runDiag(DIAG)
end

-- Calibration guidée (une seule fois, au démarrage)
if CALIBRATE then
  print(string.format("[SoulSync] Calibration : recherche d'un slot Niv%d %d/%d en RAM...",
    CALIBRATE.level, CALIBRATE.hp, CALIBRATE.maxhp))
  local matches = scanForParty(CALIBRATE)
  if #matches == 0 then
    print("[SoulSync] ÉCHEC : aucune correspondance. Vérifie le NIVEAU + les PV ACTUELS + PV max")
    print("           du 1er Pokémon (soigne-le pour avoir PV actuels = PV max), puis relance.")
  else
    lockedBase = matches[1]   -- la plus basse = buffer équipe principal
    print(string.format("[SoulSync] TROUVÉ ! base de l'équipe = 0x%08X", lockedBase))
    if #matches > 1 then
      print("[SoulSync] (plusieurs candidats, j'ai pris le 1er ; les autres sont des copies de combat)")
      for _, mm in ipairs(matches) do print(string.format("            - 0x%08X", mm)) end
    end
    print("[SoulSync] => Envoie-moi cette adresse, et mets-la dans FORCED_BASE pour t'éviter le scan la prochaine fois.")
  end
end

-------------------------------------------------------------- BOUCLE PRINC. ---

while true do

  -- (Re)calibration tant qu'on n'a pas de base valide
  if not base then
    base, baseName = findBase()
    if base then
      print(string.format("[SoulSync] Équipe détectée : %s (base 0x%08X)", baseName, base))
    end
  elseif not looksValid(base) then
    -- l'équipe a disparu (écran-titre, chargement...) : on retentera
    base = nil
  end

  local snapshot = {}

  if base then
    for i = 0, PARTY_MAX - 1 do
      local mon = readSlot(base, i)
      if mon then
        -- Détection de capture : un PID jamais vu = nouveau Pokémon obtenu
        if seenPID[mon.pid] == nil then
          local species = readSpeciesAt(base + i * SLOT_SIZE)
          seenPID[mon.pid] = species
          caughtCount = caughtCount + 1
          logCatch(caughtCount, i, mon, species)
        elseif curFrame() % SNAPSHOT_EVERY == 0 then
          -- Détection d'évolution : l'espèce d'un PID connu a changé (le PID, lui, ne change pas).
          local sp = readSpeciesAt(base + i * SLOT_SIZE)
          if sp and sp > 0 and sp ~= seenPID[mon.pid] then
            seenPID[mon.pid] = sp
            logEvolve(i, mon, sp)
          end
        end
        mon.species = seenPID[mon.pid]
        snapshot[#snapshot + 1] = { slot = i, mon = mon }

        local prev = prevHP[i]
        -- Détection de mort : PV passent de >0 à 0, slot occupé, pas déjà mort
        if prev and prev > 0 and mon.hp == 0 and not deadPID[mon.pid] then
          deadPID[mon.pid] = true
          lastDeath = { frame = curFrame(), pid = mon.pid, slot = i }
          logEvent("death", i, mon)
        end
        prevHP[i] = mon.hp
      else
        prevHP[i] = nil
      end
    end
  end

  -- Snapshot d'équipe périodique (pour le futur dashboard)
  if base and (curFrame() % SNAPSHOT_EVERY == 0) then
    local parts = {}
    for _, e in ipairs(snapshot) do
      local m = e.mon
      parts[#parts + 1] = string.format(
        '{"slot":%d,"pid":%d,"species":%d,"level":%d,"hp":%d,"maxhp":%d,"alive":%s,"dead":%s}',
        e.slot, m.pid, m.species or 0, m.level, m.hp, m.maxhp,
        tostring(m.hp > 0), tostring(deadPID[m.pid] == true))
    end
    writeState(string.format(
      '{"game":"%s","emu":"%s","frame":%d,"party":[%s]}',
      baseName or "?", EMU, curFrame(), table.concat(parts, ",")))
  end

  ------------------------------------------------------------------ OVERLAY ---
  if gui and gui.text then
    if base and DIAG_BATTLE then
      -- Mode diagnostic : on masque l'équipe et on affiche les pointeurs de combat.
      gui.text(2, 2, "DIAG PTR COMBAT  (PV @ +0x10)")
      local y = 14
      local a = 0x02257498
      while a <= 0x022574CC do
        local ptr = r32(a)
        if ptr >= 0x02000000 and ptr < 0x02400000 then
          gui.text(2, y, string.format("%04X -> %d", a % 0x10000, r16(ptr + 0x10)))
        else
          gui.text(2, y, string.format("%04X -> -", a % 0x10000))
        end
        y = y + 11
        a = a + 4
      end
    elseif base then
      gui.text(2, 2, "SoulSync: " .. (baseName or "?"))
      local y = 14
      for _, e in ipairs(snapshot) do
        local m = e.mon
        local tag = (m.hp == 0 or deadPID[m.pid]) and " [MORT]" or ""
        gui.text(2, y, string.format("S%d %s Niv%d %d/%d%s",
          e.slot, speciesName(m.species or 0), m.level, m.hp, m.maxhp, tag))
        y = y + 12
      end
    else
      gui.text(2, 2, "SoulSync: en attente d'une equipe...")
    end

    -- Flash "mort"
    if (curFrame() - lastDeath.frame) < DEATH_FLASH_FRAMES then
      gui.text(60, 90, string.format(">>> POKEMON MORT (slot %d) <<<", lastDeath.slot))
    end
  end

  emu.frameadvance()
end
