# F2-23 · Record Mercado Pago on order payments

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E3-T6 de blueprints/vector-taller-f2/epics/03-ventas-pagos.md. Mercado Pago es solo registro (No negociable 19): nada de credenciales, SDK ni llamadas a su API. Ya existen: RECORDABLE_PAYMENT_METHODS y PAYMENT_METHOD_LABELS en rules.ts (F2-20, incluye 'mercadopago'), columnas external_id, fee_clp y net_clp en payments con sus CHECK (F2-19, migración 0030) y el CHECK de método (F2-20, migración 0031); no hace falta migración nueva. Las pruebas nuevas usan createTestDb() de tests/helpers/pglite.ts. fee_clp y net_clp solo salen de src/server/** para roles con costs.view. En indicators.ts la fila 'Mercado Pago' solo aparece si hubo pagos de ese medio en el rango, para que tests/integration/indicators.test.ts e indicadores-page.test.ts sigan pasando sin cambios. e2e/entrega.spec.ts no se modifica y debe seguir pasando: conserva los rótulos actuales de entrega.astro. Tu sandbox no tiene Postgres: corre solo format, check, test y build.

Es la tarea `E3-T6` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T6` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/payments.ts`
- `src/pages/taller/ordenes/[id]/entrega.astro`
- `src/server/taller/indicators.ts`
- `tests/integration/mercadopago-payments.test.ts`

## Criterios de aceptación

1. WHEN se registra en una orden un pago `mercadopago` de 11.900 con `externalId` y comisión 450 THE SYSTEM SHALL guardar `external_id`, `fee_clp = 450` y `net_clp = 11450`
2. WHEN el pago `mercadopago` llega sin `externalId` THE SYSTEM SHALL devolver `ok: false` con código `validation_error` sin escribir
3. WHEN un pago que no es `mercadopago` trae comisión mayor que 0 THE SYSTEM SHALL devolver `ok: false` con código `validation_error`
4. WHEN `workshopIndicators` corre con un pago `mercadopago` en el rango THE SYSTEM SHALL agregar la fila `Mercado Pago` a `income.byMethod` y sumarlo al total, y sin pagos `mercadopago` SHALL devolver las cuatro filas de hoy
5. WHEN se lee `src/pages/taller/ordenes/[id]/entrega.astro` THE SYSTEM SHALL ofrecer los métodos de `RECORDABLE_PAYMENT_METHODS` y los campos `Id de la operación` y `Comisión`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/mercadopago-payments.test.ts tests/integration/payments.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
grep -q 'RECORDABLE_PAYMENT_METHODS' 'src/pages/taller/ordenes/[id]/entrega.astro' && grep -qF 'Id de la operación' 'src/pages/taller/ordenes/[id]/entrega.astro'   # expect: exit 0
test "$(wc -l < src/server/taller/payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/entrega.spec.ts sin cambios)
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
