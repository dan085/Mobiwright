import * as fs from "node:fs";
import * as path from "node:path";
import { MplayConfig } from "./types";

/**
 * Carga mplay.config.(ts|js). Si es .ts, intenta registrar ts-node al vuelo;
 * si no está disponible, pide al usuario compilar o instalar ts-node.
 */
export function loadConfig(explicitPath?: string): { config: MplayConfig; dir: string } {
  const candidates = explicitPath
    ? [explicitPath]
    : ["mplay.config.ts", "mplay.config.js", "mplay.config.cjs"];

  for (const rel of candidates) {
    const abs = path.resolve(rel);
    if (fs.existsSync(abs)) {
      maybeRegisterTsNode(abs);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(abs);
      const config: MplayConfig = mod.default ?? mod;
      validate(config, abs);
      return { config, dir: path.dirname(abs) };
    }
  }
  throw new Error(
    "No se encontró mplay.config.ts/js. Crea uno en la raíz del proyecto (usa defineConfig)."
  );
}

function maybeRegisterTsNode(file: string) {
  if (!file.endsWith(".ts")) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("ts-node/register/transpile-only");
  } catch {
    throw new Error(
      "Para usar config y specs en TypeScript instala ts-node:\n" +
        "  npm i -D ts-node typescript\n" +
        "...o compila a JS con `npm run build` y usa mplay.config.js."
    );
  }
}

function validate(config: MplayConfig, file: string) {
  if (!config || typeof config !== "object") {
    throw new Error(`${file} no exporta una configuración válida.`);
  }
  if (!Array.isArray(config.projects) || config.projects.length === 0) {
    throw new Error(`${file}: debes definir al menos un 'project'.`);
  }
}
