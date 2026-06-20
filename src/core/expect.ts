import { Locator, TimeoutError } from "./locator";

/**
 * Aserciones con reintento (auto-retrying), igual que `expect()` en Playwright.
 * Cada matcher hace polling del árbol hasta que la condición se cumple o vence
 * el timeout, lo que evita aserciones flaky por carreras de renderizado.
 */
export class LocatorAssertions {
  constructor(
    private readonly locator: Locator,
    private readonly isNot: boolean
  ) {}

  get not(): LocatorAssertions {
    return new LocatorAssertions(this.locator, !this.isNot);
  }

  private async retry(
    predicateName: string,
    check: () => Promise<{ ok: boolean; actual: string }>,
    timeout?: number
  ): Promise<void> {
    const t = timeout ?? this.locator._ctx.actionTimeout;
    const start = Date.now();
    let lastActual = "(sin evaluar)";
    for (;;) {
      // Un fallo transitorio al volcar el árbol (uiautomator/idb a veces fallan
      // un ciclo durante animaciones o transiciones) no debe romper la
      // aserción: lo tratamos como "todavía no" y reintentamos.
      let ok = false;
      let actual = "(árbol no disponible)";
      try {
        const r = await check();
        ok = r.ok;
        actual = r.actual;
      } catch (e) {
        actual = e instanceof Error ? e.message : String(e);
      }
      lastActual = actual;
      const pass = this.isNot ? !ok : ok;
      if (pass) return;
      if (Date.now() - start >= t) {
        throw new TimeoutError(
          `expect(${this.locator._description})${this.isNot ? ".not" : ""}.${predicateName} ` +
            `falló tras ${t}ms. Valor observado: ${lastActual}`
        );
      }
      await delay(250);
    }
  }

  async toBeVisible(opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      "toBeVisible()",
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        const ok = !!node && node.bounds.width > 0 && node.bounds.height > 0;
        return { ok, actual: node ? "presente" : "ausente" };
      },
      opts.timeout
    );
  }

  async toBeHidden(opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      "toBeHidden()",
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        const visible = !!node && node.bounds.width > 0 && node.bounds.height > 0;
        return { ok: !visible, actual: visible ? "visible" : "oculto" };
      },
      opts.timeout
    );
  }

  async toHaveText(expected: string, opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      `toHaveText(${JSON.stringify(expected)})`,
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        const actual = node?.text ?? "";
        return { ok: actual === expected, actual: JSON.stringify(actual) };
      },
      opts.timeout
    );
  }

  async toContainText(expected: string, opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      `toContainText(${JSON.stringify(expected)})`,
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        const actual = node?.text ?? "";
        return { ok: actual.includes(expected), actual: JSON.stringify(actual) };
      },
      opts.timeout
    );
  }

  async toBeEnabled(opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      "toBeEnabled()",
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        return { ok: !!node && node.enabled, actual: node ? `enabled=${node.enabled}` : "ausente" };
      },
      opts.timeout
    );
  }

  async toBeChecked(opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      "toBeChecked()",
      async () => {
        const tree = await this.locator._ctx.driver.dumpTree();
        const node = this.locator._resolveOne(tree);
        return { ok: !!node && node.checked, actual: node ? `checked=${node.checked}` : "ausente" };
      },
      opts.timeout
    );
  }

  async toHaveCount(expected: number, opts: { timeout?: number } = {}): Promise<void> {
    await this.retry(
      `toHaveCount(${expected})`,
      async () => {
        const actual = await this.locator.count();
        return { ok: actual === expected, actual: String(actual) };
      },
      opts.timeout
    );
  }
}

/** Aserciones de valores simples (no reintentan: el valor ya está resuelto). */
export class ValueAssertions<T> {
  constructor(private readonly actual: T, private readonly isNot: boolean) {}

  get not(): ValueAssertions<T> {
    return new ValueAssertions(this.actual, !this.isNot);
  }

  toBe(expected: T): void {
    const ok = this.actual === expected;
    if (this.isNot ? ok : !ok) {
      throw new Error(`expect(${fmt(this.actual)})${this.isNot ? ".not" : ""}.toBe(${fmt(expected)}) falló`);
    }
  }

  toEqual(expected: T): void {
    const ok = JSON.stringify(this.actual) === JSON.stringify(expected);
    if (this.isNot ? ok : !ok) {
      throw new Error(`expect(...).toEqual(...) falló: ${fmt(this.actual)} vs ${fmt(expected)}`);
    }
  }

  toBeTruthy(): void {
    const ok = !!this.actual;
    if (this.isNot ? ok : !ok) throw new Error(`expect(${fmt(this.actual)}).toBeTruthy() falló`);
  }
}

export function expect(locator: Locator): LocatorAssertions;
export function expect<T>(value: T): ValueAssertions<T>;
export function expect(value: unknown): LocatorAssertions | ValueAssertions<unknown> {
  if (value instanceof Locator) {
    return new LocatorAssertions(value, false);
  }
  return new ValueAssertions(value, false);
}

function fmt(v: unknown): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
