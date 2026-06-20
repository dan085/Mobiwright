import { Rect, Selector, UiNode } from "../types";

/** Aplana el árbol a una lista en orden de profundidad (DFS). */
export function flatten(root: UiNode): UiNode[] {
  const out: UiNode[] = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.shift()!;
    out.push(n);
    // mantener el orden de los hijos
    stack.unshift(...n.children);
  }
  return out;
}

/**
 * Mapeo de roles semánticos a tipos nativos (iOS + Android), inspirado en la
 * tabla de Mobilewright. El match es por sufijo de la clase/tipo del nodo, así
 * que "android.widget.Button" y "XCUIElementTypeButton" casan con "button".
 */
const ROLE_TYPES: Record<string, string[]> = {
  button: ["Button", "ImageButton"],
  textfield: ["TextField", "SecureTextField", "SearchField", "EditText"],
  text: ["StaticText", "TextView", "Text"],
  image: ["Image", "ImageView"],
  switch: ["Switch", "Toggle"],
  checkbox: ["CheckBox", "Checkbox"],
  slider: ["Slider", "SeekBar"],
  list: ["Table", "CollectionView", "ScrollView", "ListView", "RecyclerView"],
  header: ["NavigationBar", "Toolbar", "Header"],
  link: ["Link"],
  listitem: ["Cell"],
  tab: ["Tab", "TabBar"],
};

function typeMatchesRole(type: string, role: string): boolean {
  const types = ROLE_TYPES[role] || [];
  // Estricto: clase exacta, sufijo ".Tipo" (Android) o "Type"+Tipo (iOS).
  // No usamos endsWith(t) a secas para no casar "EditText" con el rol "text".
  return types.some((t) => type === t || type.endsWith("." + t) || type.endsWith("Type" + t));
}

/** ¿El nodo casa con el selector dado? */
function matchesOne(node: UiNode, sel: Selector): boolean {
  switch (sel.strategy) {
    case "text":
      if (sel.pattern) return sel.pattern.test(node.text);
      return sel.exact ? node.text === sel.value : node.text === sel.value || node.text.includes(sel.value);
    case "id":
      // acepta tanto "com.app:id/foo" como sufijo "foo"
      return node.id === sel.value || node.id.endsWith("/" + sel.value);
    case "accessibility":
      return node.accessibility === sel.value;
    case "type":
      return node.type === sel.value || node.type.endsWith("." + sel.value);
    case "role": {
      if (!typeMatchesRole(node.type, sel.value)) return false;
      if (sel.roleName) {
        const name = node.text || node.accessibility;
        return name === sel.roleName || name.includes(sel.roleName);
      }
      if (sel.pattern) {
        const name = node.text || node.accessibility;
        return sel.pattern.test(name);
      }
      return true;
    }
    case "placeholder":
      // placeholder/hint suele venir en accessibility o text vacío con hint
      return node.accessibility.includes(sel.value) || node.text.includes(sel.value);
    case "xpath":
      // soporte básico de xpath se maneja en matchAll
      return false;
    default:
      return false;
  }
}

/** Devuelve todos los nodos que casan con el selector. */
export function matchAll(root: UiNode, sel: Selector): UiNode[] {
  const all = flatten(root);
  if (sel.strategy === "xpath") {
    return matchXPath(root, sel.value);
  }
  const matches = all.filter((n) => matchesOne(n, sel));
  // Para `text` por subcadena, priorizamos las coincidencias EXACTAS para que
  // getByText("Iniciar") no elija "Reiniciar sesión" si existe el exacto.
  if (sel.strategy === "text" && !sel.exact) {
    matches.sort((a, b) => Number(b.text === sel.value) - Number(a.text === sel.value));
  }
  return matches;
}

/** Resuelve el nodo objetivo respetando el índice del selector. */
export function matchOne(root: UiNode, sel: Selector): UiNode | null {
  const matches = matchAll(root, sel);
  const idx = sel.index ?? 0;
  return matches[idx] ?? null;
}

/**
 * Resuelve una CADENA de selectores (locator chaining):
 * el primer selector busca en todo el árbol; cada selector siguiente busca
 * dentro de los bounds de los nodos ya encontrados (contención geométrica).
 * Funciona tanto con árboles jerárquicos (Android) como planos (iOS/idb).
 */
export function matchChain(root: UiNode, selectors: Selector[]): UiNode[] {
  if (selectors.length === 0) return [];
  const last = selectors.length - 1;
  let current = matchAll(root, selectors[0]);
  // El índice de un segmento INTERMEDIO acota ese nivel (p.ej. la 2ª celda).
  // El índice del ÚLTIMO segmento lo aplica matchChainOne (no aquí, para que
  // count() cuente sobre el conjunto completo).
  current = applyIntermediateIndex(current, selectors[0], 0, last);
  for (let i = 1; i < selectors.length; i++) {
    const candidates = matchAll(root, selectors[i]);
    const next: UiNode[] = [];
    for (const parent of current) {
      for (const child of candidates) {
        if (child !== parent && contains(parent.bounds, child.bounds)) next.push(child);
      }
    }
    current = applyIntermediateIndex(dedupe(next), selectors[i], i, last);
  }
  return current;
}

function applyIntermediateIndex(nodes: UiNode[], sel: Selector, i: number, last: number): UiNode[] {
  if (i < last && sel.index != null) {
    const n = nodes[sel.index];
    return n ? [n] : [];
  }
  return nodes;
}

/** Resuelve la cadena aplicando el índice del ÚLTIMO selector. */
export function matchChainOne(root: UiNode, selectors: Selector[]): UiNode | null {
  const matches = matchChain(root, selectors);
  const idx = selectors[selectors.length - 1]?.index ?? 0;
  return matches[idx] ?? null;
}

/** ¿`inner` está contenido dentro de `outer` (con tolerancia)? */
function contains(outer: Rect, inner: Rect): boolean {
  const t = 2; // tolerancia en px
  return (
    inner.x >= outer.x - t &&
    inner.y >= outer.y - t &&
    inner.x + inner.width <= outer.x + outer.width + t &&
    inner.y + inner.height <= outer.y + outer.height + t &&
    // evita que un contenedor de pantalla completa "contenga" todo trivialmente
    (outer.width * outer.height) >= (inner.width * inner.height)
  );
}

function dedupe(nodes: UiNode[]): UiNode[] {
  const seen = new Set<UiNode>();
  const out: UiNode[] = [];
  for (const n of nodes) if (!seen.has(n)) { seen.add(n); out.push(n); }
  return out;
}

/**
 * Implementación deliberadamente acotada de XPath para árboles de UI.
 * Soporta lo más usado en automatización móvil:
 *   //type
 *   //type[@text='valor']
 *   //type[@id='valor']  (resource-id / identifier)
 *   //*[@text='valor']
 *   //type[contains(@text,'valor')]
 */
export function matchXPath(root: UiNode, xpath: string): UiNode[] {
  const all = flatten(root);
  const m = /^\/\/([*\w.]+)(?:\[(.+)\])?$/.exec(xpath.trim());
  if (!m) return [];
  const [, typePart, predicate] = m;

  let result = all.filter((n) => typePart === "*" || n.type === typePart || n.type.endsWith("." + typePart));

  if (predicate) {
    const eq = /^@(\w[\w-]*)='([^']*)'$/.exec(predicate);
    const contains = /^contains\(@(\w[\w-]*),'([^']*)'\)$/.exec(predicate);
    if (eq) {
      const [, attr, val] = eq;
      result = result.filter((n) => attrValue(n, attr) === val);
    } else if (contains) {
      const [, attr, val] = contains;
      result = result.filter((n) => attrValue(n, attr).includes(val));
    }
  }
  return result;
}

function attrValue(n: UiNode, attr: string): string {
  switch (attr) {
    case "text":
      return n.text;
    case "id":
    case "resource-id":
      return n.id;
    case "content-desc":
    case "label":
    case "accessibility":
      return n.accessibility;
    case "class":
    case "type":
      return n.type;
    default:
      return "";
  }
}
