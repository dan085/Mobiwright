import { Driver, center } from "../drivers";
import { Role, Selector, UiNode } from "../types";
import { matchChain, matchChainOne } from "./query";
import { reportStep } from "./steps";

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

interface LocatorContext {
  driver: Driver;
  actionTimeout: number;
}

/**
 * Locator perezoso con AUTO-WAITING, igual que en Playwright. Soporta
 * ENCADENAMIENTO: `getByRole("listitem").getByRole("button")` acota la búsqueda
 * a los descendientes (por contención de bounds) del primer locator.
 *
 * Un Locator no apunta a un nodo concreto: describe CÓMO encontrarlo. Cada
 * acción re-evalúa el árbol y espera (polling) hasta que el elemento existe y es
 * accionable, o hasta agotar el timeout.
 */
export class Locator {
  constructor(
    private readonly ctx: LocatorContext,
    private readonly selectors: Selector[],
    private readonly description: string
  ) {}

  // --- Encadenamiento: factorías de locator hijo (acotadas al padre) ---

  private child(sel: Selector, label: string): Locator {
    return new Locator(this.ctx, [...this.selectors, sel], `${this.description} >> ${label}`);
  }

  getByTestId(testId: string): Locator {
    return this.child({ strategy: "id", value: testId }, `getByTestId(${JSON.stringify(testId)})`);
  }
  getById(id: string): Locator {
    return this.child({ strategy: "id", value: id }, `getById(${JSON.stringify(id)})`);
  }
  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator {
    if (text instanceof RegExp) return this.child({ strategy: "text", value: text.source, pattern: text }, `getByText(/${text.source}/)`);
    return this.child({ strategy: "text", value: text, exact: options?.exact }, `getByText(${JSON.stringify(text)})`);
  }
  getByRole(role: Role, options?: { name?: string | RegExp }): Locator {
    const sel: Selector = { strategy: "role", value: role };
    if (options?.name instanceof RegExp) sel.pattern = options.name;
    else if (options?.name) sel.roleName = options.name;
    return this.child(sel, `getByRole(${JSON.stringify(role)})`);
  }
  getByAccessibility(label: string): Locator {
    return this.child({ strategy: "accessibility", value: label }, `getByAccessibility(${JSON.stringify(label)})`);
  }
  getByType(type: string): Locator {
    return this.child({ strategy: "type", value: type }, `getByType(${JSON.stringify(type)})`);
  }
  getByPlaceholder(text: string): Locator {
    return this.child({ strategy: "placeholder", value: text }, `getByPlaceholder(${JSON.stringify(text)})`);
  }

  /** Acota a la n-ésima coincidencia (sobre el último selector de la cadena). */
  nth(index: number): Locator {
    const sels = this.selectors.slice();
    sels[sels.length - 1] = { ...sels[sels.length - 1], index };
    return new Locator(this.ctx, sels, `${this.description} >> nth(${index})`);
  }
  first(): Locator {
    return this.nth(0);
  }

  // --- Resolución (usada también por expect) ---

  _resolveOne(tree: UiNode): UiNode | null {
    return matchChainOne(tree, this.selectors);
  }
  _resolveAll(tree: UiNode): UiNode[] {
    return matchChain(tree, this.selectors);
  }

  /** Espera hasta que el elemento aparezca y devuelve su nodo. */
  async waitFor(opts: { state?: "visible" | "attached"; timeout?: number } = {}): Promise<UiNode> {
    const timeout = opts.timeout ?? this.ctx.actionTimeout;
    return this.poll(timeout, (tree) => {
      const node = this._resolveOne(tree);
      if (!node) return null;
      if (opts.state === "attached") return node;
      return node.bounds.width > 0 && node.bounds.height > 0 ? node : null;
    });
  }

  private async poll(timeout: number, pick: (tree: UiNode) => UiNode | null): Promise<UiNode> {
    const start = Date.now();
    let lastError = "";
    for (;;) {
      try {
        const tree = await this.ctx.driver.dumpTree();
        const last = pick(tree);
        if (last) return last;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (Date.now() - start >= timeout) {
        throw new TimeoutError(
          `Timeout ${timeout}ms esperando ${this.description}. El elemento no apareció / no fue accionable.` +
            (lastError ? ` Último error de volcado: ${lastError}` : "")
        );
      }
      await delay(250);
    }
  }

  /**
   * Hace scroll hasta encontrar el elemento o hasta que la pantalla deje de
   * cambiar (fin de la lista). Devuelve true si quedó disponible.
   */
  async scrollIntoViewIfNeeded(opts: { maxScrolls?: number; direction?: "up" | "down" } = {}): Promise<boolean> {
    const max = opts.maxScrolls ?? 12;
    const dir = opts.direction ?? "up";
    let prevSig = "";
    for (let i = 0; i <= max; i++) {
      const tree = await safeDump(this.ctx.driver);
      if (tree) {
        const node = this._resolveOne(tree);
        if (node && node.bounds.width > 0 && node.bounds.height > 0) return true;
        const sig = JSON.stringify(flattenSig(tree));
        if (i > 0 && sig === prevSig) return false;
        prevSig = sig;
      }
      if (i < max) {
        const info = await this.ctx.driver.info();
        const w = info.screen.width || 400;
        const h = info.screen.height || 800;
        await this.ctx.driver.swipeDirection({ x: 0, y: 0, width: w, height: h }, dir);
        await delay(400);
      }
    }
    return false;
  }

  // --- Acciones (todas con auto-wait) ---

  async tap(): Promise<void> {
    await this.ensurePresent();
    const node = await this.waitFor({ state: "visible" });
    await this.ctx.driver.tap(center(node.bounds));
    await reportStep(`tap ${this.description}`);
  }

  private async ensurePresent(): Promise<void> {
    try {
      const tree = await this.ctx.driver.dumpTree();
      if (this._resolveOne(tree)) return;
    } catch {
      return;
    }
    await this.scrollIntoViewIfNeeded();
  }

  async click(): Promise<void> {
    return this.tap();
  }

  async doubleTap(): Promise<void> {
    const node = await this.waitFor({ state: "visible" });
    await this.ctx.driver.doubleTap(center(node.bounds));
    await reportStep(`doubleTap ${this.description}`);
  }

  async longPress(durationMs = 800): Promise<void> {
    const node = await this.waitFor({ state: "visible" });
    await this.ctx.driver.longPress(center(node.bounds), durationMs);
    await reportStep(`longPress ${this.description}`);
  }

  async fill(text: string): Promise<void> {
    await this.ensurePresent();
    const node = await this.waitFor({ state: "visible" });
    await this.ctx.driver.tap(center(node.bounds));
    await delay(150);
    await this.ctx.driver.typeText(text);
    await reportStep(`fill ${this.description} = ${JSON.stringify(text)}`);
  }

  async type(text: string): Promise<void> {
    return this.fill(text);
  }

  // --- Consultas ---

  async textContent(): Promise<string> {
    const node = await this.waitFor({ state: "attached" });
    return node.text;
  }

  async isVisible(): Promise<boolean> {
    const tree = await safeDump(this.ctx.driver);
    if (!tree) return false;
    const node = this._resolveOne(tree);
    return !!node && node.bounds.width > 0 && node.bounds.height > 0;
  }

  async isEnabled(): Promise<boolean> {
    const node = await this.waitFor({ state: "attached" });
    return node.enabled;
  }

  async isChecked(): Promise<boolean> {
    const node = await this.waitFor({ state: "attached" });
    return node.checked;
  }

  async count(): Promise<number> {
    const tree = await safeDump(this.ctx.driver);
    return tree ? this._resolveAll(tree).length : 0;
  }

  // --- Acceso interno ---
  get _selector(): Selector {
    return this.selectors[this.selectors.length - 1];
  }
  get _ctx(): LocatorContext {
    return this.ctx;
  }
  get _description(): string {
    return this.description;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeDump(driver: Driver): Promise<UiNode | null> {
  try {
    return await driver.dumpTree();
  } catch {
    return null;
  }
}

function flattenSig(node: UiNode): string[] {
  const out: string[] = [];
  const walk = (n: UiNode) => {
    const key = n.id || n.text;
    if (key) out.push(key.slice(0, 30));
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
