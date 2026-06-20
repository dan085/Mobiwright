/**
 * Tipos compartidos por todo el framework.
 *
 * La idea de diseño es replicar la separación que hace Playwright:
 *   - un "Driver" de bajo nivel que habla con la plataforma (ADB / simctl)
 *   - una API pública de alto nivel (Device, Locator, expect) agnóstica de la
 *     plataforma. La API nunca llama a `adb` o `simctl` directamente: siempre
 *     pasa por el Driver. Eso permite que el MISMO test corra en Android e iOS.
 */

export type Platform = "android" | "ios";

export type ScreenshotMode = "off" | "on" | "only-on-failure";
export type TraceMode = "off" | "on" | "retain-on-failure";
export type VideoMode = "off" | "on" | "retain-on-failure";

/** Estrategias de localización soportadas (paralelo a los locators de Playwright). */
export type SelectorStrategy =
  | "text"        // texto visible exacto o parcial
  | "id"          // resource-id (Android) / accessibilityIdentifier (iOS)
  | "accessibility" // content-desc (Android) / accessibilityLabel (iOS)
  | "type"        // class (Android) / type XCUIElementType (iOS)
  | "role"        // rol semántico (button, textfield, ...) → tipos nativos
  | "placeholder" // texto de placeholder/hint
  | "xpath";      // ruta sobre el árbol de la jerarquía

/** Roles semánticos (inspirado en getByRole de Playwright/Mobilewright). */
export type Role =
  | "button" | "textfield" | "text" | "image" | "switch" | "checkbox"
  | "slider" | "list" | "header" | "link" | "listitem" | "tab";

export interface Selector {
  strategy: SelectorStrategy;
  value: string;
  /** índice cuando el selector resuelve a varios elementos */
  index?: number;
  /** para `text`: exige coincidencia exacta (no por subcadena) */
  exact?: boolean;
  /** para `text`/`role`: coincidencia por expresión regular */
  pattern?: RegExp;
  /** para `role`: filtra además por nombre accesible (texto/label) */
  roleName?: string;
}

/**
 * Representación NORMALIZADA de un elemento de UI. Cada driver traduce su
 * jerarquía nativa (UiAutomator XML / XCUITest tree) a esta forma común.
 */
export interface UiNode {
  /** identificador estable dentro del snapshot actual del árbol */
  ref: string;
  /** texto visible */
  text: string;
  /** resource-id (Android) / accessibilityIdentifier (iOS) */
  id: string;
  /** content-desc / accessibilityLabel */
  accessibility: string;
  /** clase nativa / XCUIElementType */
  type: string;
  bounds: Rect;
  enabled: boolean;
  focused: boolean;
  selected: boolean;
  checked: boolean;
  children: UiNode[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type SwipeDirection = "up" | "down" | "left" | "right";

export interface DeviceInfo {
  platform: Platform;
  serialOrUdid: string;
  model: string;
  osVersion: string;
  screen: { width: number; height: number };
}

/** Capacidades pasadas al driver al lanzar una sesión. */
export interface DriverCapabilities {
  platform: Platform;
  /** Android: serial de `adb devices`. iOS: UDID del simulador. */
  deviceSerial?: string;
  deviceUdid?: string;
  /** ruta al .apk / .app a instalar (opcional si ya está instalado) */
  app?: string;
  /** package id / bundle id */
  appId?: string;
  /** Android: activity a lanzar */
  appActivity?: string;
  /** evita reinstalar si ya existe */
  noReset?: boolean;
  /**
   * Host SSH para ejecución remota ("usuario@host" o alias de ~/.ssh/config).
   * Imprescindible para correr iOS desde Windows/Linux contra un Mac remoto.
   */
  remoteHost?: string;
  /** argumentos extra de ssh (puerto, identidad...): ["-p","2222","-i","~/.ssh/mac"] */
  sshArgs?: string[];
}

export interface UseOptions {
  platform?: Platform;
  deviceSerial?: string;
  deviceUdid?: string;
  app?: string;
  appId?: string;
  appActivity?: string;
  screenshot?: ScreenshotMode;
  trace?: TraceMode;
  video?: VideoMode;
  actionTimeout?: number;
  /** ejecución remota por SSH (necesario para iOS desde Windows/Linux) */
  remoteHost?: string;
  sshArgs?: string[];
}

/** Tupla [nombre, opciones]: "list" | "html" | "json". */
export type ReporterEntry = [string, Record<string, unknown>?];

export interface ProjectConfig {
  name: string;
  use: UseOptions;
}

export interface MplayConfig {
  testDir: string;
  testMatch: RegExp;
  timeout: number;
  expect: { timeout: number };
  retries: number;
  workers: number;
  reporter: ReporterEntry[];
  use: UseOptions;
  projects: ProjectConfig[];
}
