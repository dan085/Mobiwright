#!/usr/bin/env node
/**
 * Servidor MCP de Mobiwright (Model Context Protocol sobre stdio).
 *
 * MCP es un estándar ABIERTO: este servidor es agnóstico del modelo. Funciona
 * con CUALQUIER cliente MCP y, por tanto, con cualquier LLM detrás (Claude,
 * GPT/OpenAI, Gemini, Llama, Mistral, modelos locales con Ollama, etc.).
 * Clientes compatibles: Claude Desktop, Cursor, Cline, Continue, Windsurf,
 * Zed, VS Code (extensiones MCP), o tu propio agente.
 *
 * Permite que una IA se conecte y CONDUZCA Y REVISE el flujo de una app en un
 * emulador/simulador, igual que Playwright MCP hace con el navegador. La IA:
 *   1. abre la app (open_app)
 *   2. pide un snapshot semántico de accesibilidad (snapshot) — su "vista"
 *   3. actúa por `ref` o por selector (tap, fill, swipe, press_key)
 *   4. comprueba estados (assert_visible) y revisa el recorrido (get_flow)
 *
 * Implementa el subconjunto de MCP necesario (initialize, tools/list,
 * tools/call, ping) como JSON-RPC 2.0 delimitado por líneas, SIN dependencias
 * externas, para mantener el paquete ligero.
 */
import { createDriver, Driver } from "../drivers";
import { Device } from "../core/device";
import { setStepSink } from "../core/steps";
import { Platform, Selector, SelectorStrategy, SwipeDirection, UiNode } from "../types";
import {
  serializeSnapshot,
  indexByRef,
  detectLoginWall,
  detectWebView,
  detectFramework,
  detectSystemDialog,
  detectAnr,
} from "./snapshot";
import { center } from "../drivers";
import { matchOne } from "../core/query";
import { FlowGraph } from "../core/flowgraph";

const PROTOCOL_VERSION = "2024-11-05";

interface Session {
  driver: Driver;
  device: Device;
  lastTree?: UiNode;
  lastStateId?: string;   // estado actual en el grafo de flujos
  pendingAction?: string; // acción a la espera de su estado destino
}

let session: Session | null = null;
const flow: string[] = [];
const graph = new FlowGraph();

// Registramos cada acción de la API en el log de flujo, para que la IA pueda
// revisar el recorrido completo con get_flow.
setStepSink({
  action: (m) => flow.push(`${new Date().toISOString()}  ${m}`),
  snapshot: async () => {},
});

// --------------------------- definición de tools ---------------------------

const tools = [
  {
    name: "open_app",
    description:
      "Inicia un emulador/simulador y lanza la app bajo prueba. Úsalo primero. " +
      "Para iOS desde Windows/Linux usa remoteHost (ssh a un Mac).",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["android", "ios"] },
        app: { type: "string", description: "ruta al .apk (Android) o .app (iOS)" },
        appId: { type: "string", description: "package id / bundle id" },
        appActivity: { type: "string", description: "Android: activity a lanzar" },
        deviceSerial: { type: "string" },
        deviceUdid: { type: "string" },
        remoteHost: { type: "string", description: "ssh usuario@host (iOS remoto)" },
      },
      required: ["platform"],
    },
  },
  {
    name: "snapshot",
    description:
      "Devuelve el árbol de accesibilidad actual (vista semántica para la IA) con " +
      "un `ref` por elemento, más una captura PNG. Llámalo para 'ver' la pantalla.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tap",
    description: "Toca un elemento. Usa `ref` del último snapshot, o un selector by/value.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "ref del último snapshot, p.ej. 'a12'" },
        by: { type: "string", enum: ["id", "text", "accessibility", "type", "xpath"] },
        value: { type: "string" },
      },
    },
  },
  {
    name: "fill",
    description: "Escribe texto en un campo (por ref o selector).",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        by: { type: "string", enum: ["id", "text", "accessibility", "type", "xpath"] },
        value: { type: "string" },
        text: { type: "string", description: "texto a escribir" },
      },
      required: ["text"],
    },
  },
  {
    name: "swipe",
    description: "Desliza la pantalla en una dirección.",
    inputSchema: {
      type: "object",
      properties: { direction: { type: "string", enum: ["up", "down", "left", "right"] } },
      required: ["direction"],
    },
  },
  {
    name: "press_key",
    description: "Pulsa una tecla del sistema (back, home, enter...).",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "hide_keyboard",
    description: "Cierra el teclado software si tapa elementos (útil antes de tocar un botón inferior).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "handle_system_dialog",
    description:
      "Responde un diálogo de permisos/sistema superpuesto (Android permissioncontroller / iOS alert). " +
      "accept=true concede/acepta; accept=false deniega/cancela.",
    inputSchema: {
      type: "object",
      properties: { accept: { type: "boolean", description: "true = permitir/OK; false = denegar/cancelar" } },
      required: ["accept"],
    },
  },
  {
    name: "assert_visible",
    description: "Comprueba (con auto-wait) que un elemento es visible. Útil para validar el flujo.",
    inputSchema: {
      type: "object",
      properties: {
        by: { type: "string", enum: ["id", "text", "accessibility", "type", "xpath"] },
        value: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["by", "value"],
    },
  },
  {
    name: "login",
    description:
      "Autentica en una pantalla de login con usuario y contraseña. Si no pasas " +
      "credenciales, solo INFORMA si la pantalla requiere login (sin entrar). " +
      "Detecta automáticamente los campos; puedes forzar selectores con userBy/userValue, etc.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "usuario/email; omítelo para solo comprobar si hay login" },
        password: { type: "string", description: "contraseña" },
        userBy: { type: "string", enum: ["id", "text", "accessibility", "type", "xpath"] },
        userValue: { type: "string" },
        passwordBy: { type: "string", enum: ["id", "text", "accessibility", "type", "xpath"] },
        passwordValue: { type: "string" },
        submitText: { type: "string", description: "texto del botón (ej. 'Iniciar sesión')" },
      },
    },
  },
  {
    name: "get_flow",
    description: "Devuelve la lista de pasos ejecutados hasta ahora, para revisar el recorrido completo.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_flow_graph",
    description:
      "Devuelve el GRAFO de flujos descubierto: estados (pantallas) y transiciones " +
      "(acción → pantalla), con diagrama Mermaid. Úsalo para recorrer TODOS los flujos " +
      "de forma sistemática: ver qué pantallas faltan por explorar y evitar bucles.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "close_app",
    description: "Cierra la sesión y libera el dispositivo.",
    inputSchema: { type: "object", properties: {} },
  },
];

// --------------------------- ejecución de tools ----------------------------

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

async function callTool(name: string, args: Record<string, unknown>): Promise<{ content: Content[]; isError?: boolean }> {
  switch (name) {
    case "open_app":
      return openApp(args);
    case "snapshot":
      return snapshot();
    case "tap":
      return tap(args);
    case "fill":
      return fill(args);
    case "swipe":
      return swipe(args);
    case "press_key":
      return pressKey(args);
    case "hide_keyboard":
      return hideKeyboard();
    case "handle_system_dialog":
      return handleSystemDialog(args);
    case "assert_visible":
      return assertVisible(args);
    case "login":
      return login(args);
    case "get_flow":
      return text(flow.length ? flow.join("\n") : "(sin pasos todavía)");
    case "get_flow_graph":
      return text(graph.toText());
    case "close_app":
      return closeApp();
    default:
      return { content: [{ type: "text", text: `Tool desconocida: ${name}` }], isError: true };
  }
}

async function openApp(a: Record<string, unknown>) {
  if (session) await session.driver.close().catch(() => {});
  flow.length = 0;
  graph.reset();
  const driver = createDriver({
    platform: a.platform as Platform,
    app: a.app as string | undefined,
    appId: a.appId as string | undefined,
    appActivity: a.appActivity as string | undefined,
    deviceSerial: a.deviceSerial as string | undefined,
    deviceUdid: a.deviceUdid as string | undefined,
    remoteHost: a.remoteHost as string | undefined,
  });
  await driver.launch();
  const device = new Device(driver, 15_000);
  session = { driver, device };
  const info = await driver.info();
  flow.push(`open_app ${info.platform} ${info.model}`);
  return text(`App abierta en ${info.platform} (${info.model}). Llama a 'snapshot' para ver la pantalla.`);
}

async function snapshot() {
  const s = requireSession();
  const tree = await s.driver.dumpTree();
  s.lastTree = tree;
  const treeText = serializeSnapshot(tree);
  let png = "";
  try {
    png = (await s.driver.screenshot()).toString("base64");
  } catch {
    /* algunos entornos no permiten captura; seguimos con el árbol */
  }

  // Grafo de flujos: registra el estado y cierra la transición pendiente.
  const { state, isNew } = graph.observe(tree);
  if (s.pendingAction && s.lastStateId) {
    graph.addTransition(s.lastStateId, s.pendingAction, state.id);
  }
  s.pendingAction = undefined;
  s.lastStateId = state.id;

  const notes: string[] = [];
  notes.push(`📍 Estado: ${state.id} ${isNew ? "(NUEVO)" : "(ya visitado)"} — ${state.label}`);
  notes.push(`🧱 Framework: ${detectFramework(tree)}`);
  if (detectAnr(tree)) {
    notes.push("💥 La app parece NO RESPONDER o haberse detenido (ANR/crash). Cierra el diálogo o reinicia con open_app.");
  }
  const dialog = detectSystemDialog(tree);
  if (dialog) notes.push(dialog.message);
  const wall = detectLoginWall(tree);
  if (wall) notes.push(wall.message);
  if (detectWebView(tree)) {
    notes.push(
      "🌐 WebView detectado (app híbrida). El contenido web aparece en el árbol si la app " +
        "expone accesibilidad; los selectores por texto/id funcionan sobre esos nodos. Para inspección " +
        "profunda del DOM (CSS), ver EDGE_CASES.md › WebView."
    );
  }
  const header = notes.join("\n") + "\n\n# Accessibility snapshot\n";
  const content: Content[] = [{ type: "text", text: header + treeText }];
  if (png) content.push({ type: "image", data: png, mimeType: "image/png" });
  return { content };
}

/**
 * login: si recibe credenciales, las introduce y envía el formulario. Si NO
 * recibe credenciales, solo comprueba e informa si la pantalla requiere login,
 * sin autenticarse (revisión del flujo sin entrar).
 */
async function login(a: Record<string, unknown>) {
  const s = requireSession();
  const tree = await s.driver.dumpTree();
  s.lastTree = tree;
  const wall = detectLoginWall(tree);

  // Solo revisar: sin credenciales.
  if (!a.username && !a.password) {
    if (wall) {
      flow.push("login: detectado muro de login (sin credenciales, no se entra)");
      return text(
        "🔐 Se necesita login para ingresar a esta sección. " +
          "No has proporcionado usuario/contraseña, así que NO he autenticado. " +
          "Vuelve a llamar a `login` con { username, password } para entrar, o continúa revisando solo lo accesible sin login."
      );
    }
    return text("No se detecta pantalla de login aquí; puedes seguir revisando el flujo sin autenticación.");
  }

  if (!wall && !a.userValue && !a.submitText) {
    return text("No parece haber un formulario de login en esta pantalla. ¿Seguro que estás en la pantalla correcta? Llama a `snapshot`.");
  }

  // 1) usuario
  const userSel = a.userBy && a.userValue
    ? toSelector(a.userBy as string, a.userValue as string)
    : wall?.userRef
    ? null
    : { strategy: "id" as SelectorStrategy, value: "email" };
  await fillField(s, userSel, wall?.userRef, String(a.username ?? ""));

  // 2) contraseña
  const pwdSel = a.passwordBy && a.passwordValue
    ? toSelector(a.passwordBy as string, a.passwordValue as string)
    : wall?.passwordRef
    ? null
    : { strategy: "id" as SelectorStrategy, value: "password" };
  await fillField(s, pwdSel, wall?.passwordRef, String(a.password ?? ""));

  // 3) enviar
  const submitText = (a.submitText as string) || "Iniciar sesión";
  let submitted = false;
  const t2 = await s.driver.dumpTree();
  s.lastTree = t2;
  const submitNode =
    matchOne(t2, { strategy: "text", value: submitText }) ||
    (wall?.submitRef ? indexByRef(t2).get(wall.submitRef) : undefined);
  if (submitNode) {
    await s.driver.tap(center(submitNode.bounds));
    submitted = true;
  }
  flow.push(`login usuario=${JSON.stringify(a.username)} ${submitted ? "(enviado)" : "(no encontré botón)"}`);
  if (submitted) s.pendingAction = "login";
  return text(
    `Login: usuario y contraseña introducidos${submitted ? " y formulario enviado" : ", pero no encontré el botón de envío (indica submitText)"}. ` +
      "Llama a `snapshot` o `assert_visible` para confirmar que entraste."
  );
}

async function fillField(
  s: Session,
  sel: Selector | null,
  ref: string | undefined,
  value: string
): Promise<void> {
  let node;
  if (sel) {
    const tree = await s.driver.dumpTree();
    s.lastTree = tree;
    node = matchOne(tree, sel);
  } else if (ref && s.lastTree) {
    node = indexByRef(s.lastTree).get(ref);
  }
  if (!node) throw new Error("No pude localizar el campo de login. Usa userBy/userValue o passwordBy/passwordValue.");
  await s.driver.tap(center(node.bounds));
  await delay(120);
  await s.driver.typeText(value);
}

async function tap(a: Record<string, unknown>) {
  const s = requireSession();
  const node = await resolveNode(s, a);
  await s.driver.tap(center(node.bounds));
  flow.push(`tap ${describeNode(node)}`);
  s.pendingAction = `tap ${describeNode(node)}`;
  return text(`Tap en ${describeNode(node)}. Llama a 'snapshot' para ver el resultado.`);
}

async function fill(a: Record<string, unknown>) {
  const s = requireSession();
  const txt = String(a.text ?? "");
  const node = await resolveNode(s, a);
  await s.driver.tap(center(node.bounds));
  await delay(150);
  await s.driver.typeText(txt);
  flow.push(`fill ${describeNode(node)} = ${JSON.stringify(txt)}`);
  s.pendingAction = `fill ${describeNode(node)}`;
  return text(`Escrito ${JSON.stringify(txt)} en ${describeNode(node)}.`);
}

async function swipe(a: Record<string, unknown>) {
  const s = requireSession();
  await s.device.swipe(a.direction as SwipeDirection);
  flow.push(`swipe ${a.direction}`);
  s.pendingAction = `swipe ${a.direction}`;
  return text(`Swipe ${a.direction} hecho.`);
}

async function pressKey(a: Record<string, unknown>) {
  const s = requireSession();
  await s.driver.pressKey(String(a.key));
  flow.push(`press_key ${a.key}`);
  s.pendingAction = `press_key ${a.key}`;
  return text(`Tecla '${a.key}' pulsada.`);
}

async function hideKeyboard() {
  const s = requireSession();
  await s.driver.hideKeyboard();
  flow.push("hide_keyboard");
  return text("Teclado cerrado (si estaba visible).");
}

async function handleSystemDialog(a: Record<string, unknown>) {
  const s = requireSession();
  const tree = await s.driver.dumpTree();
  s.lastTree = tree;
  const dialog = detectSystemDialog(tree);
  if (!dialog) return text("No hay diálogo de sistema/permiso visible ahora mismo.");
  const accept = a.accept !== false;
  const ref = accept ? dialog.acceptRef : dialog.denyRef;
  if (!ref) {
    return text(
      `No encontré el botón de ${accept ? "aceptar" : "denegar"} en el diálogo. Haz 'snapshot' y usa 'tap' por ref.`
    );
  }
  const node = indexByRef(tree).get(ref);
  if (!node) return text("El botón del diálogo ya no está disponible; pide un 'snapshot'.");
  await s.driver.tap(center(node.bounds));
  flow.push(`handle_system_dialog accept=${accept}`);
  s.pendingAction = `dialog:${accept ? "accept" : "deny"}`;
  return text(`Diálogo ${accept ? "aceptado" : "denegado"}. Llama a 'snapshot' para continuar.`);
}

async function assertVisible(a: Record<string, unknown>) {
  const s = requireSession();
  const sel = toSelector(a.by as string, a.value as string);
  const timeout = (a.timeoutMs as number) ?? 10_000;
  const start = Date.now();
  for (;;) {
    const tree = await s.driver.dumpTree();
    const node = matchOne(tree, sel);
    if (node && node.bounds.width > 0 && node.bounds.height > 0) {
      flow.push(`assert_visible ${a.by}=${JSON.stringify(a.value)} ✓`);
      return text(`OK: ${a.by}=${JSON.stringify(a.value)} es visible.`);
    }
    if (Date.now() - start >= timeout) {
      flow.push(`assert_visible ${a.by}=${JSON.stringify(a.value)} ✗`);
      return { content: [{ type: "text" as const, text: `FALLO: ${a.by}=${JSON.stringify(a.value)} no es visible tras ${timeout}ms.` }], isError: true };
    }
    await delay(250);
  }
}

async function closeApp() {
  if (session) {
    await session.driver.close().catch(() => {});
    session = null;
  }
  flow.length = 0; // no arrastrar pasos entre sesiones
  graph.reset();
  return text("Sesión cerrada.");
}

// --------------------------- helpers ---------------------------------------

function requireSession(): Session {
  if (!session) throw new Error("No hay sesión. Llama primero a 'open_app'.");
  return session;
}

async function resolveNode(s: Session, a: Record<string, unknown>): Promise<UiNode> {
  // 1) por ref del último snapshot — validando contra un árbol FRESCO para no
  //    actuar sobre coordenadas obsoletas si la pantalla cambió.
  if (a.ref) {
    const fresh = await s.driver.dumpTree();
    s.lastTree = fresh;
    const node = indexByRef(fresh).get(String(a.ref));
    if (node) return node;
    // ref obsoleto: si además hay selector, caemos a él; si no, avisamos.
    if (!a.by || !a.value) {
      throw new Error(
        `El ref '${a.ref}' ya no existe (la pantalla cambió). Pide un 'snapshot' nuevo o usa by/value.`
      );
    }
  }
  // 2) por selector, re-evaluando el árbol (auto-wait corto)
  if (a.by && a.value) {
    const sel = toSelector(a.by as string, a.value as string);
    const start = Date.now();
    for (;;) {
      const tree = await s.driver.dumpTree();
      s.lastTree = tree;
      const node = matchOne(tree, sel);
      if (node) return node;
      if (Date.now() - start >= 8_000) break;
      await delay(250);
    }
    // No estaba: intentamos traerlo con scroll (listas virtualizadas / fuera
    // de pantalla), deteniéndonos al final de la lista.
    const node = await scrollUntil(s, sel);
    if (node) return node;
    throw new Error(`No se encontró el elemento ${a.by}=${JSON.stringify(a.value)} (ni tras hacer scroll).`);
  }
  throw new Error("Indica 'ref' (de un snapshot) o 'by'+'value' para localizar el elemento.");
}

/** Hace scroll hasta encontrar el selector o hasta que la lista deje de cambiar. */
async function scrollUntil(s: Session, sel: Selector, maxScrolls = 12): Promise<UiNode | null> {
  const info = await s.driver.info().catch(() => null);
  const w = info?.screen.width || 400;
  const h = info?.screen.height || 800;
  let prevSig = "";
  for (let i = 0; i < maxScrolls; i++) {
    await s.driver.swipeDirection({ x: 0, y: 0, width: w, height: h }, "up");
    await delay(400);
    const tree = await s.driver.dumpTree().catch(() => null);
    if (!tree) continue;
    s.lastTree = tree;
    const node = matchOne(tree, sel);
    if (node) return node;
    const sig = JSON.stringify(indexByRefKeys(tree));
    if (sig === prevSig) break; // fin de la lista
    prevSig = sig;
  }
  return null;
}

function indexByRefKeys(tree: UiNode): string[] {
  return [...indexByRef(tree).values()].map((n) => (n.id || n.text).slice(0, 24)).filter(Boolean);
}

function toSelector(by: string, value: string): Selector {
  const strategy = by as SelectorStrategy;
  return { strategy, value };
}

function describeNode(n: UiNode): string {
  return n.id ? `id=${n.id}` : n.text ? `text=${JSON.stringify(n.text)}` : n.accessibility ? `a11y=${JSON.stringify(n.accessibility)}` : n.type;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --------------------------- transporte JSON-RPC ---------------------------

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id: unknown, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id: unknown, code: number, message: string) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        reply(id, {
          protocolVersion: (params?.protocolVersion as string) || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "mobiwright", version: "0.1.0" },
        });
        return;
      case "notifications/initialized":
        return; // notificación, sin respuesta
      case "ping":
        reply(id, {});
        return;
      case "tools/list":
        reply(id, { tools });
        return;
      case "tools/call": {
        const name = params?.name as string;
        const args = (params?.arguments as Record<string, unknown>) || {};
        // Los errores de una tool se devuelven como result {isError:true}
        // (semántica MCP), NO como error JSON-RPC.
        try {
          const result = await callTool(name, args);
          reply(id, result);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          reply(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
        }
        return;
      }
      default:
        if (id !== undefined) replyError(id, -32601, `Método no soportado: ${method}`);
    }
  } catch (e) {
    // Fallos del protocolo (initialize, tools/list...) → error JSON-RPC real.
    const message = e instanceof Error ? e.message : String(e);
    if (id !== undefined) replyError(id, -32603, message);
  }
}

function main() {
  let buffer = "";
  // Cola secuencial: procesamos los mensajes EN ORDEN, uno tras otro. Así un
  // batch (p.ej. open_app seguido de snapshot) se ejecuta en secuencia y nunca
  // se adelanta una acción a la apertura de la sesión.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (msg: unknown) => {
    queue = queue.then(() =>
      handle(msg as { id?: unknown; method?: string; params?: Record<string, unknown> })
    );
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      enqueue(msg);
    }
  });
  process.stdin.on("end", () => {
    // Esperamos a que la cola termine ANTES de cerrar, para no perder respuestas.
    queue
      .then(async () => {
        if (session) await session.driver.close().catch(() => {});
      })
      .finally(() => process.exit(0));
  });
  // log de arranque a stderr (stdout está reservado para JSON-RPC)
  process.stderr.write("mobiwright MCP server listo (stdio).\n");
}

main();
