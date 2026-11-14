# F2-20 · Replace the payment method CHECK for Mercado Pago

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

La única excepción declarada a 'cambios siempre aditivos' de la fase 2 (decisión 55): reemplazar el CHECK payments_method_check para admitir 'mercadopago'. En schema-payments.ts cambia SOLO ese CHECK y el $type de method; nada más, porque la migración de este paso debe contener únicamente el DROP y el ADD de esa restricción. Mercado Pago es solo registro: nada de credenciales ni llamadas a su API (No negociable 19). PAYMENT_METHODS queda igual; se agrega RECORDABLE_PAYMENT_METHODS. La prueba nueva usa createTestDb(); sin la migración, que genera la coordinadora, es esperable que falle en tu sandbox: escríbela igual y reporta. No generes el esquema en memoria.

Es la tarea `E3-T3` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T3` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/db/schema-payments.ts`
- `src/server/taller/rules.ts`
- `tests/integration/payment-method-check.test.ts`
- `drizzle/**`

## Criterios de aceptación

1. WHEN `pnpm db:generate` corre THE SYSTEM SHALL emitir una migración propia cuyas únicas sentencias quitan y vuelven a crear `payments_method_check`
2. WHEN se inserta un pago `mercadopago` con `external_id` THE SYSTEM SHALL aceptarlo, y sin `external_id` SHALL rechazarlo con código `23514`
3. WHEN se inserta un pago con método `cheque` THE SYSTEM SHALL rechazarlo con código `23514`
4. WHEN se leen `PAYMENT_METHODS` y `RECORDABLE_PAYMENT_METHODS` THE SYSTEM SHALL tener `transferencia`, `tarjeta`, `efectivo` y `otro` en el primero, y esos cuatro más `mercadopago` en el segundo, con la etiqueta `Mercado Pago`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/payment-method-check.test.ts tests/integration/payments.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -qF 'DROP CONSTRAINT "payments_method_check"' "$f" && grep -qF 'ADD CONSTRAINT "payments_method_check"' "$f" && { grep -Eq 'CREATE TABLE|CREATE (UNIQUE )?INDEX|DROP INDEX|ADD COLUMN|DROP COLUMN|ALTER COLUMN|RENAME' "$f"; test $? -eq 1; } && test -z "$(grep -oE 'CONSTRAINT "[a-z_]+"' "$f" | grep -v '"payments_method_check"')"   # expect: exit 0 — la migración más nueva solo quita y vuelve a crear payments_method_check
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
