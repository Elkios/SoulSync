# 🎮 SoulSync — Installation (pour jouer avec tes potes)

Bienvenue ! Suis ces étapes une fois, et c'est bon pour toujours.

## 1. Décompresser
Extrais le zip **`SoulSync-Portable.zip`** où tu veux (ex : sur ton Bureau).
> ⚠️ N'exécute pas SoulSync **depuis l'intérieur du zip** — décompresse-le d'abord dans un dossier.

## 2. Prérequis : .NET 8 (pour l'émulateur)
L'émulateur (BizHawk) a besoin du **.NET 8 Desktop Runtime** de Microsoft.
- Télécharge-le ici (gratuit, officiel Microsoft) : **https://dotnet.microsoft.com/download/dotnet/8.0/runtime**
  → choisis **« .NET Desktop Runtime » x64 » → Windows Installer**.
- Installe-le (suivant/suivant). À faire **une seule fois**.

*(Java est déjà inclus dans SoulSync, pas besoin de l'installer.)*

## 3. Ta ROM
Tu dois fournir **ta propre ROM** de Pokémon Noire 2 / Blanche 2 (`.nds`).
SoulSync ne contient **aucune ROM** (c'est à toi de la dumper depuis ta cartouche).
Mets-la où tu veux, tu la sélectionneras dans l'app.

## 4. Lancer
Double-clique **`SoulSync.bat`**.
- **Solo** : pour tester seul.
- **Rejoindre** : colle l'adresse (ou clique le lien `soulsync://`) que l'hôte t'a envoyée.
- **Héberger** : crée la partie et partage ton lien/IP.

Puis : **📁 choisis ta ROM** → l'hôte clique **🎲 Jouer** → ça randomise et lance le jeu pour tout le monde, automatiquement. 🚀

## Jouer à distance (pas sur le même réseau)
Si vous n'êtes pas sur le même Wi-Fi/LAN, installez tous un **LAN virtuel** gratuit
(**ZeroTier** ou **Tailscale**) — ça vous met sur le même réseau virtuel, et l'IP de
l'hôte devient joignable. ~2 min à configurer une fois.

## Souci ?
- **« BizHawk ne se lance pas »** → installe le .NET 8 Desktop Runtime (étape 2).
- **« Le pote ne peut pas rejoindre »** → même réseau (LAN) ou ZeroTier/Tailscale ;
  l'hôte doit autoriser SoulSync dans le pare-feu Windows (popup au 1er hébergement).

Bon jeu ! 🔗
