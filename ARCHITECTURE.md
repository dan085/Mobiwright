# Arquitectura de mobiwright

mobiwright replica el modelo mental de **Playwright** pero apuntando a apps
**nativas** en **emuladores Android** y **simuladores iOS**. La idea central es la
misma que hace robusto a Playwright: separar una **API pública agnóstica de
plataforma** de un **driver de bajo nivel** específico de cada plataforma, y
construir todas las acciones sobre **auto-waiting** en lugar de `sleep()`.

```
┌──────────────────────────────────────────────────────────────┐
│  Tus specs:  test("login", async ({ device }) => { ... })     │
└───────────────┬──────────────────────────────────────────────┘
                │  API pública (agnóstica de plataforma)
        ┌───────▼────────┐   ┌─────────────┐   ┌──────────────┐
        │ Device (page)  │   │  Locator    │   │   expect()   │
        │ getByText/ById │   │ auto-wait   │   │ auto-retry   │
        └───────┬────────┘   └──────┬──────┘   └──────┬───────┘
                │                   │                 │
                └─────────┬─────────┴─────────────────┘
                          │  Interfaz Driver (contrato común)
              ┌───────────▼───────────┐
              │        Driver          │  dumpTree / tap / swipe / type ...
              └─────┬───────────┬──────┘
                    │           │
         ┌──────────▼──┐    ┌───▼───────────┐
         │ AndroidDriver│    │   IosDriver   │
         │ adb +        │    │ simctl + idb  │
         │ uiautomator  │    │               │
         └──────────────┘    └───────────────┘
                    │                 │
              Emulador Android    Simulador iOS
```

## Componentes

### 1. Driver (`src/drivers`)
Contrato de bajo nivel (`driver.ts`). Cada plataforma lo implementa:

- **AndroidDriver** (`android.ts`): habla directamente con `adb`. Obtiene la
  jerarquía con `uiautomator dump`, ejecuta gestos con `input tap/swipe/text` y
  capturas con `screencap`. No necesita Appium ni un servidor intermedio.
- **IosDriver** (`ios.ts`): usa `xcrun simctl` para el ciclo de vida de la app
  y capturas, e `idb` para describir el árbol de accesibilidad y enviar gestos.

Ambos **normalizan** su jerarquía nativa al tipo común `UiNode`, de modo que las
capas superiores nunca ven detalles de plataforma. Añadir una plataforma nueva
(p. ej. un dispositivo físico) es solo implementar `Driver`.

### 2. API pública (`src/core`)
- **Device** (`device.ts`): equivalente a `page`. Fábricas de locators
  (`getByText`, `getById`, `getByAccessibility`, `getByType`, `locatorXPath`) y
  acciones globales (`swipe`, `pressBack`, `screenshot`).
- **Locator** (`locator.ts`): selector **perezoso con auto-waiting**. No apunta a
  un nodo; describe cómo encontrarlo. Cada acción re-evalúa el árbol con polling
  hasta que el elemento es accionable o vence el timeout.
- **expect** (`expect.ts`): aserciones **auto-retrying** (`toBeVisible`,
  `toHaveText`, `toHaveCount`, ...) que reintentan hasta cumplirse.
- **query** (`core/query.ts`): motor de búsqueda sobre `UiNode`, incluido un
  subconjunto pragmático de XPath.

### 3. Runner (`src/runner`)
- **test.ts**: registro de `test`/`describe`/hooks (modelo Mocha/Playwright).
- **runner.ts**: orquesta proyectos (plataformas), levanta drivers, ejecuta
  tests con **hooks**, **reintentos**, **timeouts** y captura de evidencia.
- **tracer.ts**: línea de tiempo + screenshots, con visor HTML por test (idea del
  trace viewer de Playwright).
- **reporter.ts**: reporters `list` (consola), `html` y `json` (CI).

### 4. CLI y config
- **cli.ts**: `mplay test`, `mplay devices`, filtros `--platform/--project/--grep`.
- **config.ts** + `mplay.config.ts`: configuración por **proyectos**, uno por
  plataforma/dispositivo, igual que `playwright.config.ts`.

## Decisiones de diseño clave

1. **Auto-waiting en todas partes.** Ninguna acción asume que el elemento ya
   está; siempre hace polling del árbol. Esto elimina la causa #1 de tests
   flaky en móvil.
2. **Un test, todas las plataformas.** Como la API solo depende de la interfaz
   `Driver`, el mismo spec corre en Android e iOS sin cambios.
3. **Sin servidor intermedio.** Hablamos directo con `adb`/`simctl`/`idb`, lo que
   reduce dependencias y puntos de fallo frente a un stack tipo Appium.
4. **Evidencia automática.** Screenshots en fallo y trace navegable, controlados
   por la misma política `screenshot`/`trace` que usa Playwright.

## Requisitos del entorno

| Plataforma | Herramientas necesarias en el PATH |
|-----------|-------------------------------------|
| Android   | `adb` (Android SDK Platform-Tools) + un AVD/emulador corriendo |
| iOS       | macOS, Xcode + Command Line Tools (`simctl`) y `idb` (fbidb.io) |
