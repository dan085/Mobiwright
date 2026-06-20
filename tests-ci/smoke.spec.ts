import { test, expect } from "mobiwright";

/**
 * Smoke test de CI contra un emulador Android REAL, usando la app de Ajustes.
 * Valida que el AndroidDriver (adb + uiautomator) funciona de extremo a extremo:
 * arranque, volcado del árbol, locators, aserciones, gestos y screenshot.
 */
test.describe("CI smoke (emulador real)", () => {
  test("Ajustes arranca y el árbol de UI es accesible", async ({ device }) => {
    const info = await device.info();
    expect(info.platform).toBe("android");
    expect(info.screen.width > 0).toBeTruthy();

    // Hay contenido de texto en pantalla (la jerarquía se vuelca bien).
    await expect(device.getByType("android.widget.TextView").first()).toBeVisible();
  });

  test("gestos y captura funcionan", async ({ device }) => {
    // El árbol tiene nodos.
    const tree = await device.tree();
    expect(tree.children.length > 0).toBeTruthy();

    // Un gesto de scroll no debe fallar.
    await device.swipe("up");
    await device.swipe("down");

    // La captura devuelve un PNG no trivial.
    const png = await device.screenshot();
    expect(png.length > 1000).toBeTruthy();
  });

  test("doctor y orientación responden", async ({ device }) => {
    const orientation = await device.getOrientation();
    expect(orientation === "portrait" || orientation === "landscape").toBeTruthy();
  });
});
