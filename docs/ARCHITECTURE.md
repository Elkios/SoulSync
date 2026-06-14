# Architecture — SoulSync

## Principe général

Chaque joueur fait tourner, **sur sa machine** :
- son **émulateur** (BizHawk) avec sa ROM + le **script Lua** ;
- l'**app SoulSync** (Node.js) qui lit les évènements du Lua et parle aux autres joueurs.

Un des joueurs **héberge** (serveur intégré) ; les autres s'y connectent.

```
   JOUEUR HÔTE                                AUTRES JOUEURS
┌──────────────────────────────┐         ┌────────────────────────────┐
│ BizHawk + Lua                │         │ BizHawk + Lua              │
│   │ events (data/)           │         │   │ events (data/)         │
│   ▼                          │         │   ▼                        │
│ App SoulSync ── serveur ◀────┼─réseau──┼─▶ App SoulSync (client)    │
│   (moteur de règles)         │         │   (moteur de règles)       │
└──────────────────────────────┘         └────────────────────────────┘
```

## Les deux moitiés

### 1. Côté émulateur — `tracker/soulsync_tracker.lua`
Lit l'équipe directement dans la **RAM** de Pokémon Noire 2 / Blanche 2.

- **Base de l'équipe** (identique US et PAL/FR) : Noire 2 = `0x0221E3EC`,
  Blanche 2 = `0x0221E42C`. Bloc de **0xDC (220) octets** par Pokémon.
- **Chiffrement Gen 5** : les données sont chiffrées en RAM. On déchiffre :
  - **Stats de combat** (offset `0x88`+) : LCG `X=(0x41C64E6D·X+0x6073) mod 2³²`
    initialisé par le **PID** ; clé de chaque u16 = `X>>16`. Donne niveau (`0x8C`),
    PV actuels (`0x8E`), PV max (`0x90`).
  - **Espèce** : dans les 4 blocs (`0x08`–`0x87`) chiffrés par le **checksum**,
    avec un mélange de blocs basé sur le PID (`sv=((PID>>13)&31)%24`, table
    `blockPosition` à la PKHeX). Espèce = u16 au début du Bloc A.
- **Sorties** (dans `data/`) :
  - `soulsync_events.jsonl` : 1 ligne JSON par évènement (`catch`, `death`).
  - `soulsync_state.json` : snapshot de l'équipe (rafraîchi ~2×/s).
- Compatible **BizHawk** (cœur melonDS, lecture via domaine "Main RAM",
  offset = adresse − `0x02000000`) et **DeSmuME** (API auto-détectée).

### 2. Côté app — `app/` (Node.js)
- **`bridge.js`** : surveille `soulsync_events.jsonl` (tail) et émet chaque
  évènement parsé (drapeau `_live` : rejoué au démarrage vs nouveau).
- **`engine.js`** (`SoulSyncEngine`) : le moteur de règles, **agnostique du joueur**
  (on lui envoie des évènements taggués par `playerId`). Voir [RULES.md](RULES.md).
- **`watch.js`** : runner solo (Phase A) qui affiche les évènements en direct.
- **Réseau** (à venir) : transport WebSocket. L'hôte fait tourner le moteur, reçoit
  les évènements de tous, calcule les cascades, et rediffuse l'état + les notifications.

## Choix techniques

| Brique | Choix | Pourquoi |
|---|---|---|
| Émulateur | BizHawk (melonDS) | Lua fiable, lancement en ligne de commande, maintenu |
| Lecture jeu | Script Lua + RAM | Pas d'accès réseau du jeu ; la RAM expose tout |
| App / moteur | Node.js | Réutilisable pour l'app finale Electron |
| Réseau | WebSocket, un hôte | Pas de serveur tiers à maintenir (choix utilisateur) |
| Interface finale | Electron | UI web packagée en .exe, installable en qq clics |

## Pont Lua ↔ app : pourquoi par fichier ?
Le Lua de BizHawk écrit des lignes JSON dans `data/` ; l'app les lit (tail). Simple,
robuste, découplé. On pourra passer à une socket locale plus tard si la latence
l'exige (les morts sont actées en fin de combat, donc ~temps réel suffit).

## Modèle réseau (un joueur héberge)
- L'hôte ouvre un serveur ; les autres se connectent via un code (IP:port).
- **LAN** : marche directement. **À distance** : passer par un LAN virtuel (ZeroTier /
  Tailscale, gratuit, sans ouverture de port).
- Le code réseau reste abstrait pour pouvoir basculer vers un relais cloud plus tard.
