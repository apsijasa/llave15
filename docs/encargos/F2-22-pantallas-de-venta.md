# F2-22 · Add sale pages and tablet counter sale

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Paso de la fase 2 según el blueprint aprobado; el detalle completo está en el bloque E3-T5 de blueprints/vector-taller-f2/epics/03-ventas-pagos.md. El servidor ya existe (F2-21): src/server/taller/sales.ts exporta saleFormSchema, previewSale, createSale, listSales, listCustomerSales y formatSaleNumber; src/server/taller/sale-void.ts exporta voidSale. Las páginas siguen requireAdmin → can → zod → src/server/taller/** como src/pages/taller/inventario/*.astro (cópialos como patrón, incluidos los estilos locales bajo .taller y objetivos ≥ 48px, sin islas nuevas). Tu sandbox no tiene Postgres: escribe e2e/venta-mostrador.spec.ts siguiendo e2e/inventario-ajuste.spec.ts y e2e/fixtures.ts, pero no lo ejecutes; la coordinadora corre test:tablet y gate. Corre solo format, check, test y build.

Es la tarea `E3-T5` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E3-T5` de `blueprints/vector-taller-f2/epics/03-ventas-pagos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/ventas/index.astro`
- `src/pages/taller/ventas/nueva.astro`
- `src/layouts/TallerLayout.astro`
- `e2e/venta-mostrador.spec.ts`

## Criterios de aceptación

1. WHEN el spec `e2e/venta-mostrador.spec.ts` corre en tablet THE SYSTEM SHALL registrar una venta sin cliente de 2 unidades por transferencia, mostrar `Total` `$11.900` antes de registrar y `Venta VM-` con cinco dígitos y `registrada.` después, y la ficha del producto SHALL mostrar stock `1`
2. WHEN el mecánico pide `/taller/ventas/nueva` en ese spec THE SYSTEM SHALL responder 403
3. WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener el enlace `/taller/ventas` con la acción `sales.record`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm build && pnpm test:tablet e2e/venta-mostrador.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/ventas"' src/layouts/TallerLayout.astro && grep -q '"sales.record"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
