# F2-27 · Add cash session server

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E4-T3 y en 'Contracts' de blueprints/vector-taller-f2/epics/04-caja-gastos.md. El esquema ya existe y está migrado (F2-25 migración 0032, F2-26 migración 0033): cashSessions, cashMovements y expenses en src/server/db/schema-cash.ts, branches.cashControlEnabled en schema.ts, payments.cashSessionId y sales.cashSessionId. No hace falta ninguna migración: las pruebas con createTestDb() de tests/helpers/pglite.ts deben pasar en tu sandbox. El 23505 de uq_cash_sessions_open se traduce a cash_session_open (ojo: un error de Postgres dentro de una transacción la aborta; captúralo fuera o usa un savepoint, como hace otro código del repo). requireOpenCashSession, recordCashMovement y voidCashMovementFor reciben el tx de quien llama y nunca abren su propia transacción. Montos en pesos enteros; 'esperado' = apertura + ingresos vigentes - egresos vigentes de la sesión. dayPaymentsSummary usa TIMEZONE de src/server/booking/rules.ts y RECORDABLE_PAYMENT_METHODS de rules.ts. No toques payments.ts, sales.ts ni sale-void.ts: el enrutamiento del efectivo llega en F2-28 y F2-29. Corre format, check, test y build.

Es la tarea `E4-T3` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E4-T3` de `blueprints/vector-taller-f2/epics/04-caja-gastos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/cash.ts`
- `src/server/taller/rules.ts`
- `tests/integration/cash.test.ts`

## Criterios de aceptación

1. WHEN la caja está habilitada y `reception` abre una sesión con 20.000 THE SYSTEM SHALL crearla con `opened_by` y `opening_cash_clp = 20000` y registrar `cash.opened`, y una segunda apertura SHALL devolver `ok: false` con código `cash_session_open`
2. WHEN se cierra con conteo 31.000 tras un ingreso de 15.000 y un egreso de 3.000 THE SYSTEM SHALL guardar `expected_cash_clp = 32000` y `difference_clp = -1000` y registrar `cash.closed` con esperado, contado y diferencia
3. WHEN la caja no está habilitada y alguien intenta abrirla THE SYSTEM SHALL devolver `ok: false` con código `cash_control_off`
4. WHEN `reception` llama `setCashControl` THE SYSTEM SHALL devolver `forbidden`, y WHEN `owner` intenta desactivarla con una sesión abierta THE SYSTEM SHALL devolver `cash_session_open`; cada cambio efectivo SHALL registrar `cash.control_changed`
5. WHEN `dayPaymentsSummary` corre THE SYSTEM SHALL sumar por método los pagos vigentes del día local de órdenes y ventas, incluidos transferencia, tarjeta y Mercado Pago
6. WHEN el mecánico llama cualquier función de caja THE SYSTEM SHALL devolver `ok: false` con código `forbidden`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/cash.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
