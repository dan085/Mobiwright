import * as fs from "node:fs";
import * as path from "node:path";

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  fullTitle: string;
  project: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
  retries: number;
  tracePath?: string | null;
  screenshotPath?: string | null;
  videoPath?: string | null;
}

export interface Reporter {
  onBegin(total: number): void;
  onTestEnd(result: TestResult): void;
  onEnd(results: TestResult[]): void;
}

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/** Reporter de consola tipo "list" de Playwright. */
export class ListReporter implements Reporter {
  onBegin(total: number): void {
    console.log(c.bold(`\nmplay · ejecutando ${total} test(s)\n`));
  }
  onTestEnd(r: TestResult): void {
    const mark = r.status === "passed" ? c.green("✓") : r.status === "failed" ? c.red("✗") : c.yellow("○");
    const dur = c.dim(`(${r.durationMs}ms)`);
    const proj = c.dim(`[${r.project}]`);
    console.log(`  ${mark} ${proj} ${r.fullTitle} ${dur}`);
    if (r.status === "failed" && r.error) {
      console.log(c.red(indent(r.error, 6)));
      if (r.tracePath) console.log(c.dim(`      trace: ${r.tracePath}`));
      if (r.videoPath) console.log(c.dim(`      video: ${r.videoPath}`));
    }
  }
  onEnd(results: TestResult[]): void {
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    console.log("");
    console.log(
      `  ${c.green(passed + " passed")}, ${failed ? c.red(failed + " failed") : failed + " failed"}, ${c.yellow(
        skipped + " skipped"
      )}`
    );
    console.log("");
  }
}

/** Reporter HTML: genera un informe navegable en disco. */
export class HtmlReporter implements Reporter {
  private results: TestResult[] = [];
  constructor(private readonly outputFolder: string) {}

  onBegin(): void {}
  onTestEnd(r: TestResult): void {
    this.results.push(r);
  }
  onEnd(results: TestResult[]): void {
    fs.mkdirSync(this.outputFolder, { recursive: true });
    const rows = results
      .map((r) => {
        const color = r.status === "passed" ? "#1b873f" : r.status === "failed" ? "#b00020" : "#946c00";
        const traceLink = r.tracePath ? `<a href="file://${r.tracePath}">trace</a>` : "";
        const videoLink = r.videoPath ? ` <a href="file://${r.videoPath}">video</a>` : "";
        return `<tr>
          <td><span style="color:${color};font-weight:600">${r.status}</span></td>
          <td>${escapeHtml(r.project)}</td>
          <td>${escapeHtml(r.fullTitle)}</td>
          <td>${r.durationMs}ms</td>
          <td>${traceLink}${videoLink}</td>
          <td><pre>${r.error ? escapeHtml(r.error) : ""}</pre></td>
        </tr>`;
      })
      .join("\n");
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>mplay report</title>
<style>
 body{font-family:system-ui,sans-serif;margin:24px;color:#1c1c1c}
 h1{font-size:20px} .summary{margin:8px 0 20px;font-size:14px}
 table{border-collapse:collapse;width:100%;font-size:13px}
 th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
 pre{margin:0;white-space:pre-wrap;color:#b00020;font-size:12px}
</style></head><body>
<h1>mplay · informe de pruebas</h1>
<div class="summary"><b>${passed}</b> passed · <b>${failed}</b> failed · total <b>${results.length}</b></div>
<table><thead><tr><th>estado</th><th>proyecto</th><th>test</th><th>duración</th><th>trace</th><th>error</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
    const file = path.join(this.outputFolder, "index.html");
    fs.writeFileSync(file, html);
    console.log(`  Informe HTML: ${file}\n`);
  }
}

/** Reporter JUnit XML (para CI: Jenkins, GitLab, GitHub Actions...). */
export class JUnitReporter implements Reporter {
  constructor(private readonly outputFile: string) {}
  onBegin(): void {}
  onTestEnd(): void {}
  onEnd(results: TestResult[]): void {
    const failures = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const totalTime = results.reduce((a, r) => a + r.durationMs, 0) / 1000;
    const cases = results
      .map((r) => {
        const time = (r.durationMs / 1000).toFixed(3);
        const name = xmlEscape(r.fullTitle);
        const cls = xmlEscape(r.project);
        if (r.status === "passed") return `    <testcase classname="${cls}" name="${name}" time="${time}"/>`;
        if (r.status === "skipped")
          return `    <testcase classname="${cls}" name="${name}" time="${time}"><skipped/></testcase>`;
        return `    <testcase classname="${cls}" name="${name}" time="${time}">\n      <failure message="${xmlEscape(
          (r.error || "").split("\n")[0]
        )}">${xmlEscape(r.error || "")}</failure>\n    </testcase>`;
      })
      .join("\n");
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<testsuites name="mobiwright" tests="${results.length}" failures="${failures}" skipped="${skipped}" time="${totalTime.toFixed(
        3
      )}">\n` +
      `  <testsuite name="mobiwright" tests="${results.length}" failures="${failures}" skipped="${skipped}" time="${totalTime.toFixed(
        3
      )}">\n${cases}\n  </testsuite>\n</testsuites>\n`;
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, xml);
    console.log(`  Informe JUnit: ${this.outputFile}\n`);
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Reporter JSON para integración con CI. */
export class JsonReporter implements Reporter {
  constructor(private readonly outputFile: string) {}
  onBegin(): void {}
  onTestEnd(): void {}
  onEnd(results: TestResult[]): void {
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, JSON.stringify({ results }, null, 2));
  }
}

export class MultiReporter implements Reporter {
  constructor(private readonly reporters: Reporter[]) {}
  onBegin(total: number): void {
    this.reporters.forEach((r) => r.onBegin(total));
  }
  onTestEnd(result: TestResult): void {
    this.reporters.forEach((r) => r.onTestEnd(result));
  }
  onEnd(results: TestResult[]): void {
    this.reporters.forEach((r) => r.onEnd(results));
  }
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s.split("\n").map((l) => pad + l).join("\n");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
