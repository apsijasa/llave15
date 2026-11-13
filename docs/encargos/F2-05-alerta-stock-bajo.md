# F2-05 · Alert low stock on /taller and daily digest

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Alerta de stock mínimo (FASE2 §2.2 punto 10): los productos con stock_qty <= min_stock (y min_stock > 0) aparecen en /taller para quien tiene purchases.manage y se suman al resumen diario de /api/tareas/alertas solo cuando la lista no está vacía, para que las pruebas existentes de alertas sigan iguales. El asunto del correo usa SITE.name, nunca el nombre escrito a mano.

Es la tarea `E1-T6` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T6` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/low-stock.ts`
- `src/server/taller/maintenance.ts`
- `src/components/taller/LowStockNotice.astro`
- `src/pages/taller/index.astro`
- `tests/integration/low-stock.test.ts`

## Criterios de aceptación

1. WHEN `/api/tareas/alertas` corre sin órdenes atrasadas ni productos bajo mínimo THE SYSTEM SHALL responder 200 con `ok: true`, `overdue: 0`, `sent: false` y sin la clave `lowStock`
2. WHEN hay 2 productos activos con `min_stock > 0` y `stock_qty <= min_stock` y ninguna orden atrasada THE SYSTEM SHALL enviar a `SHOP_NOTIFY_EMAIL` un correo con asunto `Stock bajo mínimo: 2 · ` seguido de `SITE.name`, y responder `ok: true`, `overdue: 0`, `sent: true`, `lowStock: 2`
3. WHEN hay órdenes atrasadas y productos bajo mínimo THE SYSTEM SHALL conservar el asunto de órdenes atrasadas que arma hoy `sendOverdueDigest` y agregar al cuerpo la línea `Stock bajo mínimo:` y una línea por producto con SKU, nombre, stock y mínimo
4. WHEN un producto está inactivo o tiene `min_stock = 0` THE SYSTEM SHALL excluirlo de la alerta
5. WHEN `branchLowStock` corre para `owner` o `admin` THE SYSTEM SHALL devolver los productos bajo mínimo de su sucursal, y `null` para `reception` y `mechanic`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/low-stock.test.ts tests/integration/tasks-maintenance.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
