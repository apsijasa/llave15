import { expect, test } from "@playwright/test";
import { login, SEED } from "./fixtures.ts";

test("Crear propuesta llega al servidor", async ({ page }) => {
  await login(page, "owner", `/taller/ordenes/${SEED.orderRecibidaId}/adicional`);
  await page.getByLabel("Problema").fill("Cadena desgastada");
  await page.getByLabel("Recomendación").fill("Cambiar la cadena");
  await page.getByLabel(/^Precio/).fill("25000");
  await page.getByRole("button", { name: "Crear propuesta" }).tap();
  await expect(page.getByRole("alert")).toHaveText(
    "El estado de la orden no permite proponer un adicional.",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: /^OT-\d{5} · Adicional$/ }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText('"forbidden"');
});

test("Generar informe llega al servidor", async ({ page }) => {
  await login(page, "owner", `/taller/ordenes/${SEED.orderRecibidaId}/informe`);
  await page.getByRole("button", { name: /Generar informe|Regenerar informe/ }).tap();
  await expect(page.getByRole("alert")).toHaveText(
    "El informe se genera cuando la orden está Lista para retirar o Entregada.",
  );
  await expect(page.locator("body")).not.toContainText('"forbidden"');
});
