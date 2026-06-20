import { UiNode } from "../types";
import { flatten } from "./query";

/**
 * Grafo de flujos de la app: NODOS = estados/pantallas, ARISTAS = acciones que
 * llevan de un estado a otro.
 *
 * Permite recorrer "todos los flujos" de forma sistemática: una IA (o un
 * crawler) puede ver qué pantallas ya visitó y qué acciones llevan a dónde,
 * evitando bucles y cubriendo caminos sin explorar. Cada estado se identifica
 * por una "huella" estructural estable de la pantalla (ids/tipos/textos
 * relevantes), no por píxeles, así dos visitas a la misma pantalla colapsan en
 * el mismo nodo.
 */
export interface FlowState {
  id: string;
  fingerprint: string;
  label: string;
  visits: number;
}

export interface FlowEdge {
  from: string;
  action: string;
  to: string;
}

export class FlowGraph {
  private states = new Map<string, FlowState>(); // fingerprint -> estado
  private order: FlowState[] = [];
  private edges: FlowEdge[] = [];
  private counter = 0;

  /** Registra (o reconoce) el estado de una pantalla. */
  observe(tree: UiNode): { state: FlowState; isNew: boolean } {
    const fp = fingerprint(tree);
    const existing = this.states.get(fp);
    if (existing) {
      existing.visits++;
      return { state: existing, isNew: false };
    }
    const state: FlowState = { id: `S${this.counter++}`, fingerprint: fp, label: labelOf(tree), visits: 1 };
    this.states.set(fp, state);
    this.order.push(state);
    return { state, isNew: true };
  }

  /** Registra una transición (deduplicada). */
  addTransition(fromId: string, action: string, toId: string): void {
    if (fromId === toId && /assert|snapshot|get_flow/.test(action)) return; // ruido
    const dup = this.edges.find((e) => e.from === fromId && e.action === action && e.to === toId);
    if (!dup) this.edges.push({ from: fromId, action, to: toId });
  }

  get statesList(): FlowState[] {
    return this.order;
  }
  get edgesList(): FlowEdge[] {
    return this.edges;
  }

  reset(): void {
    this.states.clear();
    this.order = [];
    this.edges = [];
    this.counter = 0;
  }

  toJSON() {
    return {
      states: this.order.map((s) => ({ id: s.id, label: s.label, visits: s.visits })),
      transitions: this.edges,
    };
  }

  /** Representación legible para la IA. */
  toText(): string {
    if (this.order.length === 0) return "(grafo de flujos vacío — aún no hay snapshots)";
    const lines: string[] = ["Estados (pantallas) descubiertos:"];
    for (const s of this.order) lines.push(`  ${s.id}  ${JSON.stringify(s.label)}  (visitas: ${s.visits})`);
    lines.push("", "Transiciones (acción → estado):");
    if (this.edges.length === 0) lines.push("  (ninguna todavía)");
    for (const e of this.edges) lines.push(`  ${e.from} --[${e.action}]--> ${e.to}`);
    // Mermaid para visualizar
    lines.push("", "Diagrama (Mermaid):", "```mermaid", "graph TD");
    for (const s of this.order) lines.push(`  ${s.id}["${s.label.replace(/"/g, "'")}"]`);
    for (const e of this.edges) lines.push(`  ${e.from} -->|${e.action.replace(/[|"]/g, " ")}| ${e.to}`);
    lines.push("```");
    return lines.join("\n");
  }
}

/** Huella estructural estable de una pantalla. */
function fingerprint(tree: UiNode): string {
  const sig = flatten(tree)
    .filter((n) => n.id || n.text || n.accessibility)
    .map((n) => `${shortType(n.type)}#${shortId(n.id)}:${(n.text || n.accessibility).slice(0, 24)}`)
    .sort()
    .join("|");
  return hash(sig);
}

function labelOf(tree: UiNode): string {
  // Etiqueta humana: primer título/encabezado significativo.
  const nodes = flatten(tree);
  const titleNode =
    nodes.find((n) => /title|toolbar|header|navbar/i.test(n.id) && n.text) ||
    nodes.find((n) => n.text && n.text.length > 1);
  return (titleNode?.text || nodes.find((n) => n.id)?.id || "pantalla").slice(0, 40);
}

function shortType(t: string): string {
  const dot = t.lastIndexOf(".");
  return dot >= 0 ? t.slice(dot + 1) : t;
}
function shortId(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/** Hash determinista corto (djb2). */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
