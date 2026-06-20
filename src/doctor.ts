import * as os from "node:os";
import { makeRunner, CommandRunner } from "./util/proc";
import { Platform } from "./types";

/**
 * `mplay doctor`: diagnóstico del entorno, equivalente a `npx playwright
 * install --dry-run` + chequeo de navegadores, pero para móvil.
 *
 * Verifica que estén las herramientas nativas necesarias (adb/emulator para
 * Android; xcrun/simctl/idb para iOS), si hay dispositivos arrancados, y da
 * comandos de remediación concretos. Soporta verificación REMOTA por SSH
 * (para comprobar un Mac en la nube desde Windows/Linux).
 */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export interface DoctorOptions {
  platform?: Platform;          // limita a android | ios
  remoteHost?: string;          // verifica en un host remoto por ssh
  sshArgs?: string[];
}

export async function doctor(opts: DoctorOptions = {}): Promise<number> {
  const runner = makeRunner(opts.remoteHost, opts.sshArgs);
  const checks: Check[] = [];
  const platform = opts.platform;
  const hostOs = opts.remoteHost ? "(remoto)" : `${os.platform()} ${os.arch()}`;

  console.log(`\nmplay doctor — entorno: ${hostOs}${runner.remote ? ` vía ssh ${opts.remoteHost}` : ""}\n`);

  // Node (solo local)
  if (!runner.remote) {
    const major = Number(process.versions.node.split(".")[0]);
    checks.push({
      name: "Node.js",
      ok: major >= 18,
      detail: `v${process.versions.node}`,
      fix: major >= 18 ? undefined : "Instala Node 18+ (https://nodejs.org)",
    });
  }

  // SSH disponible si se pidió remoto
  if (runner.remote) {
    const ssh = await probe(runner, "ssh", ["-V"]);
    // ssh -V escribe en stderr; consideramos ok si el binario respondió
    checks.push({
      name: "Conexión SSH",
      ok: ssh.ran,
      detail: ssh.ran ? "alcanzable" : ssh.error,
      fix: ssh.ran ? undefined : "Verifica el host, claves SSH y conectividad.",
    });
  }

  // --- Android ---
  if (!platform || platform === "android") {
    const adb = await probe(runner, "adb", ["version"]);
    checks.push({
      name: "adb (Android Platform-Tools)",
      ok: adb.ran,
      detail: adb.ran ? firstLine(adb.out) : "no encontrado",
      fix: adb.ran ? undefined : remedyAndroid(),
    });

    if (adb.ran) {
      const devices = await probe(runner, "adb", ["devices"]);
      const connected = devices.out
        .split("\n")
        .slice(1)
        .filter((l) => l.trim().endsWith("device"));
      checks.push({
        name: "Emulador/dispositivo Android",
        ok: connected.length > 0,
        detail: connected.length > 0 ? `${connected.length} conectado(s)` : "ninguno arrancado",
        fix: connected.length > 0 ? undefined : "Arranca un AVD: `emulator -avd <nombre>` o usa Android Studio.",
      });
    }

    const emu = await probe(runner, "emulator", ["-list-avds"]);
    if (emu.ran) {
      const avds = emu.out.split("\n").map((s) => s.trim()).filter(Boolean);
      checks.push({
        name: "AVDs disponibles",
        ok: avds.length > 0,
        detail: avds.length > 0 ? avds.join(", ") : "ninguno creado",
        fix: avds.length > 0 ? undefined : "Crea uno: `scripts/setup-android.sh` o Android Studio › Device Manager.",
      });
    }
  }

  // --- iOS ---
  if (!platform || platform === "ios") {
    const isMac = runner.remote || os.platform() === "darwin";
    if (!isMac) {
      checks.push({
        name: "iOS (Simulador)",
        ok: false,
        detail: "iOS solo se emula en macOS",
        fix:
          "El Simulador de iOS es parte de Xcode y NO existe en Windows/Linux. " +
          "Apunta a un Mac remoto: `mplay doctor --platform=ios --remote-host=usuario@tu-mac`. " +
          "Ver SETUP.md › 'iOS desde Windows/Linux'.",
      });
    } else {
      const xcrun = await probe(runner, "xcrun", ["--version"]);
      checks.push({
        name: "Xcode Command Line Tools (xcrun)",
        ok: xcrun.ran,
        detail: xcrun.ran ? firstLine(xcrun.out) : "no encontrado",
        fix: xcrun.ran ? undefined : "Instala: `xcode-select --install` (o instala Xcode desde la App Store).",
      });

      const simctl = await probe(runner, "xcrun", ["simctl", "help"]);
      checks.push({
        name: "simctl (simuladores iOS)",
        ok: simctl.ran,
        detail: simctl.ran ? "disponible" : "no disponible",
        fix: simctl.ran ? undefined : "Requiere Xcode completo, no solo CLT.",
      });

      if (simctl.ran) {
        const booted = await probe(runner, "xcrun", ["simctl", "list", "devices", "booted"]);
        const hasBooted = /\(Booted\)/.test(booted.out);
        checks.push({
          name: "Simulador iOS arrancado",
          ok: hasBooted,
          detail: hasBooted ? "al menos uno Booted" : "ninguno arrancado",
          fix: hasBooted ? undefined : "Arranca uno: `open -a Simulator` o `xcrun simctl boot <UDID>`.",
        });
      }

      const idb = await probe(runner, "idb", ["--help"]);
      checks.push({
        name: "idb (gestos / árbol de accesibilidad)",
        ok: idb.ran,
        detail: idb.ran ? "disponible" : "no encontrado",
        fix: idb.ran
          ? undefined
          : "Instala: `brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb`.",
      });
    }
  }

  // --- Render ---
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${c.name.padEnd(38)} ${c.detail}`);
    if (!c.ok) {
      failed++;
      if (c.fix) console.log(`      \x1b[2m↳ ${c.fix}\x1b[0m`);
    }
  }

  console.log("");
  if (failed === 0) {
    console.log("  \x1b[32mEntorno listo.\x1b[0m mplay puede ejecutar tests nativos.\n");
    return 0;
  }
  console.log(
    `  \x1b[31m${failed} problema(s).\x1b[0m Ejecuta \x1b[1mscripts/setup-macos.sh\x1b[0m ` +
      `(macOS) o sigue las sugerencias de arriba. Detalle en SETUP.md.\n`
  );
  return 1;
}

interface ProbeResult {
  ran: boolean;
  out: string;
  error: string;
}

async function probe(runner: CommandRunner, cmd: string, args: string[]): Promise<ProbeResult> {
  try {
    const r = await runner.exec(cmd, args, 20_000);
    const out = (r.stdout + r.stderr).trim();
    // code !== 0 significa que el binario no existe / SSH no conectó / falló.
    // (Las herramientas que comprobamos salen 0 cuando están presentes.)
    if (r.code !== 0) {
      return { ran: false, out: "", error: out || `código de salida ${r.code}` };
    }
    return { ran: true, out, error: "" };
  } catch (e) {
    return { ran: false, out: "", error: e instanceof Error ? e.message : String(e) };
  }
}

function firstLine(s: string): string {
  return s.split("\n")[0].trim();
}

function remedyAndroid(): string {
  if (os.platform() === "darwin") return "Instala: `brew install --cask android-platform-tools` o usa `scripts/setup-android.sh`.";
  if (os.platform() === "win32") return "Instala Android Studio o `choco install adb`; añade platform-tools al PATH.";
  return "Instala android-sdk platform-tools y añádelo al PATH (ver SETUP.md).";
}
