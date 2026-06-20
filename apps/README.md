# apps/

Coloca aquí los binarios de las apps bajo prueba:

- **Android:** `app-debug.apk` (referéncialo en `mplay.config.ts` con `app` y `appId`).
- **iOS:** `App.app` compilada para simulador (referénciala con `app` y `appId`).

Estos artefactos están ignorados por git (`.gitignore`). En CI normalmente se
construyen en un paso previo o se descargan como artefactos.
