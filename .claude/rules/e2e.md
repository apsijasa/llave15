---
description: Pruebas de tablet con Playwright
paths:
  - "e2e/**"
  - "playwright.config.ts"
---

# Pruebas de tablet (Playwright)

- Flujos de `/taller` y, por excepción declarada (BG-D19), la página pública `/<slug>/reservar` (`e2e/reservar-taller.spec.ts`, que no envía la reserva porque Turnstile necesita red). El resto del sitio público no tiene E2E con navegador (No-Objetivo).
- Un solo proyecto, `tablet`: Chromium, 820×1180, `hasTouch`, `isMobile`, `deviceScaleFactor: 2`, `locale: es-CL`, `timezoneId: America/Santiago`. Los botones y opciones se presionan con `.tap()`.
- Sin capturas ni comparaciones de píxeles: se afirman textos, roles, URL y estados.
- Corre contra el build (`node dist/server/entry.mjs` en el puerto 4322): siempre `pnpm build` antes de `pnpm test:tablet`.
- Base de datos: solo la de `E2E_DATABASE_URL` (por defecto `vector_bikes_e2e`). `e2e/global-setup.ts` se niega si el nombre no termina en `_e2e`, la crea si falta, migra desde `drizzle/`, vacía todas las tablas de `public` y siembra con los ids fijos de `e2e/fixtures.ts`: el taller Vector Bikes (desde `scripts/vector-bikes-profile.ts`) y su sucursal, y el Taller Demo E2E (`taller-demo`) con la suya. Nunca la base de desarrollo.
- `e2e/**` y `playwright.config.ts` pueden leer `process.env`: son infraestructura de pruebas (excepción declarada a la regla 11 de `AGENTS.md`).
- Los specs ubican controles por rol y nombre accesible (`getByRole`, `getByLabel`); si un control no se encuentra así, el defecto está en la página, no en el spec.
- Imágenes de prueba: se generan en el spec con sharp (`sharp({ create: … }).jpeg().toBuffer()`), nunca archivos binarios en el repo.
- Cada spec es independiente: usa sus propias filas sembradas o crea las suyas, y no afirma números de orden nuevos exactos (usa `/OT-\d{5}/`).
- Los specs solo importan `@playwright/test`, `sharp` y `e2e/fixtures.ts`; `global-setup.ts` además `hashPassword` de `src/server/auth/admin-auth.ts` y `scripts/vector-bikes-profile.ts`.
- `playwright.config.ts` lo entrega el `workspace/` del blueprint y ningún paso lo edita. `e2e/global-setup.ts` y `e2e/fixtures.ts` solo los editan los pasos que lo declaran: BG-04 (siembra del taller) y BG-33 (Taller Demo E2E).
