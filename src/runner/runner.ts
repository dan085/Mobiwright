import * as fs from "node:fs";
import * as path from "node:path";
import { createDriver } from "../drivers";
import { Device } from "../core/device";
import { runWithStepSink } from "../core/steps";
import { DriverCapabilities, MplayConfig, ProjectConfig, UseOptions } from "../types";
import { allSuites, allTests, collectHooks, resetRegistry, rootSuite, TestCase } from "./test";
import { Tracer } from "./tracer";
import {
  HtmlReporter,
  JsonReporter,
  JUnitReporter,
  ListReporter,
  MultiReporter,
  Reporter,
  TestResult,
} from "./reporter";

export interface RunOptions {
  config: MplayConfig;
  /** filtra proyectos por nombre (--platform / --project) */
  projectFilter?: string[];
  /** filtra tests por subcadena de título (--grep) */
  grep?: string;
  outputBaseDir: string;
}

/**
 * Orquestador principal. Para cada proyecto (plataforma): levanta un driver,
 * carga los specs, y ejecuta cada test con hooks, reintentos, trace y captura
 * de evidencia. Es el equivalente al runner de `@playwright/test`.
 */
export async function run(opts: RunOptions): Promise<number> {
  const { config } = opts;
  const reporter = buildReporter(config, opts.outputBaseDir);

  const projects = config.projects.filter(
    (p) => !opts.projectFilter || opts.projectFilter.includes(p.name)
  );
  if (projects.length === 0) {
    console.error("No hay proyectos que coincidan con el filtro indicado.");
    return 1;
  }

  const specFiles = discoverSpecs(config.testDir, config.testMatch);
  if (specFiles.length === 0) {
    console.error(`No se encontraron specs en ${config.testDir} (patrón ${config.testMatch}).`);
    return 1;
  }

  const allResults: TestResult[] = [];

  // Pre-cargamos los specs una vez para contar el total.
  let loaded = loadSpecs(specFiles);
  // test.only: si algún test está marcado, ejecutamos SOLO esos (como Playwright).
  if (loaded.some((t) => t.only)) {
    loaded = loaded.filter((t) => t.only);
    console.log("  (modo only: ejecutando solo los tests marcados con test.only)\n");
  }
  const totalTests = loaded.length * projects.length;
  reporter.onBegin(totalTests);

  const emit = (res: TestResult) => {
    allResults.push(res);
    reporter.onTestEnd(res);
  };

  // Paralelismo: cada PROYECTO corre en su propio dispositivo. `workers` limita
  // cuántos proyectos se ejecutan a la vez. Dentro de un proyecto los tests son
  // secuenciales (un solo dispositivo). El sink de pasos se aísla por contexto
  // async, así los traces no se mezclan entre proyectos concurrentes.
  const workers = Math.max(1, config.workers || 1);
  if (workers > 1 && projects.length > 1) {
    console.log(`  (paralelo: hasta ${workers} proyectos a la vez)\n`);
  }
  await runPool(projects, workers, (project) =>
    runProject({ project, config, loaded, grep: opts.grep, outputBaseDir: opts.outputBaseDir, emit })
  );

  reporter.onEnd(allResults);
  return allResults.some((r) => r.status === "failed") ? 1 : 0;
}

interface RunProjectArgs {
  project: ProjectConfig;
  config: MplayConfig;
  loaded: TestCase[];
  grep?: string;
  outputBaseDir: string;
  emit: (res: TestResult) => void;
}

/** Ejecuta todos los tests de un proyecto en su dispositivo (secuencial). */
async function runProject(a: RunProjectArgs): Promise<void> {
  const { project, config, loaded, grep, outputBaseDir, emit } = a;
  const use = mergeUse(config.use, project.use);
  const caps = toCapabilities(use);

  const driver = createDriver(caps);
  let launched = false;
  try {
    await driver.launch();
    launched = true;
  } catch (e) {
    for (const tc of loaded) {
      emit({
        fullTitle: tc.fullTitle, project: project.name, status: "failed", durationMs: 0, retries: 0,
        error: `No se pudo iniciar el dispositivo (${project.name}): ${errorMessage(e)}`,
      });
    }
    return;
  }

  const device = new Device(driver, use.actionTimeout ?? 15_000);

  // beforeAll de todas las suites, una vez por proyecto (raíz → hojas).
  let setupError: unknown = null;
  const suites = allSuites(rootSuite);
  for (const s of suites) {
    for (const h of s.beforeAll) {
      try {
        await h({ device });
      } catch (e) {
        setupError = e;
        break;
      }
    }
    if (setupError) break;
  }

  for (const tc of loaded) {
    if (!setupError && (tc.skip || grepSkip(tc, grep))) {
      emit({ fullTitle: tc.fullTitle, project: project.name, status: "skipped", durationMs: 0, retries: 0 });
      continue;
    }
    if (setupError) {
      emit({
        fullTitle: tc.fullTitle, project: project.name, status: "failed", durationMs: 0, retries: 0,
        error: `Falló beforeAll del proyecto: ${errorMessage(setupError)}`,
      });
      continue;
    }
    const res = await runOneTest({ tc, project, use, device, driver, config, outputBaseDir });
    emit(res);
  }

  // afterAll en orden inverso (hojas → raíz).
  for (const s of [...suites].reverse()) {
    for (const h of s.afterAll) await runSafely(h, device);
  }

  if (launched) await driver.close().catch(() => {});
}

/** Ejecuta `items` con concurrencia `limit`. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

interface RunOneArgs {
  tc: TestCase;
  project: ProjectConfig;
  use: UseOptions;
  device: Device;
  driver: ReturnType<typeof createDriver>;
  config: MplayConfig;
  outputBaseDir: string;
}

async function runOneTest(args: RunOneArgs): Promise<TestResult> {
  const { tc, project, use, device, driver, config, outputBaseDir } = args;
  const maxAttempts = config.retries + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const traceDir = path.join(
      outputBaseDir,
      "mplay-results",
      sanitize(project.name),
      sanitize(tc.fullTitle) + (attempt ? `-retry${attempt}` : "")
    );
    const traceEnabled = use.trace === "on" || use.trace === "retain-on-failure";
    const tracer = new Tracer(driver, traceDir, traceEnabled);
    tracer.action(`▶ ${tc.fullTitle} (intento ${attempt + 1}/${maxAttempts})`);

    // Vídeo: empieza a grabar antes del test si la política lo pide.
    const videoEnabled = use.video === "on" || use.video === "retain-on-failure";
    if (videoEnabled) {
      fs.mkdirSync(traceDir, { recursive: true });
      await driver.startRecording().catch(() => {});
    }

    // Conecta cada acción de la API a este tracer mediante un sink AISLADO POR
    // CONTEXTO (runWithStepSink), de modo que en ejecución paralela los pasos de
    // un test no se mezclen con los de otro.
    const sink = {
      action: (m: string) => tracer.action(m),
      snapshot: (m: string) => tracer.snapshot(m),
    };

    const start = Date.now();
    const { before, after } = collectHooks(tc.suite);
    // Ejecutamos before+fn; los afterEach se corren EXACTAMENTE UNA VEZ en
    // finally, pase lo que pase (evita el doble teardown).
    let testError: unknown = null;
    await runWithStepSink(sink, async () => {
      try {
        for (const h of before) await h({ device });
        await withTimeout(tc.fn({ device }), config.timeout, tc.fullTitle);
      } catch (e) {
        testError = e;
      } finally {
        for (const h of after) await runSafely(h, device);
      }
    });

    // Cierra la grabación de vídeo (se conserva según política).
    const videoKeep = !testError ? use.video === "on" : videoEnabled;
    const videoPath = videoEnabled ? await stopVideo(driver, traceDir, videoKeep) : null;

    if (!testError) {
      await tracer.snapshot("estado final (passed)");
      const keepTrace = use.trace === "on";
      const tracePath = await tracer.finalize(keepTrace);
      return {
        fullTitle: tc.fullTitle,
        project: project.name,
        status: "passed",
        durationMs: Date.now() - start,
        retries: attempt,
        tracePath,
        videoPath,
      };
    }
    {
      const e = testError;
      lastError = e;

      // Captura de evidencia en fallo
      let screenshotPath: string | null = null;
      if (use.screenshot === "on" || use.screenshot === "only-on-failure") {
        screenshotPath = await saveFailureScreenshot(driver, traceDir, tc.fullTitle).catch(() => null);
      }
      tracer.error(errorMessage(e));
      await tracer.snapshot("estado en el fallo");
      const keepTrace = use.trace === "on" || use.trace === "retain-on-failure";
      const tracePath = await tracer.finalize(keepTrace);

      const isLast = attempt === maxAttempts - 1;
      if (isLast) {
        return {
          fullTitle: tc.fullTitle,
          project: project.name,
          status: "failed",
          durationMs: Date.now() - start,
          retries: attempt,
          error: errorMessage(e),
          tracePath,
          screenshotPath,
          videoPath,
        };
      }
      // reintento: reiniciamos la app para un estado limpio
      if (use.appId) await driver.terminateApp(use.appId).catch(() => {});
      if (use.appId) await driver.launchApp(use.appId).catch(() => {});
    }
  }

  // Inalcanzable, pero TypeScript necesita un retorno.
  return {
    fullTitle: tc.fullTitle,
    project: project.name,
    status: "failed",
    durationMs: 0,
    retries: maxAttempts - 1,
    error: errorMessage(lastError),
  };
}

// --- helpers ---

function buildReporter(config: MplayConfig, baseDir: string): Reporter {
  const reporters: Reporter[] = [];
  for (const entry of config.reporter) {
    const [name, options] = entry;
    if (name === "list") reporters.push(new ListReporter());
    else if (name === "html")
      reporters.push(new HtmlReporter(path.resolve(baseDir, (options?.outputFolder as string) || "mplay-report")));
    else if (name === "json")
      reporters.push(new JsonReporter(path.resolve(baseDir, (options?.outputFile as string) || "mplay-results.json")));
    else if (name === "junit")
      reporters.push(new JUnitReporter(path.resolve(baseDir, (options?.outputFile as string) || "mplay-junit.xml")));
  }
  if (reporters.length === 0) reporters.push(new ListReporter());
  return new MultiReporter(reporters);
}

function discoverSpecs(testDir: string, match: RegExp): string[] {
  const abs = path.resolve(testDir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (match.test(e.name)) out.push(full);
    }
  };
  walk(abs);
  return out.sort();
}

function loadSpecs(files: string[]): TestCase[] {
  resetRegistry();
  for (const f of files) {
    // Soporta specs en .ts (vía ts-node/registro) o .js ya compilados.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(path.resolve(f));
  }
  return allTests(rootSuite);
}

function mergeUse(base: UseOptions, override: UseOptions): UseOptions {
  return { ...base, ...clean(override) };
}
function clean(o: UseOptions): UseOptions {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r as UseOptions;
}

function toCapabilities(use: UseOptions): DriverCapabilities {
  if (!use.platform) throw new Error("Falta 'platform' en la configuración del proyecto.");
  return {
    platform: use.platform,
    deviceSerial: use.deviceSerial,
    deviceUdid: use.deviceUdid,
    app: use.app,
    appId: use.appId,
    appActivity: use.appActivity,
    remoteHost: use.remoteHost,
    sshArgs: use.sshArgs,
  };
}

function grepSkip(tc: TestCase, grep?: string): boolean {
  if (!grep) return false;
  return !tc.fullTitle.toLowerCase().includes(grep.toLowerCase());
}

async function withTimeout<T>(p: Promise<T> | T, ms: number, title: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Test '${title}' excedió el timeout de ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runSafely(h: (f: { device: Device }) => unknown, device: Device): Promise<void> {
  try {
    await h({ device });
  } catch {
    /* los fallos en afterEach no deben enmascarar el error del test */
  }
}

async function stopVideo(
  driver: ReturnType<typeof createDriver>,
  dir: string,
  keep: boolean
): Promise<string | null> {
  const out = path.join(dir, "video.mp4");
  const saved = await driver.stopRecording(out).catch(() => null);
  if (saved && !keep) {
    try {
      fs.rmSync(saved, { force: true });
    } catch {
      /* ignore */
    }
    return null;
  }
  return saved;
}

async function saveFailureScreenshot(
  driver: ReturnType<typeof createDriver>,
  dir: string,
  title: string
): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const png = await driver.screenshot();
  const file = path.join(dir, `failure-${sanitize(title)}.png`);
  fs.writeFileSync(file, png);
  return file;
}

function sanitize(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 80);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message;
  return String(e);
}
