#!/usr/bin/env bash
# setup.sh — installs what talking-avatar needs: ffmpeg, Node 22+, Rhubarb Lip Sync, the Remotion packages.
# Safe to re-run: it skips what is already there. Last line is "READY" or "NOT READY".
set -uo pipefail
cd "$(dirname "$0")"
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; FAIL=1; }
FAIL=0
export PATH="$HOME/.local/bin:$PATH"
sha256() { { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d" " -f1; }
has_node22() { (node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)') 2>/dev/null; }
# An older default node is fine when nvm or Homebrew already has 22+: use that one (the scripts do the same).
for d in $(ls -d "$HOME"/.nvm/versions/node/v*/bin /opt/homebrew/opt/node@2*/bin /usr/local/opt/node@2*/bin 2>/dev/null | sort -rV); do
  has_node22 && break; export PATH="$d:$PATH"
done

# ffmpeg + Node via Homebrew (macOS) or apt (Linux) when missing
if ! command -v ffmpeg >/dev/null || ! has_node22; then
  if command -v brew >/dev/null; then
    command -v ffmpeg >/dev/null || brew install ffmpeg
    has_node22 || { brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"; }
  elif command -v apt-get >/dev/null; then
    command -v ffmpeg >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y ffmpeg; }
  fi
fi
# Linux without Node 22+: official tarball into ~/.local/opt, checked against nodejs.org's SHASUMS256.txt (no sudo)
if ! has_node22 && [ "$(uname -s)" = Linux ]; then
  case "$(uname -m)" in x86_64) NA=x64 ;; aarch64|arm64) NA=arm64 ;; *) NA= ;; esac
  NU=https://nodejs.org/dist/latest-v22.x
  NT=$(curl -fsSL "$NU/SHASUMS256.txt" 2>/dev/null | grep -E "node-v[0-9.]+-linux-$NA\.tar\.xz$")
  if [ -n "$NA" ] && [ -n "$NT" ]; then
    NF=${NT##* }; NDIR="$HOME/.local/opt/${NF%.tar.xz}"
    mkdir -p "$HOME/.local/opt" "$HOME/.local/bin"
    curl -fsSL -o "/tmp/$NF" "$NU/$NF" && [ "$(sha256 "/tmp/$NF")" = "${NT%% *}" ] \
      && tar -xJf "/tmp/$NF" -C "$HOME/.local/opt" && ln -sf "$NDIR/bin/node" "$NDIR/bin/npm" "$NDIR/bin/npx" "$HOME/.local/bin/" \
      || warn "Node download failed or checksum mismatch"
    rm -f "/tmp/$NF"
  fi
fi
command -v ffmpeg >/dev/null && ok "ffmpeg" || warn "ffmpeg missing — macOS: brew install ffmpeg · Linux: sudo apt install ffmpeg"
has_node22 && ok "node $(node -v)" \
  || { ls "$HOME"/.nvm/versions/node/v2[2-9]* >/dev/null 2>&1 && ok "node 22+ in ~/.nvm (scripts find it)" \
  || warn "Node 22+ needed — https://nodejs.org or: brew install node@22"; }

# Rhubarb Lip Sync 1.14.0 → ~/.local/bin/rhubarb (the scripts look there, no PATH edit needed)
if ! command -v rhubarb >/dev/null; then
  case "$(uname -s)" in Darwin) OS=macOS ;; Linux) OS=Linux ;; *) OS= ;; esac
  if [ -n "$OS" ]; then
    D="$HOME/.local/opt/rhubarb-1.14.0"
    mkdir -p "$D" "$HOME/.local/bin"
    # SHA-256 pinned from the v1.14.0 release assets: a changed or tampered zip is refused, never unzipped
    case "$OS" in macOS) SUM=f991deacac6c973a14a4431a16a58b842f436531e120cfaea142c87c0d3ab4c5 ;;
                  Linux) SUM=a9a9074862cff47b2d59b8bf399a678a3b0b74f9452ad6ad94cb292913dd8667 ;; esac
    curl -sSL -o "$D/r.zip" "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-$OS.zip"
    if [ "$(sha256 "$D/r.zip")" = "$SUM" ]; then unzip -qo "$D/r.zip" -d "$D"; else warn "rhubarb zip checksum mismatch, not installed"; fi
    rm -f "$D/r.zip"
    printf '#!/bin/sh\nexec "%s/Rhubarb-Lip-Sync-1.14.0-%s/rhubarb" "$@"\n' "$D" "$OS" > "$HOME/.local/bin/rhubarb"
    chmod +x "$HOME/.local/bin/rhubarb"
  fi
fi
# The macOS build is x86_64: Apple Silicon runs it through Rosetta.
if [ "$(uname -sm)" = "Darwin arm64" ] && ! /usr/bin/pgrep -q oahd; then
  softwareupdate --install-rosetta --agree-to-license >/dev/null 2>&1 || true
fi
rhubarb --version >/dev/null 2>&1 && ok "rhubarb" \
  || warn "rhubarb won't run — Apple Silicon: softwareupdate --install-rosetta --agree-to-license · else: https://github.com/DanielSWolf/rhubarb-lip-sync/releases"

(cd remotion && npm install --no-audit --no-fund >/dev/null 2>&1) && ok "remotion packages" || warn "npm install failed in remotion/"

[ "$FAIL" = 0 ] && echo "READY" || echo "NOT READY"
