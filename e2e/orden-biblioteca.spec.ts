import { expect, test } from "@playwright/test";
import { login, SEED } from "./fixtures.ts";

test("El mecánico consulta la biblioteca desde su orden y guarda un diagnóstico", async ({
  page,
}) => {
  const path = `/taller/ordenes/${SEED.orderRecibidaId}/biblioteca`;
  await login(page, "mechanic", path);
  await expect(page.getByRole("heading", { name: "Contexto técnico", level: 2 })).toBeVisible();
  await page
    .getByLabel("Síntoma o pregunta")
    .fill("¿Cómo identifico el RD-M8100-SGS de 12 velocidades?");
  await page.getByRole("button", { name: "Consultar", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Confianza", level: 2 })).toBeVisible();
  const sources = page.getByRole("region", { name: "Fuentes" });
  await expect(sources.getByRole("link").first()).toBeVisible();
  const add = page.getByRole("region", { name: "Agregar al diagnóstico" });
  await add.getByLabel("Reproducir el síntoma de forma segura").tap();
  await add.getByRole("button", { name: "Agregar al diagnóstico", exact: true }).tap();
  await expect(page).toHaveURL(/hecho=diagnostico/);
  await expect(page.getByRole("status")).toHaveText("Diagnóstico guardado.");
  const list = page.getByRole("region", { name: "Diagnósticos de esta orden" });
  await expect(list.getByText("Borrador", { exact: true })).toBeVisible();
});

test("La biblioteca de una orden inexistente responde 404", async ({ page }) => {
  await login(page, "mechanic", "/taller");
  const response = await page.request.get(
    "/taller/ordenes/00000000-0000-4000-8000-0000000000ff/biblioteca",
  );
  expect(response.status()).toBe(404);
});
