import { test, expect } from "mobiwright";

/**
 * Flujo de navegación que ejercita gestos (swipe), back y aserciones de conteo.
 */
test.describe("Navegación principal", () => {
  test("el carrusel de onboarding avanza con swipe", async ({ device }) => {
    await expect(device.getById("onboarding_page_1")).toBeVisible();

    await device.swipe("left");
    await expect(device.getById("onboarding_page_2")).toBeVisible();

    await device.swipe("left");
    await expect(device.getById("onboarding_page_3")).toBeVisible();

    await device.getByText("Empezar").tap();
    await expect(device.getById("home_title")).toBeVisible();
  });

  test("la lista de productos carga al menos un elemento", async ({ device }) => {
    await device.getByAccessibility("Tab Productos").tap();
    await expect(device.getByType("ProductCard")).not.toHaveCount(0);
  });

  test("el botón atrás regresa al home", async ({ device }) => {
    await device.getByAccessibility("Tab Ajustes").tap();
    await expect(device.getById("settings_title")).toBeVisible();
    await device.pressBack();
    await expect(device.getById("home_title")).toBeVisible();
  });
});
