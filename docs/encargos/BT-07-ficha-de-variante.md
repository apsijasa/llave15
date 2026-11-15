# BT-07 · Variant sheet with sections

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-07 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E2-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E2-T3` de `blueprints/vector-biblioteca/epics/02-biblioteca-base.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/components/taller/OrderTabs.astro`, `src/pages/taller/biblioteca/buscar.astro`, `src/server/library/catalog.ts`, `tests/integration/biblioteca-pages.test.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/biblioteca/componentes/[id].astro`
- `src/components/taller/library/LibraryTabs.astro`
- `src/components/taller/library/SourceList.astro`
- `tests/integration/biblioteca-ficha-page.test.ts`

## Criterios de aceptación

1. WHEN se abre `/taller/biblioteca/componentes/[id]` THE SYSTEM SHALL mostrar encabezado fabricante · familia · modelo · variante · código · generación · velocidades y secciones Resumen, Especificaciones, Compatibilidad, Procedimientos, Documentos, Historial por `?seccion=` con `aria-current`
2. WHEN una especificación no está verificada THE SYSTEM SHALL mostrar su etiqueta de estado y fecha de revisión; cada una con su fuente enlazada
3. WHEN el id no existe o no es uuid THE SYSTEM SHALL responder 404
4. WHEN la sección es Historial THE SYSTEM SHALL listar versiones publicadas con número, fecha y revisor

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/biblioteca-ficha-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
