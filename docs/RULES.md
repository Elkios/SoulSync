# Règles Nuzlocke + Soul Link — et ce que SoulSync automatise

Le mode se compose de 3 couches. SoulSync sert d'**arbitre automatique** : il lit le
jeu, applique les règles, et synchronise les joueurs.

Légende : ✅ fait · 🔄 prévu (auto) · ✋ honneur (l'app rappelle, ne bloque pas)

---

## 1. Nuzlocke (suivi individuel)

| Règle | Ce que fait SoulSync | Statut |
|---|---|---|
| **K.O. = mort définitive** | Détecte PV→0, marque le Pokémon mort pour toujours | ✅ |
| **Cimetière** | Garde la liste des morts (PID, nom, espèce, ordre) | ✅ |
| **1 capture par route** | Détecte chaque nouvelle capture ; (à terme) bloque la 2ᵉ sur une route | 🔄 |
| **Black-out = game over** | Détecte quand toute l'équipe d'un joueur est morte | ✅ (moteur) |
| **Surnoms obligatoires** | Lit/affiche les surnoms | 🔄 |
| **Plafond de niveau** (option) | Lit les niveaux, peut alerter | 🔄 |

## 2. Soul Link (le lien entre potes — le cœur)

| Règle | Ce que fait SoulSync | Statut |
|---|---|---|
| **Pokémon de même route = liés (paire)** | Apparie les captures (par **ordre** de capture) | ✅ (moteur) |
| **Mort en cascade** | Un Pokémon meurt → son partenaire lié meurt aussi, et tout le monde est prévenu | ✅ (moteur) |
| **Capture ratée = les deux sautent** | Casse le lien si un joueur rate la route | 🔄 |
| **Équipes miroir** | Alerte si une paire est séparée (équipe/boîte) | ✋/🔄 |
| **Clause d'espèce** | Détecte 2× la même espèce | ✅ (moteur) |
| **Game over partagé** | Diffuse le Game Over à tous | ✅ (moteur) |

### L'astuce d'appariement
Comme les joueurs jouent **synchronisés**, on apparie **par ordre de capture** :
la 1ʳᵉ capture de chacun ↔ la 1ʳᵉ, la 2ᵉ ↔ la 2ᵉ, etc. Simple et robuste. La
détection de la route exacte est un raffinement ultérieur (anti-désync).

## 3. Randomizer (bonus)
Rencontres, dresseurs, starters (et souvent talents/stats/types) randomisés via
l'Universal Pokémon Randomizer. **Optionnel** — pas le cœur du projet.

---

## Variantes maison (options, l'app rappelle seulement) ✋
- **Dupes clause** : si la 1ʳᵉ rencontre est une espèce déjà eue, on peut retenter.
- **Shiny clause**, **mode Set** (pas de switch gratuit), **pas d'objets en combat**,
  **niveau plafonné** au prochain champion…

## Ce qui est auto-détectable vs manuel
- **100 % auto (RAM)** : morts, PV, niveaux, espèces, surnoms, nouvelles captures, game over.
- **À coder** : route/zone courante (optionnel grâce à l'appariement par ordre).
- **Honneur** : mode Set, objets, dupes/shiny clause — l'app affiche un rappel.
