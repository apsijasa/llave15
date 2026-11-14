# F2-25 · Add cash sessions, movements and expenses schema

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E4-T1 y en la tabla 'Data model touched here' de blueprints/vector-taller-f2/epics/04-caja-gastos.md. schema-cash.ts importa solo de schema.ts y schema-inventory.ts (suppliers); NO lo importes desde schema-sales.ts ni schema-payments.ts en este paso (eso es F2-26). drizzle.config.ts ya toma src/server/db/schema*.ts. Tu sandbox no tiene Postgres ni red: NO corras db:generate ni db:migrate. Escribe tests/integration/cash-schema.test.ts con createTestDb() de tests/helpers/pglite.ts (aplica las migraciones de drizzle/); las pruebas nuevas fallarán hasta que la coordinadora genere la migración, y eso es lo esperado: no las cambies para que pasen ni uses drizzle-kit/api en memoria. Corre format, check y build; corre test y reporta qué pruebas fallan solo por falta de migración.

Es la tarea `E4-T1` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E4-T1` de `blueprints/vector-taller-f2/epics/04-caja-gastos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-cash.ts`
- `src/server/db/schema.ts`
- `scripts/db-check.ts`
- `tests/integration/cash-schema.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `cash_sessions`, `cash_movements` y `expenses` y agregar `branches.cash_control_enabled` con valor por defecto `false`
2. WHEN se abre una segunda sesión sin cerrar la primera en la misma sucursal THE SYSTEM SHALL rechazarla con código `23505`
3. WHEN una sesión se cierra con `difference_clp` distinto de `counted_cash_clp - expected_cash_clp`, o queda con solo parte de los datos de cierre THE SYSTEM SHALL rechazarla con código `23514`
4. WHEN un gasto tiene `amount_clp <= 0` o una categoría fuera de `arriendo`, `sueldos`, `servicios`, `insumos`, `repuestos` y `otros` THE SYSTEM SHALL rechazarlo con código `23514`
5. WHEN un movimiento de caja tiene `amount_clp <= 0` o `kind` fuera de `ingreso` y `egreso` THE SYSTEM SHALL rechazarlo con código `23514`
6. WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar las columnas de `cashTables` y salir 0

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/cash-schema.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
