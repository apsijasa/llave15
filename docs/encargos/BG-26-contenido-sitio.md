BG-26 · Contenido del sitio heredado fuera de `src/`

## Contexto y autorización (Andrés, 18-nov)

Paso 26 de la fase Llave 15 (decisión 57; nombre en BG-D31). La portada heredada de Vector Bikes (`src/layouts/Base.astro`, `src/components/Landing.astro`) todavía escribe en `src/` los datos del taller: el JSON-LD con `Vitacura` y `Las Condes`, `og:site_name`, el `aria-label` del wordmark, el correo del aviso de privacidad, la dirección y el `IslandShop` de Vector Bikes que BG-25 dejó en `Landing.astro`. Además `BookingSchedule.tsx` escribe fijo el correo del taller en el mensaje "No hay días disponibles…". Este paso crea el contenido del sitio de Vector Bikes donde se va a quedar, `web/vector-bikes/src/content/site.ts` (BG-D14), y la portada heredada lo importa (excepción de frontera hasta BG-DC1). El HTML construido de la portada **no cambia**. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-26 — Contenido del sitio heredado fuera de `src/` (E2-T10)"**, y en `tasks.json` (tarea `E2-T10`). Ese texto manda.

## Lee antes

`AGENTS.md` (fronteras: `web/vector-bikes/**` nunca importa `src/**`; excepción BG-D14 para `Base.astro`, `Landing.astro`, `src/pages/index.astro` y `privacidad.astro`); `.claude/rules/ui-design.md` y `.claude/rules/shops.md`; el bloque de BG-26 del blueprint y BG-D14; `src/lib/site.ts`, `src/lib/faq.ts`, `src/pages/index.astro`, `src/pages/privacidad.astro` (títulos, descripciones y texto del aviso, para copiarlos); `src/layouts/Base.astro`; `src/components/Landing.astro`; `src/components/islands/booking-state.ts` (`IslandShop`), `BookingSchedule.tsx`, `BookingTicket.tsx`; `web/vector-bikes/tsconfig.json`; `tests/build/landing.test.ts` y `tests/build/seo.test.ts` (no se tocan).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-25`). Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` incluido), `pnpm gate` y el Checkpoint con el tag `bg-26`. Es un refactor: la prueba que manda es `tests/build/landing.test.ts` + `seo.test.ts` sin cambios, más el `grep` de los nueve patrones del Verify.

## Qué hacer

1. `web/vector-bikes/src/content/site.ts` (nuevo): exporta `VECTOR_BIKES_SITE` con nombre, `url`, `logoPath`, `certifications`, dirección (`streetAddress`, `addressShort`, `locality`, `region`, `country`), correo, teléfono y `phoneDisplay`, Instagram (URL y handle), mapa, las comunas de retiro para el JSON-LD, el FAQ (copiado de `src/lib/faq.ts`), los títulos y descripciones de `/` y `/privacidad` (copiados de `index.astro` y `privacidad.astro`), el texto del aviso de privacidad del pie de `Base.astro`, e `islandShop` con los valores de reserva que hoy tiene `Landing.astro` (los mismos, incluido `horizonDays: 14`, que es el `dias` que la isla siempre pidió). Exporta también `BOOKING_URL = "https://llave15.cl/vector-bikes/reservar"`. **No importa ningún archivo de `src/`**: si necesitas un tipo, decláralo en el mismo archivo con la misma forma (TypeScript es estructural).
2. `src/layouts/Base.astro`: todos sus datos del taller (JSON-LD, `og:site_name`, `aria-label` del wordmark, correo del aviso, Instagram, imagen) salen de `VECTOR_BIKES_SITE`; **sigue importando `whatsappHref` de `src/lib/site.ts`** (hasta BG-27) y ya no usa `SITE.`.
3. `src/components/Landing.astro`: sus datos (etiqueta de la portada, dirección, `IslandShop`, FAQ si lo usa) salen de `VECTOR_BIKES_SITE`; ya no usa `SITE.`. Si sigue necesitando `whatsappHref`, puede importarlo de `src/lib/site.ts`.
4. `src/components/islands/BookingSchedule.tsx`: el mensaje "No hay días disponibles en las próximas dos semanas. Escríbenos a …" toma el correo del taller del `ShopContext`. Para eso, **sexto archivo declarado (BG-D48)**: `src/components/islands/booking-state.ts` agrega a `IslandShop` el campo **opcional** `email?: string` (opcional para no tocar las pruebas que arman un `IslandShop`); sin correo, el mensaje termina en "Escríbenos para coordinar otra fecha." El `islandShop` de `site.ts` lleva el correo de Vector Bikes, así que la portada muestra lo de hoy.
5. `src/components/islands/BookingTicket.tsx`: nombre, dirección y tarifa del `ShopContext` (BG-25 ya lo hizo en buena parte; confirma que no quede ningún literal).

Registra en `blueprints/bike-garage/blueprint.md` §20.3, después de la fila de BG-D47, la fila: `| BG-D48 | En BG-26, IslandShop gana el campo opcional email para el mensaje sin días de BookingSchedule; booking-state.ts es un sexto archivo declarado (coordinadora, 19-11-2026) | Mensaje sin correo, o email obligatorio | El mensaje mostraba el correo de Vector Bikes fijo; opcional no cambia las pruebas que arman un IslandShop | /<slug>/reservar (BG-29) pasa el correo del perfil |`.

## Riesgo conocido

`tests/build/landing.test.ts` y `tests/build/seo.test.ts` deben pasar **sin cambios** (no puedes correr `test:build`: verifica con cuidado que el HTML de la portada quede idéntico: mismos textos, mismo JSON-LD, mismos `meta`). Si una prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- El HTML construido de la portada, el comportamiento de la isla, el cuerpo que envía a la API.
- Fronteras: `web/vector-bikes/**` no importa `src/**`; solo `Base.astro` y `Landing.astro` (y más adelante `index.astro`/`privacidad.astro`) importan `site.ts`. `src/lib/site.ts`, `src/lib/faq.ts`, `src/pages/**`, `src/server/**`, ninguna prueba existente, `tests/helpers/**`, la línea base de literales, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.
- Regla 10 (`set:html` solo en el JSON-LD de `Base.astro`). Diseño monocromo. Archivos bajo 400 líneas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; el `test -z "$(grep -lFI …)"` de los nueve patrones del Verify → exit 0; el `grep -Eq '(^|[^_A-Z])SITE\.'` del Verify → 1; `grep -qF 'https://llave15.cl/vector-bikes/reservar' web/vector-bikes/src/content/site.ts` → 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-26 (`pnpm test:build` incluido) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, la salida de los `grep` del Verify, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
