# Mobiwright MCP — conducir y revisar flujos con IA

Mobiwright incluye un **servidor MCP** (Model Context Protocol) que expone el
emulador/simulador a una IA, igual que [Playwright MCP](https://github.com/microsoft/playwright-mcp)
hace con el navegador. La IA recibe un **snapshot de accesibilidad** (vista
semántica, no píxeles), decide el siguiente paso y actúa — y puede **revisar el
flujo completo** que ha recorrido.

> **Agnóstico de modelo.** MCP es un estándar **abierto**. Este servidor funciona
> con cualquier cliente MCP y, por tanto, con **cualquier modelo**: Claude,
> ChatGPT/GPT‑5.x, Gemini 3.x, Copilot, o modelos locales (Llama, Qwen, GLM vía
> Ollama). Recomendaciones de qué modelo usar en **[MODELS.md](MODELS.md)**.

## Cómo funciona

```
┌──────────┐   MCP (stdio / JSON-RPC)   ┌────────────────────┐   adb/simctl/idb   ┌────────────┐
│   IA     │ ◀───────────────────────▶ │ mobiwright-mcp     │ ◀────────────────▶ │ emulador / │
│ (Claude) │   tools/call: snapshot,   │ (servidor MCP)     │                    │ simulador  │
└──────────┘   tap, fill, assert...    └────────────────────┘                    └────────────┘
```

## Herramientas expuestas

| Tool | Para qué |
|------|----------|
| `open_app` | inicia el dispositivo y lanza la app (soporta `remoteHost` para iOS remoto) |
| `snapshot` | árbol de accesibilidad con `ref` por elemento + captura PNG — la "vista" de la IA |
| `tap` | toca un elemento por `ref` o por selector (`by`/`value`) |
| `fill` | escribe texto en un campo |
| `swipe` | desliza la pantalla (`up`/`down`/`left`/`right`) |
| `press_key` | back / home / enter / ... |
| `assert_visible` | verifica (con auto-wait) que un elemento es visible |
| `login` | autentica con usuario/contraseña; sin credenciales solo **avisa si se necesita login** |
| `get_flow` | lista los pasos ejecutados — revisión del recorrido |
| `get_flow_graph` | **grafo de flujos** (pantallas + transiciones, con Mermaid) para recorrer TODO de forma sistemática |
| `close_app` | cierra la sesión |

Cada `snapshot` anota además el **estado** en el grafo (NUEVO/visitado), el
**framework** detectado (Android/iOS nativo, Flutter, React Native, WebView) y si
hay **WebView**. Ver [FRAMEWORKS.md](FRAMEWORKS.md).

## Arrancar el servidor

```bash
npm run build
npx mplay mcp          # o:  node dist/mcp/server.js   o:  npx mobiwright-mcp
```

El servidor habla MCP por **stdio** (stdout = JSON-RPC, stderr = logs).

## Conectarlo a un cliente MCP

Funciona con cualquier cliente MCP: **Claude Desktop / Claude Code**, **Cursor**,
**Cline**, **Continue.dev**, **Windsurf**, **Zed**, **VS Code** (extensiones MCP),
**ChatGPT** y **Gemini** con soporte MCP, o tu propio agente. La configuración es
la misma en todos: apuntar el cliente al servidor.

### Ejemplo (Claude Desktop / Cursor / Cowork)

Añade a la configuración MCP del cliente (ej. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mobiwright": {
      "command": "node",
      "args": ["/ruta/absoluta/a/Mobiwright/dist/mcp/server.js"]
    }
  }
}
```

Si lo instalas como paquete (`npm i -g mobiwright`), basta con:

```json
{
  "mcpServers": {
    "mobiwright": { "command": "mobiwright-mcp" }
  }
}
```

## Ejemplo de sesión que haría la IA

```
1. open_app   { "platform": "android", "appId": "com.example.app", "appActivity": ".MainActivity" }
2. snapshot   → [a3] EditText id="email_input"
                [a4] EditText id="password_input"
                [a7] Button text="Iniciar sesión"
3. fill       { "ref": "a3", "text": "daniel@example.com" }
4. fill       { "ref": "a4", "text": "Sup3rSecret!" }
5. tap        { "ref": "a7" }
6. assert_visible { "by": "id", "value": "home_title" }
7. get_flow   → recorrido completo paso a paso para revisión
```

Con esto, la IA explora la app de forma autónoma, valida que cada pantalla del
flujo aparece como se espera, y deja un registro revisable de todo el recorrido.

> Nota de seguridad: el servidor controla un dispositivo real/emulado. Úsalo en
> emuladores/simuladores de prueba, no en dispositivos con datos sensibles.
