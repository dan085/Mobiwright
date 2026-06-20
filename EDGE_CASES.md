# Situaciones borde consideradas (Android e iOS)

Resumen de los casos límite que Mobiwright contempla y cómo los maneja. La
verificación automática de geometría/tamaños vive en
[`tests/device-sizes.check.cjs`](tests/device-sizes.check.cjs) (`npm run verify`).

## Tamaños y orientación de dispositivo

| Situación | Manejo |
|-----------|--------|
| Cualquier resolución (320×480 … 1600×2560 …) | Las acciones por *locator* leen los `bounds` reales del árbol vivo y tocan el centro del elemento → **independientes del tamaño**. Verificado en 5 resoluciones. |
| Landscape / rotación | Igual: los bounds reflejan la orientación actual; el swipe usa el área real. |
| Coordenadas float | Se redondean a enteros antes de `input swipe`/`tap`. |
| Swipe de pantalla completa | Área tomada de `wm size` (Android). En iOS (puntos lógicos, size 0) se deduce del nodo raíz/árbol. Fallback 400×800. |
| Elemento de tamaño 0 / invisible | El auto-waiting solo lo considera accionable si `width>0 && height>0`. |

## Android — situaciones borde

| Situación | Manejo |
|-----------|--------|
| `adb` no está en el PATH | Error claro con instrucción de instalación. |
| Ningún dispositivo | Mensaje accionable (arranca un AVD). |
| Dispositivo **unauthorized** | Detectado: pide aceptar el diálogo de depuración USB. |
| Dispositivo **offline** | Detectado: sugiere `adb kill-server && adb start-server`. |
| Varios dispositivos | Usa `deviceSerial` del config; si no, el primero. |
| `uiautomator dump` con "null root" durante animaciones | Reintenta hasta 3 veces. |
| `/sdcard` no escribible (scoped storage) | Fallback a `/data/local/tmp`. |
| Jerarquía XML inválida/vacía | Detectada; error claro tras reintentos. |
| Texto con espacios / caracteres especiales (`()<>|;&*~"'`$`) | Escapado para `input text`; espacio → `%s`. |
| Unicode / emojis | Limitación conocida de `adb input text`; documentado (usar ADBKeyBoard IME). |
| App no instalada | `install -r -g` valida "Success"; error si falla. |
| Captura de pantalla | `exec-out screencap -p` (binario por stdout). |
| Boot incompleto del emulador | Espera `sys.boot_completed` hasta 60 s. |

## iOS — situaciones borde

| Situación | Manejo |
|-----------|--------|
| No es macOS (Windows/Linux) | iOS no se emula localmente: se ejecuta en un **Mac remoto por SSH** (`remoteHost`). Avisado por `doctor`. |
| Ningún simulador booteado | Error claro (`open -a Simulator`). |
| `idb` no instalado | `dumpTree`/gestos dan error claro pidiendo instalar idb. |
| Salida de idb en JSON **o** XML | Se soportan ambos formatos. |
| Varios simuladores booteados | Usa `deviceUdid`; si no, el primer "Booted". |
| Coordenadas en puntos lógicos | Tratadas como tales; tamaño deducido del árbol cuando hace falta. |
| App por bundle id | `simctl install` + `simctl launch` con validación. |

## Ejecución remota (SSH) — situaciones borde

| Situación | Manejo |
|-----------|--------|
| Host inalcanzable / clave SSH | `BatchMode=yes`; `doctor` reporta el fallo de conexión (código ≠ 0). |
| Argumentos con espacios/caracteres | `shellQuote` POSIX por argumento. |
| Captura binaria por SSH | Sin TTY: el PNG viaja íntegro por stdout. |
| Host key desconocida | `StrictHostKeyChecking=accept-new`. |

## Runner / auto-waiting — situaciones borde

| Situación | Manejo |
|-----------|--------|
| Fallo transitorio del volcado del árbol | `tap`/`fill`/`expect` lo tratan como "todavía no" y reintentan hasta el timeout. |
| Dispositivo no disponible al iniciar | Marca los tests del proyecto como fallidos con mensaje claro y sigue con el resto. |
| Timeout de test | `Promise.race` con mensaje del título y límite. |
| Fallo en `afterEach` | No enmascara el error real del test. |
| Reintentos | Reinician la app para partir de un estado limpio. |
| Limpieza de trace con FS bloqueado (Windows/locks) | Borrado *best-effort* (no rompe el test). |

## Login / revisión de flujo — situaciones borde

| Situación | Manejo |
|-----------|--------|
| Pantalla exige login | `detectLoginWall` lo detecta y la IA avisa "se necesita login para ingresar". |
| Sin credenciales | La tool `login` solo informa; **no** autentica. |
| Con credenciales | Rellena usuario/contraseña y envía; detección automática de campos o selectores explícitos. |
| No hay formulario de login | Lo indica en vez de fallar a ciegas. |
