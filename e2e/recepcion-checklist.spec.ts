import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("El mecánico inicia una recepción, ve qué falta del checklist y continúa a fotos y firma", async ({
  page,
}) => {
  await login(page, "mechanic");
  await page.goto("/taller/recepcion/nueva?q=Cliente Taller");
  await page.getByRole("link", { name: "Cliente Taller E2E", exact: true }).tap();
  await page
    .getByRole("group", { name: "Bicicleta", exact: true })
    .getByRole("radio", { name: /Specialized Rockhopper/ })
    .tap();
  await page.getByLabel("Servicio solicitado", { exact: true }).fill("Revisión general");
  await page.getByRole("button", { name: "Crear orden", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/ordenes\/[0-9a-f-]{36}\/recepcion$/);
  for (const label of [
    "Frenos",
    "Cadena",
    "Transmisión",
    "Ruedas",
    "Neumáticos",
    "Estado general",
  ]) {
    await page
      .getByRole("group", { name: label, exact: true })
      .getByRole("radio", { name: "OK", exact: true })
      .tap();
  }
  const continuar = page.getByRole("button", { name: "Continuar a fotos y firma", exact: true });
  // Con un punto sin marcar, guarda lo marcado y se queda diciendo qué falta.
  await continuar.tap();
  await expect(page).toHaveURL(/\/recepcion\?hecho=continuar#checklist$/);
  await expect(
    page.getByRole("status").filter({
      hasText: "Guardamos la recepción. Para seguir a fotos y firma, marca: Problemas visibles.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Falta 1 punto$/ })).toBeVisible();
  await page
    .getByRole("group", { name: "Problemas visibles", exact: true })
    .getByRole("radio", { name: "OK", exact: true })
    .tap();
  await continuar.tap();
  await expect(page).toHaveURL(/\/cierre$/);
  await expect(page.getByText("Checklist: Completo", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Fecha de entrega: Confirmada:/)).toBeVisible();
});
