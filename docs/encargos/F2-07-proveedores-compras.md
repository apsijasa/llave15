# F2-07 · Add suppliers and purchase orders server

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Servidor de proveedores y órdenes de compra (FASE2 §3.3): proveedores con datos de contacto bajo las mismas reglas de privacidad que los clientes (nada de correos ni teléfonos en logs ni en la auditoría sin redactar); órdenes de compra con estados borrador → enviada → recibida | anulada, numeradas con branches.next_purchase_number. Recibir una compra genera los movimientos de entrada con applyStockMovement (kind compra, referencia purchase_order) en la misma transacción y actualiza el costo promedio. Solo purchases.manage; los costos solo con costs.view. Anular nunca borra: voided_at y voided_by.

Es la tarea `E1-T8` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T8` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/suppliers.ts`
- `src/server/taller/purchases.ts`
- `src/server/taller/rules.ts`
- `tests/integration/purchases.test.ts`

## Criterios de aceptación

1. WHEN se recibe una compra `enviada` de 5 unidades de un producto nuevo a 1.000 THE SYSTEM SHALL dejar el producto con `stock_qty = 5` y `cost_clp = 1000`, un movimiento `compra` de +5 con `reference_kind = 'purchase_order'`, y la compra `recibida` con `received_at` y `received_by`
2. WHEN una segunda compra de 5 unidades a 1.300 se recibe THE SYSTEM SHALL dejar `stock_qty = 10` y `cost_clp = 1150`
3. WHEN se agrega una línea a una compra que no está en `borrador`, o se recibe o anula una compra `recibida` THE SYSTEM SHALL devolver `ok: false` con código `invalid_status` sin cambiar filas
4. WHEN se crean dos compras en una sucursal THE SYSTEM SHALL numerarlas desde `branches.next_purchase_number` y mostrarlas como `OC-00001` y `OC-00002`
5. WHEN `reception` o `mechanic` llaman una función que escribe proveedores o compras THE SYSTEM SHALL devolver `ok: false` con código `forbidden`
6. WHEN se crea un proveedor con un RUT inválido, o con un RUT que ya existe en la sucursal THE SYSTEM SHALL devolver el código `validation_error` o `rut_exists`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/purchases.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
