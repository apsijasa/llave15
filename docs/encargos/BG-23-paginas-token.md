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

1. `src/pages/seguimiento/[token].astro`: con una vista válida, resuelve `profileForShareToken(db, "seguimiento", token)` y renderiza con `PublicLayout` (`noindex`), pasando el perfil ya formateado (`name`, `logoPath`, `addressShort`, `email`). El texto "este es el estado de tu bicicleta en …", la dirección y el horario de recepción salen del perfil (`profile.name`, `profile.addressShort`, `profile.receptionHours`), no de `SITE` ni de `RECEPTION_HOURS`. Título `Seguimiento de tu bicicleta — <nombre del taller>`.
2. `src/pages/aprobacion/[token].astro`: lo mismo con `profileForShareToken(db, "aprobacion", token)`; título y descripción con el nombre del taller.
3. `src/pages/reservas/cancelar.astro`: lo mismo con `profileForCancelToken(db, token)`; los mensajes de contacto usan `profile.email`; título `Cancelar reserva — <nombre del taller>`.
4. `tests/integration/token-pages-isolation.test.ts` (nuevo): los criterios 1 a 4 con `seedTwoShops` (seguimiento, aprobación y cancelación de un token del Taller Demo: su nombre, dirección, horario o correo, la línea `Gestionado con Llave 15`, las cabeceras, y la ausencia de cualquier dato de Vector Bikes; token desconocido → 404).

**Token desconocido, inválido o con límite de intentos** (no hay taller): la página conserva su código (404 o 429) y su mensaje, y se renderiza con `AppLayout` (`noindex`) sin marca de ningún taller, con título `… — Llave 15` (`PLATFORM.name`). En la cancelación, la frase de contacto de los mensajes `started` e `invalid` usa el correo del taller cuando hay perfil; sin perfil, termina en "Si el problema sigue, contacta al taller donde hiciste la reserva." (nunca un correo literal).

Todo lo demás se conserva tal cual: las cabeceras `cache-control: no-store`, `referrer-policy: no-referrer` y `x-robots-tag` donde existen, `originForLog`, el límite de intentos, los métodos distintos de GET, el comportamiento de cada token, los códigos de respuesta y el uso de solo el primer nombre del cliente.

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
