# Setup del entorno nativo

mplay automatiza apps **nativas** sobre el **emulador de Android** y el
**simulador de iOS**. Esta guía explica cómo dejar el entorno funcional en cada
sistema operativo, incluyendo la situación especial de iOS.

> Comprueba en cualquier momento qué te falta con:
> ```bash
> npx mplay doctor
> ```

## TL;DR

| Tu sistema | Android | iOS |
|-----------|---------|-----|
| **macOS** | ✅ nativo (`scripts/setup-macos.sh`) | ✅ nativo (Xcode + idb) |
| **Windows** | ✅ nativo (Android Studio + adb) | ⚠️ **solo remoto** (Mac en la nube por SSH) |
| **Linux** | ✅ nativo (Android SDK) | ⚠️ **solo remoto** (Mac en la nube por SSH) |

## macOS (lo más sencillo: un comando)

```bash
bash scripts/setup-macos.sh
```

Esto instala (lo que falte): Homebrew, Node 20, Android Platform-Tools + SDK +
un AVD, Xcode CLT e `idb`, y arranca un simulador. Al final corre `mplay doctor`.

Manual, por partes:

```bash
bash scripts/setup-android.sh   # adb, SDK, imagen del sistema y AVD
bash scripts/setup-ios.sh       # Xcode CLT + idb + simulador
```

## Windows

**Android es nativo.** Instala [Android Studio](https://developer.android.com/studio)
(incluye SDK + emulador) o, con Chocolatey, `choco install adb android-sdk`. Añade
`platform-tools` al PATH. Luego:

```powershell
./scripts/setup-windows.ps1
npx mplay doctor --platform=android
```

**iOS no se puede emular en Windows** (ver siguiente sección).

## Linux

**Android es nativo.** Instala el SDK (línea de comandos de Android) o
`scripts/setup-android.sh` (detecta `apt`). Necesitas aceleración KVM para que el
emulador vaya fluido. iOS, igual que en Windows, **solo en remoto**.

---

## iOS desde Windows / Linux (o Mac sin recursos)

**La realidad técnica y legal:** el Simulador de iOS es parte de **Xcode**, que
**solo existe en macOS**. No hay forma legítima de emular iOS en Windows o Linux.
Cualquier "emulador de iOS para Windows" que prometa lo contrario es, en el mejor
caso, un reproductor web de baja fidelidad y, a menudo, inseguro.

**La solución correcta:** ejecutar los comandos de iOS en un **macOS remoto** y
controlarlo desde tu máquina. mplay lo soporta de forma nativa con la opción
`remoteHost` (ejecuta `simctl`/`idb` por SSH en el Mac).

### Opciones para conseguir ese macOS

| Opción | Tipo | Cuándo usarla |
|--------|------|---------------|
| **GitHub Actions `macos-14`** | Mac efímero en CI | Tests automáticos en cada push/PR (gratis en repos públicos). Ya configurado en `.github/workflows/ci.yml`. |
| **MacStadium / MacInCloud / AWS EC2 Mac** | Mac dedicado en la nube | Desarrollo interactivo desde Windows/Linux con un Mac persistente. |
| **Mac físico en tu red** | Mac local compartido | Tienes un Mac y quieres lanzar desde el PC. |
| **BrowserStack App Automate / Sauce Labs / AWS Device Farm** | Device farm (dispositivos reales) | No quieres gestionar infra; ejecutas en iPhones reales en la nube. *(requeriría un driver de farm; ver Roadmap)* |

### Configuración del modo remoto (SSH)

1. **En el Mac** (nube o físico): instala el entorno de iOS y arranca un simulador.
   ```bash
   bash scripts/setup-ios.sh
   ```
2. **Habilita SSH en el Mac**: Ajustes del Sistema → General → Compartir →
   activa *Inicio de sesión remoto*. Configura una clave SSH desde tu PC.
3. **Verifica la conexión** desde Windows/Linux:
   ```bash
   npx mplay doctor --platform=ios --remote-host=usuario@ip-del-mac
   ```
4. **Apunta el proyecto iOS al Mac** en `mplay.config.ts`:
   ```ts
   {
     name: "ios",
     use: {
       platform: "ios",
       remoteHost: "usuario@ip-del-mac",   // ← ejecuta simctl/idb por SSH
       // sshArgs: ["-p", "2222", "-i", "~/.ssh/mac"],  // puerto/identidad opcionales
       app: "/ruta/en/el/mac/App.app",      // la .app debe estar en el Mac
       appId: "com.example.App",
     },
   }
   ```
5. **Ejecuta** como siempre, desde tu Windows/Linux:
   ```bash
   npx mplay test --platform=ios
   ```
   Los gestos, capturas y el árbol de accesibilidad viajan por SSH; el resultado
   (incluido el trace con screenshots) se guarda en tu máquina local.

> Nota: las rutas de `app` y los UDID son del **Mac remoto**. mplay no copia la
> app por ti (todavía); súbela al Mac con `scp` o compílala allí en CI.

## Requisitos mínimos por herramienta

| Herramienta | Para qué | Instalación |
|-------------|----------|-------------|
| `adb` | control de Android | Android Platform-Tools |
| `emulator` + AVD | emulador de Android | Android SDK / Android Studio |
| `xcrun simctl` | ciclo de vida + capturas iOS | Xcode (macOS) |
| `idb` | gestos y árbol de accesibilidad iOS | `brew install idb-companion` + `pip3 install fb-idb` |
| `ssh` | modo remoto iOS | incluido en Windows 10+/Linux/macOS |
