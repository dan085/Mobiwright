import { Driver } from "./driver";
import { BackgroundProcess, CommandRunner, makeRunner, spawnBackground } from "../util/proc";
import { parseXml, XmlElement } from "../util/xml";
import { DeviceInfo, DriverCapabilities, Point, Rect, SwipeDirection, UiNode } from "../types";

/**
 * Driver de Android basado en `adb` + `uiautomator dump`.
 *
 * Requisitos en la máquina: Android SDK Platform-Tools (adb) en el PATH y un
 * emulador (AVD) o dispositivo corriendo. No requiere instalar Appium ni
 * ningún servidor: hablamos directamente con adb, igual que haría Playwright
 * con el protocolo del navegador.
 */
export class AndroidDriver implements Driver {
  readonly capabilities: DriverCapabilities;
  private serial = "";
  private refCounter = 0;
  private runner: CommandRunner;

  constructor(caps: DriverCapabilities) {
    this.capabilities = caps;
    this.runner = makeRunner(caps.remoteHost, caps.sshArgs);
  }

  private async adb(args: string[], timeoutMs = 30_000) {
    const full = this.serial ? ["-s", this.serial, ...args] : args;
    return this.runner.exec("adb", full, timeoutMs);
  }

  async launch(): Promise<void> {
    // 1. Resolver el serial del dispositivo
    const list = await this.runner.exec("adb", ["devices"], 15_000);
    const rows = list.stdout
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
    const devices = rows.filter((l) => l.endsWith("\tdevice") || l.endsWith(" device")).map((l) => l.split(/\s+/)[0]);
    const unauthorized = rows.filter((l) => /unauthorized/.test(l));
    const offline = rows.filter((l) => /offline/.test(l));

    if (devices.length === 0) {
      let hint = "Arranca un AVD: `emulator -avd <nombre>` y verifica con `adb devices`.";
      if (unauthorized.length) hint = "Hay un dispositivo NO AUTORIZADO: acepta el diálogo de depuración USB en el dispositivo.";
      else if (offline.length) hint = "Hay un dispositivo OFFLINE: reinícialo con `adb kill-server && adb start-server`.";
      throw new Error(`No hay emuladores/dispositivos Android disponibles. ${hint}`);
    }
    this.serial = this.capabilities.deviceSerial || devices[0];

    // 2. Esperar a que el sistema termine de bootear
    await this.adb(["wait-for-device"]);
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = await this.adb(["shell", "getprop", "sys.boot_completed"]);
      if (r.stdout.trim() === "1") break;
      await delay(1000);
    }

    // 3. Instalar la app si nos dieron un .apk
    if (this.capabilities.app) {
      await this.installApp(this.capabilities.app);
    }
    // 4. Lanzar la app
    if (this.capabilities.appId) {
      await this.launchApp(this.capabilities.appId);
    }
  }

  async close(): Promise<void> {
    if (this.capabilities.appId) {
      await this.terminateApp(this.capabilities.appId).catch(() => {});
    }
  }

  private cachedModel?: string;
  private cachedOs?: string;

  async info(): Promise<DeviceInfo> {
    // model/os son inmutables → se cachean. El tamaño se consulta siempre
    // (puede cambiar con la rotación).
    if (this.cachedModel === undefined) {
      this.cachedModel = (await this.adb(["shell", "getprop", "ro.product.model"])).stdout.trim();
      this.cachedOs = (await this.adb(["shell", "getprop", "ro.build.version.release"])).stdout.trim();
    }
    const sizeOut = (await this.adb(["shell", "wm", "size"])).stdout;
    // "Override size" gana a "Physical size" si existe.
    const sizes = [...sizeOut.matchAll(/(\d+)x(\d+)/g)];
    const last = sizes[sizes.length - 1];
    return {
      platform: "android",
      serialOrUdid: this.serial,
      model: this.cachedModel,
      osVersion: this.cachedOs || "",
      screen: { width: last ? +last[1] : 0, height: last ? +last[2] : 0 },
    };
  }

  async dumpTree(): Promise<UiNode> {
    // uiautomator escribe el XML en el dispositivo; lo leemos por stdout.
    // En algunos dispositivos /sdcard no es escribible (almacenamiento por
    // alcance): probamos varias rutas. uiautomator también puede devolver
    // "null root node" durante animaciones; reintentamos un par de veces.
    const paths = ["/sdcard/mplay_dump.xml", "/data/local/tmp/mplay_dump.xml"];
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const p of paths) {
        const dump = await this.adb(["shell", "uiautomator", "dump", p]);
        if (/ERROR|null root|could not/i.test(dump.stdout + dump.stderr)) {
          lastErr = (dump.stdout + dump.stderr).trim();
          continue;
        }
        const xml = (await this.adb(["shell", "cat", p])).stdout;
        if (xml.includes("<hierarchy") || xml.includes("<node")) {
          const root = parseXml(xml);
          this.refCounter = 0;
          return this.toUiNode(root);
        }
        lastErr = "uiautomator no devolvió jerarquía XML válida";
      }
      await delay(400);
    }
    throw new Error(`No se pudo obtener la jerarquía de UI (Android): ${lastErr}`);
  }

  private toUiNode(el: XmlElement): UiNode {
    const a = el.attrs;
    const bounds = parseBounds(a["bounds"] || "[0,0][0,0]");
    const node: UiNode = {
      ref: `a${this.refCounter++}`,
      text: a["text"] || "",
      id: a["resource-id"] || "",
      accessibility: a["content-desc"] || "",
      type: a["class"] || el.name,
      bounds,
      enabled: a["enabled"] === "true",
      focused: a["focused"] === "true",
      selected: a["selected"] === "true",
      checked: a["checked"] === "true",
      children: el.children.map((c) => this.toUiNode(c)),
    };
    return node;
  }

  async screenshot(): Promise<Buffer> {
    const args = this.serial ? ["-s", this.serial, "exec-out", "screencap", "-p"] : ["exec-out", "screencap", "-p"];
    return this.runner.execBinary("adb", args, 30_000);
  }

  async tap(p: Point): Promise<void> {
    await this.adb(["shell", "input", "tap", String(p.x), String(p.y)]);
  }

  async doubleTap(p: Point): Promise<void> {
    await this.tap(p);
    await delay(80);
    await this.tap(p);
  }

  async longPress(p: Point, durationMs: number): Promise<void> {
    await this.adb(["shell", "input", "swipe", String(p.x), String(p.y), String(p.x), String(p.y), String(durationMs)]);
  }

  async swipe(from: Point, to: Point, durationMs: number): Promise<void> {
    // `input swipe` exige enteros; redondeamos para tolerar coordenadas float.
    await this.adb([
      "shell", "input", "swipe",
      String(Math.round(from.x)), String(Math.round(from.y)),
      String(Math.round(to.x)), String(Math.round(to.y)), String(Math.round(durationMs)),
    ]);
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
    // `adb shell input text` interpreta varios caracteres a través del shell.
    // Unicode/emojis NO son fiables con `input text` (limitación de Android);
    // avisamos por stderr para no fallar silenciosamente (usa un IME de test
    // tipo ADBKeyBoard para esos casos).
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(text)) {
      process.stderr.write(
        `[mobiwright] aviso: el texto contiene caracteres no-ASCII que 'adb input text' puede no escribir correctamente: ${JSON.stringify(text)}\n`
      );
    }
    // Escapamos % (colisiona con %s) y el resto de metacaracteres del shell;
    // el espacio se convierte en %s.
    const escaped = text
      .replace(/%/g, "%%")
      .replace(/[\\()<>|;&*~"'`$?#[\]{}=+ ]/g, (ch) => (ch === " " ? "%s" : "\\" + ch));
    await this.adb(["shell", "input", "text", escaped]);
  }

  async pressKey(key: string): Promise<void> {
    const keycodes: Record<string, string> = {
      enter: "66", back: "4", home: "3", tab: "61",
      delete: "67", search: "84", up: "19", down: "20",
    };
    const code = keycodes[key.toLowerCase()] || key;
    await this.adb(["shell", "input", "keyevent", code]);
  }

  async hideKeyboard(): Promise<void> {
    // Comprobamos si el IME está mostrándose; si es así, lo cerramos con BACK.
    const ime = (await this.adb(["shell", "dumpsys", "input_method"])).stdout;
    if (/mInputShown=true|mServedInputConnection=.*true/i.test(ime)) {
      await this.pressKey("back");
    }
  }

  async launchApp(appId: string): Promise<void> {
    if (this.capabilities.appActivity) {
      const comp = `${appId}/${this.capabilities.appActivity}`;
      await this.adb(["shell", "am", "start", "-n", comp]);
    } else {
      await this.adb(["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
    }
  }

  async terminateApp(appId: string): Promise<void> {
    await this.adb(["shell", "am", "force-stop", appId]);
  }

  async installApp(path: string): Promise<void> {
    const r = await this.adb(["install", "-r", "-g", path], 120_000);
    if (!/Success/i.test(r.stdout + r.stderr)) {
      throw new Error(`Falló la instalación del APK: ${r.stderr || r.stdout}`);
    }
  }

  async uninstallApp(appId: string): Promise<void> {
    await this.adb(["uninstall", appId]);
  }

  async getOrientation(): Promise<"portrait" | "landscape"> {
    const r = (await this.adb(["shell", "dumpsys", "input", "|", "grep", "SurfaceOrientation"])).stdout;
    const rot = (await this.adb(["shell", "settings", "get", "system", "user_rotation"])).stdout.trim();
    if (rot === "1" || rot === "3" || /Orientation:\s*[13]/.test(r)) return "landscape";
    return "portrait";
  }

  async setOrientation(o: "portrait" | "landscape"): Promise<void> {
    // Desactiva el auto-rotate y fija la rotación.
    await this.adb(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
    await this.adb(["shell", "settings", "put", "system", "user_rotation", o === "landscape" ? "1" : "0"]);
  }

  async getForegroundApp(): Promise<string> {
    const out = (await this.adb(["shell", "dumpsys", "window"])).stdout;
    const m = /mCurrentFocus=.*\s([a-zA-Z0-9_.]+)\//.exec(out) || /mFocusedApp=.*\s([a-zA-Z0-9_.]+)\//.exec(out);
    return m ? m[1] : "";
  }

  private recording?: BackgroundProcess;
  private readonly remoteVideoPath = "/sdcard/mplay_record.mp4";

  async startRecording(): Promise<void> {
    if (this.capabilities.remoteHost) return; // remoto no soportado aún
    const args = this.serial
      ? ["-s", this.serial, "shell", "screenrecord", "--bit-rate", "4000000", this.remoteVideoPath]
      : ["shell", "screenrecord", "--bit-rate", "4000000", this.remoteVideoPath];
    this.recording = spawnBackground("adb", args);
  }

  async stopRecording(outPath: string): Promise<string | null> {
    if (!this.recording) return null;
    await this.recording.stop(); // screenrecord cierra el mp4 con SIGINT
    this.recording = undefined;
    await delay(800); // deja que el fichero se cierre en el dispositivo
    const pull = await this.adb(["pull", this.remoteVideoPath, outPath], 60_000);
    await this.adb(["shell", "rm", "-f", this.remoteVideoPath]).catch(() => {});
    return /pulled|1 file/i.test(pull.stdout + pull.stderr) ? outPath : null;
  }
}

function parseBounds(s: string): Rect {
  // formato "[x1,y1][x2,y2]" — admite negativos (elementos fuera de pantalla).
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(s);
  if (!m) return { x: 0, y: 0, width: 0, height: 0 };
  const x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4];
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
