BG-02 · Helpers de tiempo en `src/lib/time.ts`

## Contexto y autorización (Andrés, 18-nov)

Segundo paso de la fase Llave 15 (decisión 57; el producto se renombró de Bike Garage a Llave 15 en BG-D31). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-02 — Helpers de tiempo en `src/lib/time.ts` (E1-T2)"**, y en `blueprints/bike-garage/tasks.json` (tarea `E1-T2`). Ese bloque manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Hoy `TIMEZONE` vive en `src/server/booking/rules.ts` y `localToday`, `addDays` y `localToInstant` en `src/server/booking/slots.ts`. El esquema de talleres (BG-03) y `src/lib/**` los necesitan sin importar `src/server/**`, así que se mueven a `src/lib/time.ts`. Sin decisión nueva.

## Lee antes

`AGENTS.md`; `.claude/rules/booking-engine.md`; el bloque de BG-02 del blueprint; `src/server/booking/rules.ts` y `src/server/booking/slots.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit. Prueba nueva primero, en rojo; después el código; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-02`).

## Qué hacer

Exactamente estos cuatro archivos:

1. **`src/lib/time.ts`** (nuevo): `TIMEZONE = "America/Santiago"`, `localToday`, `addDays`, `localToInstant`, con el mismo cuerpo que hoy. Solo importa `luxon`.
2. **`src/server/booking/rules.ts`**: quita la definición de `TIMEZONE` y la reexporta desde `../../lib/time.ts`.
3. **`src/server/booking/slots.ts`**: quita las tres funciones y las reexporta desde `../../lib/time.ts`. Lo que `slots.ts` sigue usando internamente (`TIMEZONE` y las funciones) lo importa de `../../lib/time.ts`.
4. **`tests/unit/time.test.ts`** (nuevo): cubre los cuatro primeros criterios del bloque: exporta los cuatro nombres; `localToday(new Date("2026-10-05T02:30:00Z"))` es `2026-10-04`; la primera hora local inexistente de septiembre de 2026 en `America/Santiago` (búscala con luxon en la prueba, no la escribas a mano) da `null` en `localToInstant`; y los reexportados de `rules.ts` y `slots.ts` son idénticos (`toBe`) a los de `src/lib/time.ts`.

## No cambiar

- Ninguna firma exportada ni ningún importador: todos siguen importando desde `rules.ts` y `slots.ts` (los reexportados se quitan en BG-28).
- Ninguna prueba existente (`slots.test.ts`, `pickup-hours.test.ts`, `multi-bike-slots.test.ts` pasan sin tocarse), `e2e/`, `drizzle/`, `package.json` ni el lockfile.
- Regla 14: ningún dato de un taller en `src/`. No leer ni escribir archivos de entorno. No migrar.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: el Verify completo del bloque BG-02 (incluido `node scripts/bg-expect-parity.ts` → 0) y `pnpm gate` → exit 0.

## Reporte

Los cuatro archivos con sus líneas, la hora inexistente que encontró la prueba, la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
