@echo off
title SoulSync - REJOINDRE
echo === SoulSync : rejoindre une partie ===
set /p NAME=Ton pseudo:
if "%NAME%"=="" set NAME=Joueur
set /p HOSTIP=IP:port de l'hote (ex 192.168.1.20:58787):
"C:\Program Files\nodejs\node.exe" "%~dp0client.js" --name "%NAME%" --host "%HOSTIP%"
echo.
echo (deconnecte)
pause
