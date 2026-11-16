import { expect, test } from "@playwright/test";
import { login, SEED } from "./fixtures.ts";

test("el dueño cambia la fecha de entrega desde la orden", async ({ page }) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const future = new Date(`${today}T12:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 10);
  const date = future.toISOString().slice(0, 10);

  await login(page, "owner", `/taller/ordenes/${SEED.orderControlId}`);
  const field = page.getByRole("textbox", { name: "Fecha de entrega", exact: true });
  await field.fill(date);
  await page.getByRole("button", { name: "Guardar y avisar al cliente", exact: true }).tap();
  await expect(
    page.getByRole("status").filter({ hasText: "Fecha de entrega guardada." }),
  ).toBeVisible();
  await expect(field).toHaveValue(date);
});
