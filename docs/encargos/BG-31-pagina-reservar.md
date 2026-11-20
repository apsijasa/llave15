BG-31 · Página `/<slug>/reservar` y privacidad del taller

## Contexto y autorización (Andrés, 17-nov)

Paso 31 de la fase Llave 15 (decisión 57) y tercero de la etapa 3. BG-29 dejó `scopeBySlug`; BG-30 hizo que la API y la isla trabajen por `taller`. Este paso crea la página pública de reservas de cada taller y su aviso de privacidad. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-31 — Página `/<slug>/reservar` y privacidad del taller (E3-T3)"**, y en `tasks.json` (tarea `E3-T3`); la jerarquía de componentes está en la sección "Component hierarchy" del mismo blueprint. Ese texto manda, con la decisión BG-D50 de abajo.

## BG-D50 (decidida por Claude, registrada en §20.3): días que pide la isla

`IslandShop.horizonDays` no es el horizonte de reserva del taller: es cuántos días pide la isla a `/api/disponibilidad` (hoy, en la portada de Vector Bikes, 14; el horizonte del taller es 30 y la API acepta 1 a 31). En `/<slug>/reservar`, `horizonDays = Math.min(scope.config.horizonDays, 14)`: el cliente ve la misma ventana que hoy en la portada y nunca más que el horizonte del taller. Por eso las props de `/vector-bikes/reservar` coinciden con `VECTOR_BIKES_SITE.islandShop` salvo `privacyHref` (`/vector-bikes/privacidad` en vez de `/privacidad`).

## Lee antes

`AGENTS.md`; `.claude/rules/ui-design.md`, `.claude/rules/server-api.md` (`/<slug>/reservar` indexable y `no-store`; páginas con datos personales `noindex`), `.claude/rules/shops.md`; el bloque de BG-31 del blueprint y su "Component hierarchy"; `src/server/shops/scope.ts` (`scopeBySlug`), `src/server/shops/profile.ts` (`profileBySlug`, `ShopProfile`), `src/layouts/PublicLayout.astro` (props `profile`), `src/components/islands/BookingIsland.tsx` y `booking-state.ts` (`IslandShop`), `src/components/Landing.astro` (cómo monta la isla con `siteKey` y `shop`), `src/pages/index.astro` (`import.meta.env.PUBLIC_TURNSTILE_SITE_KEY`), `src/pages/[slug]/logo.ts` (página dinámica existente), `src/pages/privacidad.astro` y su versión `git show 8bca898:src/pages/privacidad.astro` (el texto del aviso); `web/vector-bikes/src/content/site.ts` (`VECTOR_BIKES_SITE.islandShop`, solo para la prueba); `tests/integration/layouts.test.ts`, `tests/integration/api-by-shop.test.ts` y `tests/helpers/shops.ts` como patrón (Container API, `vi.mock` de `getDb`, dos talleres).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-30`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` incluido), `pnpm gate` y el Checkpoint con el tag `bg-31`.

## Qué hacer

Tres archivos escritos a mano:

1. `src/pages/[slug]/reservar.astro` (nuevo): `export const prerender = false`; `scopeBySlug(getDb(), slug)` y `profileBySlug`; si alguno es `null` → 404 (respuesta vacía o la página 404 del sitio, sin datos de otro taller). `PublicLayout` con el perfil, título `Reservar — <Taller>`, descripción corta y **sin** `noindex` (`noindex={false}`); un solo `h1` con el nombre del taller; `BookingIsland client:visible` con `siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? ""}` y `shop` armado del alcance y el perfil: `slug`, `name`, `addressShort`, `email`, `pickupEnabled`, `pickupComunas`, `pickupFeeClp`, `blockMinutes`, `codePrefix` del alcance y el perfil, `horizonDays` según BG-D50 y `privacyHref` = `/<slug>/privacidad`. `Astro.response.headers.set("cache-control", "no-store")`. Ninguna isla nueva.
2. `src/pages/[slug]/privacidad.astro` (nuevo): `prerender = false`; `profileBySlug` (y 404 si el taller no existe o está `suspendido`: usa `scopeBySlug` para decidirlo); `PublicLayout` con `noindex` (por defecto); el texto del aviso de `8bca898:src/pages/privacidad.astro` copiado tal cual, con nombre, dirección y correo del perfil en lugar de `SITE`, y título `Aviso de privacidad — <Taller>`.
3. `tests/integration/booking-page.test.ts` (nuevo): los cinco criterios del blueprint con dos talleres, renderizando ambas páginas con la Container API (`vi.mock` de `getDb` como en las pruebas de páginas existentes): 200 + `PublicLayout` + `h1` + props de la isla del Taller Demo + `Taller Demo · Gestionado con Llave 15`; 404 para `no-existe` y para un taller `suspendido`; las props de `/vector-bikes/reservar` iguales a `VECTOR_BIKES_SITE.islandShop` salvo `privacyHref`; privacidad del Taller Demo con su nombre, dirección y correo y sin `Vector Bikes`, `Vitacura` ni `Kennedy`; `cache-control: no-store` y sin `name="robots"` en reservar.

**Ningún valor esperado cambia:** la paridad corre sin `--allow` ni `--skip`. Si una prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- `src/pages/index.astro`, `src/pages/privacidad.astro`, la portada heredada (`pnpm test:build` sin cambios), `Landing.astro`, `Base.astro`, `PublicLayout.astro`, las islas, la API, `src/server/**`. Los enlaces a la página nueva son BG-32.
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. Regla 14: ningún dato de un taller en `src/` (la guardia `shop-literals.test.ts` lo revisa). Regla 10: sin `set:html`. Regla 9: todo elemento cerrado.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `pnpm test tests/integration/booking-page.test.ts` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-31 (`pnpm test:build`) y `pnpm gate` → exit 0; además mira `/taller-demo/reservar` o `/vector-bikes/reservar` renderizada.

## Reporte

Los tres archivos con sus líneas, las props exactas que recibe la isla para Vector Bikes, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
