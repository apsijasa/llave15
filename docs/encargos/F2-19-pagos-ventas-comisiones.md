# F2-19 · Extend payments additively for sales and fees

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Extensión aditiva de payments (decisión E del blueprint): work_order_id pasa a nullable, sale_id nullable con FK a sales, CHECK de exactamente uno de los dos, external_id, fee_clp (default 0, >= 0) y net_clp nullable; NO toques payments_method_check (eso es F2-20). listPayments omite feeClp y netClp sin costs.view. Importante sobre el método de trabajo: la prueba nueva DEBE usar createTestDb() de tests/helpers/pglite.ts como las demás; NO generes el esquema en memoria con drizzle-kit/api ni con otro atajo. Como tu sandbox no puede generar la migración, es esperable que la prueba nueva falle por columnas inexistentes: escríbela igual, verifica format, check y build, y reporta; la coordinadora genera la migración y corre todo. Si una prueba existente (payments.test.ts, history.test.ts, delivery.test.ts, indicators.test.ts) choca con omitir feeClp/netClp o con el null de workOrderId, no la edites: detente y repórtalo (en un caso parecido se resolvió con F2-D28: un costo null se deja tal cual).

Es la tarea `E3-T2` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T2` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-payments.ts`
- `src/server/taller/payments.ts`
- `src/server/taller/history.ts`
- `tests/integration/payments-extension.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL dejar `payments.work_order_id` nullable y agregar `sale_id`, `external_id`, `fee_clp` con valor por defecto 0 y `net_clp`, sin cambiar `payments_method_check`
2. WHEN se inserta un pago sin `work_order_id` ni `sale_id`, o con ambos THE SYSTEM SHALL rechazarlo con código `23514`
3. WHEN se inserta un pago con `fee_clp` negativo o mayor que `amount_clp`, o con `net_clp` distinto de `amount_clp - fee_clp` THE SYSTEM SHALL rechazarlo con código `23514`
4. WHEN `listPayments` corre para `reception` o `mechanic` THE SYSTEM SHALL devolver los pagos sin las claves `feeClp` ni `netClp`, y con ellas para `owner` y `admin`
5. WHEN corren `payments.test.ts`, `delivery.test.ts`, `history.test.ts` e `indicators.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
6. WHEN se cuentan las líneas de `src/server/db/schema-payments.ts` THE SYSTEM SHALL tener menos de 400

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/payments-extension.test.ts tests/integration/payments.test.ts tests/integration/delivery.test.ts tests/integration/history.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva (DROP NOT NULL se permite) → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
