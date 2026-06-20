import * as fs from "node:fs";
import * as path from "node:path";
import { Driver } from "../drivers";

export interface TraceEntry {
  t: number;
  type: "action" | "screenshot" | "log" | "error";
  message: string;
  screenshotFile?: string;
}

/**
 * Tracer minimalista inspirado en el trace viewer de Playwright: registra una
 * línea de tiempo de acciones y guarda capturas de pantalla. Al final escribe
 * un trace.json + un visor HTML autocontenido por test.
 */
export class Tracer {
  private entries: TraceEntry[] = [];
  private start = Date.now();
  private shotIndex = 0;

  constructor(
    private readonly driver: Driver,
    private readonly outputDir: string,
    private readonly enabled: boolean
  ) {
    if (this.enabled) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  log(message: string): void {
    if (!this.enabled) return;
    this.entries.push({ t: Date.now() - this.start, type: "log", message });
  }

  action(message: string): void {
    if (!this.enabled) return;
    this.entries.push({ t: Date.now() - this.start, type: "action", message });
  }

  async snapshot(message: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const png = await this.driver.screenshot();
      const file = `shot-${String(this.shotIndex++).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(this.outputDir, file), png);
      this.entries.push({ t: Date.now() - this.start, type: "screenshot", message, screenshotFile: file });
    } catch (e) {
      this.entries.push({ t: Date.now() - this.start, type: "error", message: `screenshot falló: ${String(e)}` });
    }
  }

  error(message: string): void {
    if (!this.enabled) return;
    this.entries.push({ t: Date.now() - this.start, type: "error", message });
  }

  /** Persiste trace.json + index.html. Devuelve la ruta del visor o null. */
  async finalize(keep: boolean): Promise<string | null> {
    if (!this.enabled) return null;
    if (!keep) {
      // No dejamos que un fallo al limpiar (locks en Windows, FS de solo
      // creación, permisos) rompa el test: el borrado es best-effort.
      try {
        fs.rmSync(this.outputDir, { recursive: true, force: true });
      } catch {
        /* ignorado a propósito */
      }
      return null;
    }
    fs.writeFileSync(path.join(this.outputDir, "trace.json"), JSON.stringify(this.entries, null, 2));
    const html = this.renderViewer();
    const htmlPath = path.join(this.outputDir, "index.html");
    fs.writeFileSync(htmlPath, html);
    return htmlPath;
  }

  private renderViewer(): string {
    const rows = this.entries
      .map((e) => {
        const shot = e.screenshotFile
          ? `<img src="${e.screenshotFile}" style="max-width:240px;border:1px solid #ccc;border-radius:6px"/>`
          : "";
        return `<tr class="${e.type}">
          <td>${e.t}ms</td><td>${e.type}</td><td>${escapeHtml(e.message)}</td><td>${shot}</td>
        </tr>`;
      })
      .join("\n");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>mplay trace</title>
<style>
 body{font-family:system-ui,sans-serif;margin:24px;color:#1c1c1c}
 h1{font-size:18px}
 table{border-collapse:collapse;width:100%}
 td{padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top;font-size:13px}
 tr.action{background:#f6f9ff}
 tr.error{background:#fff0f0}
 tr.error td{color:#b00020}
</style></head><body>
<h1>mplay · trace</h1>
<table><thead><tr><th>t</th><th>tipo</th><th>mensaje</th><th>captura</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
