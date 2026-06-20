import { Driver } from "../drivers";
import { DeviceInfo, Role, Selector, SwipeDirection, UiNode } from "../types";
import { Locator } from "./locator";
import { reportStep } from "./steps";

/**
 * Device es el objeto de cara al usuario, equivalente a `page` en Playwright.
 * Expone fábricas de Locator (getByText, getById, ...) y acciones globales del
 * dispositivo (swipe de pantalla, back, screenshot, gestión de la app).
 */
export class Device {
  constructor(
    private readonly driver: Driver,
    private readonly actionTimeout: number
  ) {}

  private locator(selector: Selector, description: string): Locator {
    return new Locator({ driver: this.driver, actionTimeout: this.actionTimeout }, [selector], description);
  }

  // --- Fábricas de Locator (estilo getBy* de Playwright) ---

  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator {
    if (text instanceof RegExp) {
      return this.locator({ strategy: "text", value: text.source, pattern: text }, `getByText(/${text.source}/)`);
    }
    return this.locator(
      { strategy: "text", value: text, exact: options?.exact },
      `getByText(${JSON.stringify(text)}${options?.exact ? ", exact" : ""})`
    );
  }

  /**
   * Selector por ROL semántico (button, textfield, text, image, switch,
   * checkbox, slider, list, header, link, listitem, tab), con filtro opcional
   * por nombre. Mapea a los tipos nativos de cada plataforma — la forma más
   * estable y legible (también para IA) de localizar elementos.
   */
  getByRole(role: Role, options?: { name?: string | RegExp }): Locator {
    const sel: Selector = { strategy: "role", value: role };
    let desc = `getByRole(${JSON.stringify(role)}`;
    if (options?.name instanceof RegExp) {
      sel.pattern = options.name;
      desc += `, name=/${options.name.source}/`;
    } else if (options?.name) {
      sel.roleName = options.name;
      desc += `, name=${JSON.stringify(options.name)}`;
    }
    return this.locator(sel, desc + ")");
  }

  getByPlaceholder(text: string): Locator {
    return this.locator({ strategy: "placeholder", value: text }, `getByPlaceholder(${JSON.stringify(text)})`);
  }

  getById(id: string): Locator {
    return this.locator({ strategy: "id", value: id }, `getById(${JSON.stringify(id)})`);
  }

  /**
   * Selector por test id, recomendado para tests estables y multiplataforma.
   * En React Native, `testID` aterriza como `resource-id` en Android y como
   * `accessibilityIdentifier` en iOS; en nativo es el propio id. Por eso mapea
   * a la estrategia `id` (que ya cubre ambos).
   */
  getByTestId(testId: string): Locator {
    return this.locator({ strategy: "id", value: testId }, `getByTestId(${JSON.stringify(testId)})`);
  }

  getByAccessibility(label: string): Locator {
    return this.locator({ strategy: "accessibility", value: label }, `getByAccessibility(${JSON.stringify(label)})`);
  }

  getByType(type: string): Locator {
    return this.locator({ strategy: "type", value: type }, `getByType(${JSON.stringify(type)})`);
  }

  locatorXPath(xpath: string): Locator {
    return this.locator({ strategy: "xpath", value: xpath }, `xpath(${JSON.stringify(xpath)})`);
  }

  // --- Acciones globales ---

  async info(): Promise<DeviceInfo> {
    return this.driver.info();
  }

  async tree(): Promise<UiNode> {
    return this.driver.dumpTree();
  }

  async screenshot(): Promise<Buffer> {
    return this.driver.screenshot();
  }

  async swipe(direction: SwipeDirection): Promise<void> {
    const area = await this.screenArea();
    await this.driver.swipeDirection(area, direction);
    await reportStep(`swipe ${direction}`);
  }

  /**
   * Área de pantalla robusta frente a cualquier tamaño/orientación de
   * dispositivo. Prioriza las dimensiones reportadas; si vienen a 0 (caso de
   * iOS, donde idb usa puntos lógicos), las deduce de los bounds del nodo raíz
   * del árbol vivo; y como último recurso usa un tamaño por defecto.
   */
  private async screenArea(): Promise<{ x: number; y: number; width: number; height: number }> {
    const info = await this.driver.info();
    let w = info.screen.width;
    let h = info.screen.height;
    if (!w || !h) {
      try {
        const root = await this.driver.dumpTree();
        const b = rootExtent(root);
        w = w || b.width;
        h = h || b.height;
      } catch {
        /* seguimos al fallback */
      }
    }
    return { x: 0, y: 0, width: w || 400, height: h || 800 };
  }

  async pressBack(): Promise<void> {
    await this.driver.pressKey("back");
    await reportStep("pressBack");
  }

  async pressHome(): Promise<void> {
    await this.driver.pressKey("home");
    await reportStep("pressHome");
  }

  /** Cierra el teclado software si está visible. */
  async hideKeyboard(): Promise<void> {
    await this.driver.hideKeyboard();
    await reportStep("hideKeyboard");
  }

  async getOrientation(): Promise<"portrait" | "landscape"> {
    return this.driver.getOrientation();
  }

  async setOrientation(o: "portrait" | "landscape"): Promise<void> {
    await this.driver.setOrientation(o);
    await reportStep(`setOrientation ${o}`);
  }

  /** package/bundle id de la app en primer plano. */
  async getForegroundApp(): Promise<string> {
    return this.driver.getForegroundApp();
  }

  /** Verifica que la app objetivo está en primer plano (detecta crash/background). */
  async isAppInForeground(appId: string): Promise<boolean> {
    const fg = await this.driver.getForegroundApp();
    return fg === "" || fg === appId; // "" = desconocido, no fallamos
  }

  async launchApp(appId: string): Promise<void> {
    await this.driver.launchApp(appId);
  }

  async terminateApp(appId: string): Promise<void> {
    await this.driver.terminateApp(appId);
  }

  /** Pausa explícita (úsala lo mínimo: prefiere auto-waiting de los Locator). */
  async waitForTimeout(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  get _driver(): Driver {
    return this.driver;
  }
}

/**
 * Estima el tamaño de pantalla a partir del árbol: el mayor borde derecho/
 * inferior de cualquier nodo. Funciona aunque el nodo raíz no traiga bounds.
 */
function rootExtent(root: UiNode): { width: number; height: number } {
  let maxX = root.bounds.x + root.bounds.width;
  let maxY = root.bounds.y + root.bounds.height;
  const walk = (n: UiNode) => {
    maxX = Math.max(maxX, n.bounds.x + n.bounds.width);
    maxY = Math.max(maxY, n.bounds.y + n.bounds.height);
    n.children.forEach(walk);
  };
  walk(root);
  return { width: maxX, height: maxY };
}
