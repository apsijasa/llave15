BG-24 · Informe, etiqueta y textos de la orden con la marca del taller

## Contexto y autorización (Andrés, 18-nov)

Paso 24 de la fase Llave 15 (decisión 57; nombre en BG-D31). El informe público `/informe/[token]` y su componente `ReportView` leen `SITE` (nombre, dirección, correo, teléfono, certificaciones y el logo `/brand/vector-bikes-logo.png`); la página del personal `/taller/ordenes/[id]/informe` titula `… — Vector Bikes` y arma el texto de WhatsApp con el nombre fijo; la etiqueta (`src/server/taller/label.ts:43`) titula `Etiqueta … — Vector Bikes`. Después de este paso, lo que ve el cliente lleva la marca del taller de la orden y lo que ve el personal lleva `PLATFORM.name` (`Llave 15`). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-24 — Informe, etiqueta y textos de la orden (E2-T8)"**, y en `tasks.json` (tarea `E2-T8`). Ese texto manda, con la excepción BG-D47 de abajo.

## Excepción BG-D47 (coordinadora, 19-nov)

Igual que el seguimiento en BG-23 (BG-D46), el informe público **no tiene `<header>` ni `<footer>`** (`tests/integration/report-page.test.ts:179` y `report-view-brand.test.ts:69` lo afirman y no se tocan). Por eso `/informe/[token]` **no usa `PublicLayout`**: usa `AppLayout` (`noindex`), conserva su estructura de hoy (el logo en `<p class="report-brand">` antes del `<h1>`) y agrega al final del contenido, dentro de la `<section>` y nunca en `<footer>`, un `<p>` con `PLATFORM.footerLine`.

El logo sale de `profile.logoPath` (`/<slug>/logo`, `null` si el taller no tiene logo; sin logo, no hay `<img>`). En producción Vector Bikes tiene logo (lo guardó `bg:backfill`), pero la siembra de pruebas no. **Siembra declarada (no cuenta):** `tests/integration/report-page-brand.test.ts` e `tests/integration/informe-mantencion-page.test.ts` agregan en su preparación un `update` de `shops` que pone `logo_key` al taller `vector-bikes` (por ejemplo `shops/<id>/logo.png`), para que su logo se sirva desde `/vector-bikes/logo`. Esa línea de siembra y el cambio declarado de la URL del logo son lo único que cambia en esas dos pruebas.

Registra en `blueprints/bike-garage/blueprint.md` §20.3, después de la fila de BG-D46, la fila: `| BG-D47 | En BG-24, /informe/[token] usa AppLayout sin encabezado ni pie, con el logo del perfil antes del h1 y la línea Gestionado con Llave 15 al final del contenido; report-page-brand.test.ts e informe-mantencion-page.test.ts siembran el logo_key de Vector Bikes, como en producción tras bg:backfill (coordinadora, 19-11-2026) | PublicLayout también en el informe; seguir sirviendo /brand/vector-bikes-logo.png | El informe no tiene encabezado ni pie (report-page.test.ts:179); el logo del taller se sirve desde /<slug>/logo (BG-17) y la siembra de pruebas no tenía logo | El dueño pide la misma cabecera en el informe |`.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/ui-design.md`, `.claude/rules/taller-ui.md`, `.claude/rules/server-api.md`; el bloque de BG-24 del blueprint y el párrafo de apertura de la épica 02; `src/pages/informe/[token].astro`, `src/components/taller/ReportView.astro`, `src/pages/taller/ordenes/[id]/informe.astro`, `src/server/taller/label.ts`; `src/pages/seguimiento/[token].astro` (cómo quedó BG-D46, patrón a repetir); `src/layouts/AppLayout.astro`; `src/server/shops/profile.ts` (`profileForShareToken(db, "informe", token)`, `profileForBranch`); `src/lib/platform.ts`; las pruebas nombradas en el Verify (solo lectura salvo lo declarado); `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-23`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluido `pnpm test:tablet e2e/etiqueta.spec.ts`), `pnpm gate` y el Checkpoint con el tag `bg-24`.

## Qué hacer

Cinco archivos escritos a mano:

1. `src/components/taller/ReportView.astro`: recibe `brand` ya formateado (`{ name, addressShort, email, phoneDisplay, certifications, logoPath }`) como prop, en vez de `SITE` (líneas ~117-118). No importa `src/server/**` ni `src/lib/site.ts`.
2. `src/pages/informe/[token].astro`: con un informe válido, resuelve `profileForShareToken(db, "informe", token)` y renderiza con `AppLayout` según BG-D47 (logo del perfil, título `Informe de servicio — <nombre del taller>`, `ReportView` con la marca del perfil, la línea `PLATFORM.footerLine` al final). Token desconocido, inválido o con límite: mismo código y mensaje de hoy, título `… — Llave 15`, sin marca de ningún taller.
3. `src/pages/taller/ordenes/[id]/informe.astro`: título `<número> · Informe — Llave 15` (`PLATFORM.name`); el texto de WhatsApp (línea ~111) usa el nombre del perfil de la sucursal del usuario (`profileForBranch(db, user.branchId)`); pasa a `ReportView` la marca del mismo perfil.
4. `src/server/taller/label.ts`: el título de la etiqueta es `Etiqueta <número> — Llave 15` (`PLATFORM.name`).
5. `tests/integration/report-brand-isolation.test.ts` (nuevo): los criterios 1 a 4 con `seedTwoShops`.

Firma y siembra declaradas (no cuentan; **los únicos cambios permitidos en pruebas existentes**):

- `tests/integration/report-view-brand.test.ts`: pasa a `ReportView` la marca armada con los valores que hoy fija su `vi.mock` de `src/lib/site.ts`, **quita ese `vi.mock` y deja de importar `src/lib/site.ts`**; sus expectativas no cambian.
- `tests/integration/report-page-brand.test.ts` e `tests/integration/informe-mantencion-page.test.ts`: la siembra del `logo_key` de Vector Bikes (BG-D47) y la URL del logo `/brand/vector-bikes-logo.png` → `/vector-bikes/logo` en sus expectativas. Nada más.

En las pruebas existentes, **ninguna cola de matcher** cambia salvo lo declarado: `Gestionado con Llave 15`, el logo `/vector-bikes/logo` y los títulos del personal `… — Llave 15` (informe del personal y etiqueta).

## Riesgo conocido

Si `report-page.test.ts`, `report-view.test.ts`, `label.test.ts` u otra prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto. Nunca uses `getDb()` como respaldo fuera de la página (las páginas ya lo usan). No cambies el servidor de `recordAttempt`.

## No cambiar

- El snapshot v1 del informe, los tokens, las cabeceras (`no-store`, `no-referrer`, `x-robots-tag`), `originForLog`, el límite de intentos, los códigos de respuesta, el uso de solo el primer nombre.
- `AppLayout`, `PublicLayout`, `Base.astro`, `src/server/shops/**`; ninguna otra prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.
- Regla 10, regla 14 (las cuatro páginas y archivos tocados dejan de importar `src/lib/site.ts` y no escriben "Vector Bikes"), regla 9. Diseño monocromo, sin hex nuevos. Archivos bajo 400 líneas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` → 0; `grep -q 'lib/site.ts' tests/integration/report-view-brand.test.ts` → 1.
2. Claude: el Verify completo del bloque BG-24 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
