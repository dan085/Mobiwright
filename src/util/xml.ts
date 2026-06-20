/**
 * Parser XML mínimo y sin dependencias, suficiente para la salida de
 * `uiautomator dump` (Android) y para el árbol de accesibilidad de iOS que
 * serializamos como XML. No pretende ser un parser XML completo: cubre
 * elementos, atributos entrecomillados y anidamiento, que es lo que generan
 * esas herramientas.
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

export function parseXml(xml: string): XmlElement {
  let i = 0;
  const n = xml.length;

  function skipProlog() {
    // saltar <?xml ...?> y espacios
    const m = /^\s*<\?xml[^>]*\?>/.exec(xml.slice(i));
    if (m) i += m[0].length;
  }

  function skipWs() {
    while (i < n && /\s/.test(xml[i])) i++;
  }

  function parseElement(): XmlElement {
    skipWs();
    if (xml[i] !== "<") throw new Error(`XML inválido en pos ${i}`);
    i++; // consume '<'
    // nombre
    let name = "";
    while (i < n && /[^\s/>]/.test(xml[i])) name += xml[i++];

    const attrs: Record<string, string> = {};
    // atributos
    for (;;) {
      skipWs();
      if (i >= n || xml[i] === "/" || xml[i] === ">") break; // fin/trunco
      let attrName = "";
      while (i < n && /[^\s=/>]/.test(xml[i])) attrName += xml[i++];
      if (attrName === "") { i++; continue; } // evita bucle ante carácter raro
      skipWs();
      if (xml[i] === "=") {
        i++; // '='
        skipWs();
        const quote = xml[i++]; // " o '
        let val = "";
        while (i < n && xml[i] !== quote) val += xml[i++];
        i++; // cierre de comilla
        attrs[attrName] = decodeEntities(val);
      } else {
        attrs[attrName] = "";
      }
    }

    const el: XmlElement = { name, attrs, children: [] };

    if (xml[i] === "/") {
      i += 2; // '/>'
      return el;
    }
    i++; // '>'

    // contenido
    for (;;) {
      skipWs();
      if (i >= n) break; // XML truncado: cortamos sin colgarnos
      if (xml[i] === "<" && xml[i + 1] === "/") {
        // cierre
        i += 2;
        while (i < n && xml[i] !== ">") i++;
        i++; // '>'
        break;
      } else if (xml[i] === "<" && xml[i + 1] === "!") {
        // comentario / CDATA: lo saltamos hasta '>'
        while (i < n && xml[i] !== ">") i++;
        i++;
      } else if (xml[i] === "<") {
        el.children.push(parseElement());
      } else {
        // texto: lo ignoramos (uiautomator no usa text nodes)
        while (i < n && xml[i] !== "<") i++;
      }
    }
    return el;
  }

  skipProlog();
  skipWs();
  return parseElement();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // &amp; al final para no re-decodificar
}

function safeCodePoint(cp: number): string {
  try {
    return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : "";
  } catch {
    return "";
  }
}
