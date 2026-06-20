# Soporte por framework de app

Mobiwright actúa sobre el **árbol de accesibilidad** del sistema (UiAutomator en
Android, XCUITest/idb en iOS). Por eso funciona con cualquier framework que
exponga accesibilidad — nativo, Flutter, React Native — y con **WebView** cuando
la app lo habilita. El servidor MCP **detecta el framework** automáticamente y lo
indica en cada `snapshot`, para que la IA elija la estrategia de selector óptima.

## Resumen de estrategias por framework

| Framework | Selector recomendado | De dónde sale el id |
|-----------|----------------------|---------------------|
| **Android nativo (Kotlin/Java)** | `getById` (`getByTestId`) | `android:id/...` → asigna `android:id/foo` en XML o `View.setId`/`resource-id` |
| **iOS nativo (Swift/SwiftUI/UIKit)** | `getById` / `getByAccessibility` | `accessibilityIdentifier` (UIKit) / `.accessibilityIdentifier()` (SwiftUI) |
| **React Native** | `getByTestId` | `testID` → `resource-id` (Android) y `accessibilityIdentifier` (iOS) |
| **Flutter** | `getByAccessibility` / `getByText` | `Semantics(label:/identifier:)`; requiere semántica activada |
| **WebView / híbrida** | `getByText` / `getByAccessibility` | a11y del DOM si la app habilita accesibilidad en el WebView |

> Recomendación general: usa **`getByTestId`** o **`getByRole`** siempre que
> puedas (estables y multiplataforma). Como fallback, `getByAccessibility`
> (labels) o `getByText`.

## Matriz de soporte (ampliada)

| Framework | iOS | Android | Notas |
|-----------|-----|---------|-------|
| UIKit / Storyboards | ✅ | — | Tipos nativos completos; todos los locators. |
| SwiftUI | ✅ | — | Árbol `XCUIElementType` estándar. |
| Jetpack Compose | — | ✅ | Usa `Modifier.testTag` + `testTagsAsResourceId`. |
| Android Views (XML) | — | ✅ | Tipos nativos completos. |
| React Native / Expo | ✅ | ✅ | `testID` → resource-id / accessibilityIdentifier. |
| .NET MAUI | ✅ | ✅ | Compila a controles nativos en ambas. |
| NativeScript | ✅ | ✅ | Renderiza a vistas nativas. |
| Cordova / Capacitor / Ionic | ✅ | ✅ | Contenido WebView accesible vía a11y. |
| Kotlin Multiplatform | ⏳ | ✅ | Android nativo OK; iOS Compose en progreso. |
| Flutter | ⏳ | ⏳ | Requiere semántica activada (canvas, no vistas nativas). |

## Android nativo (Kotlin / Java)

Funciona de serie. UiAutomator expone `resource-id`, `class`, `content-desc`,
`text`, `bounds` y estados (`enabled`/`checked`/...).

- **Buenas prácticas:** pon `android:id` o `testTag`/`resource-id` estables en los
  elementos clave. En Jetpack Compose, usa `Modifier.testTag("...")` **y**
  `testTagsAsResourceId = true` (en el `SemanticsModifier` raíz) para que el
  testTag aparezca como `resource-id`.
- **Casos borde:** Compose sin `testTagsAsResourceId` no expone ids → usa
  `getByText`/`getByAccessibility`. Elementos en `RecyclerView` fuera de pantalla
  no están en el árbol hasta hacer scroll (`device.swipe`).

## iOS nativo (Swift / SwiftUI / UIKit)

Funciona vía `idb`/XCUITest.

- **Buenas prácticas:** UIKit → `view.accessibilityIdentifier = "..."`. SwiftUI →
  `.accessibilityIdentifier("...")`. Marca elementos accionables como accesibles.
- **Casos borde:** SwiftUI a veces agrupa o aplana la jerarquía; el árbol de `idb`
  puede venir plano (lista de elementos) → `getById`/`getByAccessibility` siguen
  funcionando, pero XPath con anidamiento profundo es limitado. Algunos controles
  personalizados sin `accessibilityIdentifier` solo exponen `label`.

## React Native

RN renderiza vistas nativas, así que el árbol nativo las ve.

- **Buenas prácticas:** añade `testID="..."` a los componentes. RN lo mapea a
  `resource-id` en Android y a `accessibilityIdentifier` en iOS, por lo que
  **`getByTestId` funciona en ambas plataformas**.
- **Casos borde:** en Android, `testID` solo se propaga a `resource-id` en RN
  recientes; si no aparece, usa `accessibilityLabel` → `getByAccessibility`.
  Algunos componentes (p.ej. `Text` anidado) colapsan el `testID` del padre.
  Listas virtualizadas (`FlatList`) solo exponen los ítems renderizados.

## Flutter

Flutter pinta en un lienzo; el sistema solo "ve" la UI si la **semántica de
accesibilidad** está activa.

- **Buenas prácticas:** envuelve los elementos clave en `Semantics(label: '...',
  identifier: '...')`, o usa widgets con semántica por defecto (botones, campos).
  En algunos casos conviene `SemanticsBinding.instance.ensureSemantics()`.
- **Selección:** usa `getByAccessibility(label)` o `getByText`. Los `resource-id`
  no suelen existir; el `identifier` de `Semantics` puede aparecer como id en
  versiones recientes.
- **Casos borde:** sin semántica activada, el árbol llega casi vacío (solo un
  `FlutterView`) → no hay nada que seleccionar. Mobiwright lo detecta como
  "Flutter" y conviene avisar de activar accesibilidad. El texto pintado en canvas
  sin `Semantics` no es accesible.

## WebView / apps híbridas (incl. web components)

Apps nativas que embeben web (`WebView`/`WKWebView`), Cordova/Ionic/Capacitor,
o **web components** dentro de un WebView.

- **Qué funciona out-of-the-box:** si el WebView expone accesibilidad, sus nodos
  (texto, botones, inputs, **incluido el shadow DOM de web components** si el
  navegador los proyecta a la capa de accesibilidad) aparecen en el árbol y
  `getByText`/`getByAccessibility` los alcanzan. Mobiwright **detecta el WebView**
  y lo anota en el `snapshot`.
- **Habilitar en Android:** `WebView.setWebContentsDebuggingEnabled(true)` y
  asegúrate de que la accesibilidad del WebView está activa. Para **inspección
  profunda del DOM (selectores CSS, shadow DOM cerrado)** hace falta el **Chrome
  DevTools Protocol (CDP)**: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`
  y conectar un cliente CDP. *(Bridge CDP nativo: ver Roadmap.)*
- **Habilitar en iOS:** WKWebView expone parte de la a11y; para DevTools se usa
  `Safari › Desarrollo › Simulador`. Inspección DOM programática vía CDP/WebInspector
  está en el Roadmap.
- **Casos borde:**
  - WebView sin accesibilidad → aparece como un único nodo opaco `WebView` sin
    hijos. Solución: habilitar a11y o usar el bridge CDP (roadmap).
  - **Web components con shadow DOM**: los elementos del shadow DOM *abierto* que
    el motor proyecta a accesibilidad sí se ven; el shadow DOM *cerrado* requiere
    CDP. 
  - Contenido que carga de forma asíncrona dentro del WebView: el **auto-waiting**
    de Mobiwright reintenta hasta que el nodo aparece.
  - Iframes anidados: visibles si exponen a11y; CDP para control fino.
  - Coordenadas: los taps usan el centro del nodo accesible del WebView, así que
    funcionan aunque no haya selector CSS.

## Cómo lo detecta Mobiwright

El `snapshot` del MCP incluye una línea `🧱 Framework: ...` (Android nativo, iOS
nativo, Flutter, React Native o WebView) calculada por las clases/tipos del árbol,
y `🌐 WebView detectado` si hay contenido web. Así la IA sabe qué estrategia de
selección usar sin que tú se lo digas.
