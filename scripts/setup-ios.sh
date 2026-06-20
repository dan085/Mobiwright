#!/usr/bin/env bash
#
# setup-ios.sh — instala y configura el entorno nativo de iOS para mplay.
# SOLO macOS: el Simulador de iOS es parte de Xcode y no existe en Windows/Linux.
#
set -euo pipefail

log()  { printf "\033[1;34m[ios]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m  ✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m  ! \033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m  ✗\033[0m %s\n" "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(uname)" != "Darwin" ]; then
  die "iOS solo se emula en macOS. Desde Windows/Linux apunta a un Mac remoto:
       mplay test --platform=ios   (con remoteHost en el config)
       Ver SETUP.md › 'iOS desde Windows/Linux'."
fi

# 1) Command Line Tools / Xcode ----------------------------------------------
if xcode-select -p >/dev/null 2>&1; then
  ok "Xcode CLT presente: $(xcode-select -p)"
else
  log "Instalando Xcode Command Line Tools (se abrirá un diálogo)..."
  xcode-select --install || true
  warn "Completa la instalación del diálogo y vuelve a ejecutar este script."
fi

if have xcrun && xcrun simctl help >/dev/null 2>&1; then
  ok "simctl disponible"
else
  warn "simctl no responde. Necesitas Xcode COMPLETO (App Store), no solo las CLT."
  warn "Tras instalar Xcode: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && sudo xcodebuild -license accept"
fi

# 2) Homebrew ----------------------------------------------------------------
if ! have brew; then
  warn "Homebrew no está instalado; lo necesitamos para idb."
  warn 'Instálalo: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
fi

# 3) idb (idb-companion + cliente python) ------------------------------------
if have idb; then
  ok "idb ya instalado"
else
  log "Instalando idb (gestos y árbol de accesibilidad)..."
  if have brew; then
    brew tap facebook/fb || true
    brew install idb-companion || warn "Falló idb-companion; revisa Homebrew."
  fi
  if have pip3; then
    pip3 install fb-idb || warn "Falló 'pip3 install fb-idb'. Instálalo manualmente."
  else
    warn "pip3 no disponible; instala Python 3 y luego: pip3 install fb-idb"
  fi
fi

# 4) Arrancar un simulador por defecto ---------------------------------------
if have xcrun && xcrun simctl help >/dev/null 2>&1; then
  UDID="$(xcrun simctl list devices available | grep -m1 -E 'iPhone 1[5-9]' | grep -oE '[0-9A-F-]{36}' || true)"
  if [ -n "${UDID}" ]; then
    log "Arrancando simulador ${UDID}..."
    xcrun simctl boot "$UDID" 2>/dev/null || true
    open -a Simulator || true
    ok "Simulador arrancando"
  else
    warn "No encontré un iPhone disponible. Abre Xcode › Settings › Platforms y descarga un runtime de iOS."
  fi
fi

cat <<EOF

\033[1;32miOS configurado (lo posible automáticamente).\033[0m
  Verifica:  npx mplay doctor --platform=ios
EOF
