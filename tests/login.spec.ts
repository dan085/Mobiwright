import { test, expect } from "mobiwright";

/**
 * Flujo end-to-end de ejemplo: login completo.
 *
 * Este MISMO test corre tanto en Android como en iOS — el runner inyecta el
 * `device` adecuado según el proyecto del config. Los selectores son por
 * accessibility id / resource-id, que es lo recomendado para tests estables
 * (igual que getByTestId en Playwright web).
 */
test.describe("Autenticación", () => {
  test.beforeEach(async ({ device }) => {
    // Arrancamos siempre desde la pantalla de login.
    await device.getById("logout_button").isVisible().then(async (loggedIn) => {
      if (loggedIn) await device.getById("logout_button").tap();
    });
  });

  test("login con credenciales válidas", async ({ device }) => {
    await device.getById("email_input").fill("daniel@example.com");
    await device.getById("password_input").fill("Sup3rSecret!");
    await device.getByText("Iniciar sesión").tap();

    // Auto-waiting: espera a que aparezca el home tras la navegación.
    await expect(device.getById("home_title")).toBeVisible();
    await expect(device.getById("welcome_message")).toContainText("Bienvenido");
  });

  test("login con contraseña incorrecta muestra error", async ({ device }) => {
    await device.getById("email_input").fill("daniel@example.com");
    await device.getById("password_input").fill("mala-clave");
    await device.getByText("Iniciar sesión").tap();

    await expect(device.getById("error_banner")).toBeVisible();
    await expect(device.getById("error_banner")).toContainText("Credenciales inválidas");
    await expect(device.getById("home_title")).toBeHidden();
  });

  test.skip("recuperar contraseña (pendiente backend)", async ({ device }) => {
    await device.getByText("¿Olvidaste tu contraseña?").tap();
    await expect(device.getById("reset_email_input")).toBeVisible();
  });
});
