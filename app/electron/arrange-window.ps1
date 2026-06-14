param([int]$x, [int]$y, [int]$w, [int]$h)
# Positionne la fenetre BizHawk (EmuHawk) au rectangle donne, en attendant
# qu'elle apparaisse (BizHawk met 1-3 s a creer sa fenetre apres lancement).
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMove {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
for ($i = 0; $i -lt 40; $i++) {
  $p = Get-Process EmuHawk -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    [WinMove]::MoveWindow($p.MainWindowHandle, $x, $y, $w, $h, $true) | Out-Null
    [WinMove]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Write-Output "moved"
    exit 0
  }
  Start-Sleep -Milliseconds 300
}
Write-Output "not found"
