BG-29 · Slugs reservados y alcance por slug

## Contexto y autorización (Andrés, 17-nov)

Paso 29 de la fase Llave 15 (decisión 57; nombre en BG-D31) y primero de la etapa 3, reservas en línea por taller (épica 03). La página pública de reservas vivirá en `/<slug>/reservar` (BG-31) y la API recibirá `taller` (BG-30); antes hace falta que un slug no choque con una ruta del sistema y una forma de resolver el alcance de reservas desde el slug. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-29 — Slugs reservados y alcance por slug (E3-T1)"**, y en `tasks.json` (tarea `E3-T1`). Ese texto manda.

## Lee antes

`AGENTS.md`; `.claude/rules/shops.md` (slugs reservados, `scopeBySlug`, estados `activo`/`suspendido`); el bloque de BG-29 del blueprint y el encabezado de la épica 03 (`blueprints/bike-garage/epics/03-reservas-por-taller.md`); `src/server/shops/scope.ts` (`BookingScope`, `scopeForBranch`, `singleShopScope`), `src/server/db/schema-shops.ts` (`shops_slug_check`: `^[a-z0-9]+(-[a-z0-9]+)*$`, largo 3 a 40; columna de estado del taller), `src/server/booking/config.ts` (`bookingConfigFromShop`); `tests/helpers/shops.ts` (`seedTwoShops`, Taller Demo) y una prueba de integración de esta fase con dos talleres como patrón (por ejemplo `tests/integration/shop-profile.test.ts`).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-49`). Pruebas nuevas primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-29`.

## Qué hacer

Cuatro archivos escritos a mano:

1. `src/server/shops/slugs.ts` (nuevo): `RESERVED_SLUGS` (la lista literal del blueprint, `as const`) y `slugSchema` (zod: el mismo formato y largo que `shops_slug_check`, no reservado; el mensaje de reservado es exactamente `Ese nombre está reservado.`; mensajes de formato en español de Chile).
2. `src/server/shops/scope.ts`: `scopeBySlug(db, slug)` → el `BookingScope` del taller con ese slug si está `activo` (con su única sucursal, igual que `singleShopScope`), o `null` si el slug no pasa `slugSchema`, no existe, es reservado o el taller está `suspendido`. Sin lanzar. `scopeForBranch` y `singleShopScope` no cambian; si conviene, extrae un ayudante privado para armar el alcance, sin cambiar sus firmas ni su comportamiento.
3. `tests/unit/reserved-slugs.test.ts` (nuevo): los tres primeros criterios del blueprint, incluido el recorrido de las entradas de primer nivel de `src/pages/` (salvo las que empiezan con `[`) y de `public/`, sin extensión, contra `RESERVED_SLUGS`.
4. `tests/integration/scope-by-slug.test.ts` (nuevo): el cuarto criterio con dos talleres (`taller-demo` → alcance del Taller Demo con su sucursal y configuración; desconocido, reservado y `suspendido` → `null`).

**Ningún valor esperado cambia:** la paridad corre sin `--allow` ni `--skip`. Si una prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- Las firmas y el comportamiento de `scopeForBranch` y `singleShopScope`; ningún otro módulo de `src/`, páginas ni API (la API por taller es BG-30).
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. Regla 14: ningún dato de un taller en `src/` (el slug `vector-bikes` no se escribe en `src/`).

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `pnpm test tests/unit/reserved-slugs.test.ts tests/integration/scope-by-slug.test.ts` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-29 y `pnpm gate` → exit 0.

## Reporte

Los cuatro archivos con sus líneas, la firma de `scopeBySlug`, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
