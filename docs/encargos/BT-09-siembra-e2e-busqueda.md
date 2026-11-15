# BT-09 · E2E seed and tablet search spec

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-09 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E2-T5` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E2-T5` de `blueprints/vector-biblioteca/epics/02-biblioteca-base.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/e2e.md` (con la excepción BT-D7: esta fase autoriza editar `e2e/fixtures.ts` y `e2e/global-setup.ts`); y como patrón y contrato: `e2e/fixtures.ts`, `e2e/global-setup.ts`, `e2e/inventario-ajuste.spec.ts`, `e2e/login.spec.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `e2e/fixtures.ts`
- `e2e/global-setup.ts`
- `e2e/biblioteca-busqueda.spec.ts`

## Criterios de aceptación

1. WHEN corre `e2e/global-setup.ts` THE SYSTEM SHALL sembrar (si existen las tablas) un fabricante, familia, modelo `RD-M8100-SGS`, variante, una especificación `sin_dato_verificado`, un documento `enlace` y un artículo publicado con los ids fijos de `SEED.library*` (edición autorizada BT-D7)
2. WHEN el mecánico busca `RD-M8100-SGS` en tablet THE SYSTEM SHALL mostrar la coincidencia exacta, abrir la ficha con un toque y ver la sección Especificaciones con la etiqueta 'Sin dato verificado'
3. WHEN el mecánico abre una categoría desde el inicio THE SYSTEM SHALL llegar a resultados filtrados

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm build && pnpm test:tablet e2e/biblioteca-busqueda.spec.ts   # expect: exit 0 (coordinadora)
git diff HEAD --name-only -- e2e | LC_ALL=C sort | tr '\n' ' ' | grep -q 'e2e/biblioteca-busqueda.spec.ts e2e/fixtures.ts e2e/global-setup.ts'   # expect: exit 0 — solo esos tres
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
