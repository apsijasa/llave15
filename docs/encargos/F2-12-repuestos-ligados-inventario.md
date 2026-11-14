# F2-12 · Link part lines to inventory products

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Repuestos de la orden ligados a productos del inventario (FASE2 §3.4): una función nueva (items.ts está cerca de 400 líneas, no la hagas crecer) agrega una línea de repuesto con productId, consume stock con applyStockMovement(consumo_orden) en la misma transacción, congela unit_cost_clp con el costo promedio y usa products.price_clp como precio sugerido (el mecánico no puede cambiarlo: 403). voidItem, manteniendo su firma, revierte el stock con un movimiento 'anulacion' cuando la línea tenía producto. Si el stock no alcanza: out_of_stock, sin escribir nada (error centinela dentro de la transacción, traducido afuera). Las líneas de texto libre funcionan como hoy. Un repuesto ligado en una orden 'final' cobra price_clp + IVA (F2-D16).

Es la tarea `E2-T4` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T4` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/part-stock.ts`
- `src/server/taller/items.ts`
- `src/pages/taller/ordenes/[id]/lineas.astro`
- `tests/integration/part-stock.test.ts`

## Criterios de aceptación

1. WHEN `addProductPartItem` agrega 1 unidad de un producto con `stock_qty = 5` a una orden THE SYSTEM SHALL dejar `stock_qty = 4`, una línea `repuesto` con `product_id` y `unit_cost_clp` igual al costo del producto, y un movimiento `consumo_orden` de -1 que referencia esa línea
2. WHEN se anula esa línea con `voidItem` THE SYSTEM SHALL devolver el stock a 5 con un movimiento `anulacion` de +1, dejando dos movimientos
3. WHEN el producto no tiene stock suficiente THE SYSTEM SHALL devolver `ok: false` con código `out_of_stock` sin dejar la línea ni el movimiento
4. WHEN la orden es `neto` THE SYSTEM SHALL usar `price_clp` del producto como precio unitario de la línea, y en una orden `final` SHALL usar `price_clp + vatOfNet(price_clp)`
5. WHEN `listItems` corre para `mechanic` o `reception` THE SYSTEM SHALL devolver las líneas sin la clave `unitCostClp`, y con ella para `owner` y `admin`
6. WHEN el mecánico llama `addProductPartItem` THE SYSTEM SHALL devolver `ok: false` con código `forbidden`, y `addPartItem` sin producto SHALL comportarse como hoy

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/part-stock.test.ts tests/integration/order-items.test.ts tests/integration/items.test.ts tests/integration/quotes.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/items.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/lineas-guardar-cambios.spec.ts sin cambios)
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
