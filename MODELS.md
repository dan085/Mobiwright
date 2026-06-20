# Modelos de IA recomendados

Mobiwright expone un **servidor MCP** (Model Context Protocol), un estándar
**abierto** (creado por Anthropic y hoy gobernado por la *Agentic AI Foundation*
de la Linux Foundation) que funciona en Claude, ChatGPT, Gemini, Copilot y
muchos más. Por eso Mobiwright es **agnóstico del modelo**: puedes usar
prácticamente cualquier LLM moderno con buen *tool calling*.

> Esta lista refleja el panorama a mediados de **2026**. Los modelos cambian
> rápido; comprueba la disponibilidad y precios actuales en cada proveedor.

## Qué necesita el modelo para conducir Mobiwright

1. **Tool calling / function calling fiable** (obligatorio): el modelo debe
   invocar las tools MCP (`open_app`, `snapshot`, `tap`, `fill`, `login`...).
2. **Visión** (opcional pero recomendable): `snapshot` devuelve el **árbol de
   accesibilidad en texto** *y* una **captura PNG**. Un modelo solo-texto puede
   conducir el flujo perfectamente usando el árbol; un modelo con visión además
   aprovecha la captura para casos visuales ambiguos.
3. **Contexto amplio** (útil): flujos largos generan muchos snapshots; más
   contexto = menos pérdida de estado.

## Recomendaciones por caso de uso

| Caso de uso | Recomendado (propietarios) | Por qué |
|-------------|----------------------------|---------|
| **Máxima fiabilidad** (flujos críticos, regresión) | **Claude Opus 4.8**, **GPT‑5.5 Pro**, **Gemini 3.1 Pro** | Lideran los rankings agénticos; mejor razonamiento multi‑paso y menos errores en tool‑use. |
| **Equilibrio coste/rendimiento** (uso diario) | **Claude Sonnet 4.6**, **GPT‑5.4**, **Gemini 3.5 Flash** | Muy buen tool‑calling a una fracción del coste; ideales para CI y exploración continua. |
| **Mejor visión** (analizar capturas/UI) | **Gemini 3 Flash (Agentic Vision)**, **Claude Opus 4.8**, **GPT‑5.x** | Razonamiento visual fuerte para validar pantallas por la imagen, no solo el árbol. |
| **Rápido y económico** (smoke tests) | **Claude Haiku 4.5**, **Gemini 3.5 Flash** | Latencia baja y precio bajo para flujos cortos y verificaciones simples. |
| **Local / privado / sin coste por token** | **Qwen3‑Coder‑30B**, **GLM‑4.5‑Air**, **Llama 3.1 70B** | Frontier tool‑use en una sola GPU; ejecútalos con Ollama + un cliente MCP (Cline/Continue). Ideal si los datos no pueden salir de tu red. |

### Resumen rápido
- **Empieza con**: Claude Sonnet 4.6, GPT‑5.4 o Gemini 3.5 Flash — el mejor punto
  de equilibrio.
- **Sube a** Claude Opus 4.8 / GPT‑5.5 Pro / Gemini 3.1 Pro cuando el flujo sea
  crítico o complejo.
- **Privacidad total**: Qwen3‑Coder‑30B o Llama 3.1 70B en local.

## Clientes MCP compatibles (donde usas estos modelos)

| Cliente | Modelos típicos |
|---------|-----------------|
| **Claude Desktop / Claude Code / Cowork** | Claude (Opus/Sonnet/Haiku) |
| **ChatGPT (Desktop) / con soporte MCP** | GPT‑5.x |
| **Gemini / Gemini CLI / Google AI Studio** | Gemini 3.x |
| **Cursor** | Claude, GPT, Gemini (eliges) |
| **Cline / Continue.dev / Windsurf / Zed** | cualquiera, incl. **modelos locales** (Ollama, LM Studio) |
| **VS Code (extensiones MCP / Copilot)** | GPT, Claude, otros |
| **Tu propio agente** | cualquier LLM con un cliente MCP |

Sea cual sea el cliente, la configuración del servidor es la misma (ver
[MCP.md](MCP.md)): apuntas el cliente a `dist/mcp/server.js` y el modelo que ese
cliente use conducirá el emulador/simulador.

## Notas

- El **árbol de accesibilidad en texto** hace que incluso modelos sin visión
  funcionen bien; no necesitas un modelo multimodal para empezar.
- Para **flujos muy largos**, prefiere modelos con contexto grande (Gemini 3.x
  llega a 1M tokens; GPT‑5.4, 256K).
- Las recomendaciones son orientativas: ejecuta tu propio flujo en 2–3 modelos
  y compara fiabilidad/coste para tu app.

---

Fuentes (consultadas en junio de 2026):
- [BenchLM — LLM Agent & Tool‑Use Benchmarks (2026)](https://benchlm.ai/llm-agent-benchmarks)
- [ALTINKEY — Best LLM for Agentic AI in 2026](https://altinkey.com/blog/best-llm-for-agentic-ai-2026)
- [Google — Agentic Vision in Gemini 3 Flash](https://blog.google/innovation-and-ai/technology/developers-tools/agentic-vision-gemini-3-flash/)
- [Google Cloud — Gemini 3 Flash](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash)
- [SiliconFlow — Best Open Source LLM for Agent Workflow 2026](https://www.siliconflow.com/articles/en/best-open-source-LLM-for-Agent-Workflow)
