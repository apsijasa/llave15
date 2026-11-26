import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { login, SEED } from "./fixtures.ts";

async function completeChecklist(page: Page) {
  for (const label of [
    "Frenos",
    "Cadena",
    "Transmisión",
    "Ruedas",
    "Neumáticos",
    "Estado general",
    "Problemas visibles",
  ]) {
    await page
      .getByRole("group", { name: label, exact: true })
      .getByRole("radio", { name: "OK", exact: true })
      .tap();
  }
}

async function prepareReception(page: Page) {
  await login(page, "owner");
  await page.goto("/taller/reservas");
  await page
    .getByRole("row", { name: /Pedro Reserva/ })
    .getByRole("link", { name: "Recibir", exact: true })
    .tap();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Pedro Reserva");
  await page.getByRole("radio", { name: "Ruta", exact: true }).tap();
  await page.getByRole("button", { name: "Crear orden", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/ordenes\/[0-9a-f-]{36}\/recepcion$/);
  await expect(page.getByRole("heading", { name: /OT-\d{5}/, level: 1 })).toBeVisible();
  await expect(page.getByText("Creado", { exact: true })).toBeVisible();
  await completeChecklist(page);
  await expect(page.getByRole("option", { name: /Ajuste de frenos/ })).toHaveAttribute(
    "value",
    SEED.serviceFrenosId,
  );
  await page
    .getByLabel("Servicio del catálogo", { exact: true })
    .selectOption(SEED.serviceFrenosId);
  await page.getByLabel("Accesorio", { exact: true }).fill("Luz trasera");
  // Un solo botón guarda checklist, servicio, accesorio y fecha, y lleva a Fotos y firma.
  await expect(page.getByRole("button", { name: "Guardar checklist" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmar fecha" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar a fotos y firma", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/ordenes\/[0-9a-f-]{36}\/cierre$/);
}

async function expectSavedReception(page: Page) {
  await page.getByRole("link", { name: "Recepción", exact: true }).tap();
  await expect(page.getByRole("cell", { name: "Ajuste de frenos", exact: true })).toBeVisible();
  await expect(page.getByText("Luz trasera", { exact: true })).toBeVisible();
}

async function chooseReceptionPhotos(page: Page) {
  const photos = [];
  for (let index = 0; index < 4; index++) {
    photos.push({
      name: `recepcion-${index + 1}.jpg`,
      mimeType: "image/jpeg",
      buffer: await sharp({
        create: {
          width: 640,
          height: 480,
          channels: 3,
          background: { r: 60 + index * 40, g: 100, b: 140 },
        },
      })
        .jpeg()
        .toBuffer(),
    });
  }
  // Fotos y firma ofrece dos botones: la cámara en la página y la galería.
  await expect(page.getByRole("button", { name: "Sacar fotos", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tomar foto", { exact: true })).toHaveCount(0);
  const input = page.getByLabel("Elegir de la galería", { exact: true });
  await expect(input).toBeEnabled();
  // En Fotos y firma las fotos esperan al único botón "Guardar": no hay un "Subir" aparte.
  await input.setInputFiles(photos);
  await expect(page.getByText("4 fotos listas para guardar", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Subir \d+ fotos?$/ })).toHaveCount(0);
}

async function expectSavedPhotos(page: Page) {
  const thumbnails = page.getByRole("img", { name: /^Foto de recepción \d$/ });
  await expect(thumbnails).toHaveCount(4);
  for (let index = 0; index < 4; index++) {
    await expect(
      page.getByRole("img", { name: `Foto de recepción ${index + 1}`, exact: true }),
    ).toHaveAttribute("src", /^\/taller\/media\//);
  }
  await expect(page.getByText("Fotos de recepción (4): Completas", { exact: true })).toBeVisible();
}

async function drawSignature(page: Page) {
  const canvas = page.getByLabel("Firma del cliente", { exact: true });
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("No se encontró el panel de firma.");
  const x = bounds.x + bounds.width * 0.2;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + bounds.width * 0.15, y - 35, { steps: 12 });
  await page.mouse.move(x + bounds.width * 0.3, y + 35, { steps: 12 });
  await page.mouse.move(x + bounds.width * 0.5, y - 15, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByLabel("Firma registrada", { exact: true })).toHaveValue(
    /^data:image\/png;base64,/,
  );
}

test("El dueño completa la recepción de Pedro Reserva con cuatro fotos y firma", async ({
  page,
}) => {
  await prepareReception(page);
  await expect(page.getByText("Checklist: Completo", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Fecha de entrega: Confirmada:/)).toBeVisible();
  await chooseReceptionPhotos(page);
  await page.getByLabel("Nombre de quien firma", { exact: true }).fill("Pedro Reserva");
  const incompleteResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/cierre"),
  );
  // "Guardar" sube primero las fotos y después envía firma y nombre.
  await page.getByRole("button", { name: "Guardar", exact: true }).tap();
  expect((await incompleteResponse).status()).toBe(422);
  await expect(page.getByRole("alert")).toHaveText("Falta la firma del cliente");
  // Las fotos quedaron guardadas aunque faltara la firma: no hay que sacarlas de nuevo.
  await expectSavedPhotos(page);
  await expect(page.getByText("Creado", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/cierre$/);
  await drawSignature(page);
  await page.getByRole("button", { name: "Borrar", exact: true }).tap();
  await expect(page.getByLabel("Firma registrada", { exact: true })).toHaveValue("");
  await drawSignature(page);
  await page.getByRole("button", { name: "Guardar", exact: true }).tap();
  await expect(page).toHaveURL(/\/recepcion\?hecho=recibida$/);
  await expect(page.getByText("Creado", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Recepción finalizada$/ }),
  ).toBeVisible();
  await expectSavedReception(page);
});
