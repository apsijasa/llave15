import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login } from "./fixtures.ts";

function dataValue(page: Page, label: string, term: string) {
  return page
    .locator(`dl.data[aria-label="${label}"] dt`)
    .filter({ hasText: new RegExp(`^${term}$`) })
    .locator("+ dd");
}

async function createProduct(page: Page) {
  await login(page, "owner", "/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-COSTO-1");
  await page.getByLabel("Nombre", { exact: true }).fill("Lubricante E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Insumo" });
  await page.getByLabel("Costo neto", { exact: true }).fill("1500");
  await page.getByLabel("Precio neto", { exact: true }).fill("2500");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");
}

test("el dueño calcula gastos, servicio y producto sin cambiar precios", async ({ page }) => {
  await createProduct(page);
  await page.getByRole("button", { name: "Menú", exact: true }).tap();
  await page.getByRole("link", { name: "Calculadora", exact: true }).tap();
  for (const [label, value] of [
    ["Arriendo", "250000"],
    ["Servicios básicos", "50000"],
    ["Sueldos", "0"],
    ["Impuestos y patentes", "20000"],
    ["Otros gastos", "30000"],
    ["Insumos del taller", "50000"],
    ["Horas facturables al mes", "100"],
    ["Margen objetivo (%)", "30"],
  ]) {
    await page.getByLabel(label ?? "", { exact: true }).fill(value ?? "");
  }
  await page.getByRole("button", { name: "Guardar gastos", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Gastos mensuales guardados.");
  await expect(dataValue(page, "Resumen del mes", "Costo por hora")).toHaveText("$4.000");
  await page
    .getByLabel("Servicio del catálogo", { exact: true })
    .selectOption({ label: "Mantención general" });
  await page.getByLabel("Tipo de bici", { exact: true }).selectOption({ label: "MTB" });
  await page.getByLabel("Insumos del servicio", { exact: true }).fill("3000");
  await page.getByRole("button", { name: "Calcular servicio", exact: true }).tap();
  await expect(page.getByLabel("Minutos", { exact: true })).toHaveValue("90");
  for (const [term, value] of [
    ["Costo del servicio", "$9.000"],
    ["Precio neto sugerido", "$12.858"],
    ["Precio con IVA", "$15.301"],
    ["Precio de catálogo", "$35.000"],
    ["Margen actual", "74%"],
  ]) {
    await expect(dataValue(page, "Resultado del servicio", term ?? "")).toHaveText(value ?? "");
  }
  await page
    .getByLabel("Producto del inventario", { exact: true })
    .selectOption({ label: "E2E-COSTO-1 · Lubricante E2E" });
  await page.getByRole("button", { name: "Calcular producto", exact: true }).tap();
  for (const [term, value] of [
    ["Costo", "$1.500"],
    ["Precio neto sugerido", "$2.143"],
    ["Precio con IVA", "$2.550"],
    ["Margen actual", "40%"],
  ]) {
    await expect(dataValue(page, "Resultado del producto", term ?? "")).toHaveText(value ?? "");
  }
});

test("el mecánico recibe 403 en la calculadora", async ({ page }) => {
  await login(page, "mechanic");
  expect((await page.goto("/taller/calculadora"))?.status()).toBe(403);
});
