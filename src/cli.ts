#!/usr/bin/env node
import * as path from "node:path";
import { loadConfig } from "./config";
import { run } from "./runner/runner";
import { doctor } from "./doctor";
import { Platform } from "./types";

/**
 * CLI de mobiwright. Comandos:
 *   mplay test [--platform=android|ios] [--project=name] [--grep=texto] [--config=ruta]
 *   mplay devices
 *   mplay --help
 */
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "test";

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  const flags = parseFlags(argv.slice(1));

  if (command === "devices") {
    return listDevices();
  }

  if (command === "mcp") {
    // Arranca el servidor MCP (stdio). No retorna: vive hasta que se cierra stdin.
    await import("./mcp/server");
    return new Promise<number>(() => {});
  }

  if (command === "init") {
    return scaffold();
  }

  if (command === "doctor") {
    return doctor({
      platform: flags.platform as Platform | undefined,
      remoteHost: flags.remoteHost,
      sshArgs: flags.sshArgs,
    });
  }

  if (command === "test") {
    const { config, dir } = loadConfig(flags.config);
    if (flags.workers) config.workers = flags.workers; // override por CLI
    // ejecutar relativo al directorio del config
    process.chdir(dir);
    const projectFilter = flags.platform
      ? [flags.platform]
      : flags.project
      ? [flags.project]
      : undefined;

    const code = await run({
      config,
      projectFilter,
      grep: flags.grep,
      outputBaseDir: process.cwd(),
    });
    return code;
  }

  console.error(`Comando desconocido: ${command}`);
  printHelp();
  return 1;
}

interface Flags {
  platform?: string;
  project?: string;
  grep?: string;
  config?: string;
  remoteHost?: string;
  sshArgs?: string[];
  workers?: number;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (const a of args) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "platform") flags.platform = val;
    else if (key === "project") flags.project = val;
    else if (key === "grep") flags.grep = val;
    else if (key === "config") flags.config = val ? path.resolve(val) : undefined;
    else if (key === "remote-host") flags.remoteHost = val;
    else if (key === "ssh-arg") (flags.sshArgs ||= []).push(val || "");
    else if (key === "workers") flags.workers = Math.max(1, parseInt(val || "1", 10) || 1);
  }
  return flags;
}

async function scaffold(): Promise<number> {
  const fs = await import("node:fs");
  const created: string[] = [];
  const write = (file: string, content: string) => {
    if (fs.existsSync(file)) {
      console.log(`  existe   ${file} (omitido)`);
      return;
    }
    fs.writeFileSync(file, content);
    created.push(file);
    console.log(`  creado   ${file}`);
  };

  write(
    "mplay.config.ts",
    `import { defineConfig } from "mobiwright";

export default defineConfig({
  testDir: "./tests",
  retries: 1,
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
  reporter: [["list"], ["html", { outputFolder: "mplay-report" }], ["junit", { outputFile: "mplay-junit.xml" }]],
  projects: [
    { name: "android", use: { platform: "android", appId: "com.example.app", appActivity: ".MainActivity" } },
    { name: "ios", use: { platform: "ios", appId: "com.example.App" } },
  ],
});
`
  );

  if (!fs.existsSync("tests")) fs.mkdirSync("tests");
  write(
    "tests/example.spec.ts",
    `import { test, expect } from "mobiwright";

test("login de ejemplo", async ({ device }) => {
  await device.getByTestId("email_input").fill("user@example.com");
  await device.getByTestId("password_input").fill("secret");
  await device.getByRole("button", { name: "Iniciar sesión" }).tap();

  await expect(device.getByTestId("home_title")).toBeVisible();
});
`
  );

  console.log(
    created.length
      ? `\n  Listo. Edita mplay.config.ts y ejecuta: npx mplay test\n`
      : `\n  No se creó nada nuevo.\n`
  );
  return 0;
}

async function listDevices(): Promise<number> {
  const { exec } = await import("./util/proc");
  console.log("Android (adb devices):");
  try {
    const a = await exec("adb", ["devices"], { timeoutMs: 10_000 });
    console.log(a.stdout.trim() || "  (ninguno)");
  } catch {
    console.log("  adb no disponible en el PATH");
  }
  console.log("\niOS (simctl booted):");
  try {
    const i = await exec("xcrun", ["simctl", "list", "devices", "booted"], { timeoutMs: 10_000 });
    console.log(i.stdout.trim() || "  (ninguno)");
  } catch {
    console.log("  xcrun/simctl no disponible (¿no es macOS?)");
  }
  return 0;
}

function printHelp() {
  console.log(`
mplay — automatización E2E para emuladores iOS / Android (estilo Playwright)

Uso:
  mplay init                        Crea mplay.config.ts y un test de ejemplo
  mplay test                        Ejecuta todos los proyectos del config
  mplay test --platform=android     Solo Android
  mplay test --platform=ios         Solo iOS
  mplay test --project=android      Filtra por nombre de proyecto
  mplay test --grep="login"         Filtra tests por título
  mplay test --workers=2            Proyectos/dispositivos en paralelo
  mplay test --config=ruta.ts       Usa un config concreto
  mplay mcp                         Arranca el servidor MCP (para que una IA conduzca el flujo)
  mplay doctor                      Verifica el entorno (tools nativas)
  mplay doctor --platform=ios       Verifica solo iOS
  mplay doctor --remote-host=u@mac  Verifica un Mac remoto (iOS desde Win/Linux)
  mplay devices                     Lista emuladores/simuladores disponibles
  mplay --help                      Esta ayuda

iOS desde Windows/Linux:
  El Simulador de iOS solo existe en macOS. Usa --remote-host para apuntar a un
  Mac remoto (nube/device farm) por SSH. Detalles en SETUP.md.
`);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("\n✗ Error fatal:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
