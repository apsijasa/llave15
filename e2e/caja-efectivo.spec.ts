import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login } from "./fixtures.ts";

function dataValue(page: Page, term: string) {
  return page
    .locator("dl.data dt")
    .filter({ hasText: new RegExp(`^${term}$`) })
    .locator("+ dd");
}

test("Venta en efectivo con la caja abierta", async ({ page }) => {
  await login(page, "owner", "/taller/caja");
  await page.getByRole("button", { name: "Habilitar control de caja", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Control de caja habilitado.");
  await page.getByLabel("Efectivo inicial", { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Abrir caja", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Caja abierta.");

  await page.goto("/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-CAJA-1");
  await page.getByLabel("Nombre", { exact: true }).fill("Luz E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Accesorio" });
  await page.getByLabel("Costo neto", { exact: true }).fill("3000");
  await page.getByLabel("Precio neto", { exact: true }).fill("5000");
  await page.getByLabel("Stock inicial", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");

  await page.goto("/taller/ventas/nueva");
  await page.getByLabel("Producto 1", { exact: true }).selectOption({
    label: "E2E-CAJA-1 · Luz E2E · stock 2 · $5.000",
  });
  await page.getByLabel("Cantidad 1", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Calcular total", exact: true }).tap();
  await expect(dataValue(page, "Total")).toHaveText("$5.950");
  await page
    .getByRole("group", { name: "Medio de pago", exact: true })
    .getByLabel("Efectivo", { exact: true })
    .tap();
  await page.getByRole("button", { name: "Registrar venta", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText(/^Venta VM-\d{5} registrada\.$/);

  await page.goto("/taller/caja");
  const movements = page.getByRole("table", { name: "Movimientos de la sesión" });
  await expect(
    movements.getByRole("row").filter({ hasText: "Ingreso" }).filter({ hasText: "$5.950" }),
  ).toHaveCount(1);
  await expect(dataValue(page, "Esperado")).toHaveText("$15.950");
  await page.getByLabel("Efectivo contado", { exact: true }).fill("15950");
  await page.getByRole("button", { name: "Cerrar caja", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Caja cerrada. Diferencia: $0.");

  await page.getByRole("button", { name: "Desactivar control de caja", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Control de caja desactivado.");
});
