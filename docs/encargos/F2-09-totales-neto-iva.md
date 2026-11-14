# F2-09 · Compute net, VAT and total for neto orders

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Primer paso del grupo de precios netos (FASE2 §2.4.1, decisión del dueño: los precios del catálogo son netos). En órdenes con pricing_mode 'neto' el sistema separa neto, IVA y total: subtotal_clp = suma de líneas vigentes, vat_clp = Math.round(subtotal × 19 / 100) con VAT_RATE_PERCENT = 19 en rules.ts, total_clp = subtotal + vat. Las órdenes 'final' (todas las existentes y las de pruebas) calculan exactamente como hoy y dejan subtotal_clp y vat_clp en 0. recomputeOrderTotals se mueve a order-totals.ts y items.ts la reexporta con la misma firma, para que approvals.ts y las pruebas existentes no cambien.

Es la tarea `E2-T1` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T1` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/order-totals.ts`
- `src/server/taller/items.ts`
- `src/server/taller/rules.ts`
- `tests/integration/pricing-totals.test.ts`

## Criterios de aceptación

1. WHEN una orden `neto` tiene líneas vigentes por 10.000 THE SYSTEM SHALL dejar `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`
2. WHEN una orden `neto` suma 10.003 THE SYSTEM SHALL dejar `vat_clp = 1901` y `total_clp = 11904`
3. WHEN se anula una línea de una orden `neto` THE SYSTEM SHALL recalcular neto, IVA y total sobre las líneas vigentes en la misma transacción
4. WHEN una orden `final` cambia sus líneas THE SYSTEM SHALL calcular `total_clp` y `estimated_minutes` como antes y dejar `subtotal_clp` y `vat_clp` en 0
5. WHEN `vatOfNet` recibe 0, 50 y 10000 THE SYSTEM SHALL devolver 0, 10 y 1900
6. WHEN corren `items.test.ts`, `order-items.test.ts`, `approvals.test.ts` y `delivery.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/pricing-totals.test.ts tests/integration/items.test.ts tests/integration/order-items.test.ts tests/integration/approvals.test.ts tests/integration/delivery.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/items.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
