# F2-21 · Add counter sales server and customer history

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E3-T4 de blueprints/vector-taller-f2/epics/03-ventas-pagos.md. Recordatorios: las pruebas usan createTestDb() de tests/helpers/pglite.ts (las migraciones 0028-0031 ya existen, no hace falta ninguna nueva en este paso); cada ítem descuenta stock solo con applyStockMovement(tx, actor, {type:'venta'...}) de stock.ts y la anulación lo devuelve con 'anulacion'; precio y costo se congelan en sale_items; el número sale de branches.next_sale_number con bloqueo FOR UPDATE y se muestra VM-00001; el pago se crea con sale_id y work_order_id nulo; IVA con vatOfNet de rules.ts sobre el neto con descuento. El enlace con la caja (requireOpenCashSession) NO va en este paso: llega en la épica 4. Las claves unitCostClp/feeClp/costClp se omiten para roles sin costs.view (F2-D28: un costo nulo se deja tal cual).

Es la tarea `E3-T4` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T4` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/sales.ts`
- `src/server/taller/sale-void.ts`
- `src/server/taller/rules.ts`
- `src/server/taller/history.ts`
- `tests/integration/sales.test.ts`

## Criterios de aceptación

1. WHEN `reception` registra una venta sin cliente de 2 unidades de un producto de 5.000 netos con stock 3, pagada por transferencia THE SYSTEM SHALL crear la venta `VM-00001` `pagada` con `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`, un `sale_items` con precio y costo congelados, un pago `final` con `sale_id` por 11.900, y dejar `stock_qty = 1` con un movimiento `venta` de -2
2. WHEN una línea pide más unidades que el stock THE SYSTEM SHALL devolver `ok: false` con código `out_of_stock` sin escribir venta, líneas, pago ni movimientos
3. WHEN `reception` envía un descuento THE SYSTEM SHALL devolver `ok: false` con código `forbidden`, y WHEN `owner` aplica 1.000 con motivo THE SYSTEM SHALL calcular el IVA sobre el neto con descuento y registrar `sale.discounted` con usuario, monto y motivo
4. WHEN `owner` anula la venta con motivo THE SYSTEM SHALL dejarla `anulada` con `voided_at`, `voided_by` y el motivo, devolver el stock con movimientos `anulacion`, anular su pago y registrar `sale.voided`; `reception` SHALL recibir `forbidden`
5. WHEN la venta lleva cliente THE SYSTEM SHALL aparecer en `customerTimeline` de ese cliente como `Venta VM-00001` con su total, aunque el cliente no tenga órdenes
6. WHEN `listSales` corre para `reception` THE SYSTEM SHALL devolver las ventas sin las claves `unitCostClp` ni `feeClp`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/sales.test.ts tests/integration/history.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/sales.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/taller/history.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
