BG-23 · Páginas por token con la marca del taller

## Contexto y autorización (Andrés, 18-nov)

Paso 23 de la fase Llave 15 (decisión 57; nombre en BG-D31). Las tres páginas públicas por token —`/seguimiento/[token]`, `/aprobacion/[token]` y `/reservas/cancelar`— se arman hoy sobre `Base.astro` (la portada de Vector Bikes) y leen `SITE` y `RECEPTION_HOURS`. Después de este paso usan `PublicLayout` (BG-22) con el perfil **del taller del token**: `profileForShareToken(db, "seguimiento" | "aprobacion", token)` y `profileForCancelToken(db, token)` (BG-17). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-23 — Páginas por token con la marca del taller (E2-T7)"**, y en `tasks.json` (tarea `E2-T7`). Ese texto manda.

Diseño por paso: antes de BG-47 rige el monocromo aprobado; `PublicLayout` ya lo respeta.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/server-api.md` (páginas por token: el token es la defensa, `originForLog`, `no-store`, `noindex`, `no-referrer`, solo el primer nombre) y `.claude/rules/ui-design.md`; el bloque de BG-23 del blueprint; las tres páginas; `src/layouts/PublicLayout.astro` y `src/layouts/AppLayout.astro`; `src/server/shops/profile.ts`; `src/lib/platform.ts`; `tests/integration/tracking-page.test.ts` y `tests/integration/approval-page.test.ts` como patrón de prueba de página (no se tocan); `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-22`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluido `pnpm test:tablet e2e/seguimiento-enlace.spec.ts`), `pnpm gate` y el Checkpoint con el tag `bg-23`.

## Qué hacer

Exactamente estos cuatro archivos:

1. `src/pages/seguimiento/[token].astro` (**excepción BG-D46: esta página NO usa `PublicLayout`**): la página de seguimiento no tiene `<header>` ni `<footer>` y muestra la dirección y el horario del taller **solo cuando la orden está lista para retirar** (decisión A-01; lo afirman `tracking-page.test.ts:154` y `:209`, que no se tocan). Por eso usa `AppLayout` (`noindex`) en vez de `Base.astro`, sin encabezado ni pie, y con una vista válida resuelve `profileForShareToken(db, "seguimiento", token)`: el texto "este es el estado de tu bicicleta en …" usa `profile.name`; la dirección y el horario de recepción (cuando está lista, como hoy) salen de `profile.addressShort` y `profile.receptionHours`, no de `SITE` ni de `RECEPTION_HOURS`; y al final del contenido (dentro de `<section>`, nunca en `<footer>`) una línea `<p>` con `PLATFORM.footerLine`. Título `Seguimiento de tu bicicleta — <nombre del taller>`.
2. `src/pages/aprobacion/[token].astro`: lo mismo con `profileForShareToken(db, "aprobacion", token)`; título y descripción con el nombre del taller.
3. `src/pages/reservas/cancelar.astro`: lo mismo con `profileForCancelToken(db, token)`; los mensajes de contacto usan `profile.email`; título `Cancelar reserva — <nombre del taller>`.
4. `tests/integration/token-pages-isolation.test.ts` (nuevo): los criterios 1 a 4 con `seedTwoShops` (seguimiento, aprobación y cancelación de un token del Taller Demo: su nombre, dirección, horario o correo, la línea `Gestionado con Llave 15`, las cabeceras, y la ausencia de cualquier dato de Vector Bikes; token desconocido → 404).

**Token desconocido, inválido o con límite de intentos** (no hay taller): la página conserva su código (404 o 429) y su mensaje, y se renderiza con `AppLayout` (`noindex`) sin marca de ningún taller, con título `… — Llave 15` (`PLATFORM.name`). En la cancelación, la frase de contacto de los mensajes `started` e `invalid` usa el correo del taller cuando hay perfil; sin perfil, termina en "Si el problema sigue, contacta al taller donde hiciste la reserva." (nunca un correo literal).

Todo lo demás se conserva tal cual: las cabeceras `cache-control: no-store`, `referrer-policy: no-referrer` y `x-robots-tag` donde existen, `originForLog`, el límite de intentos, los métodos distintos de GET, el comportamiento de cada token, los códigos de respuesta y el uso de solo el primer nombre del cliente.

## Primer pase (19-nov, revertido)

El primer pase llevó también el seguimiento a `PublicLayout`, y fallaron tres pruebas de `tracking-page.test.ts`: la línea 154 (dos casos: la página no debe tener `<header>` ni `<footer>`) y la línea 209 (la dirección no aparece antes de que la orden esté lista; el pie de `PublicLayout` la mostraba siempre). Este encargo corrige el seguimiento con la excepción BG-D46; aprobación y cancelación siguen con `PublicLayout`.

Registra en `blueprints/bike-garage/blueprint.md` §20.3, después de la fila de BG-D45, la fila: `| BG-D46 | En BG-23, /seguimiento/[token] usa AppLayout sin encabezado ni pie, con el nombre del taller en el texto y la línea Gestionado con Llave 15 al final del contenido; la dirección y el horario siguen apareciendo solo con la orden lista para retirar. Aprobación y cancelación usan PublicLayout (coordinadora, 19-11-2026) | PublicLayout también en el seguimiento | La página de seguimiento no tiene encabezado ni pie y muestra la dirección solo al estar lista (decisión A-01; tracking-page.test.ts:154 y :209); la paridad prohíbe cambiar esas expectativas | El dueño pide la misma cabecera en el seguimiento |`.

Además: si una prueba nueva necesita registrar intentos fallidos con dos talleres, **no cambies el servidor**; anota en el reporte que `recordAttempt` sin sucursal falla con dos talleres en las páginas por token (la coordinadora lo trata aparte).

## Riesgo conocido

Si `tracking-page.test.ts`, `approval-page.test.ts`, `cancel-flow.test.ts`, `tests/build/seo.test.ts` u otra prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto. Los únicos valores esperados que pueden cambiar son la línea `Gestionado con Llave 15` y lo que trae el cambio de `Base.astro` a `PublicLayout` (los títulos de Vector Bikes siguen `… — Vector Bikes`).

## No cambiar

- `PublicLayout.astro`, `AppLayout.astro`, `Base.astro`, `src/server/**` (las funciones de perfil ya existen), ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.
- Regla 10 (`set:html` solo en el JSON-LD de `Base.astro`), regla 14 (ningún dato de un taller en `src/`: estas tres páginas dejan de importar `src/lib/site.ts` y no escriben "Vector Bikes"), regla 9 (elementos no-void cerrados). Las páginas no tienen SQL propio ni lógica de negocio.
- Diseño: textos y estructura de hoy salvo la marca; monocromo; sin estilos nuevos con hex.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15'` → 0; `grep -l 'lib/site.ts' 'src/pages/seguimiento/[token].astro' 'src/pages/aprobacion/[token].astro' src/pages/reservas/cancelar.astro` → sin salida.
2. Claude: el Verify completo del bloque BG-23 y `pnpm gate` → exit 0.

## Reporte

Los cuatro archivos con sus líneas, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
