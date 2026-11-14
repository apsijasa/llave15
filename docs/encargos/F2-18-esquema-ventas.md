# F2-18 · Add sales and sale items schema

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Primer paso del grupo de ventas de mostrador (FASE2 §2.4): tablas sales y sale_items en un archivo nuevo schema-sales.ts, que en la cadena final va después de schema-cash.ts y antes de schema-payments.ts (como schema-cash.ts todavía no existe, importa solo lo que el bloque de la épica indique), y branches.next_sale_number para numerar VM-00001. Precio y costo congelados en cada línea; descuentos con motivo; nada se borra (voided_at). Tú escribes esquema y prueba; NO corras pnpm db:generate: lo corre la coordinadora, que revisa el SQL y aplica la migración en la base dev.

Es la tarea `E3-T1` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T1` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-sales.ts`
- `src/server/db/schema.ts`
- `scripts/db-check.ts`
- `tests/integration/sales-schema.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `sales` y `sale_items` y agregar `branches.next_sale_number` con valor por defecto 1
2. WHEN una venta se guarda con `total_clp` distinto de `subtotal_clp + vat_clp` THE SYSTEM SHALL rechazarla con código `23514`
3. WHEN una venta queda `pagada` con `paid_clp` distinto de `total_clp`, o lleva `discount_clp > 0` sin `discount_reason` THE SYSTEM SHALL rechazarla con código `23514`
4. WHEN una venta queda `anulada` sin `voided_at`, o tiene `voided_at` en otro estado THE SYSTEM SHALL rechazarla con código `23514`
5. WHEN se guardan dos ventas con el mismo `number` en una sucursal THE SYSTEM SHALL rechazar la segunda con código `23505`
6. WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar las columnas de `saleTables` y salir 0

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/sales-schema.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
