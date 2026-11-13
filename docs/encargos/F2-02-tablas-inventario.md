# F2-02 · Add inventory tables and pricing columns

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Primera migración de la fase 2: las cinco tablas de inventario (proveedores, productos, movimientos de stock, órdenes de compra y sus líneas) en `schema-inventory.ts`, que va **antes** de `schema-orders.ts` en la cadena (decisión de arquitectura A del blueprint de la fase 2), más las columnas de régimen de precios en `branches`, `work_orders` y `work_order_items`. Todo aditivo. Tú escribes esquema y prueba; **no corras `pnpm db:generate`**: lo corre la coordinadora, que revisa el SQL generado y aplica la migración en la base dev.

Es la tarea `E1-T3` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T3` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-inventory.ts`
- `src/server/db/schema.ts`
- `src/server/db/schema-orders.ts`
- `scripts/db-check.ts`
- `tests/integration/inventory-schema.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `products`, `stock_movements`, `suppliers`, `purchase_orders` y `purchase_order_items` y agregar `branches.next_purchase_number`, `branches.new_order_pricing_mode`, `work_orders.pricing_mode`, `work_orders.subtotal_clp`, `work_orders.vat_clp`, `work_order_items.product_id` y `work_order_items.unit_cost_clp`, sin borrar ni renombrar nada
2. WHEN se inserta una sucursal o una orden sin las columnas nuevas THE SYSTEM SHALL guardar `new_order_pricing_mode = 'final'`, `pricing_mode = 'final'`, `subtotal_clp = 0` y `vat_clp = 0`
3. WHEN se guarda una orden `neto` con `total_clp` distinto de `subtotal_clp + vat_clp` THE SYSTEM SHALL rechazarla con código `23514`, y una orden `final` con cualquier total SHALL aceptarse
4. WHEN se guarda un producto con `stock_qty` negativo, con `category` fuera de `repuesto`, `accesorio`, `insumo` y `bicicleta_usada`, o una `bicicleta_usada` sin `serial_number` THE SYSTEM SHALL rechazarlo con código `23514`
5. WHEN se insertan dos productos con el mismo `sku`, o con el mismo `barcode` no nulo, en una sucursal THE SYSTEM SHALL rechazar el segundo con código `23505`, y SHALL aceptar dos productos con `barcode` nulo
6. WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar también las columnas de `inventoryTables` y salir 0

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).
- Columnas y CHECK existentes; `tests/integration/foundation.test.ts`.
- No generes ni edites archivos en `drizzle/`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/inventory-schema.test.ts tests/integration/foundation.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = la migración nueva no borra ni renombra → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
