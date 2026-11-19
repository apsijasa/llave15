BG-25 · Isla de reserva por props

## Contexto y autorización (Andrés, 18-nov)

Paso 25 de la fase Llave 15 (decisión 57; nombre en BG-D31). La isla de reserva (`BookingIsland`, `client:visible` en la portada) tiene hoy los datos de Vector Bikes fijos: comunas `Vitacura`/`Las Condes` y su mensaje (`booking-state.ts:263`), el prefijo `VB-` del ticket (`:339`), la tarifa de retiro `PICKUP_FEE_CLP = 15000` (`:347`), y en `BookingFields.tsx` (líneas ~161, ~185, ~205) las comunas y los textos de consentimiento con el nombre del taller. Después de este paso la isla recibe un `shop: IslandShop` por props y lo comparte con sus hijos por un `ShopContext` de Preact. La portada heredada sigue mostrando exactamente lo de hoy. La isla todavía **no** envía `taller` a la API (eso es BG-30). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-25 — Isla de reserva por props (E2-T9)"**, y en `tasks.json` (tarea `E2-T9`). Ese texto manda, con la precisión de frontera de abajo.

## Precisión de frontera (coordinadora, 19-nov)

El blueprint dice que `Landing.astro` arma el `shop` "con `SITE` y las constantes de `rules.ts`", pero `src/components/**` **nunca importa `src/server/**`** (fronteras de `AGENTS.md`). Por eso `Landing.astro` arma el `IslandShop` de Vector Bikes con `SITE` (nombre, `addressShort`) y con los valores de reserva de Vector Bikes que **hoy están fijos dentro de la isla** (comunas, tarifa, prefijo `VB`, horizonte y bloque que usa la isla), **moviéndolos** desde `booking-state.ts` y `BookingFields.tsx` a `Landing.astro`, no copiándolos. Es transitorio hasta BG-26, cuando el contenido del sitio heredado sale de `src/`. La guardia `tests/unit/shop-literals.test.ts` mide los literales del taller **por archivo** contra `tests/unit/shop-literals-baseline.json`: ningún archivo puede quedar sobre su línea base (`Landing.astro` 7, `booking-state.ts` 5, `BookingFields.tsx` 4). Si al mover los valores `Landing.astro` pasa de 7, usa `SITE` y valores derivados (por ejemplo, la tarifa como número `15000`, que no es literal de la guardia) para no pasarte; si aun así no cabe, **detente y repórtalo**; no edites la línea base.

## Lee antes

`AGENTS.md` (fronteras y "Diseño por paso"); `.claude/rules/ui-design.md` (una sola isla pública, `IslandShop`, `ShopContext`); el bloque de BG-25 del blueprint; `src/components/islands/BookingIsland.tsx`, `booking-state.ts`, `BookingFields.tsx`, `BookingSchedule.tsx`, `BookingTicket.tsx`; `src/components/Landing.astro`; `src/lib/site.ts`; `tests/unit/booking-state.test.ts`; `tests/build/landing.test.ts` (no se toca); `tests/unit/shop-literals.test.ts` y su línea base.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-24`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` incluido), `pnpm gate` y el Checkpoint con el tag `bg-25`.

## Qué hacer

Cinco archivos escritos a mano:

1. `src/components/islands/booking-state.ts`: exporta el tipo `IslandShop = { slug: string; name: string; addressShort: string; pickupEnabled: boolean; pickupComunas: string[]; pickupFeeClp: number; horizonDays: number; blockMinutes: number; codePrefix: string; privacyHref: string }` y `ShopContext = createContext<IslandShop | null>(null)` (de `preact`). Las funciones que hoy usan los valores fijos reciben el taller como argumento: validación de comunas con `shop.pickupComunas` y el mensaje `Elige A o B.` armado desde ellas, el retiro solo si `shop.pickupEnabled`, `ticketCode` con `shop.codePrefix`, la tarifa con `shop.pickupFeeClp`, y una función `consentTexts(name)` que devuelve los dos textos de consentimiento con el nombre del taller (exactamente los del criterio 3). Sale de aquí `PICKUP_FEE_CLP` y todo literal de Vector Bikes.
2. `src/components/islands/BookingIsland.tsx`: recibe `shop: IslandShop` (además de `siteKey`), lo envuelve en `<ShopContext.Provider value={shop}>` y pasa el taller a las funciones de `booking-state.ts`.
3. `src/components/islands/BookingFields.tsx`: lee el taller con `useContext(ShopContext)`; comunas, tarifa y consentimiento desde el taller (`consentTexts(shop.name)`).
4. `src/components/Landing.astro`: arma el `IslandShop` de Vector Bikes (ver la precisión de frontera) con `privacyHref: "/privacidad"` y `slug: "vector-bikes"`, y lo pasa a `<BookingIsland client:visible siteKey={siteKey} shop={shop} />`.
5. `tests/unit/island-shop.test.ts` (nuevo): los criterios 1 a 3 (comunas `Ñuñoa` y `Providencia` y retiro a `$9.000` con las props del Taller Demo; sin retiro con `pickupEnabled: false`; `consentTexts("Taller Demo")`).

Firma declarada (no cuenta): `tests/unit/booking-state.test.ts` pasa el `IslandShop` de Vector Bikes (armado en la prueba con los valores de hoy) a las funciones que ahora lo reciben. Solo cambian las llamadas y el armado del taller; **ninguna cola de matcher**.

## Riesgo conocido

`tests/build/landing.test.ts` debe pasar **sin cambios**: la portada construida muestra lo mismo que hoy. Si alguna prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- El comportamiento de la isla con Vector Bikes; la forma del cuerpo que envía a la API (no agregues `taller`); ninguna isla nueva; `BookingSchedule.tsx` y `BookingTicket.tsx` salvo que reciban el taller por contexto si lo necesitan (repórtalo).
- Fronteras: los componentes no importan `src/server/**` (ni `src/server/booking/rules.ts` ni `config.ts`). `src/pages/**`, `src/server/**`, `tests/helpers/**`, `tests/unit/shop-literals-baseline.json`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.
- Regla 14 y su guardia (ningún archivo sobre su línea base). Diseño monocromo, sin estilos nuevos. Archivos bajo 400 líneas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-25 (`pnpm test:build` incluido) y `pnpm gate` → exit 0.

## Reporte

Los cinco archivos con sus líneas, los cambios en `booking-state.test.ts` línea por línea, el conteo de literales de los tres archivos de la isla y de `Landing.astro` antes y después, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
