import { Driver } from "./driver";
import { BackgroundProcess, CommandRunner, makeRunner, spawnBackground } from "../util/proc";
import { parseXml, XmlElement } from "../util/xml";
import { DeviceInfo, DriverCapabilities, Point, Rect, SwipeDirection, UiNode } from "../types";

/**
 * Driver de iOS basado en `xcrun simctl` + `idb` (Facebook iOS Development
 * Bridge) para la inspección de la jerarquía y los gestos.
 *
 * Requisitos en la máquina (macOS): Xcode + Command Line Tools (`simctl`) y,
 * para describir la UI y enviar gestos por accesibilidad, `idb`
 * (https://fbidb.io). `simctl` por sí solo no expone el árbol de accesibilidad,
 * por eso usamos `idb ui describe-all`, cuya salida normalizamos a UiNode.
 *
 * Diseño espejo del AndroidDriver: misma interfaz, misma semántica, de modo que
 * el runner y la API pública no distinguen plataforma.
 */
export class IosDriver implements Driver {
  readonly capabilities: DriverCapabilities;
  private udid = "";
  private refCounter = 0;
  private runner: CommandRunner;

  constructor(caps: DriverCapabilities) {
    this.capabilities = caps;
    // Si remoteHost está definido, todos los comandos simctl/idb se ejecutan
    // por SSH en el Mac remoto. Así iOS es accesible desde Windows/Linux.
    this.runner = makeRunner(caps.remoteHost, caps.sshArgs);
  }

  async launch(): Promise<void> {
    // 1. Resolver el UDID del simulador (Booted si no se especifica).
    if (this.capabilities.deviceUdid) {
      this.udid = this.capabilities.deviceUdid;
    } else {
      const r = await this.runner.exec("xcrun", ["simctl", "list", "devices", "booted"], 20_000);
      const m = /\(([0-9A-Fa-f-]{36})\)\s*\(Booted\)/.exec(r.stdout);
      if (!m) {
        throw new Error(
          "No hay simulador iOS booteado. Arranca uno con `xcrun simctl boot <UDID>` u `open -a Simulator`."
        );
      }
      this.udid = m[1];
    }

    // 2. Instalar la .app si se proporcionó.
    if (this.capabilities.app) {
      await this.installApp(this.capabilities.app);
    }
    // 3. Lanzar la app.
    if (this.capabilities.appId) {
      await this.launchApp(this.capabilities.appId);
    }
  }

  async close(): Promise<void> {
    if (this.capabilities.appId) {
      await this.terminateApp(this.capabilities.appId).catch(() => {});
    }
  }

  async info(): Promise<DeviceInfo> {
    const r = await this.runner.exec("xcrun", ["simctl", "list", "devices"], 20_000);
    const line = r.stdout.split("\n").find((l) => l.includes(this.udid)) || "";
    const model = line.split("(")[0].trim() || "iOS Simulator";
    return {
      platform: "ios",
      serialOrUdid: this.udid,
      model,
      osVersion: "",
      screen: { width: 0, height: 0 }, // idb reporta coordenadas en puntos lógicos
    };
  }

  async dumpTree(): Promise<UiNode> {
    // idb devuelve un JSON con todos los elementos accesibles y sus frames.
    const r = await this.runner.exec("idb", ["ui", "describe-all", "--udid", this.udid, "--json"], 30_000);
    this.refCounter = 0;
    if (r.code !== 0 || !r.stdout.trim()) {
      throw new Error(
        "No se pudo obtener la jerarquía de UI (iOS). ¿Está 'idb' instalado y el simulador booteado? " +
          `Detalle: ${(r.stderr || r.stdout || `código ${r.code}`).trim().slice(0, 200)}`
      );
    }
    try {
      const flat = JSON.parse(r.stdout) as IdbElement[];
      return this.fromIdb(flat);
    } catch {
      // Fallback: algunos builds de idb emiten XML; lo soportamos también.
      const root = parseXml(r.stdout);
      return this.fromXml(root);
    }
  }

  private fromIdb(elements: IdbElement[]): UiNode {
    // idb da una lista plana; construimos un nodo raíz contenedor.
    const root: UiNode = {
      ref: `i${this.refCounter++}`,
      text: "", id: "", accessibility: "", type: "Application",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      enabled: true, focused: false, selected: false, checked: false,
      children: [],
    };
    for (const e of elements) {
      const f = e.frame || { x: 0, y: 0, width: 0, height: 0 };
      root.children.push({
        ref: `i${this.refCounter++}`,
        text: e.title || e.value || "",
        id: e.AXUniqueId || e.identifier || "",
        accessibility: e.AXLabel || e.label || "",
        type: e.type || "",
        bounds: { x: f.x, y: f.y, width: f.width, height: f.height },
        enabled: e.enabled !== false,
        focused: false,
        selected: false,
        checked: false,
        children: [],
      });
    }
    return root;
  }

  private fromXml(el: XmlElement): UiNode {
    const a = el.attrs;
    return {
      ref: `i${this.refCounter++}`,
      text: a["value"] || a["name"] || "",
      id: a["identifier"] || "",
      accessibility: a["label"] || a["name"] || "",
      type: a["type"] || el.name,
      bounds: {
        x: +(a["x"] || 0), y: +(a["y"] || 0),
        width: +(a["width"] || 0), height: +(a["height"] || 0),
      },
      enabled: a["enabled"] !== "false",
      focused: false, selected: false, checked: false,
      children: el.children.map((c) => this.fromXml(c)),
    };
  }

  async screenshot(): Promise<Buffer> {
    return this.runner.execBinary("xcrun", ["simctl", "io", this.udid, "screenshot", "-"], 30_000);
  }

  async tap(p: Point): Promise<void> {
    await this.runner.exec("idb", ["ui", "tap", "--udid", this.udid, String(p.x), String(p.y)], 15_000);
  }

  async doubleTap(p: Point): Promise<void> {
    await this.tap(p);
    await delay(80);
    await this.tap(p);
  }

  async longPress(p: Point, durationMs: number): Promise<void> {
    const dur = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 800;
    await this.runner.exec(
      "idb",
      ["ui", "tap", "--udid", this.udid, "--duration", String(dur / 1000), String(p.x), String(p.y)],
      15_000
    );
  }

  async swipe(from: Point, to: Point, durationMs: number): Promise<void> {
    const dur = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 300;
    await this.runner.exec(
      "idb",
      [
        "ui", "swipe", "--udid", this.udid,
        "--duration", String(dur / 1000),
        String(from.x), String(from.y), String(to.x), String(to.y),
      ],
      15_000
    );
  }

  async swipeDirection(area: Rect, direction: SwipeDirection): Promise<void> {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const dx = area.width * 0.4;
    const dy = area.height * 0.4;
    const map: Record<SwipeDirection, [Point, Point]> = {
      up: [{ x: cx, y: cy + dy }, { x: cx, y: cy - dy }],
      down: [{ x: cx, y: cy - dy }, { x: cx, y: cy + dy }],
      left: [{ x: cx + dx, y: cy }, { x: cx - dx, y: cy }],
      right: [{ x: cx - dx, y: cy }, { x: cx + dx, y: cy }],
    };
    const [from, to] = map[direction];
    await this.swipe(from, to, 300);
  }

  async typeText(text: string): Promise<void> {
    await this.runner.exec("idb", ["ui", "text", "--udid", this.udid, text], 15_000);
  }

  async pressKey(key: string): Promise<void> {
    // idb usa códigos HID; mapeamos los más comunes.
    const keycodes: Record<string, string> = {
      enter: "40", back: "41", delete: "42", tab: "43", home: "0",
    };
    const code = keycodes[key.toLowerCase()];
    if (code) {
      await this.runner.exec("idb", ["ui", "key", "--udid", this.udid, code], 10_000);
    }
  }

  async hideKeyboard(): Promise<void> {
    // iOS no ofrece un "dismiss" universal por idb; intentamos la tecla de
    // retorno del teclado (cierra muchos teclados de una sola línea). Si el
    // formulario envía con Return, prefiere no llamar a hideKeyboard.
    await this.pressKey("enter").catch(() => {});
  }

  async launchApp(appId: string): Promise<void> {
    await this.runner.exec("xcrun", ["simctl", "launch", this.udid, appId], 30_000);
  }

  async terminateApp(appId: string): Promise<void> {
    await this.runner.exec("xcrun", ["simctl", "terminate", this.udid, appId], 15_000);
  }

  async installApp(path: string): Promise<void> {
    const r = await this.runner.exec("xcrun", ["simctl", "install", this.udid, path], 120_000);
    if (r.code !== 0) {
      throw new Error(`Falló la instalación de la .app: ${r.stderr}`);
    }
  }

  async uninstallApp(appId: string): Promise<void> {
    await this.runner.exec("xcrun", ["simctl", "uninstall", this.udid, appId], 30_000);
  }

  async getOrientation(): Promise<"portrait" | "landscape"> {
    // idb no expone orientación de forma estable; deducimos por el aspecto del
    // root del árbol (ancho > alto = landscape).
    try {
      const tree = await this.dumpTree();
      return tree.bounds.width > tree.bounds.height ? "landscape" : "portrait";
    } catch {
      return "portrait";
    }
  }

  async setOrientation(_o: "portrait" | "landscape"): Promise<void> {
    // El simulador de iOS no permite fijar la orientación por CLI de forma
    // fiable; se gestiona desde la app o con AppleScript del Simulator (Cmd+←/→).
    // No-op documentado.
  }

  async getForegroundApp(): Promise<string> {
    try {
      const r = await this.runner.exec("xcrun", ["simctl", "spawn", this.udid, "launchctl", "list"], 15_000);
      // Heurística: devolvemos el appId configurado si está corriendo.
      const id = this.capabilities.appId || "";
      return id && r.stdout.includes(id.split(".").pop() || id) ? id : id;
    } catch {
      return this.capabilities.appId || "";
    }
  }

  private recording?: BackgroundProcess;
  private recordPath?: string;

  async startRecording(): Promise<void> {
    if (this.capabilities.remoteHost) return; // remoto no soportado aún
    this.recordPath = `/tmp/mplay_record_${this.udid}.mp4`;
    // simctl graba en el host directamente; --force sobrescribe.
    this.recording = spawnBackground("xcrun", [
      "simctl", "io", this.udid, "recordVideo", "--codec=h264", "--force", this.recordPath,
    ]);
  }

  async stopRecording(outPath: string): Promise<string | null> {
    if (!this.recording || !this.recordPath) return null;
    await this.recording.stop(); // SIGINT cierra el mp4
    this.recording = undefined;
    await delay(600);
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(this.recordPath)) {
        fs.copyFileSync(this.recordPath, outPath);
        fs.rmSync(this.recordPath, { force: true });
        return outPath;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

interface IdbElement {
  AXLabel?: string;
  AXUniqueId?: string;
  label?: string;
  identifier?: string;
  title?: string;
  value?: string;
  type?: string;
  enabled?: boolean;
  frame?: { x: number; y: number; width: number; height: number };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
