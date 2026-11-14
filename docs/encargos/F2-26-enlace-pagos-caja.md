# F2-26 · Link payments and sales to cash sessions

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E4-T2 de blueprints/vector-taller-f2/epics/04-caja-gastos.md. cashSessions ya existe en src/server/db/schema-cash.ts (F2-25, migración 0032 aplicada); schema-sales.ts y schema-payments.ts lo importan de ahí. Tu sandbox no tiene Postgres ni red: NO corras db:generate ni db:migrate. Escribe tests/integration/cash-links-schema.test.ts con createTestDb() de tests/helpers/pglite.ts; fallará hasta que la coordinadora genere la migración, y eso es lo esperado (no lo arregles con drizzle-kit/api en memoria). Las pruebas existentes que inserten pagos o ventas también pueden fallar por la columna nueva sin migrar: no las toques. Corre format, check y build; corre test y reporta qué falla solo por falta de migración.

Es la tarea `E4-T2` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E4-T2` de `blueprints/vector-taller-f2/epics/04-caja-gastos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-payments.ts`
- `src/server/db/schema-sales.ts`
- `tests/integration/cash-links-schema.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL agregar `payments.cash_session_id` y `sales.cash_session_id`, nullable y con FK a `cash_sessions`, sin borrar nada
2. WHEN se inserta un pago o una venta con un `cash_session_id` que no existe THE SYSTEM SHALL rechazarlo con código `23503`
3. WHEN corren `payments.test.ts`, `payments-extension.test.ts` y `sales.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
4. WHEN se cuentan las líneas de `schema-payments.ts` y `schema-sales.ts` THE SYSTEM SHALL tener menos de 400 en cada uno

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/cash-links-schema.test.ts tests/integration/payments.test.ts tests/integration/payments-extension.test.ts tests/integration/sales.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-payments.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/db/schema-sales.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
