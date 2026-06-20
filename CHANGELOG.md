# Changelog

Todos los cambios notables de mobiwright se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

## [0.1.0] - 2026-06-20

### Añadido
- Núcleo del framework estilo Playwright para móvil.
- `AndroidDriver` basado en `adb` + `uiautomator`.
- `IosDriver` basado en `xcrun simctl` + `idb`.
- API pública: `Device`, `Locator` (auto-waiting), `expect` (auto-retrying).
- Locators: `getById`, `getByText`, `getByAccessibility`, `getByType`, XPath.
- Runner con `describe`, hooks, reintentos, timeouts y filtros.
- Tracer con screenshots y visor HTML por test.
- Reporters `list`, `html` y `json`.
- CLI `mplay` (`test`, `devices`, `doctor`, `mcp`) y `defineConfig`.
- `mplay doctor`: diagnóstico de entorno (local y remoto por SSH).
- Scripts de instalación automática (macOS/Android/iOS/Windows).
- Ejecución remota por SSH (`remoteHost`) para iOS desde Windows/Linux.
- Servidor MCP (`mplay mcp`): una IA conduce y revisa el flujo con snapshots
  de accesibilidad.
- Trace paso a paso del flujo (acción + captura por paso).
- `getByRole`/`getByPlaceholder`, RegExp en `getByText`, encadenamiento de locators.
- Orientación, app en primer plano, ocultar teclado, scroll-into-view.
- Reporter JUnit XML, comando `mplay init`.
- Grabación de vídeo del flujo (Android screenrecord, iOS simctl recordVideo).
- Workflow de CI para Android (emulador) e iOS (simulador).
- Specs de ejemplo: login y navegación.
