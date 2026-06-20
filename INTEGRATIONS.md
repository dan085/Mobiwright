# Integraciones

## graphify (safishamsi/graphify) — ¿conviene integrarlo?

**Qué es graphify:** una skill para asistentes de IA (Claude Code, Cursor, Codex,
Gemini CLI…) que convierte una carpeta de **código, esquemas SQL, scripts, docs,
papers, imágenes o vídeos** en un **grafo de conocimiento consultable** del
proyecto. Es decir, opera sobre artefactos **estáticos** (tu código fuente y tu
documentación).

**Qué hace Mobiwright:** explora y valida la app **en ejecución** sobre un
emulador/simulador, y construye un **grafo de flujos en runtime** (pantallas y
transiciones) mientras la recorre.

### Valoración honesta

Son **complementarios, no solapados**. graphify no es el componente que necesitas
para "recorrer todos los flujos" en runtime —eso ya lo cubre el grafo de flujos
propio de Mobiwright (`get_flow_graph`)—, porque graphify grafica el **código
estático**, no los **estados de la UI en vivo**.

Dónde **sí** aporta graphify, de forma separada:

- **Entender la app por su código** antes o después de explorarla: mapear qué
  pantallas/Activities/Screens existen en el fuente, qué endpoints llaman, qué
  esquema de datos hay detrás. Útil para *saber qué flujos deberían existir* y
  contrastarlos con los que Mobiwright descubre en runtime (cobertura).
- **Diagnóstico de regresiones**: cruzar un fallo de un flujo con el código que lo
  implementa.

### Recomendación

No lo integres **dentro del runtime** de Mobiwright (no es una dependencia de
ejecución). Úsalo **en paralelo, a nivel de repositorio del proyecto bajo prueba**:

1. Ejecuta graphify sobre el **código de tu app** (Kotlin/Swift/RN/Flutter) para
   obtener el grafo de pantallas/flujos *esperados*.
2. Ejecuta Mobiwright (MCP `get_flow_graph`) para obtener los flujos *reales*
   recorridos en el emulador.
3. Compara ambos para medir **cobertura de flujos** y detectar pantallas no
   exploradas o caminos muertos.

Ambos son **agnósticos de modelo** y hablan con asistentes de IA, así que pueden
convivir en el mismo cliente (Claude, ChatGPT, Gemini, Cursor…) sin fricción.

> En resumen: graphify = grafo del **código**; Mobiwright = grafo del **flujo en
> ejecución**. Juntos dan la foto completa (lo que la app *debería* hacer vs. lo
> que *hace*), pero no hace falta acoplarlos en código.

## Otras integraciones del Roadmap

- **Device farms** (BrowserStack / Sauce Labs / AWS Device Farm) como driver
  remoto para dispositivos reales.
- **Chrome DevTools Protocol (CDP)** para inspección profunda del DOM en WebView.
- **Reporters externos** (Allure, JUnit XML) para CI.
