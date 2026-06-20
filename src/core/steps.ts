import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Sumidero de "pasos" del flujo (estilo trace de Playwright). Cada acción
 * (tap, fill, expect...) se registra como un paso con su captura.
 *
 * Para soportar PARALELISMO (workers > 1) sin que los pasos de un test se
 * mezclen con los de otro, el sink se propaga por CONTEXTO ASÍNCRONO
 * (AsyncLocalStorage). El runner ejecuta cada test dentro de `runWithStepSink`,
 * y `reportStep` lee el sink del contexto actual. Se mantiene además un sink
 * global de respaldo para usos fuera de contexto (p.ej. el servidor MCP).
 */
export interface StepSink {
  action(message: string): void;
  snapshot(message: string): Promise<void>;
}

const als = new AsyncLocalStorage<StepSink | null>();
let globalSink: StepSink | null = null;

/** Sink global de respaldo (usado por el servidor MCP). */
export function setStepSink(s: StepSink | null): void {
  globalSink = s;
}

/** Ejecuta `fn` con un sink propio de contexto (aísla pasos en paralelo). */
export function runWithStepSink<T>(sink: StepSink | null, fn: () => Promise<T>): Promise<T> {
  return als.run(sink, fn);
}

export async function reportStep(message: string): Promise<void> {
  const sink = als.getStore() ?? globalSink;
  if (!sink) return;
  sink.action(message);
  try {
    await sink.snapshot(message);
  } catch {
    /* nunca dejamos que el tracing rompa el test */
  }
}
