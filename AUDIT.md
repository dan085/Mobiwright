# Auditoría de flujos y resolución de casos borde

Auditoría completa del recorrido de procesos de Mobiwright (runner, drivers,
API, MCP, util) y estado de resolución. La verificación automática vive en
`tests/device-sizes.check.cjs` (`npm run verify`) y el modo demo en
`npm run test:demo`. `tsc --noEmit` pasa sin errores ni warnings.

## Críticos — RESUELTOS

| # | Hallazgo | Resolución |
|---|----------|-----------|
| 1 | `test.only` se registraba pero no se honraba (corría todo) | El runner filtra: si hay algún `only`, ejecuta solo esos. |
| 2 | `beforeAll`/`afterAll` se recogían pero nunca se ejecutaban | El runner corre `beforeAll` (raíz→hojas) una vez por proyecto y `afterAll` (hojas→raíz); si `beforeAll` falla, marca los tests como fallidos con mensaje claro. |
| 3 | `afterEach` podía ejecutarse dos veces en fallo | Reestructurado con `try/finally`: los `afterEach` corren **exactamente una vez**. |
| 4 | `withTimeout` no limpiaba el temporizador (fuga) | `clearTimeout` en `finally`. (La cancelación dura del test sigue en Roadmap; los reintentos ya son secuenciales.) |
| 5 | Sink de pasos global y `workers` ignorado | Documentado: el runner es secuencial (`workers:1`); `workers>1` es Roadmap. Sink se limpia en `finally`. |

## Medios — RESUELTOS

| # | Hallazgo | Resolución |
|---|----------|-----------|
| 6 | El `flow` del MCP no se limpiaba al cerrar sesión | `flow` y el grafo se reinician en `open_app` y `close_app`. |
| 7 | Errores de protocolo MCP se devolvían como `result` | Ahora: errores de `tools/call` → `{isError:true}`; fallos de protocolo → `error` JSON-RPC real. |
| 8 | `resolveNode` por `ref` usaba árbol cacheado obsoleto | Revalida contra un árbol **fresco**; si el ref no existe, cae al selector o avisa. |
| 9 | iOS `dumpTree`: error críptico si `idb` falla | Comprueba código de salida y da error claro (idb/simulador). |
| 10 | `typeText` Android: escape incompleto y Unicode silencioso | Escapa `%` y más metacaracteres; **avisa por stderr** ante texto no-ASCII. |
| 11 | `info()` Android: 3 comandos adb por swipe | Cachea model/os (inmutables); el tamaño se reconsulta (rotación). |
| 12 | `getByText` por subcadena podía elegir el elemento erróneo | Prioriza coincidencia **exacta**; opción `getByText(t,{exact:true})`. |
| 13 | `NaN` en duración de gestos iOS | Validación: duración finita > 0 o valor por defecto. |

## Bajos — RESUELTOS

| # | Hallazgo | Resolución |
|---|----------|-----------|
| 14 | Timer del race sin limpiar | Resuelto junto al #4. |
| 15 | `parseBounds` no aceptaba negativos | Regex admite `-?\d+` (elementos fuera de pantalla). |
| 16 | Parser XML: entidades numéricas, CDATA/comentarios, XML truncado | Decodifica `&#..;`/`&#x..;`, salta `<!-- -->`/CDATA y corta con guardas ante truncado (sin bucles infinitos). |
| 18 | `testMatch` por defecto solo `.ts` | Documentado; el loader soporta `.ts` (ts-node) y `.js` compilado. |
| proc | `execBinary` podía resolver/rechazar dos veces | Guarda `settled` (igual que `exec`). |

## Cobertura de plataformas y frameworks — REVISADA

- **Android nativo (Kotlin/Java)**, **iOS nativo (Swift)**, **React Native**,
  **Flutter** y **WebView/híbridas**: estrategias, buenas prácticas y casos borde
  en [FRAMEWORKS.md](FRAMEWORKS.md). El MCP **detecta el framework** y lo anota.
- **Tamaños/orientación de dispositivo** y demás casos límite de Android/iOS:
  [EDGE_CASES.md](EDGE_CASES.md), verificados en `npm run verify`.

## Recorrer TODOS los flujos — AÑADIDO

Se añadió un **grafo de flujos** (`src/core/flowgraph.ts`): nodos = pantallas
(huella estructural estable), aristas = acciones. El MCP registra el estado en
cada `snapshot` (NUEVO/visitado) y expone `get_flow_graph` (con diagrama
Mermaid), para explorar todas las pantallas de forma sistemática, sin bucles.

## Segunda auditoría — casos de dispositivo móvil

| Caso | Estado |
|------|--------|
| **Diálogos de permisos / sistema** (Android permissioncontroller, iOS alert) | RESUELTO: `detectSystemDialog` + tool MCP `handle_system_dialog(accept)`; anotado en `snapshot`. |
| **Elementos fuera de pantalla en listas** (RecyclerView/FlatList) | RESUELTO: `Locator.scrollIntoViewIfNeeded()` y scroll automático en `tap`/`fill` y en `resolveNode` del MCP; se detiene al final de la lista. |
| **Coordenadas negativas / fuera de pantalla** | RESUELTO: `center()` clampa a ≥1 y `clampPoint()` acota a la pantalla. |
| **Teclado software tapando botones** | RESUELTO: `Device.hideKeyboard()` + tool MCP `hide_keyboard` (Android detecta IME y cierra con BACK). |
| **ANR / app no responde / crash** | RESUELTO (detección): `detectAnr` avisa en el `snapshot`. |
| **Animaciones/árbol inestable** | CUBIERTO: auto-waiting tolerante + reintentos de volcado. |
| **Orientación a mitad de test** | PARCIAL: tamaño dinámico en Android; API de rotación → Roadmap. |
| **RTL / bidi** | PARCIAL → Roadmap (normalización de marcas bidi y swipes forward/back). |
| **Toasts transitorios** | Documentado: poco fiables vía árbol; preferir logcat → Roadmap. |
| **Modales / bottom sheets** | Registrados como estado en el grafo; acotar búsqueda a la capa superior → Roadmap. |
| **Foldables / split-screen** | Riesgo bajo; acotar a la ventana de la app → Roadmap. |

## Limitaciones conocidas (Roadmap, documentadas)

- Cancelación dura del cuerpo del test al vencer el timeout.
- `workers > 1` (paralelismo multi-dispositivo).
- Inspección profunda del DOM en WebView vía Chrome DevTools Protocol.
- Entrada de Unicode/emojis en Android (requiere IME de test).
- Jerarquía anidada/ XPath profundo en iOS (idb a veces aplana el árbol).
