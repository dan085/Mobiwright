import { defineConfig } from "mobiwright";

/**
 * Configuración global del runner — equivalente a `playwright.config.ts`.
 *
 * Aquí defines los "projects" (uno por plataforma/dispositivo), el patrón de
 * specs, timeouts, reintentos y la política de captura de evidencia (screenshots
 * y traces) igual que en Playwright.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 2, // hasta 2 proyectos (dispositivos) en paralelo
  reporter: [["list"], ["html", { outputFolder: "mplay-report" }], ["junit", { outputFile: "mplay-junit.xml" }]],

  use: {
    // Evidencia capturada automáticamente:
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "android",
      use: {
        platform: "android",
        // Si lo dejas vacío, mplay toma el primer emulador/dispositivo de `adb devices`.
        deviceSerial: process.env.ANDROID_SERIAL,
        // App bajo prueba:
        app: "./apps/sample-debug.apk",
        appId: "com.example.sample",
        appActivity: ".MainActivity",
      },
    },
    {
      name: "ios",
      use: {
        platform: "ios",
        // UDID del simulador; si lo dejas vacío toma el "Booted".
        deviceUdid: process.env.IOS_UDID,
        app: "./apps/Sample.app",
        appId: "com.example.Sample",
        // --- iOS desde Windows/Linux (o Mac remoto) ---
        // Descomenta para ejecutar simctl/idb por SSH en un Mac remoto.
        // La .app y el UDID son del Mac remoto. Ver SETUP.md.
        // remoteHost: process.env.MAC_SSH,          // "usuario@ip-del-mac"
        // sshArgs: ["-i", "~/.ssh/mac"],
      },
    },
  ],
});
