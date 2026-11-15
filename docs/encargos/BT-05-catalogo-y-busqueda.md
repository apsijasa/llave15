# BT-05 · Catalog queries and library search

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-05 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E2-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E2-T1` de `blueprints/vector-biblioteca/epics/02-biblioteca-base.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; y como patrón y contrato: `src/server/taller/search.ts` (escape de ILIKE), `src/server/db/schema-library-*.ts`, `src/server/library/rules.ts`, `src/server/library/access.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/catalog.ts`
- `src/server/library/search.ts`
- `tests/integration/library-search.test.ts`
- `tests/integration/library-catalog.test.ts`
- `tests/unit/library-detect-code.test.ts`

## Criterios de aceptación

1. WHEN `searchLibrary` recibe `RD-M8100-SGS` THE SYSTEM SHALL devolverlo en `exact` antes que cualquier otro resultado y distinguir dos variantes con revisión distinta
2. WHEN recibe `cambio trasero salta` THE SYSTEM SHALL devolver artículos y modelos por FTS `spanish` ordenados por `ts_rank` y filtrables por categoría, fabricante y estado
3. WHEN existe una propuesta `submitted` con ese texto THE SYSTEM SHALL no devolverla
4. WHEN `variantSheet` recibe una variante THE SYSTEM SHALL devolver especificaciones con `validationStatus`, `reviewedOn` y documento fuente, documentos, procedimientos, reglas de compatibilidad y versiones de artículos ligados
5. WHEN el actor no tiene `library.view` THE SYSTEM SHALL devolver `{ ok: false, code: 'forbidden' }`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-search.test.ts tests/integration/library-catalog.test.ts tests/unit/library-detect-code.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
