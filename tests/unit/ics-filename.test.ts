import { describe, expect, it } from "vitest";
import { icsFilename } from "../../src/server/email/notifications.ts";

describe("icsFilename", () => {
  it("nombra el archivo de calendario con el slug del taller", () => {
    expect(icsFilename("taller-norte")).toBe("reserva-taller-norte.ics");
  });

  it("mantiene el nombre que ya recibían los clientes del primer taller", () => {
    expect(icsFilename("vector-bikes")).toBe("reserva-vector-bikes.ics");
  });
});
