import { test, expect } from "mobiwright";

/**
 * Demo ejecutable SIN emulador real (driver mock). Pruébalo con:
 *   MOBIWRIGHT_MOCK=1 npx mplay test --grep="demo"
 *
 * Simula el flujo de login completo: rellenar credenciales, entrar, y verificar
 * la pantalla de inicio.
 */
test.describe("demo", () => {
  test("login mock: entra con credenciales correctas", async ({ device }) => {
    await device.getById("email_input").fill("daniel@example.com");
    await device.getById("password_input").fill("Sup3rSecret!");
    await device.getByText("Iniciar sesión").tap();

    await expect(device.getById("home_title")).toBeVisible();
    await expect(device.getById("welcome_message")).toContainText("Bienvenido");
  });

  test("login mock: contraseña incorrecta muestra error", async ({ device }) => {
    await device.getById("email_input").fill("daniel@example.com");
    await device.getById("password_input").fill("clave-mala");
    await device.getByText("Iniciar sesión").tap();

    await expect(device.getById("error_banner")).toContainText("inválidas");
    await expect(device.getById("home_title")).toBeHidden();
  });
});
