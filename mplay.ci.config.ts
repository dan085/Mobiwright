import { defineConfig } from "mobiwright";

/**
 * Config de CI: valida los drivers contra un emulador Android REAL sin necesidad
 * de una APK propia. Apunta a la app de Ajustes del sistema (siempre presente),
 * que basta para ejercitar launch → dumpTree → locator → expect → gesto →
 * screenshot de extremo a extremo.
 */
export default defineConfig({
  testDir: "./tests-ci",
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  retries: 1,
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
  reporter: [["list"], ["junit", { outputFile: "mplay-junit.xml" }]],
  projects: [
    {
      name: "android",
      use: {
        platform: "android",
        appId: "com.android.settings",
        appActivity: ".Settings",
      },
    },
  ],
});
