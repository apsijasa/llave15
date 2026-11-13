# F2-04 · Add inventory pages and tablet stock adjustment

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Pantallas de inventario en /taller: lista con stock y mínimo (filtros por categoría y bajo mínimo), alta de producto y ficha con movimientos y ajuste manual con motivo. Son páginas Astro del servidor con formularios POST, sin islas nuevas, con los tokens de diseño existentes, objetivos táctiles de al menos 48px y estados con forma y texto (.claude/rules/taller-ui.md). Cada página: requireAdmin → can → zod → src/server/taller/**, con isAllowedOrigin en los POST. Incluye el spec de Playwright en tablet para el ajuste de stock: crea sus propios datos por la interfaz y no edita e2e/global-setup.ts, e2e/fixtures.ts ni playwright.config.ts (.claude/rules/e2e.md). Tú no puedes correr test:tablet; escríbelo y la coordinadora lo corre.

Es la tarea `E1-T5` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T5` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/inventario/index.astro`
- `src/pages/taller/inventario/nuevo.astro`
- `src/pages/taller/inventario/[id].astro`
- `src/layouts/TallerLayout.astro`
- `e2e/inventario-ajuste.spec.ts`

## Criterios de aceptación

1. WHEN el spec `e2e/inventario-ajuste.spec.ts` corre en el viewport de tablet THE SYSTEM SHALL crear un producto desde `/taller/inventario/nuevo`, mostrarlo con el texto `Bajo mínimo` en `/taller/inventario?bajo=1`, registrar un ajuste de +5 con motivo y mostrar `Stock ajustado.` y stock `5` en su ficha
2. WHEN el mecánico abre `/taller/inventario` en ese spec THE SYSTEM SHALL mostrar la lista sin la columna `Costo` y sin el enlace `Nuevo producto`
3. WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener el enlace `/taller/inventario` con la acción `inventory.view`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm build && pnpm test:tablet e2e/inventario-ajuste.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/inventario"' src/layouts/TallerLayout.astro && grep -q '"inventory.view"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
