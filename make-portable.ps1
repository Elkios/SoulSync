# Construit SoulSync-Portable.zip (à partager à tes potes).
# Inclut : app + tracker + UPR + BizHawk + JRE embarqué. EXCLUT : ROMs, données runtime.
$ErrorActionPreference = "Continue"
$root  = "C:\Users\pomie\OneDrive\Desktop\Nuzlocke-SoulLink-Randomize"
$build = "$env:TEMP\SoulSync-build"
$stage = "$build\SoulSync"
$out   = "C:\Users\pomie\SoulSync-Portable.zip"

if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

function CopyDir($src, $dst) { robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null }

Write-Output "Copie des fichiers..."
CopyDir "$root\app"            "$stage\app"
CopyDir "$root\tracker"        "$stage\tracker"
CopyDir "$root\tools\upr"      "$stage\tools\upr"
CopyDir "$root\tools\preset"   "$stage\tools\preset"
CopyDir "$root\jre"            "$stage\jre"
$biz = (Get-ChildItem $root -Directory -Filter "BizHawk-*" | Select-Object -First 1).Name
CopyDir "$root\$biz"           "$stage\$biz"

# Petits fichiers
Copy-Item "$root\SoulSync.bat", "$root\SETUP.md", "$root\README.md" $stage -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$stage\data", "$stage\roms" | Out-Null
Set-Content "$stage\data\.gitkeep" "" -Encoding ascii
Set-Content "$stage\roms\METS-TA-ROM-ICI.txt" "Mets ta ROM Pokemon Noire 2 / Blanche 2 (.nds) ou selectionne-la dans l'app." -Encoding utf8
# Pas de config perso (chemin ROM)
Set-Content "$stage\app\randomizer\config.json" "{}" -Encoding ascii
# Nettoie les fichiers de dev/test
Remove-Item "$stage\app\test*.js", "$stage\app\preview-server.js" -Force -ErrorAction SilentlyContinue

Write-Output "Compression (peut prendre quelques minutes)..."
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path $stage -DestinationPath $out -CompressionLevel Optimal

Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $out) { Write-Output ("OK : " + $out + "  (" + [math]::Round((Get-Item $out).Length/1MB, 1) + " Mo)") }
else { Write-Output "ECHEC : zip non cree" }
