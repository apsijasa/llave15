# F2-00 · Mover `payments` y `bikeComponents` a `schema-payments.ts`, sin migración

## Contexto y autorización (Andrés, 13-11-2026)

`src/server/db/schema-orders.ts` tiene 399 líneas y la fase 2 necesita agregarle columnas. Esta tarea solo mueve dos tablas a un archivo nuevo, sin cambiar nombres de tabla ni de columna, para que `pnpm db:generate` no produzca migración. Es la tarea `E1-T1` de `blueprints/vector-taller-f2/tasks.json`.

Autorización: decisión 55 de `blueprints/vector-taller-f1/blueprint.md` §20.3. El dueño autorizó cambiar **solo la línea de `import`** de `payments` y `bikeComponents` en seis pruebas existentes, sin tocar ninguna verificación. Esta tarea es la única excepción declarada al límite de 5 archivos por paso (F2-D2 del blueprint de la fase 2).

## Lee antes

- `AGENTS.md`.
- `.claude/rules/database.md`.
- `blueprints/vector-taller-f2/epics/01-base-inventario.md`, bloque `E1-T1`: es la especificación exacta.

## Rama y reparto

- Trabaja en `main`, desde el commit actual. No hagas push, commit ni tag: los hace la sesión coordinadora.
- Tu sandbox no tiene Postgres ni red. Corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`. `pnpm db:generate`, `pnpm db:check` y `pnpm gate` los corre la coordinadora.

## Qué hacer

1. **Crear `src/server/db/schema-payments.ts`.** Mueve **tal cual** `payments` y `bikeComponents` desde `schema-orders.ts`:
   - columnas, `$type`, defaults;
   - índices (`uq_payments_one_abono`, `idx_payments_branch_received`, `idx_bike_components_*`);
   - CHECK `payments_*` y `bike_components_*`.

   El archivo lleva sus propias copias de `branchReference()` y `creatorReference()`. Importa `workOrders` y `workOrderItems` desde `./schema-orders.ts`, `bikes` desde `./schema-taller.ts` y el resto desde `./schema.ts`. Al final: `export const paymentTables = [payments, bikeComponents] as const;`.
2. **`schema-orders.ts`.** Quita las dos tablas, las importaciones que queden sin uso y sus entradas en `orderTables`.
3. **`scripts/db-check.ts`.** Importa `paymentTables` y agrégalo al recorrido de columnas.
4. **Reapuntar importadores.** Corre `grep -rn "schema-orders.ts" src scripts tests e2e`. En cada archivo que importe `payments` o `bikeComponents`, separa esa importación hacia `schema-payments.ts`. Se esperan:
   - en `src/server/taller/`: `payments.ts`, `history.ts`, `components.ts`, `reports.ts`, `dashboard.ts`, `indicators.ts`;
   - en `tests/integration/`: `payments.test.ts`, `dashboard.test.ts`, `dashboard-finance.test.ts`, `indicators.test.ts`, `indicadores-page.test.ts`, `components.test.ts`.

   Si aparece otro importador en `src/` o `scripts/`, inclúyelo y anótalo en el reporte. Si otra prueba fuera de esas seis importa esas tablas, **detente y repórtalo**.

## No cambiar

- Nombres de tabla, columna, índice o CHECK. Nada en `drizzle/`.
- Ninguna aserción ni otra línea de las pruebas: en las seis autorizadas cambian solo líneas de `import`. Ninguna otra prueba.
- Firmas exportadas, lógica de negocio, páginas, estilos.
- `.claude/settings.json`, `.env`, cualquier secreto.

## Reglas de código que aplican

- Importaciones relativas con extensión `.ts`.
- `import type` para importar solo tipos.
- Sin barrels ni reexportaciones nuevas.
- Archivos de menos de 400 líneas.

## Verificación (tu parte)

`pnpm format && pnpm check && pnpm test && pnpm build` en verde. Además:

```bash
grep -Eq 'export const (payments|bikeComponents) = pgTable' src/server/db/schema-orders.ts; test $? -eq 1
wc -l src/server/db/schema-orders.ts src/server/db/schema-payments.ts
git diff -U0 -- tests
```

## Reporte

Termina con un resumen archivo por archivo: qué cambió, las líneas de cada archivo de esquema, el resultado de cada comando y cualquier importador extra que hayas encontrado.
