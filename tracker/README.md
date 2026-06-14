# SoulSync Tracker — Étape 1 (détection des morts)

Script Lua qui lit les PV de ton équipe dans la RAM de **Pokémon Noire 2 / Blanche 2**
et détecte quand un Pokémon meurt (PV → 0). C'est la brique de base du futur logiciel.

Compatible **BizHawk** (cœur melonDS) et **DeSmuME** — l'émulateur est détecté tout seul.

---

## 1. Charger le script

### BizHawk (recommandé pour la suite du projet)
1. Lance `EmuHawk.exe`, ouvre ta ROM B2/W2 (`File > Open ROM`).
2. `Tools > Lua Console`.
3. Dans la console Lua : `Script > Open Script…` → choisis `soulsync_tracker.lua`.
4. Le script tourne. Regarde la fenêtre **Lua Console** pour les logs.

### DeSmuME (le plus simple pour un premier test)
1. Lance DeSmuME, ouvre ta ROM.
2. `Tools > Lua Scripting > New Lua Script Window`.
3. `Browse…` → `soulsync_tracker.lua` → `Run`.

> ⚠️ Il faut une version de DeSmuME **avec support Lua** (build "Lua" sur Windows).

---

## 2. Ce que tu dois voir

- En haut à gauche de l'écran de jeu : `SoulSync: Noire 2` (ou `Blanche 2`) + la liste
  des slots avec `Niv` et `PV/PVmax`.
- Au démarrage (écran-titre, avant d'avoir un Pokémon) : `en attente d'une equipe...`
  → c'est normal, ça se calibre dès que tu as ton 1er Pokémon.

Trois fichiers se créent à côté de l'émulateur :
- `soulsync_events.jsonl` — 1 ligne par mort détectée.
- `soulsync_state.json` — l'état de l'équipe, rafraîchi ~2×/seconde.
- (les logs s'affichent aussi dans la console Lua.)

---

## 3. Protocole de test (≈10 min) — c'est ce que j'ai besoin que tu valides

**Test A — l'équipe est bien lue**
1. Charge une partie où tu as ≥1 Pokémon.
2. Vérifie que l'overlay affiche les **bons** niveaux et PV de ton équipe.
   - ✅ Si oui → l'adresse est bonne, l'auto-calibration marche.
   - ❌ Si les chiffres sont faux/absents → note-le (ta ROM est peut-être une version
     EU/JP différente ; on ajoutera l'adresse).

**Test B — la mort est détectée**
1. Va faire tomber un Pokémon (combat sauvage, laisse-le être mis K.O.).
2. Au moment où il tombe à 0 PV (ou à la fin du combat), tu dois voir :
   - le flash `>>> POKEMON MORT <<<` à l'écran,
   - une ligne dans la console Lua,
   - une nouvelle ligne dans `soulsync_events.jsonl`.

**Point clé à observer pour le Test B :** la mort est-elle détectée
**pendant** le combat, ou seulement **à la fin** du combat (retour overworld) ?
Dis-le moi — ça change la finesse du timing des notifs.

---

## 4. Ce dont j'ai besoin en retour
- Test A : les PV affichés sont-ils corrects ? (oui/non)
- Test B : la mort est-elle bien détectée ? À quel moment (pendant/après le combat) ?
- Ta version de ROM (US / EU / autre) et quel émulateur tu as utilisé.
- Si quelque chose casse : copie-moi le message d'erreur de la console Lua.

Avec ça je verrouille l'Étape 1 et on passe au launcher (randomisation 1 clic).

---

## ⚠️ Version EU / FR (ta Blanche 2 française) — calibration guidée

Les adresses par défaut viennent de la version **US**. Sur les versions **EU/FR/DE/ES/IT/JP**,
l'adresse de l'équipe peut être **différente**. Si l'overlay reste sur `en attente d'une equipe`
ou affiche de **faux chiffres** alors que tu as une équipe → fais la calibration guidée :

1. En jeu, **soigne ton équipe** (Centre Pokémon / PC) pour que **PV actuels = PV max**.
2. Note le **niveau** et les **PV max** de ton **1er** Pokémon (slot 1).
3. Ouvre `soulsync_tracker.lua`, et en haut renseigne (exemple pour un Pokémon Niv 5 à 19 PV) :
   ```lua
   local CALIBRATE = { level = 5, hp = 19, maxhp = 19 }
   ```
4. Sauvegarde, **relance le script**. Dans la console Lua tu verras :
   `[SoulSync] TROUVÉ ! base de l'équipe = 0x0221XXXX`
5. **Envoie-moi cette adresse** → je l'ajoute en dur pour toute la team (plus besoin de scanner).
   En attendant, remets `CALIBRATE = nil` et mets l'adresse trouvée dans `FORCED_BASE`.

Le scan prend quelques secondes (l'émulateur peut figer un instant) — c'est normal.

---

## Réglages (en haut du `.lua`)
- `FORCED_BASE` : force une adresse (Noire 2 US = `0x0221E3EC`, Blanche 2 US = `0x0221E42C`,
  ou l'adresse FR trouvée par la calibration).
- `CALIBRATE` : `{ level=.., hp=.., maxhp=.. }` pour lancer la calibration guidée (versions EU/FR…).
- `OUT_DIR` : dossier où écrire les fichiers de sortie (par défaut : dossier de l'émulateur).
