# F2-16 · Show net and VAT on approvals

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Aprobaciones de adicionales: cuando la orden es 'neto', la página pública /aprobacion/[token] y el detalle interno muestran el precio del adicional como neto + IVA = total (el precio guardado de la propuesta sigue siendo el neto de la línea). Con órdenes 'final', la página es idéntica a la de hoy y las pruebas existentes de aprobación no cambian. La página pública mantiene sus reglas: el token es la defensa, sin Origin, solo primer nombre, no-store, noindex y no-referrer.

Es la tarea `E2-T8` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T8` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/approvals.ts`
- `src/pages/aprobacion/[token].astro`
- `src/pages/taller/ordenes/[id]/adicional.astro`
- `tests/integration/approval-pricing.test.ts`

## Criterios de aceptación

1. WHEN el cliente abre `/aprobacion/<token>` de un adicional de 10.000 en una orden `neto` THE SYSTEM SHALL mostrar `Precio neto` `$10.000`, `IVA (19%)` `$1.900` y `Total` `$11.900`
2. WHEN el adicional es de una orden `final` THE SYSTEM SHALL mostrar `Precio` con el monto como hoy, con `approval-page.test.ts` sin cambios
3. WHEN el cliente aprueba ese adicional en una orden `neto` sin otras líneas THE SYSTEM SHALL agregar la línea con `unit_price_clp = 10000` y dejar la orden con `total_clp = 11900`
4. WHEN el personal abre `/taller/ordenes/<id>/adicional` de una orden `neto` THE SYSTEM SHALL rotular el campo de precio como `Precio neto` y mostrar cada propuesta con su IVA
5. WHEN se cuentan las líneas de `src/server/taller/approvals.ts` THE SYSTEM SHALL tener menos de 400

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/approval-pricing.test.ts tests/integration/approval-page.test.ts tests/integration/approvals.test.ts tests/integration/approval-decide.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/approvals.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
