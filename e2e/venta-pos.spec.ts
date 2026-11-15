import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("Venta de mostrador cobrada con POS Getnet en tablet", async ({ page }) => {
  await login(page, "owner", "/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-POS-1");
  await page.getByLabel("Nombre", { exact: true }).fill("Luz trasera E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Accesorio" });
  await page.getByLabel("Costo neto", { exact: true }).fill("2000");
  await page.getByLabel("Precio neto", { exact: true }).fill("4000");
  await page.getByLabel("Stock inicial", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");

  await page.goto("/taller/ventas/nueva");
  await page.getByLabel("Producto 1", { exact: true }).selectOption({
    label: "E2E-POS-1 · Luz trasera E2E · stock 2 · $4.000",
  });
  await page
    .getByRole("group", { name: "Medio de pago", exact: true })
    .getByLabel("POS", { exact: true })
    .tap();
  await page.getByRole("button", { name: "Registrar venta", exact: true }).tap();
  await expect(page.locator("#posProvider-error")).toHaveText(
    "Elige el proveedor del POS solo cuando pagas con POS.",
  );

  await page
    .getByRole("group", { name: "Medio de pago", exact: true })
    .getByLabel("POS", { exact: true })
    .tap();
  await page.getByLabel("Proveedor del POS", { exact: true }).selectOption({ label: "Getnet" });
  await page.getByRole("button", { name: "Registrar venta", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/ventas\?hecho=sale&venta=VM-\d{5}$/);
  const sale = page.getByRole("row").filter({ hasText: "$4.760" });
  await expect(sale.getByRole("cell", { name: "POS · Getnet", exact: true })).toBeVisible();
});
