#!/usr/bin/env bash
#
# setup-android.sh — instala y configura el entorno nativo de Android para mplay.
# Idempotente: puedes ejecutarlo varias veces sin romper nada.
#
# Soporta macOS (Homebrew) y Linux (apt/manual). En Windows usa setup-windows.ps1.
#
set -euo pipefail

log()  { printf "\033[1;34m[android]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m  ✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m  ! \033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m  ✗\033[0m %s\n" "$*" >&2; exit 1; }

API_LEVEL="${MPLAY_ANDROID_API:-34}"
AVD_NAME="${MPLAY_AVD_NAME:-mplay_pixel}"
ARCH_TAG="$( [ "$(uname -m)" = "arm64" ] && echo "arm64-v8a" || echo "x86_64" )"
IMAGE="system-images;android-${API_LEVEL};google_apis;${ARCH_TAG}"

have() { command -v "$1" >/dev/null 2>&1; }

# 1) adb / platform-tools -----------------------------------------------------
if have adb; then
  ok "adb ya instalado: $(adb version | head -1)"
else
  log "Instalando Android Platform-Tools (adb)..."
  if [ "$(uname)" = "Darwin" ]; then
    have brew || die "Homebrew no está instalado. Ejecuta scripts/setup-macos.sh primero."
    brew install --cask android-platform-tools
  elif have apt-get; then
    sudo apt-get update && sudo apt-get install -y android-tools-adb android-tools-fastboot
  else
    die "No sé instalar adb en este SO automáticamente. Instala Android SDK Platform-Tools manualmente."
  fi
  ok "adb instalado"
fi

# 2) SDK command-line tools + emulator ---------------------------------------
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ "$(uname)" = "Linux" ] && ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_HOME
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

if have sdkmanager; then
  ok "sdkmanager disponible"
else
  warn "sdkmanager no está en el PATH."
  if [ "$(uname)" = "Darwin" ] && have brew; then
    log "Instalando command-line-tools vía Homebrew..."
    brew install --cask android-commandlinetools || warn "Instala Android Studio si esto falla."
  else
    warn "Instala las 'Android SDK Command-line Tools' (Android Studio › SDK Manager) y reexporta ANDROID_HOME."
  fi
fi

# 3) Imagen del sistema + emulador + AVD -------------------------------------
if have sdkmanager; then
  log "Aceptando licencias del SDK..."
  yes | sdkmanager --licenses >/dev/null 2>&1 || true

  log "Instalando emulador, platform-tools e imagen ${IMAGE}..."
  sdkmanager "platform-tools" "emulator" "platforms;android-${API_LEVEL}" "$IMAGE" >/dev/null

  if have avdmanager; then
    if avdmanager list avd 2>/dev/null | grep -q "Name: ${AVD_NAME}$"; then
      ok "AVD '${AVD_NAME}' ya existe"
    else
      log "Creando AVD '${AVD_NAME}'..."
      echo "no" | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" --device "pixel_5" >/dev/null
      ok "AVD '${AVD_NAME}' creado"
    fi
  fi
fi

cat <<EOF

\033[1;32mAndroid listo.\033[0m
  ANDROID_HOME = $ANDROID_HOME
  Arranca el emulador:   emulator -avd ${AVD_NAME}
  Verifica:              npx mplay doctor --platform=android

Añade esto a tu shell (~/.zshrc o ~/.bashrc) para que persista:
  export ANDROID_HOME="$ANDROID_HOME"
  export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools:\$PATH"
EOF
