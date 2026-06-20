# Mejoras inspiradas en Mobilewright

[Mobilewright](https://github.com/mobile-next/mobilewright) (mobile-next, Apache-2.0)
es un framework maduro de automatización móvil con la misma filosofía que
Mobiwright (API estilo Playwright, auto-waiting, pensado para IA). Tras revisarlo,
adoptamos varias de sus mejores ideas. Crédito y reconocimiento a ese proyecto.

## Adoptado en Mobiwright

| Idea (Mobilewright) | Implementado aquí |
|---------------------|-------------------|
| **`getByRole(role, {name})`** con mapeo de roles a tipos nativos | ✅ `device.getByRole("button", { name: "Entrar" })` — mapea button/textfield/text/image/switch/checkbox/slider/list/header/link/listitem/tab a tipos iOS+Android. |
| **`getByText` con RegExp** | ✅ `device.getByText(/bienvenid/i)`. |
| **`getByPlaceholder`** | ✅ `device.getByPlaceholder("Buscar…")`. |
| **`getByText` exacto vs. parcial** | ✅ ya existía (`{ exact: true }`), reforzado. |
| **`scrollIntoViewIfNeeded`** | ✅ ya añadido (auditoría), coincide con su API. |
| **Orientación: `setOrientation`/`getOrientation`** | ✅ `device.setOrientation("landscape")` (Android nativo; iOS deducido/no-op documentado). |
| **App en primer plano: `getForegroundApp`** | ✅ `device.getForegroundApp()` + `isAppInForeground()` (cierra el hueco de detección de crash/background). |
| **`doctor` con remediación** | ✅ ya teníamos `mplay doctor` (+ modo remoto). |
| **Matriz de soporte por framework** | ✅ ampliada en [FRAMEWORKS.md](FRAMEWORKS.md). |
| **Encadenamiento de locators** | ✅ `getByRole("listitem").first().getByRole("button")` por contención de bounds (Android + iOS). |
| **Reporter JUnit XML** | ✅ `reporter: [["junit", { outputFile: "mplay-junit.xml" }]]`. |
| **Comando `init` (scaffold)** | ✅ `mplay init` crea `mplay.config.ts` + `tests/example.spec.ts`. |

## Diferencias de diseño (intencionadas)

- **Mobilewright** se apoya en su binario [`mobilecli`](https://github.com/mobile-next/mobilecli)
  (cliente WebSocket JSON-RPC) y ofrece nube de dispositivos reales
  (mobile-use.com). **Mobiwright** habla directo con `adb`/`simctl`/`idb` sin
  binario intermedio, y resuelve iOS remoto por **SSH**.
- Mobiwright incluye un **servidor MCP propio** con **grafo de flujos**
  (`get_flow_graph`), detección de **login/permiso/ANR/WebView/framework** y
  herramientas de exploración para que una IA recorra *todos* los flujos.

## Roadmap (también inspirado en Mobilewright)

- Driver para **device farms** / nube de dispositivos reales.
- Soporte ampliado **Flutter** (Dart VM Service) y **KMP**.
- Vídeo del flujo en **modo remoto** (SSH) — local ya implementado.
- Sharding de tests de una misma plataforma entre varios emuladores.

> **Paralelismo** (`workers > 1`) ✅ implementado: cada proyecto corre en su
> dispositivo en paralelo, con aislamiento de pasos por contexto async
> (AsyncLocalStorage) para que los traces no se mezclen.
