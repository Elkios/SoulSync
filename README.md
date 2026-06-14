# 🔗 SoulSync

**Arbitre automatique pour les runs Pokémon Nuzlocke / Soul Link entre potes.**

SoulSync lit l'état de ton jeu (Pokémon **Noire 2 / Blanche 2** sur émulateur) en
temps réel, applique les règles Nuzlocke + Soul Link automatiquement, et synchronise
tout le monde : dès qu'un de tes Pokémon meurt, **tes potes le savent instantanément**
et le partenaire lié meurt aussi (cascade). Plus besoin de tout suivre à la main.

> Jeu cible : Pokémon Blanche 2 / Noire 2 (Gen 5, NDS, émulé). Le **randomizer** est
> une option bonus ; le cœur du projet, c'est le suivi automatique des règles.

---

## Comment ça marche (vue d'ensemble)

```
   Émulateur (BizHawk)              App SoulSync (Node.js)
  ┌───────────────────┐           ┌────────────────────────┐
  │  Jeu B2/W2        │           │  Pont (lit les events) │
  │  + script Lua     │──events──▶│  Moteur de règles      │◀──réseau──▶ potes
  │  (lit la RAM)     │  (data/)  │  (paires, cascade...)  │
  └───────────────────┘           └────────────────────────┘
```

1. Un **script Lua** tourne dans l'émulateur et lit l'équipe en RAM (déchiffrement
   Gen 5). Il écrit les évènements (capture, mort) dans `data/`.
2. L'**app Node** lit ces évènements, applique les règles, et (à terme) les partage
   avec les autres joueurs via le réseau.

## État du projet

| Brique | Statut |
|---|---|
| Lecture de l'équipe en RAM (déchiffrée) | ✅ |
| Détection des **morts** | ✅ |
| Détection des **captures** + espèces + noms FR | ✅ |
| Moteur de règles (paires, cascade, game over, clause d'espèce) | ✅ (testé) |
| Pont Lua → Node (temps réel) | ✅ |
| **Réseau** entre joueurs (un hôte) | ✅ (testé) |
| Dashboard / interface (Electron) | ⏳ à venir |
| Launcher + randomizer 1-clic | ⏳ bonus |

## Structure du dépôt

```
SoulSync/
├── README.md            ← ce fichier
├── docs/
│   ├── ARCHITECTURE.md  ← l'architecture technique
│   └── RULES.md         ← les règles Nuzlocke / Soul Link (le "cahier des charges")
├── tracker/             ← côté émulateur (Lua)
│   ├── soulsync_tracker.lua   ← lit la RAM, détecte morts/captures
│   ├── species_fr.lua         ← noms FR des Pokémon (généré)
│   └── README.md              ← comment charger le script + tests
├── app/                 ← côté app (Node.js)
│   ├── engine.js        ← moteur de règles (paires, cascade...)
│   ├── bridge.js        ← lit les évènements du Lua
│   ├── watch.js         ← Phase A : affiche les évènements en direct
│   ├── watch.bat        ← lanceur double-clic
│   └── test.js          ← test du moteur (scénario 2 joueurs)
├── data/                ← fichiers d'échange Lua ↔ app (runtime, ignoré par git)
├── roms/                ← TA ROM perso (ignorée par git — jamais distribuée)
└── BizHawk-.../         ← l'émulateur (ignoré par git)
```

## Démarrage rapide (état actuel — solo)

1. Ouvre ta ROM B2/W2 dans **BizHawk** → `Tools > Lua Console` → ouvre
   `tracker/soulsync_tracker.lua`.
2. Double-clique **`app/watch.bat`** : la console affiche tes captures/morts en direct.

Voir [`tracker/README.md`](tracker/README.md) pour le détail.

## Jouer à plusieurs (réseau)

Chaque joueur lance BizHawk + le script Lua sur sa machine. Ensuite :

- **L'hôte** double-clique **`app/host.bat`**, entre son pseudo → la console affiche
  son `IP:port` (ex. `192.168.1.20:8787`).
- **Les potes** double-cliquent **`app/join.bat`**, entrent leur pseudo + l'`IP:port`
  de l'hôte.

Tout le monde reçoit alors les **captures, morts et cascades** de tous, en direct.
- **Même réseau (LAN)** : marche directement.
- **À distance** : passez par un LAN virtuel gratuit (ZeroTier / Tailscale).

## Prérequis légal
Chaque joueur fournit **sa propre ROM** (jamais distribuée par l'app). SoulSync ne
contient aucune ROM.
