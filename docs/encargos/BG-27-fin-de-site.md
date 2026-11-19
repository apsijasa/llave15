BG-27 · Páginas heredadas, marca del personal y fin de `SITE` (excepción declarada)

## Contexto y autorización (Andrés, 18-nov)

Paso 27 de la fase Llave 15 (decisión 57; nombre en BG-D31), **excepción mecánica BG-D6**: toca muchos archivos, pero cada cambio es mecánico. Al terminar, `src/lib/site.ts` y `src/lib/faq.ts` no existen, nadie los importa, el personal ve `Llave 15` en títulos y menú, y lo que va al cliente usa el nombre del taller del perfil. El paso completo, con su lista de archivos, sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-27 — Páginas heredadas, marca del personal y fin de `SITE` (E2-T11) — excepción declarada"**, y en `tasks.json` (tarea `E2-T11`). Ese texto manda, con lo de abajo.

## Lo que BG-27 hereda de BG-D45 (léelo: no está en el bloque del blueprint)

BG-D45 (fila en §20.3) dejó un respaldo transitorio: los avisos de reserva de `src/server/email/notifications.ts` reciben `db?` y, **sin `db`**, arman una marca heredada con `SITE`; `buildIcs(booking, sequence, profile?)` usa `SITE` si no hay perfil; y `render(subject, content, brand?)` de `src/server/email/templates.ts` usa `SITE` si no hay marca. Su "Would reverse if" dice: **"BG-27 borra SITE: db pasa a ser obligatorio y esas pruebas pasan la base"**. Por eso, en este paso:

- `notifyBookingCreated`, `notifyBookingCancelled` y `notifyBookingRescheduled`: `db: AppDb` **obligatorio** (sigue al final, en la misma posición); sale la marca heredada.
- `buildIcs(booking, sequence, profile)`: `profile` obligatorio; sale `SITE`.
- `render(subject, content, brand)`: `brand` obligatorio; sale `SITE`. Si alguna plantilla todavía llama `render` sin marca, pásale la suya (todas la reciben desde BG-18 a BG-21).
- **Firma declarada de BG-D45 (no cuenta):** `tests/integration/email.test.ts` pasa `test.db` como último argumento en sus llamadas a los tres avisos (líneas ~102, 116, 147, 170, 193, 214) y pasa a `buildIcs` (línea ~222) el perfil de Vector Bikes (`await profileForBranch(test.db, booking.branchId)`). Solo eso; ninguna cola de matcher.
- Si otra prueba existente llama a esos avisos, a `buildIcs` o a `render` sin el argumento que ahora es obligatorio, aplica el mismo cambio de firma y **repórtalo** (archivo y línea).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-ui.md` (títulos del personal con `PLATFORM.name`; marca del menú `Llave 15 · Taller` hasta BG-48; un texto al cliente usa el perfil de la sucursal del usuario), `.claude/rules/ui-design.md`, `.claude/rules/server-api.md`; el bloque de BG-27 del blueprint, BG-D6, BG-D14 y BG-D45; `src/lib/site.ts`, `src/lib/faq.ts`; `web/vector-bikes/src/content/site.ts` (`VECTOR_BIKES_SITE`, BG-26); `src/lib/platform.ts`; `src/layouts/AppLayout.astro`, `TallerLayout.astro`, `Base.astro`; `src/server/shops/profile.ts`; `src/server/email/notifications.ts`, `templates.ts`; `tests/helpers/shops.ts` (el accesorio `SITE` de pruebas sigue existiendo y no se toca).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-26`). Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` y `pnpm test:tablet` incluidos), `pnpm gate` y el Checkpoint con el tag `bg-27`.

## Qué hacer

Encuentra todo importador con `grep -rln 'lib/site.ts' src tests e2e` (hoy son unos 40) y deja cada uno así:

1. **Páginas heredadas:** `src/pages/index.astro` y `src/pages/privacidad.astro` toman su contenido de `VECTOR_BIKES_SITE` (excepción BG-D14); `src/pages/404.astro` titula `Página no encontrada — Llave 15` (`PLATFORM.name`) y no escribe datos de ningún taller.
2. **`src/lib/whatsapp.ts` (nuevo):** `whatsappHref` copiada tal cual desde `src/lib/site.ts`. `Base.astro`, `Landing.astro` y quien la use la importan de ahí. `Base.astro` toma el FAQ de `VECTOR_BIKES_SITE`.
3. **Borrar** `src/lib/site.ts` y `src/lib/faq.ts`.
4. **`src/layouts/TallerLayout.astro`:** sobre `AppLayout` (no `Base.astro`), marca del menú `{PLATFORM.name} · Taller`.
5. **`src/pages/admin/login.astro`:** sobre `AppLayout`, título `Ingresar — Llave 15`.
6. **Cada página de `src/pages/taller/**` y `src/pages/admin/**`** con `— Vector Bikes`, `· Vector Bikes` o `SITE.name`: en `title=` y en marcas del personal → `PLATFORM.name`; en un texto que va al cliente (WhatsApp, cotización) → el nombre del perfil de `profileForBranch(db, user.branchId)`.
7. **`src/server/email/notifications.ts` y `templates.ts`:** lo de BG-D45 arriba.
8. **Pruebas (firma de import, no cuentan):** `tests/integration/low-stock.test.ts` y `tests/integration/lineas-aviso-repuesto.test.ts` cambian `import { SITE } from "../../src/lib/site.ts"` por `import { SITE } from "../helpers/shops.ts"`; `tests/build/landing.test.ts` importa `whatsappHref` de `../../src/lib/whatsapp.ts`; `tests/integration/email.test.ts` según BG-D45. `tests/unit/vector-bikes-profile.test.ts` (prueba de esta fase) **se reescribe** para comparar el perfil (`scripts/vector-bikes-profile.ts`) con `VECTOR_BIKES_SITE` (identidad e `islandShop`: comunas, tarifa, bloque, prefijo; el horizonte del perfil es 30 y el `islandShop.horizonDays` es 14 = los días que pide la isla, así que **no los compares entre sí**) y con valores literales en la prueba para horarios, capacidad y antelación; ya no importa `src/lib/site.ts` ni `src/server/booking/rules.ts`.
9. `tests/unit/shop-literals-baseline.json`: si menciona `src/lib/site.ts` o `src/lib/faq.ts`, quita esas entradas (los archivos ya no existen); no agregues ni subas ninguna.

## Valores esperados que cambian (declarados)

Títulos `… — Vector Bikes` y `… · Vector Bikes` del personal y del ingreso → `Llave 15`; la marca del menú `Vector Bikes · Taller` → `Llave 15 · Taller`; el título del 404 → `Página no encontrada — Llave 15`; las expectativas de `tests/unit/vector-bikes-profile.test.ts`. Nada más. Si una prueba existente afirmaba uno de esos títulos o la marca del menú, ajusta solo esa cola al valor declarado y **repórtalo**; cualquier otra prueba que falle, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- Rutas, permisos, `global.css`, `tokens.css`, `AppLayout`, `PublicLayout`, el HTML de la portada (`tests/build/landing.test.ts` y `seo.test.ts` pasan con solo el cambio de import declarado), el diseño monocromo (BG-47 a BG-49 cambian la identidad visual, no este paso).
- `src/server/**` fuera de `notifications.ts` y `templates.ts`; `tests/helpers/**`; `e2e/` salvo que importe `src/lib/site.ts` (reemplaza solo el import); `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.
- Regla 14: al terminar, los nueve patrones de la guardia no aparecen en `src/pages`, `src/layouts` ni `src/lib`. Regla 10 (`set:html` solo en el JSON-LD de `Base.astro`). Archivos bajo 400 líneas.

## Verificación

1. Codex: `test ! -e src/lib/site.ts && test ! -e src/lib/faq.ts`; `grep -rq 'lib/site.ts' src tests e2e` → 1; el `test -z "$(grep -rlFI …)"` del Verify sobre `src/pages src/layouts src/lib` → 0; `grep -q 'AppLayout' src/layouts/TallerLayout.astro` y sin `Base.astro`; `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --skip tests/unit/vector-bikes-profile.test.ts` → 0.
2. Claude: el Verify completo del bloque BG-27 (`pnpm test:build` y `pnpm test:tablet`) y `pnpm gate` → exit 0.

## Reporte

La lista de archivos tocados, agrupada (páginas, layouts, lib, servidor, pruebas), cada cambio en pruebas existentes línea por línea, la salida de los `grep` del Verify, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
