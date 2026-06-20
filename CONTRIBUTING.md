# Contribuir a mobiwright

¡Gracias por tu interés! Esta guía resume cómo trabajar en el proyecto.

## Puesta en marcha

```bash
npm install
npm run build      # compila TypeScript a dist/
node dist/cli.js --help
```

## Estructura del código

```
src/
  index.ts          API pública (test, expect, defineConfig, Device, Locator)
  types.ts          tipos compartidos (UiNode, Selector, config...)
  config.ts         carga de mplay.config.(ts|js)
  cli.ts            CLI: mplay test / devices
  util/
    proc.ts         ejecución segura de adb/simctl/idb
    xml.ts          parser XML mínimo para uiautomator
  drivers/
    driver.ts       interfaz Driver (contrato de plataforma)
    android.ts      AndroidDriver (adb + uiautomator)
    ios.ts          IosDriver (simctl + idb)
    index.ts        fábrica createDriver()
  core/
    query.ts        búsqueda sobre el árbol UiNode (+ XPath acotado)
    locator.ts      Locator con auto-waiting
    device.ts       Device (page-equivalent)
    expect.ts       aserciones auto-retrying
  runner/
    test.ts         registro de test/describe/hooks
    runner.ts       orquestador (proyectos, reintentos, evidencia)
    tracer.ts       trace + screenshots + visor HTML
    reporter.ts     reporters list/html/json
tests/              specs de ejemplo
```

## Añadir una plataforma nueva

1. Crea `src/drivers/<plataforma>.ts` implementando la interfaz `Driver`.
2. Normaliza la jerarquía nativa al tipo `UiNode`.
3. Regístrala en `createDriver()` (`src/drivers/index.ts`).
4. Añade un `project` de ejemplo en `mplay.config.ts`.

No toques `core/` ni `runner/`: deben permanecer agnósticos de plataforma.

## Estilo

- TypeScript estricto (`strict: true`). El build no debe emitir errores.
- Sin dependencias de runtime salvo justificación clara.
- Comentarios que expliquen el *por qué*, no el *qué*.

## Pull requests

- Asegúrate de que `npm run build` pasa sin errores.
- Si tocas la API pública, actualiza `README.md` y `ARCHITECTURE.md`.
- Añade/actualiza un spec de ejemplo si introduces una capacidad nueva.
