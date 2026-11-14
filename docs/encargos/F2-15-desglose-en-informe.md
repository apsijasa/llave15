# F2-15 · Freeze the breakdown in the service report

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

El informe de servicio congela el desglose: al generar el informe de una orden 'neto', su snapshot guarda neto, IVA y total, y tanto la vista interna como /informe/[token] los muestran. El snapshot v1 existente y los informes ya generados no cambian (reports.ts está cerca de 400 líneas: no lo hagas crecer; extrae si hace falta según el bloque de la épica). Las órdenes 'final' producen exactamente el mismo informe que hoy.

Es la tarea `E2-T7` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T7` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/report-snapshot.ts`
- `src/server/taller/reports.ts`
- `src/components/taller/ReportView.astro`
- `tests/integration/report-pricing.test.ts`

## Criterios de aceptación

1. WHEN se genera el informe de una orden `neto` con neto 10.000 THE SYSTEM SHALL guardar en el snapshot `subtotalClp` 10000, `vatClp` 1900, `vatRatePercent` 19 y `totalClp` 11900
2. WHEN `ReportView` recibe ese snapshot THE SYSTEM SHALL mostrar las filas `Neto`, `IVA (19%)` y `Total` con los tres montos
3. WHEN se genera el informe de una orden `final` THE SYSTEM SHALL guardar el snapshot sin `subtotalClp`, `vatClp` ni `vatRatePercent`
4. WHEN se abre un informe guardado antes del cambio THE SYSTEM SHALL validarlo y mostrarlo como hoy
5. WHEN se cuentan las líneas de `src/server/taller/reports.ts` THE SYSTEM SHALL tener menos de 400

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/report-pricing.test.ts tests/integration/reports.test.ts tests/integration/report-view.test.ts tests/integration/report-page.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/reports.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
