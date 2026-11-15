# BT-01 · Esquema del catálogo global de la biblioteca y marca de curador

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

El dueño aprobó construir la Biblioteca Técnica dentro del programa del taller (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15). Este es el primer paso: las ocho tablas **globales** del catálogo técnico (fabricantes, familias, modelos, variantes, fuentes, documentos, especificaciones, herramientas) y la columna `users.library_curator`. Las tablas globales **no llevan `branch_id`** (decisión BT-D1, única excepción declarada a `.claude/rules/database.md`). No hay lógica de dominio en este paso: solo esquema, migración generada y pruebas de esquema.

Es la tarea `E1-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta es el bloque `E1-T1` de `blueprints/vector-biblioteca/epics/01-fundacion.md`: léelo completo junto con las **reglas transversales** y los **patrones del repo** del inicio de esa épica.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md` (aplica a `src/server/db/**`, `drizzle/**`, `scripts/db-*.ts`); `src/server/db/schema.ts` y `src/server/db/schema-orders.ts` (patrón de columnas, CHECK, índices y FKs); `scripts/db-check.ts`; `tests/integration/inventory-schema.test.ts` (patrón de prueba de esquema con PGlite); `tests/helpers/pglite.ts`.

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el esquema, luego `pnpm db:generate`. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test tests/integration/library-catalog-schema.test.ts`, `pnpm test` y `pnpm build`; `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos, más lo que genere `pnpm db:generate` en `drizzle/`)

- `src/server/db/schema-library-catalog.ts` (nuevo)
- `src/server/db/schema.ts` (solo la columna `library_curator` en `users`)
- `scripts/db-check.ts` (importar y recorrer `libraryCatalogTables`)
- `tests/integration/library-catalog-schema.test.ts` (nuevo)

## Criterios de aceptación

1. WHEN se lee `schema-library-catalog.ts` THE SYSTEM SHALL definir `manufacturers`, `component_families`, `component_models`, `component_variants`, `knowledge_sources`, `technical_documents`, `technical_specifications`, `tools_consumables` exactamente con las columnas, únicos y CHECK de la tabla del bloque E1-T1, sin `branch_id`, y exportar `libraryCatalogTables`.
2. WHEN se lee `schema.ts` THE SYSTEM SHALL tener `users.library_curator boolean not null default false`.
3. WHEN corre `pnpm db:generate` THE SYSTEM SHALL producir **una sola** migración `drizzle/0035_*.sql`, aditiva (sin `DROP`), con `CREATE TABLE` de las ocho tablas, `ALTER TABLE "users" ADD COLUMN "library_curator"` y los índices.
4. WHEN se inserta una especificación `verificado` sin `source_document_id` THE SYSTEM SHALL rechazarla por CHECK; un documento con `storage_key` y licencia `enlace`, rechazarlo; `speeds = 15`, rechazarlo; `year_to < year_from`, rechazarlo; variante duplicada `(model_id, code, revision)`, rechazarla.
5. WHEN corre `pnpm db:check` THE SYSTEM SHALL recorrer también `libraryCatalogTables`.

## No cambiar

- Nada en `drizzle/` a mano; nunca `drizzle-kit generate --custom`. Si `db:generate` pregunta por renombres, no respondas: el esquema está mal.
- `.claude/settings.json`, `.env`, `.env.example`, secretos.
- Ninguna prueba existente. Ninguna otra tabla ni columna de `schema.ts`.
- Firmas exportadas existentes. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).
- Importaciones relativas con `.ts`; `import type` para tipos; sin `enum`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-catalog-schema.test.ts   # expect: exit 0, 0 failed
test "$(ls drizzle/0035_*.sql | wc -l | tr -d ' ')" = 1   # expect: exit 0
grep -Eiq 'drop (table|column)' drizzle/0035_*.sql; test $? -eq 1   # expect: exit 0
grep -q 'libraryCatalogTables' scripts/db-check.ts   # expect: exit 0
pnpm db:migrate && pnpm db:check   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, nombre de la migración generada y las sentencias que contiene (resumen), resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
