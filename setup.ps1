# setup.ps1 — Windows version of setup.sh: ffmpeg, Node 22+, Rhubarb Lip Sync, the Remotion packages.
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1
# Safe to re-run: it skips what is already there. Last line is "READY" or "NOT READY".
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$fail = $false
function Ok($m) { Write-Host "  + $m" }
function Warn($m) { Write-Host "  ! $m"; $script:fail = $true }
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Node22 { (Has node) -and ([int]((node -v) -replace '^v(\d+).*', '$1') -ge 22) }

# ffmpeg + Node via winget when missing
$winget = Has winget
if (-not (Has ffmpeg) -and $winget) { winget install -e --id Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements | Out-Null; RefreshPath }
if (-not (Node22) -and $winget) { winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null; RefreshPath }
if (Has ffmpeg) { Ok "ffmpeg" } else { Warn "ffmpeg missing - winget install Gyan.FFmpeg, then open a new terminal" }
if (Node22) { Ok "node $(node -v)" } else { Warn "Node 22+ needed - winget install OpenJS.NodeJS.LTS, then open a new terminal" }

# Rhubarb Lip Sync 1.14.0 -> ~\.local\opt (scripts/render.mjs looks there, no PATH edit needed)
$opt = Join-Path $HOME ".local\opt\rhubarb-1.14.0"
$exe = Join-Path $opt "Rhubarb-Lip-Sync-1.14.0-Windows\rhubarb.exe"
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force $opt | Out-Null
  $zip = Join-Path $opt "r.zip"
  try {
    Invoke-WebRequest -UseBasicParsing -OutFile $zip "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Windows.zip"
    Expand-Archive -Force $zip $opt; Remove-Item $zip
  } catch { }
}
if ((Test-Path $exe) -and (& $exe --version 2>$null)) { Ok "rhubarb" } else { Warn "rhubarb not installed - get the Windows zip from https://github.com/DanielSWolf/rhubarb-lip-sync/releases and unzip it into $opt" }

Push-Location remotion
npm install --no-audit --no-fund 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Ok "remotion packages" } else { Warn "npm install failed in remotion\" }
Pop-Location

if ($fail) { "NOT READY" } else { "READY" }
