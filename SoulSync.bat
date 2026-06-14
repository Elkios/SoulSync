@echo off
title SoulSync
rem Lance l'interface SoulSync (Electron). Double-clique ce fichier.
"%~dp0app\node_modules\electron\dist\electron.exe" "%~dp0app\electron\main.js"
