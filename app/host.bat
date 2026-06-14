@echo off
title SoulSync - HOTE
echo === SoulSync : heberger une partie ===
set /p NAME=Ton pseudo:
if "%NAME%"=="" set NAME=Hote
"C:\Program Files\nodejs\node.exe" "%~dp0host.js" --name "%NAME%"
echo.
echo (serveur arrete)
pause
