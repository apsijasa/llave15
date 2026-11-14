# F2-11 · Show net, VAT and total on order screens

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Pantallas de la orden en /taller (detalle, líneas, entrega, recepción): cuando la orden es 'neto' muestran Neto / IVA (19%) / Total con un componente nuevo OrderAmounts.astro que recibe montos ya formateados; cuando es 'final' su salida es idéntica a la de hoy (las pruebas existentes de esas páginas no cambian). Sin islas nuevas, tokens existentes, tabular-nums.

Es la tarea `E2-T3` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T3` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/components/taller/OrderAmounts.astro`
- `src/pages/taller/ordenes/[id]/index.astro`
- `src/pages/taller/ordenes/[id]/recepcion.astro`
- `src/pages/taller/ordenes/[id]/entrega.astro`
- `tests/integration/order-amounts-page.test.ts`

## Criterios de aceptación

1. WHEN se renderiza `/taller/ordenes/<id>` de una orden `neto` con neto 10.000 THE SYSTEM SHALL mostrar `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total para el cliente` `$11.900`
2. WHEN se renderiza `/taller/ordenes/<id>/entrega` de esa orden THE SYSTEM SHALL mostrar neto, IVA, `Total` `$11.900` y `Saldo` `$11.900`, y el campo `Monto` con valor `11900`
3. WHEN se renderiza `/taller/ordenes/<id>/recepcion` de esa orden THE SYSTEM SHALL mostrar `Neto`, `IVA (19%)` y el total `$11.900`
4. WHEN las tres páginas se renderizan para una orden `final` THE SYSTEM SHALL no contener `IVA (19%)` y mostrar el total con el mismo marcado de hoy
5. WHEN se fuerza `status = 'entregada'` en una orden `neto` de total 11.900 con `paid_clp = 10000` THE SYSTEM SHALL fallar con código `23514`, y con `paid_clp = 11900` SHALL aceptarlo
6. WHEN corre `pnpm test` THE SYSTEM SHALL pasar sin cambios en ninguna prueba existente

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/order-amounts-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
