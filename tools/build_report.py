#!/usr/bin/env python3
"""
Construye el reporte completo del flujo (HTML autocontenido con imágenes
embebidas en base64). Salida: report/FLOW_REPORT.html
"""
import os
import base64

HERE = os.path.dirname(__file__)
IMG = os.path.join(HERE, "..", "report", "images")
OUT = os.path.join(HERE, "..", "report", "FLOW_REPORT.html")


def b64(name):
    with open(os.path.join(IMG, name), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


# (img, titulo, veredicto[ok|warn|bad], qué pasa, cómo lo maneja, replicar)
SIT = [
    ("01_login.png", "1. Pantalla de login", "ok",
     "La app exige autenticarse para continuar.",
     "<code>detectLoginWall</code> lo detecta; el snapshot avisa «se necesita login». La IA decide entrar (con credenciales) o solo revisar.",
     "Abre la app en la pantalla de login → <code>snapshot</code>. Verás 🔐 y los campos email/password con sus ids."),
    ("02_home.png", "2. Login correcto → Home", "ok",
     "Con credenciales válidas se navega al home.",
     "<code>login</code> rellena y envía; <code>expect(home_title).toBeVisible()</code> confirma. La transición S0→S1 queda en el grafo.",
     "<code>login {username,password}</code> → <code>assert_visible id=home_title</code> → <code>get_flow_graph</code>."),
    ("03_permission.png", "3. Diálogo de permisos", "warn",
     "Un diálogo de sistema (ubicación, cámara…) tapa la app y bloquea el flujo.",
     "<code>detectSystemDialog</code> lo identifica (Android permissioncontroller / iOS alert) y lo anota; la tool <code>handle_system_dialog(accept)</code> responde.",
     "Provoca un permiso runtime (p.ej. pedir ubicación) → <code>snapshot</code> muestra 🛡️ → <code>handle_system_dialog accept=true</code>."),
    ("04_keyboard.png", "4. Teclado tapa el botón", "warn",
     "Tras enfocar un campo, el teclado software cubre el botón de enviar.",
     "<code>Device.hideKeyboard()</code> / tool <code>hide_keyboard</code> cierra el IME (Android lo detecta y pulsa BACK) antes de tocar el botón.",
     "Enfoca un campo cercano al borde inferior, intenta tocar el botón → llama <code>hide_keyboard</code> y reintenta."),
    ("05_anr.png", "5. App no responde (ANR)", "bad",
     "La app se congela o crashea; aparece el diálogo del sistema «no responde».",
     "<code>detectAnr</code> lo detecta y el snapshot avisa 💥, para no confundir el diálogo con una pantalla válida del flujo.",
     "Fuerza un bloqueo del hilo principal (build de prueba) → <code>snapshot</code> muestra el aviso de ANR."),
    ("06_offscreen.png", "6. Elemento fuera de pantalla", "warn",
     "Un ítem de una lista larga (RecyclerView/FlatList) no está en el árbol hasta hacer scroll.",
     "<code>scrollIntoViewIfNeeded()</code> y el scroll automático en <code>tap/fill</code> y en el MCP desplazan hasta hallarlo o hasta el fin de la lista.",
     "<code>tap by=id value=product_42</code> en una lista larga: hace scroll solo hasta encontrarlo."),
    ("07_webview.png", "7. WebView / app híbrida", "ok",
     "Pantalla con contenido web embebido (WebView / web components).",
     "<code>detectWebView</code> lo anota; si el WebView expone accesibilidad, sus nodos (incl. shadow DOM abierto) se alcanzan con <code>getByText</code>/<code>getByAccessibility</code>.",
     "Abre una pantalla con WebView → <code>snapshot</code> muestra 🌐. (DOM profundo CSS vía CDP → Roadmap.)"),
    ("08_flowgraph.png", "8. Grafo de flujos", "ok",
     "Para recorrer TODOS los flujos sin perderse ni repetir.",
     "Cada <code>snapshot</code> registra el estado (NUEVO/visitado); <code>get_flow_graph</code> devuelve nodos (pantallas) y aristas (acciones) con diagrama Mermaid.",
     "Explora la app con la IA y pide <code>get_flow_graph</code>: verás qué pantallas faltan por visitar."),
    ("09_rotation.png", "9. Rotación / orientación", "warn",
     "El dispositivo rota a horizontal a mitad del flujo y cambian las dimensiones.",
     "El tamaño de pantalla se reconsulta dinámicamente (Android) y el swipe usa el área real; el árbol se re-vuelca tras rotar.",
     "Rota el emulador (<code>adb shell settings put system user_rotation 1</code>) y repite un <code>snapshot</code>. (API de rotar integrada → Roadmap.)"),
    ("10_rtl.png", "10. Layout RTL (árabe/hebreo)", "warn",
     "Idiomas de derecha a izquierda: la UI se muestra espejada.",
     "Los selectores por id/texto/a11y siguen funcionando y el tap usa bounds reales; los swipes direccionales y las marcas bidi requieren manejo semántico.",
     "Cambia el locale del device a <code>ar</code>/<code>he</code> y recorre el flujo. (swipe forward/back y normalización bidi → Roadmap.)"),
    ("11_modal.png", "11. Modal / bottom sheet", "warn",
     "Una hoja inferior o diálogo modal se superpone sobre la pantalla.",
     "El modal se registra como un estado nuevo en el grafo; conviene acotar la búsqueda a la capa superior mientras esté presente.",
     "Abre un bottom sheet → <code>snapshot</code> (nuevo estado). (Acotado a la capa superior → Roadmap.)"),
]

BADGE = {
    "ok": ("✓ CORRECTO", "#1b873f"),
    "warn": ("⚠ DUDOSO / requiere manejo", "#946c00"),
    "bad": ("✗ INCORRECTO", "#b00020"),
}

n_ok = sum(1 for s in SIT if s[2] == "ok")
n_warn = sum(1 for s in SIT if s[2] == "warn")
n_bad = sum(1 for s in SIT if s[2] == "bad")

cards = ""
for img, title, verdict, what, how, repl in SIT:
    label, color = BADGE[verdict]
    cards += f"""
    <section class="card">
      <div class="img"><img src="{b64(img)}" alt="{title}"/></div>
      <div class="body">
        <span class="badge" style="background:{color}">{label}</span>
        <h3>{title}</h3>
        <p><b>Qué ocurre:</b> {what}</p>
        <p><b>Cómo lo maneja Mobiwright:</b> {how}</p>
        <p class="repl"><b>Replicar:</b> {repl}</p>
      </div>
    </section>"""

html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mobiwright — Reporte completo del flujo</title>
<style>
 :root{{--ink:#1c1c1e;--sub:#6b7280;--line:#e6e8eb}}
 *{{box-sizing:border-box}}
 body{{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:var(--ink);margin:0;background:#fafbfc}}
 header{{padding:32px 24px;background:linear-gradient(135deg,#1f2937,#111827);color:#fff}}
 header h1{{margin:0 0 6px;font-size:26px}}
 header p{{margin:0;color:#cbd5e1}}
 .wrap{{max-width:980px;margin:0 auto;padding:24px}}
 .summary{{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0 8px}}
 .pill{{flex:1;min-width:150px;border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}}
 .pill b{{font-size:24px;display:block}}
 .pill.ok b{{color:#1b873f}} .pill.warn b{{color:#946c00}} .pill.bad b{{color:#b00020}}
 h2{{margin:28px 0 10px;font-size:20px}}
 .card{{display:flex;gap:18px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:16px;margin:16px 0;align-items:flex-start}}
 .card .img{{flex:0 0 210px}}
 .card .img img{{width:210px;border-radius:12px;border:1px solid var(--line)}}
 .card .body{{flex:1}}
 .card h3{{margin:8px 0 10px;font-size:18px}}
 .card p{{margin:6px 0;font-size:14px;line-height:1.5}}
 .card .repl{{background:#f5f7fb;border-radius:8px;padding:8px 10px}}
 .badge{{display:inline-block;color:#fff;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px}}
 code{{background:#eef1f5;padding:1px 6px;border-radius:5px;font-size:13px}}
 table{{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}}
 th,td{{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left}}
 pre{{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;overflow:auto;font-size:13px}}
 .muted{{color:var(--sub)}}
 @media(max-width:680px){{.card{{flex-direction:column}}.card .img,.card .img img{{width:100%;flex:auto}}}}
</style></head><body>
<header>
  <h1>Mobiwright — Reporte completo del flujo</h1>
  <p>Recorrido E2E, veredicto por situación e imágenes para replicar · {n_ok+n_warn+n_bad} situaciones evaluadas</p>
</header>
<div class="wrap">

  <div class="summary">
    <div class="pill ok"><b>{n_ok}</b> correcto(s)</div>
    <div class="pill warn"><b>{n_warn}</b> dudoso(s) / requieren manejo</div>
    <div class="pill bad"><b>{n_bad}</b> incorrecto(s)</div>
  </div>
  <p class="muted">«Dudoso» = situación del dispositivo que rompería el flujo si no se gestiona;
  Mobiwright la <b>detecta y ofrece la herramienta</b> para resolverla. «Incorrecto» = estado de
  error de la app (no del framework) que el framework <b>señala</b> para que no se confunda con un
  paso válido.</p>

  <h2>Verificación automática (ejecutada)</h2>
  <table>
    <tr><th>Comprobación</th><th>Resultado</th></tr>
    <tr><td>Compilación TypeScript (<code>tsc</code>)</td><td>✓ sin errores</td></tr>
    <tr><td>Casos borde de tamaños/gestos/queries (<code>npm run verify</code>)</td><td>✓ TODOS OK</td></tr>
    <tr><td>Flujo de login con el runner (<code>npm run test:demo</code>)</td><td>✓ 4 passed, 0 failed</td></tr>
    <tr><td>Servidor MCP (13 tools, grafo de flujos)</td><td>✓ operativo · transición S0→S1</td></tr>
  </table>

  <h2>Situaciones del flujo (con imágenes)</h2>
  {cards}

  <h2>Grafo de flujos real (salida de get_flow_graph)</h2>
  <pre>Estados (pantallas) descubiertos:
  S0  "Iniciar sesión"  (visitas: 1)
  S1  "Inicio"  (visitas: 1)

Transiciones (acción → estado):
  S0 --[login]--> S1

Diagrama (Mermaid):
graph TD
  S0["Iniciar sesión"]
  S1["Inicio"]
  S0 -->|login| S1</pre>

  <h2>Limitaciones conocidas (Roadmap)</h2>
  <ul>
    <li>Rotación de pantalla y layouts RTL: manejo parcial.</li>
    <li>Inspección profunda del DOM en WebView (selectores CSS) vía Chrome DevTools Protocol.</li>
    <li>Entrada de Unicode/emojis en Android (requiere IME de test).</li>
    <li>Paralelismo multi-dispositivo (<code>workers &gt; 1</code>).</li>
  </ul>
  <p class="muted">Detalle técnico en <code>AUDIT.md</code>, <code>EDGE_CASES.md</code> y <code>FRAMEWORKS.md</code>.</p>
</div>
</body></html>"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("Reporte HTML:", os.path.abspath(OUT), f"({len(html)} bytes)")

# --- Markdown (referencia las imágenes; se mantiene en sync con la lista) ---
import re

def strip_html(s):
    return re.sub(r"<[^>]+>", lambda m: "`" if m.group(0) in ("<code>", "</code>") else "", s)

MD = os.path.join(HERE, "..", "report", "FLOW_REPORT.md")
md = [
    "# Mobiwright — Reporte completo del flujo", "",
    "Recorrido end-to-end con **veredicto por situación** (correcto / dudoso / "
    "incorrecto) e **imágenes para replicar** cada caso.", "",
    "> Versión navegable con imágenes embebidas: [`FLOW_REPORT.html`](FLOW_REPORT.html) · "
    "PDF: [`FLOW_REPORT.pdf`](FLOW_REPORT.pdf)", "",
    "## Resumen", "",
    "| | Cantidad |", "|---|---|",
    f"| ✓ Correcto | {n_ok} |",
    f"| ⚠ Dudoso / requiere manejo | {n_warn} |",
    f"| ✗ Incorrecto (error de la app, señalado) | {n_bad} |", "",
    "- **Dudoso** = situación del dispositivo que rompería el flujo si no se gestiona; "
    "Mobiwright la **detecta y ofrece la herramienta** para resolverla.",
    "- **Incorrecto** = estado de error de la **app** (no del framework) que el framework "
    "**señala** para no confundirlo con un paso válido.", "",
    "## Verificación automática (ejecutada)", "",
    "| Comprobación | Resultado |", "|--------------|-----------|",
    "| Compilación TypeScript (`tsc`) | ✓ sin errores |",
    "| Casos borde (`npm run verify`) | ✓ TODOS OK |",
    "| Flujo de login (`npm run test:demo`) | ✓ 4 passed, 0 failed |",
    "| Servidor MCP (13 tools, grafo) | ✓ operativo · S0→S1 |", "",
    "## Situaciones del flujo", "",
]
BADGE_MD = {"ok": "✓ CORRECTO", "warn": "⚠ DUDOSO", "bad": "✗ INCORRECTO"}
for img, title, verdict, what, how, repl in SIT:
    md += [
        f"### {title} — {BADGE_MD[verdict]}",
        f"![{title}](images/{img})", "",
        f"- **Qué ocurre:** {strip_html(what)}",
        f"- **Manejo:** {strip_html(how)}",
        f"- **Replicar:** {strip_html(repl)}", "",
    ]
md += [
    "## Grafo de flujos real", "", "```mermaid", "graph TD",
    '  S0["Iniciar sesión"]', '  S1["Inicio"]', "  S0 -->|login| S1", "```", "",
    "Detalle técnico en [AUDIT.md](../AUDIT.md), [EDGE_CASES.md](../EDGE_CASES.md) y "
    "[FRAMEWORKS.md](../FRAMEWORKS.md).", "",
]
with open(MD, "w", encoding="utf-8") as f:
    f.write("\n".join(md))
print("Reporte MD:", os.path.abspath(MD))
