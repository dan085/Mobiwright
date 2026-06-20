/**
 * Verificación de casos borde de TAMAÑOS DE DISPOSITIVO y geometría de gestos.
 * No requiere emulador: usa drivers de registro en memoria.
 *
 *   npm run build && npm run verify
 *
 * Comprueba que, a cualquier resolución/orientación:
 *   - los swipes caen dentro de la pantalla y con coordenadas enteras,
 *   - la dirección del swipe es correcta,
 *   - el tap acierta el centro del elemento (independiente del tamaño),
 *   - en iOS (puntos lógicos, screen 0) el tamaño se deduce del árbol,
 *   - los selectores (nth/text/id/xpath) y la detección de login funcionan.
 */
const path = require("path");
const B = path.join(__dirname, "..", "dist");
const { Device } = require(path.join(B, "core/device"));
const { center } = require(path.join(B, "drivers/driver"));
const { matchOne, matchAll } = require(path.join(B, "core/query"));
const { detectLoginWall } = require(path.join(B, "mcp/snapshot"));

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("  ✗ " + m); } };
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

function node(id, text, x, y, w, h, type = "View") {
  return { ref: id, text, id, accessibility: text, type, bounds: { x, y, width: w, height: h }, enabled: true, focused: false, selected: false, checked: false, children: [] };
}
function rec(tree, screen) {
  const c = { taps: [], swipes: [] };
  return {
    driver: {
      capabilities: { platform: "android" },
      async launch() {}, async close() {},
      async info() { return { platform: "android", serialOrUdid: "x", model: "M", osVersion: "1", screen }; },
      async dumpTree() { return tree; }, async screenshot() { return PNG; },
      async tap(p) { c.taps.push(p); }, async doubleTap() {}, async longPress() {},
      async swipe(f, t) { c.swipes.push([f, t]); },
      async swipeDirection(a, d) {
        const cx = a.x + a.width / 2, cy = a.y + a.height / 2, dx = a.width * 0.4, dy = a.height * 0.4;
        const m = { up: [{ x: cx, y: cy + dy }, { x: cx, y: cy - dy }], down: [{ x: cx, y: cy - dy }, { x: cx, y: cy + dy }], left: [{ x: cx + dx, y: cy }, { x: cx - dx, y: cy }], right: [{ x: cx - dx, y: cy }, { x: cx + dx, y: cy }] };
        c.swipes.push(m[d].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
      },
      async typeText() {}, async pressKey() {}, async launchApp() {}, async terminateApp() {}, async installApp() {}, async uninstallApp() {},
    },
    cap: c,
  };
}

(async () => {
  ok(center({ x: 0, y: 0, width: 100, height: 40 }).x === 50, "center x");
  ok(center({ x: 10, y: 20, width: 101, height: 41 }).y === 41, "center redondea");

  const sizes = [["small", 320, 480], ["phone", 1080, 2340], ["phablet", 1440, 3200], ["tablet", 1600, 2560], ["landscape", 2340, 1080]];
  for (const [name, w, h] of sizes) {
    const btn = node("btn", "OK", Math.round(w / 2 - 50), Math.round(h / 2 - 20), 100, 40, "Button");
    const root = { ...node("root", "", 0, 0, w, h, "Root"), children: [btn] };
    const { driver, cap } = rec(root, { width: w, height: h });
    const dev = new Device(driver, 3000);
    for (const d of ["up", "down", "left", "right"]) await dev.swipe(d);
    let allIn = true, allInt = true;
    for (const [f, t] of cap.swipes) for (const p of [f, t]) {
      if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) allIn = false;
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) allInt = false;
    }
    ok(allIn, `${name} swipes dentro de pantalla`);
    ok(allInt, `${name} swipes con enteros`);
    ok(cap.swipes[0][0].y > cap.swipes[0][1].y, `${name} 'up' abajo->arriba`);
    ok(cap.swipes[3][0].x < cap.swipes[3][1].x, `${name} 'right' izq->der`);
    await dev.getById("btn").tap();
    const tp = cap.taps[cap.taps.length - 1];
    ok(tp.x === btn.bounds.x + 50 && tp.y === btn.bounds.y + 20, `${name} tap acierta centro`);
  }

  // iOS: screen 0, deducir tamaño del árbol
  const child = node("b", "X", 0, 1180, 400, 40, "Button");
  const root2 = { ...node("root", "", 0, 0, 0, 0, "Application"), children: [child] };
  const { driver: d2, cap: c2 } = rec(root2, { width: 0, height: 0 });
  await new Device(d2, 3000).swipe("up");
  ok(c2.swipes[0][0].y <= 1220 && c2.swipes[0][0].y > 0, "iOS deduce alto del árbol");

  // queries
  const list = { ...node("root", "", 0, 0, 400, 800), children: [
    node("com.app:id/row", "Hola mundo", 0, 0, 400, 40, "TextView"),
    node("com.app:id/row", "Adios", 0, 40, 400, 40, "TextView"),
    node("com.app:id/email_input", "", 0, 80, 400, 40, "EditText")] };
  ok(matchAll(list, { strategy: "text", value: "Hola" }).length === 1, "text parcial");
  ok(matchOne(list, { strategy: "id", value: "email_input" }), "id sufijo");
  ok(matchAll(list, { strategy: "type", value: "TextView" }).length === 2, "type");
  ok(matchOne(list, { strategy: "xpath", value: "//TextView[@text='Adios']" }), "xpath eq");
  ok(matchOne(list, { strategy: "text", value: "o", index: 1 }).text === "Adios", "nth index");

  // login detection
  const loginScreen = { ...node("root", "", 0, 0, 400, 800), children: [
    node("com.app:id/password", "", 0, 0, 400, 40, "EditText"),
    node("com.app:id/btn", "Iniciar sesión", 0, 40, 400, 40, "Button")] };
  ok(detectLoginWall(loginScreen), "detecta login");
  ok(!detectLoginWall(list), "sin falso positivo");

  console.log(fails === 0 ? "TODOS LOS CASOS BORDE OK ✓" : `${fails} FALLOS ✗`);
  process.exit(fails ? 1 : 0);
})();
