/**
 * Punto de entrada público de mobiwright.
 *
 * Importa desde aquí en tus specs:
 *   import { test, expect } from "mobiwright";
 */
export { test, describe } from "./runner/test";
export { expect } from "./core/expect";
export { Device } from "./core/device";
export { Locator, TimeoutError } from "./core/locator";
export { createDriver } from "./drivers";
export type { Driver } from "./drivers";
export * from "./types";

import { MplayConfig, UseOptions } from "./types";

/** Defaults razonables para no obligar a especificarlo todo. */
const DEFAULT_USE: UseOptions = {
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
  actionTimeout: 15_000,
};

/** Helper tipado para escribir `mplay.config.ts`, igual que defineConfig de Playwright. */
export function defineConfig(config: Partial<MplayConfig> & { projects: MplayConfig["projects"] }): MplayConfig {
  return {
    testDir: config.testDir ?? "./tests",
    testMatch: config.testMatch ?? /.*\.spec\.ts$/,
    timeout: config.timeout ?? 60_000,
    expect: config.expect ?? { timeout: 10_000 },
    retries: config.retries ?? 0,
    workers: config.workers ?? 1,
    reporter: config.reporter ?? [["list"]],
    use: { ...DEFAULT_USE, ...(config.use ?? {}) },
    projects: config.projects,
  };
}
