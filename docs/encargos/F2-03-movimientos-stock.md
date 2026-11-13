# F2-03 · Add stock movements and product server

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

El stock solo cambia por movimientos (FASE2 §2.2, F2-D del blueprint): una sola función del servidor, `applyStockMovement(tx, actor, input, now)`, bloquea el producto con `select … for update`, inserta el movimiento y actualiza `stock_qty`; el CHECK `stock_qty >= 0` se traduce a `out_of_stock`. Además el módulo de productos del servidor (crear, editar, listar, ficha con movimientos), con costos solo para quien tiene `costs.view` y una prueba de omisión por rol. Recuerda: PGlite es de una sola conexión, así que la prueba de concurrencia usa el CHECK, no dos `for update` simultáneos.

Es la tarea `E1-T4` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T4` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/stock.ts`
- `src/server/taller/products.ts`
- `src/server/taller/rules.ts`
- `src/server/taller/audit.ts`
- `tests/integration/products.test.ts`

## Criterios de aceptación

1. WHEN `adjustStock` registra +5 con motivo sobre un producto con stock 0 THE SYSTEM SHALL dejar `stock_qty = 5`, un `stock_movements` `ajuste` con `quantity = 5` y el motivo, y una fila `stock.adjusted` en `audit_log` con el usuario
2. WHEN dos consumos de 1 unidad se aplican en secuencia sobre un producto con `stock_qty = 1` THE SYSTEM SHALL aceptar el primero y devolver `ok: false` con código `out_of_stock` en el segundo, dejando `stock_qty = 0` y un solo movimiento de consumo
3. WHEN un `update` directo intenta dejar `stock_qty = -1` THE SYSTEM SHALL fallar con código `23514`
4. WHEN `applyStockMovement` aplica una `compra` de 5 unidades a 1.300 sobre 5 unidades a costo 1.000 THE SYSTEM SHALL dejar `stock_qty = 10` y `cost_clp = 1150`
5. WHEN `listProducts` o `getProduct` corren para `mechanic` o `reception` THE SYSTEM SHALL devolver filas sin las claves `costClp` ni `unitCostClp`, y con ellas para `owner` y `admin`
6. WHEN `reception` o `mechanic` llaman `createProduct`, `updateProduct` o `adjustStock` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin escribir filas

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/products.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
