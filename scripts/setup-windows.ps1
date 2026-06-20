# setup-windows.ps1 — bootstrap de mplay en Windows.
#
# Android funciona NATIVO en Windows (emulador de Android Studio + adb).
# iOS NO se puede emular en Windows: el Simulador es parte de Xcode (solo macOS).
# Para iOS, este script configura el acceso a un Mac remoto por SSH.
#
# Ejecuta en PowerShell:  ./scripts/setup-windows.ps1

$ErrorActionPreference = "Stop"
function Log($m) { Write-Host "[setup] $m" -ForegroundColor Magenta }
function Have($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# 1) Node --------------------------------------------------------------------
if (Have node) { Log "Node $(node -v) presente." }
else {
  Log "Node no encontrado. Instálalo desde https://nodejs.org o: winget install OpenJS.NodeJS.LTS"
}

# 2) Dependencias + build ----------------------------------------------------
if (Test-Path "$PSScriptRoot/../package.json") {
  Log "Instalando dependencias y compilando..."
  Push-Location "$PSScriptRoot/.."
  npm install
  npm run build
  Pop-Location
}

# 3) Android ------------------------------------------------------------------
if (Have adb) {
  Log "adb presente: $(adb version | Select-Object -First 1)"
} else {
  Log "adb no encontrado. Opciones:"
  Log "  - Instala Android Studio (incluye SDK + emulador): https://developer.android.com/studio"
  Log "  - O con Chocolatey:  choco install adb android-sdk"
  Log "  Luego añade '%LOCALAPPDATA%\Android\Sdk\platform-tools' al PATH."
}

# 4) iOS (remoto) -------------------------------------------------------------
Log ""
Log "iOS en Windows: el Simulador de iOS NO existe en Windows (es parte de Xcode/macOS)."
Log "mplay ejecuta iOS contra un Mac REMOTO por SSH. Configúralo así:"
Log "  1. Consigue un Mac: GitHub Actions (runner macOS), MacStadium, MacInCloud, o un Mac físico."
Log "     Alternativa con dispositivos reales: BrowserStack App Automate / Sauce Labs / AWS Device Farm."
Log "  2. En ese Mac instala el entorno:  bash scripts/setup-ios.sh"
Log "  3. Habilita SSH en el Mac (Ajustes > General > Compartir > Inicio de sesion remoto)."
Log "  4. En mplay.config.ts, en el project 'ios', añade:  use: { remoteHost: 'usuario@ip-del-mac' }"
Log "  5. Verifica:  npx mplay doctor --platform=ios --remote-host=usuario@ip-del-mac"

Log ""
Log "Diagnostico:"
Push-Location "$PSScriptRoot/.."
node dist/cli.js doctor
Pop-Location
