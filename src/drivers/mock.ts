import { Driver } from "./driver";
import { DeviceInfo, DriverCapabilities, Point, Rect, SwipeDirection, UiNode } from "../types";

/**
 * Driver de DEMOSTRACIÓN. No habla con ningún dispositivo: simula una app de
 * login con dos pantallas, para poder probar Mobiwright (runner, API, trace y
 * servidor MCP) SIN un emulador/simulador real.
 *
 * Actívalo con la variable de entorno MOBIWRIGHT_MOCK=1 o platform "mock".
 * El flujo simulado:
 *   - Pantalla "login": email_input, password_input, botón "Iniciar sesión".
 *   - Al pulsar el botón con credenciales correctas → pantalla "home".
 *   - Con contraseña incorrecta → aparece error_banner.
 */
export class MockDriver implements Driver {
  readonly capabilities: DriverCapabilities;
  private screen: "login" | "home" = "login";
  private fields: Record<string, string> = { email_input: "", password_input: "" };
  private focused = "";
  private refCounter = 0;

  constructor(caps: DriverCapabilities) {
    this.capabilities = caps;
  }

  async launch(): Promise<void> {
    this.screen = "login";
    this.fields = { email_input: "", password_input: "" };
  }
  async close(): Promise<void> {}

  async info(): Promise<DeviceInfo> {
    return {
      platform: this.capabilities.platform,
      serialOrUdid: "mock-device",
      model: "Mobiwright Mock",
      osVersion: "1.0",
      screen: { width: 400, height: 800 },
    };
  }

  async dumpTree(): Promise<UiNode> {
    this.refCounter = 0;
    const children: UiNode[] =
      this.screen === "login"
        ? [
            this.node("EditText", this.fields.email_input, "com.demo:id/email_input", 40),
            this.node("EditText", this.fields.password_input ? "••••••••" : "", "com.demo:id/password_input", 120),
            this.node("Button", "Iniciar sesión", "com.demo:id/login_button", 200),
            ...(this.errorVisible
              ? [this.node("TextView", "Credenciales inválidas", "com.demo:id/error_banner", 280)]
              : []),
          ]
        : [
            this.node("TextView", "Inicio", "com.demo:id/home_title", 40),
            this.node("TextView", "Bienvenido, Daniel", "com.demo:id/welcome_message", 100),
            this.node("Button", "Cerrar sesión", "com.demo:id/logout_button", 700),
          ];
    return {
      ref: `m${this.refCounter++}`,
      text: "", id: "", accessibility: "", type: "Root",
      bounds: { x: 0, y: 0, width: 400, height: 800 },
      enabled: true, focused: false, selected: false, checked: false,
      children,
    };
  }

  private errorVisible = false;

  private node(type: string, text: string, id: string, y: number): UiNode {
    return {
      ref: `m${this.refCounter++}`,
      text,
      id,
      accessibility: text,
      type,
      bounds: { x: 40, y, width: 320, height: 48 },
      enabled: true, focused: this.focused === id, selected: false, checked: false,
      children: [],
    };
  }

  // Resuelve qué campo está bajo un punto (para enfocar al hacer tap/fill).
  private fieldAt(p: Point): string | null {
    if (this.screen !== "login") return null;
    if (within(p, 120)) return "password_input";
    if (within(p, 40)) return "email_input";
    return null;
  }

  async tap(p: Point): Promise<void> {
    const field = this.fieldAt(p);
    if (field) {
      this.focused = `com.demo:id/${field}`;
      return;
    }
    // ¿botón de login? (y ~ 200)
    if (this.screen === "login" && within(p, 200)) {
      this.errorVisible = false;
      if (this.fields.email_input && this.fields.password_input === "Sup3rSecret!") {
        this.screen = "home";
      } else {
        this.errorVisible = true;
      }
    } else if (this.screen === "home" && within(p, 700)) {
      this.screen = "login";
      this.fields = { email_input: "", password_input: "" };
    }
  }

  async typeText(text: string): Promise<void> {
    const id = this.focused.split("/")[1];
    if (id && id in this.fields) this.fields[id] = text;
  }

  async doubleTap(p: Point): Promise<void> { await this.tap(p); }
  async longPress(): Promise<void> {}
  async swipe(): Promise<void> {}
  async swipeDirection(_a: Rect, _d: SwipeDirection): Promise<void> {}
  async pressKey(key: string): Promise<void> {
    if (key === "back" && this.screen === "home") this.screen = "login";
  }

  async hideKeyboard(): Promise<void> {
    this.focused = "";
  }

  async screenshot(): Promise<Buffer> {
    // PNG 1x1 válido (placeholder de captura para el trace).
    return Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex"
    );
  }

  async launchApp(): Promise<void> { this.screen = "login"; }
  async terminateApp(): Promise<void> {}
  async installApp(): Promise<void> {}
  async uninstallApp(): Promise<void> {}

  private orientation: "portrait" | "landscape" = "portrait";
  async getOrientation(): Promise<"portrait" | "landscape"> { return this.orientation; }
  async setOrientation(o: "portrait" | "landscape"): Promise<void> { this.orientation = o; }
  async getForegroundApp(): Promise<string> { return this.capabilities.appId || "com.demo"; }
  async startRecording(): Promise<void> {}
  async stopRecording(): Promise<string | null> { return null; }
}

function within(p: Point, y: number): boolean {
  return p.y >= y && p.y <= y + 48;
}
