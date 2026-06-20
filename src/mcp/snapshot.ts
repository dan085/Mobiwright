import { UiNode } from "../types";
import { flatten } from "../core/query";

/**
 * Serializa el árbol de UI a un "accessibility snapshot" legible para una IA,
 * en la misma línea que hace Playwright MCP para el navegador.
 *
 * En vez de píxeles, la IA recibe una vista SEMÁNTICA: cada elemento accionable
 * con un `ref` estable, su tipo, texto, id y etiqueta de accesibilidad. La IA
 * razona sobre esta estructura para decidir el siguiente paso del flujo y luego
 * actúa con `tap_ref`/`fill_ref` usando ese `ref`.
 */
export function serializeSnapshot(root: UiNode): string {
  const lines: string[] = [];
  const walk = (n: UiNode, depth: number) => {
    if (isInteresting(n)) {
      const indent = "  ".repeat(depth);
      const parts: string[] = [`[${n.ref}]`, n.type || "node"];
      if (n.text) parts.push(`text=${JSON.stringify(n.text)}`);
      if (n.id) parts.push(`id=${JSON.stringify(shortId(n.id))}`);
      if (n.accessibility) parts.push(`a11y=${JSON.stringify(n.accessibility)}`);
      const flags: string[] = [];
      if (!n.enabled) flags.push("disabled");
      if (n.checked) flags.push("checked");
      if (n.selected) flags.push("selected");
      if (flags.length) parts.push(`(${flags.join(",")})`);
      lines.push(indent + parts.join(" "));
    }
    for (const c of n.children) walk(c, depth + (isInteresting(n) ? 1 : 0));
  };
  walk(root, 0);
  return lines.length ? lines.join("\n") : "(árbol vacío — ¿app cargada?)";
}

/** Filtra nodos puramente estructurales sin información útil. */
function isInteresting(n: UiNode): boolean {
  return Boolean(n.text || n.id || n.accessibility) || isInteractiveType(n.type) || isWebViewType(n.type);
}

/** ¿Es un contenedor WebView (app híbrida)? */
export function isWebViewType(type: string): boolean {
  return /webview|wkwebview|web_view/i.test(type);
}

/** ¿La pantalla actual contiene contenido web (app híbrida)? */
export function detectWebView(root: UiNode): boolean {
  return flatten(root).some((n) => isWebViewType(n.type));
}

/**
 * Detecta el framework de UI por las clases/tipos del árbol. Ayuda a la IA a
 * elegir la estrategia de selector adecuada (ids vs labels) en cada caso.
 */
export function detectFramework(root: UiNode): string {
  const nodes = flatten(root);
  const types = nodes.map((n) => n.type).join(" ");
  if (/FlutterView|io\.flutter|FlutterSurfaceView|FlutterTextureView/i.test(types)) return "Flutter";
  if (/ReactRootView|RCTView|RCTText|com\.facebook\.react/i.test(types)) return "React Native";
  if (isWebViewTypePresent(nodes) && nodes.length < 6) return "WebView (app híbrida o PWA en WebView)";
  if (/XCUIElementType/i.test(types)) return "iOS nativo (Swift/SwiftUI/UIKit)";
  if (/android\.(widget|view|webkit)/i.test(types)) return "Android nativo (Kotlin/Java)";
  return "desconocido";
}

function isWebViewTypePresent(nodes: UiNode[]): boolean {
  return nodes.some((n) => isWebViewType(n.type));
}

function isInteractiveType(type: string): boolean {
  return /button|text|edit|switch|checkbox|cell|tab|image|link|field/i.test(type);
}

function shortId(id: string): string {
  // "com.app:id/email_input" -> "email_input"
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/**
 * Detecta si la pantalla actual es un "muro de login" que exige autenticarse
 * para continuar. Heurística: hay un campo de contraseña, o un botón/enlace de
 * login junto a un campo de email/usuario.
 *
 * Devuelve null si no parece login, o un objeto describiendo qué se necesita,
 * para que la IA pueda avisar "se necesita login para ingresar" y, si tiene
 * credenciales, autenticarse.
 */
export interface LoginWall {
  passwordRef?: string;
  userRef?: string;
  submitRef?: string;
  message: string;
}

export function detectLoginWall(root: UiNode): LoginWall | null {
  const nodes = flatten(root);
  const isPwd = (n: UiNode) =>
    /password|contrase|pwd|pin/i.test(n.id) || /password|secure/i.test(n.type);
  const isUser = (n: UiNode) =>
    /email|user|usuario|correo|login|phone|telefono/i.test(n.id + " " + n.accessibility);
  const isSubmit = (n: UiNode) =>
    /button|link/i.test(n.type) &&
    /iniciar sesi|ingresar|log\s?in|sign\s?in|entrar|acceder|continuar/i.test(n.text + " " + n.accessibility);

  const pwd = nodes.find(isPwd);
  const user = nodes.find(isUser);
  const submit = nodes.find(isSubmit);

  if (pwd || (user && submit)) {
    return {
      passwordRef: pwd?.ref,
      userRef: user?.ref,
      submitRef: submit?.ref,
      message:
        "🔐 Se necesita login para ingresar. Esta pantalla pide autenticación. " +
        "Proporciona usuario y contraseña (tool `login`) para continuar el flujo, " +
        "o revisa solo hasta aquí si no quieres autenticarte.",
    };
  }
  return null;
}

/**
 * Detecta un diálogo de PERMISOS o de SISTEMA superpuesto (Android
 * permissioncontroller / iOS system alert) que bloquea el flujo. Devuelve los
 * refs de los botones aceptar/denegar para poder responder.
 */
export interface SystemDialog {
  acceptRef?: string;
  denyRef?: string;
  message: string;
}

export function detectSystemDialog(root: UiNode): SystemDialog | null {
  const nodes = flatten(root);
  const isAccept = (n: UiNode) =>
    /permission_allow|allow_button|button1/i.test(n.id) ||
    /^(allow|while using( the app)?|only this time|permitir|al usar la app|solo esta vez|ok|aceptar)$/i.test(n.text.trim());
  const isDeny = (n: UiNode) =>
    /permission_deny|deny_button|button2/i.test(n.id) ||
    /^(deny|don't allow|no permitir|denegar|cancelar|cancel)$/i.test(n.text.trim());
  // Señal de que es un diálogo de sistema/permiso (no de la app).
  const looksSystem = nodes.some(
    (n) => /permissioncontroller|systemui|com\.android\.packageinstaller/i.test(n.id + " " + n.type) ||
      /XCUIElementTypeAlert/i.test(n.type) ||
      /permitir que|allow .* to|quiere acceder|would like to access|usar tu ubicación|access your/i.test(n.text)
  );
  const accept = nodes.find(isAccept);
  const deny = nodes.find(isDeny);
  if (looksSystem && (accept || deny)) {
    return {
      acceptRef: accept?.ref,
      denyRef: deny?.ref,
      message:
        "🛡️ Diálogo de sistema/permiso detectado (tapa la app). Usa `handle_system_dialog` " +
        "con accept=true/false para responder y continuar el flujo.",
    };
  }
  return null;
}

/** Detecta el diálogo "la app no responde" (ANR) / crash. */
export function detectAnr(root: UiNode): boolean {
  return flatten(root).some((n) =>
    /isn't responding|no responde|not responding|has stopped|se ha detenido|keeps stopping/i.test(n.text)
  );
}

/** Mapa ref -> nodo, para resolver acciones por `ref` del último snapshot. */
export function indexByRef(root: UiNode): Map<string, UiNode> {
  const map = new Map<string, UiNode>();
  const walk = (n: UiNode) => {
    map.set(n.ref, n);
    n.children.forEach(walk);
  };
  walk(root);
  return map;
}
