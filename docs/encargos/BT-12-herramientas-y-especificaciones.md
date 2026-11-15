# BT-12 · Tools and specifications lookup

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-12 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E3-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E3-T3` de `blueprints/vector-biblioteca/epics/03-procedimientos-compatibilidad.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/server/library/search.ts`, `src/server/library/catalog.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/specifications.ts`
- `src/pages/taller/biblioteca/herramientas.astro`
- `tests/integration/library-specifications.test.ts`
- `tests/integration/biblioteca-herramientas-page.test.ts`

## Criterios de aceptación

1. WHEN `lookupSpecifications` recibe una variante y un tipo (`torque`) sin dato THE SYSTEM SHALL devolver una entrada `sin_dato_verificado` en lugar de omitirla
2. WHEN recibe una operación (texto) THE SYSTEM SHALL devolver herramientas y consumibles por FTS sobre nombre, uso y especificación
3. WHEN se abre `/taller/biblioteca/herramientas` THE SYSTEM SHALL mostrar tipo, código, tamaños, consumibles, torque con unidad, advertencias y la etiqueta 'Sin dato verificado' cuando corresponde

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-specifications.test.ts tests/integration/biblioteca-herramientas-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
