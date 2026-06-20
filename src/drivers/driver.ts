import { DeviceInfo, DriverCapabilities, Point, Rect, SwipeDirection, UiNode } from "../types";

/**
 * Contrato de bajo nivel que TODA plataforma debe implementar.
 *
 * Es el equivalente al "BrowserContext/Page protocol" de Playwright pero para
 * dispositivos móviles. La API pública (Device/Locator) solo conoce esta
 * interfaz, nunca los detalles de adb/simctl. Añadir una nueva plataforma
 * (p.ej. un dispositivo físico por USB) se reduce a implementar Driver.
 */
export interface Driver {
  readonly capabilities: DriverCapabilities;

  /** Arranca la sesión: verifica dispositivo, instala/lanza la app. */
  launch(): Promise<void>;

  /** Cierra la sesión y limpia recursos. */
  close(): Promise<void>;

  info(): Promise<DeviceInfo>;

  /**
   * Devuelve un snapshot del árbol de UI actual, ya normalizado a UiNode.
   * Es la operación central sobre la que se construye el auto-waiting.
   */
  dumpTree(): Promise<UiNode>;

  /** Captura de pantalla en PNG. */
  screenshot(): Promise<Buffer>;

  // --- Gestos / acciones primitivas (en coordenadas de pantalla) ---
  tap(point: Point): Promise<void>;
  doubleTap(point: Point): Promise<void>;
  longPress(point: Point, durationMs: number): Promise<void>;
  swipe(from: Point, to: Point, durationMs: number): Promise<void>;
  swipeDirection(area: Rect, direction: SwipeDirection): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  /** Cierra el teclado software si está visible (best-effort). */
  hideKeyboard(): Promise<void>;

  // --- Ciclo de vida de la app ---
  launchApp(appId: string): Promise<void>;
  terminateApp(appId: string): Promise<void>;
  installApp(path: string): Promise<void>;
  uninstallApp(appId: string): Promise<void>;

  // --- Estado del dispositivo ---
  /** Orientación actual ("portrait" | "landscape"). */
  getOrientation(): Promise<Orientation>;
  setOrientation(o: Orientation): Promise<void>;
  /** package/bundle id de la app en primer plano (o "" si se desconoce). */
  getForegroundApp(): Promise<string>;

  // --- Grabación de vídeo (best-effort) ---
  /** Inicia la grabación de pantalla. */
  startRecording(): Promise<void>;
  /** Detiene la grabación y guarda el .mp4 en `outPath`; devuelve la ruta o null. */
  stopRecording(outPath: string): Promise<string | null>;
}

export type Orientation = "portrait" | "landscape";

/**
 * Calcula el centro de un rectángulo (punto de toque por defecto). Clampa a
 * coordenadas no negativas: elementos parcialmente fuera de pantalla (bajo la
 * status bar, desplazados) pueden tener centro con x/y < 0, lo que haría que el
 * tap se pierda. El límite superior se acota a nivel de Device cuando se conoce
 * el tamaño de pantalla.
 */
export function center(rect: Rect): Point {
  return {
    x: Math.max(1, Math.round(rect.x + rect.width / 2)),
    y: Math.max(1, Math.round(rect.y + rect.height / 2)),
  };
}

/** Acota un punto al interior de la pantalla [1, w-1] × [1, h-1]. */
export function clampPoint(p: Point, width: number, height: number): Point {
  return {
    x: width > 1 ? Math.min(Math.max(1, p.x), width - 1) : p.x,
    y: height > 1 ? Math.min(Math.max(1, p.y), height - 1) : p.y,
  };
}
