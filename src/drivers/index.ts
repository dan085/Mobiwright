import { Driver } from "./driver";
import { AndroidDriver } from "./android";
import { IosDriver } from "./ios";
import { MockDriver } from "./mock";
import { DriverCapabilities } from "../types";

export { Driver, center } from "./driver";
export { AndroidDriver } from "./android";
export { IosDriver } from "./ios";
export { MockDriver } from "./mock";

/** Fábrica de drivers: instancia el driver correcto según la plataforma. */
export function createDriver(caps: DriverCapabilities): Driver {
  // Modo demostración sin dispositivo: MOBIWRIGHT_MOCK=1 o platform "mock".
  if (process.env.MOBIWRIGHT_MOCK === "1" || (caps.platform as string) === "mock") {
    return new MockDriver(caps);
  }
  switch (caps.platform) {
    case "android":
      return new AndroidDriver(caps);
    case "ios":
      return new IosDriver(caps);
    default:
      throw new Error(`Plataforma no soportada: ${(caps as { platform: string }).platform}`);
  }
}
