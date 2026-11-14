# F2-28 · Route cash order payments through the session

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E4-T4 de blueprints/vector-taller-f2/epics/04-caja-gastos.md. src/server/taller/cash.ts ya existe (F2-27) y exporta requireOpenCashSession(tx, branchId) → {mode:'off'|'closed'|'open', sessionId?}, recordCashMovement(tx, actor, {sessionId, kind, amountClp, referenceKind, referenceId, note?}, now) → {ok:true,movementId}|{ok:false,code} y voidCashMovementFor(tx, actor, 'payment', paymentId, now) → {ok:true}|{ok:false,code:'cash_session_closed'}. Se llaman dentro de la transacción de recordPayment/voidPayment, nunca abren otra. Si recordCashMovement devuelve ok:false después de insertar el pago, lanza un error centinela para revertir y tradúcelo afuera a {ok:false, code} (regla 13 de CLAUDE.md: devolverlo no revierte). Las firmas exportadas de payments.ts no cambian; payments.test.ts, delivery.test.ts, mercadopago-payments.test.ts y e2e/entrega.spec.ts no se tocan y deben seguir pasando (con la caja apagada, todo igual que hoy). No hace falta migración: corre format, check, test y build; si la suite completa tarda demasiado, corre al menos los archivos del Verify y los de pagos.

Es la tarea `E4-T4` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E4-T4` de `blueprints/vector-taller-f2/epics/04-caja-gastos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/payments.ts`
- `src/pages/taller/ordenes/[id]/entrega.astro`
- `tests/integration/cash-order-payments.test.ts`

## Criterios de aceptación

1. WHEN la caja está habilitada y abierta y se registra un pago `efectivo` de una orden THE SYSTEM SHALL guardar el pago con `cash_session_id` y un `cash_movements` `ingreso` por el mismo monto, en la misma transacción
2. WHEN la caja está habilitada y no hay sesión abierta THE SYSTEM SHALL devolver `ok: false` con código `cash_closed` sin escribir pago ni movimiento
3. WHEN la caja no está habilitada THE SYSTEM SHALL registrar el pago `efectivo` como hoy, sin `cash_session_id`, con `payments.test.ts` sin cambios
4. WHEN se anula un pago en efectivo cuya sesión sigue abierta THE SYSTEM SHALL marcar también su movimiento con `voided_at`
5. WHEN la sesión de ese pago ya cerró THE SYSTEM SHALL devolver `ok: false` con código `cash_session_closed` sin anular nada
6. WHEN se registra un pago por transferencia con la caja abierta THE SYSTEM SHALL no crear movimiento de caja

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/cash-order-payments.test.ts tests/integration/payments.test.ts tests/integration/delivery.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
