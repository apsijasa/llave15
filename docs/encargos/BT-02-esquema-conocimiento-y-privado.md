# BT-02 · Esquema de conocimiento, procedimientos, compatibilidad y capa privada

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Segundo paso de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1, BT-D3, BT-D9). BT-01 dejó `schema-library-catalog.ts` y la migración `0035`. Ahora van los tres archivos restantes de la cadena: conocimiento (artículos, versiones inmutables, reglas de diagnóstico, trozos indexados con índice GIN `spanish`), procedimientos y compatibilidad n-aria, y la capa privada por sucursal (propuestas, revisiones, eventos de publicación, diagnósticos técnicos, notas privadas e interacciones de IA). Las tablas globales no llevan `branch_id` (BT-D1); `knowledge_proposals`, `technical_diagnoses`, `private_technical_notes` y `ai_interactions` sí, `NOT NULL`. Solo esquema, migración generada y pruebas.

Es la tarea `E1-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta es el bloque `E1-T2` de `blueprints/vector-biblioteca/epics/01-fundacion.md`: léelo completo junto con las **reglas transversales** y los **patrones del repo**.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `src/server/db/schema-library-catalog.ts` (recién creado), `src/server/db/schema-orders.ts` (helpers `branchReference`/`creatorReference`, autorreferencias con `AnyPgColumn`), `src/server/db/schema-payments.ts` (patrón de tabla con `voided_at`); `scripts/db-check.ts`; `tests/integration/library-catalog-schema.test.ts` (patrón recién escrito).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero**, luego el esquema, luego `pnpm db:generate` (una sola vez). Sin commit, tag ni push. Sandbox sin red: corre `pnpm format`, `pnpm check`, `pnpm test tests/integration/library-schema.test.ts`, `pnpm test` y `pnpm build`.

## Archivos (máximo estos, más `drizzle/` generado)

- `src/server/db/schema-library-knowledge.ts` (nuevo)
- `src/server/db/schema-library-procedures.ts` (nuevo)
- `src/server/db/schema-library-private.ts` (nuevo)
- `scripts/db-check.ts`
- `tests/integration/library-schema.test.ts` (nuevo)

## Criterios de aceptación

1. WHEN se leen los tres archivos THE SYSTEM SHALL definir las 16 tablas del bloque E1-T2 con sus columnas, únicos, índices y CHECK exactos, exportar `libraryKnowledgeTables`, `libraryProcedureTables`, `libraryPrivateTables`, y cada archivo tener menos de 400 líneas.
2. WHEN se inserta una regla `oficial_confirmada` sin `source_document_id` THE SYSTEM SHALL rechazarla; una propuesta `published` sin `published_version_id`, rechazarla; una `draft` con `published_version_id`, rechazarla; una interacción `orden` sin `work_order_id`, rechazarla; un diagnóstico `confirmado` sin `confirmed_at`, rechazarlo.
3. WHEN se consulta `document_chunks` con `to_tsvector('spanish', text) @@ plainto_tsquery('spanish', 'cambios traseros')` THE SYSTEM SHALL devolver el trozo que dice "cambio trasero" y la migración `0036` SHALL contener el índice GIN con `to_tsvector`.
4. WHEN corre `pnpm db:generate` THE SYSTEM SHALL producir una sola migración `0036_*.sql` aditiva.
5. WHEN se recorren las columnas THE SYSTEM SHALL encontrar `branch_id` solo en `knowledge_proposals`, `technical_diagnoses`, `private_technical_notes` y `ai_interactions`.

## Notas de implementación

- La columna `references` de `technical_diagnoses` se llama así en SQL; la propiedad TypeScript es `refs` (`refs: jsonb("references")…`) para no chocar con la palabra reservada en el código.
- `knowledge_articles.current_version_id` y `article_versions.supersedes_version_id` son autorreferencias/referencias cruzadas dentro del mismo archivo: usa `(): AnyPgColumn => …`.
- Índice GIN de expresión: `index("idx_document_chunks_fts").using("gin", sql\`to_tsvector('spanish', ${t.text})\`)`.
- `jsonb(...).$type<...>().notNull().default(sql\`'[]'::jsonb\`)` como en `audit_log.details`.

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`; no responder renombres.
- `schema-library-catalog.ts`, `schema.ts` y el resto del esquema existente.
- Ninguna prueba existente. `.env*`, `.claude/settings.json`.
- Importaciones relativas con `.ts`; `import type`; sin `enum`; nombre del taller nunca literal.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-schema.test.ts   # expect: exit 0, 0 failed
test "$(ls drizzle/0036_*.sql | wc -l | tr -d ' ')" = 1 && grep -q 'to_tsvector' drizzle/0036_*.sql   # expect: exit 0
for f in src/server/db/schema-library-knowledge.ts src/server/db/schema-library-procedures.ts src/server/db/schema-library-private.ts; do test "$(wc -l < $f | tr -d ' ')" -lt 400 || exit 1; done   # expect: exit 0
pnpm db:migrate && pnpm db:check   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas, nombre de la migración y resumen de sentencias, resultado de `format`, `check`, `test` y `build`, desviaciones con motivo.
