#!/usr/bin/env bash
#
# setup-macos.sh — bootstrap completo de mplay en macOS.
# Instala Homebrew (si falta), Node, el entorno de Android y el de iOS, y deja
# todo listo para `npx mplay test`. Idempotente.
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf "\033[1;35m[setup]\033[0m %s\n" "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(uname)" = "Darwin" ] || { echo "Este script es para macOS. Usa setup-android.sh (Linux) o setup-windows.ps1 (Windows)."; exit 1; }

# 1) Homebrew ----------------------------------------------------------------
if have brew; then
  log "Homebrew presente."
else
  log "Instalando Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
fi

# 2) Node --------------------------------------------------------------------
if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then
  log "Node $(node -v) presente."
else
  log "Instalando Node 20..."
  brew install node@20 || brew install node
fi

# 3) Dependencias del proyecto + build ---------------------------------------
if [ -f "$HERE/../package.json" ]; then
  log "Instalando dependencias de mplay y compilando..."
  ( cd "$HERE/.." && npm install && npm run build )
fi

# 4) Android -----------------------------------------------------------------
log "Configurando Android..."
bash "$HERE/setup-android.sh" || log "Android terminó con advertencias (ver arriba)."

# 5) iOS ---------------------------------------------------------------------
log "Configurando iOS..."
bash "$HERE/setup-ios.sh" || log "iOS terminó con advertencias (ver arriba)."

# 6) Diagnóstico final -------------------------------------------------------
log "Diagnóstico final:"
( cd "$HERE/.." && node dist/cli.js doctor ) || true

cat <<'EOF'

[setup] Listo. Próximos pasos:
  1. Arranca un emulador Android:   emulator -avd mplay_pixel
  2. (en Mac) arranca un simulador: open -a Simulator
  3. Ejecuta los tests:             npx mplay test
EOF
