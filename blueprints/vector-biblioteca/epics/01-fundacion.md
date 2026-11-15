# Epic 01: Fundación de la biblioteca

> Después de esta épica existen las 24 tablas de la biblioteca (ocho globales de catálogo y documentos, cinco de conocimiento, cinco de procedimientos y compatibilidad, seis de gobernanza y capa privada), la marca `users.library_curator`, las cuatro acciones nuevas con `canCurate`, las constantes y etiquetas del módulo, y el paquete de contenido con su importación idempotente y la siembra inicial verificable.

| | |
|---|---|
| **Epic id** | `01-fundacion` |
| **Tasks** | `E1-T1` … `E1-T4` (pasos BT-01 … BT-04) |
| **Depends on** | nada |
| **Unlocks** | `02-biblioteca-base` |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · Vitest + PGlite. `pnpm` 12.4.2; Node 24. **Ninguna dependencia nueva.**

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. El sandbox de Codex corre solo `format`, `check`, `test`, `build` (y `db:generate`, que no necesita red); `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora, que también commitea.

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos salvo donde el bloque lo declara; **releer cada archivo antes de tocarlo**; ningún texto para el usuario escribe el nombre del taller literal (`SITE.name`); nunca editar `drizzle/` a mano (solo `pnpm db:generate`, nunca `--custom`); cambios de esquema aditivos; `db` y `now` como argumentos (nunca `new Date()` en `src/server/**`); zod en toda entrada; importaciones relativas con extensión `.ts`; `import type` para tipos; nada de `enum`; archivos < 400 líneas, funciones < 50.

**Excepción declarada de esta fase (BT-D1):** las tablas del conocimiento **global** no llevan `branch_id`. Las tablas privadas (`knowledge_proposals`, `technical_diagnoses`, `private_technical_notes`, `ai_interactions`) sí lo llevan, `NOT NULL`, con FK a `branches`.

## Directory subtree

```
src/server/db/schema.ts                      # edit (E1-T1): users.library_curator
src/server/db/schema-library-catalog.ts      # NEW (E1-T1)
src/server/db/schema-library-knowledge.ts    # NEW (E1-T2)
src/server/db/schema-library-procedures.ts   # NEW (E1-T2)
src/server/db/schema-library-private.ts      # NEW (E1-T2)
scripts/db-check.ts                          # edit (E1-T1, E1-T2): recorre los arreglos nuevos
src/server/auth/permissions.ts               # edit (E1-T3): 4 acciones
src/server/auth/admin-auth.ts                # edit (E1-T3): SessionUser.libraryCurator
src/server/library/rules.ts · access.ts      # NEW (E1-T3)
src/server/library/content-pack.ts           # NEW (E1-T4)
src/data/library/pack.json                   # NEW (E1-T4)
scripts/library-import.ts · package.json     # NEW / edit (E1-T4)
tests/unit/permissions.test.ts               # edit autorizado (E1-T3, BT-D7)
tests/unit/library-rules.test.ts             # NEW (E1-T3)
tests/integration/library-catalog-schema.test.ts · library-schema.test.ts · library-access.test.ts · library-pack.test.ts   # NEW
```

Cadena de esquema final: `schema.ts ← schema-taller.ts ← schema-inventory.ts ← schema-orders.ts ← schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts ← schema-library-catalog.ts ← schema-library-knowledge.ts ← schema-library-procedures.ts ← schema-library-private.ts`. `drizzle.config.ts` ya lee `./src/server/db/schema*.ts`.

## Patrones del repo que se copian

- Columnas comunes: `id: uuid("id").primaryKey().defaultRandom()`, `createdAt: createdAt()`, `updatedAt: updatedAt()` importados de `./schema.ts`. Instantes con `instant("…")`. Fechas con `date("…", { mode: "string" })`.
- CHECK con `check("<tabla>_<campo>_check", sql\`…\`)` y SQL literal de columnas; índices `index("idx_<tabla>_<campos>")`, únicos `uniqueIndex("uq_<tabla>_<campos>")`. FKs `.references(() => tabla.id, { onDelete: "restrict" })`. Autorreferencias con `(): AnyPgColumn => tabla.id`.
- Un índice GIN de expresión: `index("idx_document_chunks_fts").using("gin", sql\`to_tsvector('spanish', ${t.text})\`)`.
- `jsonb("…").$type<T>().notNull().default(sql\`'[]'::jsonb\`)`.
- Pruebas de esquema: `createTestDb()` de `tests/helpers/pglite.ts` migra desde `drizzle/`; se insertan filas con Drizzle y se espera que el CHECK rechace con `rejects.toThrow()`.
- `scripts/db-check.ts` importa cada arreglo de tablas y recorre sus columnas.

---

## E1-T1 — BT-01 Esquema del catálogo global y marca de curador

**Archivos:** `src/server/db/schema-library-catalog.ts` (nuevo), `src/server/db/schema.ts`, `scripts/db-check.ts`, `tests/integration/library-catalog-schema.test.ts` (nuevo), más `drizzle/0035_*.sql` y `drizzle/meta/*` generados.

### Esquema

`schema.ts`: en `users`, agregar `libraryCurator: boolean("library_curator").notNull().default(false)` después de `isActive`. Nada más cambia en ese archivo.

`schema-library-catalog.ts` importa `{ createdAt, instant, updatedAt }` de `./schema.ts` (y nada más). Define, en este orden:

| Tabla / export | Columnas | Índices y CHECK |
|---|---|---|
| `manufacturers` | `slug text not null`, `name text not null`, `aliases jsonb not null default '[]'` (`$type<string[]>`), `officialSiteUrl text` (`official_site_url`), `status text not null default 'activo'` | `uq_manufacturers_slug`; `manufacturers_status_check`: `status in ('activo','inactivo')` |
| `componentFamilies` (`component_families`) | `manufacturerId → manufacturers`, `slug not null`, `name not null`, `category text not null` | `uq_component_families_manufacturer_slug (manufacturer_id, slug)`; `idx_component_families_category`; `component_families_category_check`: `category in ('transmision','frenos','suspension','ruedas','direccion','pedalier','electronica','herramientas')` |
| `componentModels` (`component_models`) | `familyId → component_families`, `code text not null`, `name text not null`, `componentType text not null` (`component_type`), `generation text`, `speeds integer`, `status text not null default 'vigente'` | `uq_component_models_family_code (family_id, code)`; `idx_component_models_code`; `component_models_status_check`: `status in ('vigente','descontinuado','en_revision')`; `component_models_speeds_check`: `speeds is null or speeds between 1 and 14` |
| `componentVariants` (`component_variants`) | `modelId → component_models`, `code text not null`, `revision text not null default ''`, `yearFrom integer`, `yearTo integer`, `attributes jsonb not null default '{}'` (`$type<Record<string, unknown>>`), `status text not null default 'vigente'` | `uq_component_variants_model_code_revision (model_id, code, revision)`; `idx_component_variants_code`; `component_variants_status_check` (misma lista); `component_variants_years_check`: `year_to is null or year_from is null or year_to >= year_from` |
| `knowledgeSources` (`knowledge_sources`) | `publisher not null`, `title not null`, `url text not null`, `publishedOn date`, `reviewedOn date`, `authority text not null`, `usagePolicy text not null default 'enlace'`, `notes text` | `uq_knowledge_sources_url`; `knowledge_sources_authority_check`: `authority in ('oficial','comunidad_verificada','comunidad','historico')`; `knowledge_sources_usage_policy_check`: `usage_policy in ('enlace','extracto_permitido','copia_autorizada')` |
| `technicalDocuments` (`technical_documents`) | `title not null`, `manufacturerId → manufacturers` (null), `sourceId → knowledge_sources` (null), `canonicalUrl text not null`, `license text not null default 'enlace'`, `docType text not null`, `language text not null default 'es'`, `variantId → component_variants` (null), `revision text not null default ''`, `checksum text`, `storageKey text`, `status text not null default 'vigente'` | `uq_technical_documents_url_revision (canonical_url, revision)`; `idx_technical_documents_variant`; `technical_documents_license_check`; `technical_documents_doc_type_check`: `doc_type in ('manual','despiece','boletin','guia','otro')`; `technical_documents_status_check`: `status in ('vigente','desactualizado','retirado')`; **`technical_documents_storage_check`: `storage_key is null or license = 'copia_autorizada'`** |
| `technicalSpecifications` (`technical_specifications`) | `variantId → component_variants not null`, `kind text not null`, `label text not null`, `valueText text not null` (`value_text`), `unit text`, `tolerance text`, `context text`, `sourceDocumentId → technical_documents` (null), `validationStatus text not null default 'en_revision'`, `reviewedOn date` | `idx_technical_specifications_variant_kind (variant_id, kind)`; `technical_specifications_kind_check`: `kind in ('torque','medida','aceite','volumen','presion','peso','otro')`; `technical_specifications_validation_check`: `validation_status in ('verificado','condicionado','desactualizado','en_revision','sin_dato_verificado')`; **`technical_specifications_source_check`: `validation_status <> 'verificado' or source_document_id is not null`** |
| `toolsConsumables` (`tools_consumables`) | `manufacturerId → manufacturers` (null), `code text`, `name text not null`, `kind text not null`, `category text not null`, `specification text`, `usage text`, `restrictions text` | `idx_tools_consumables_category_name`; `tools_consumables_kind_check`: `kind in ('herramienta','consumible')`; `tools_consumables_category_check` (misma lista de categorías) |

Al final: `export const libraryCatalogTables = [manufacturers, componentFamilies, componentModels, componentVariants, knowledgeSources, technicalDocuments, technicalSpecifications, toolsConsumables] as const;` y tipos `$inferSelect` exportados para `Manufacturer`, `ComponentModel`, `ComponentVariant`, `TechnicalSpecification`, `TechnicalDocument`.

`scripts/db-check.ts`: importar `libraryCatalogTables` y agregarlo al arreglo de `missingColumns`.

Después de escribir el esquema: `pnpm db:generate` → debe aparecer **una** migración `drizzle/0035_*.sql` solo con `CREATE TABLE`, `ALTER TABLE "users" ADD COLUMN`, `CREATE INDEX`/`CREATE UNIQUE INDEX` y `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`. Si pregunta por renombres, algo está mal: no responder, revisar el esquema.

### Pruebas (primero, en rojo) — `tests/integration/library-catalog-schema.test.ts`

Con `createTestDb()`:
1. Las ocho tablas existen tras migrar (recorrer `libraryCatalogTables` con `getTableConfig(t).name` contra `information_schema.tables`) y `users` tiene la columna `library_curator` con default `false` (insertar un usuario sin la columna y leerla).
2. Insertar fabricante, familia, modelo `RD-M8100-SGS` (speeds 12) y dos variantes con `revision` `''` y `B` → ok; una tercera con la misma `(model_id, code, revision)` → `rejects.toThrow()`.
3. Especificación `validation_status: 'verificado'` sin `source_document_id` → rechaza; con documento → ok. `kind: 'otro_raro'` → rechaza.
4. Documento con `storage_key` y `license: 'enlace'` → rechaza; con `copia_autorizada` → ok. Documento duplicado `(canonical_url, revision)` → rechaza.
5. `speeds: 15` → rechaza; `year_to < year_from` → rechaza.
6. Ninguna de las ocho tablas tiene columna `branch_id` (`getTableColumns`).

### Verify
```bash
pnpm test tests/integration/library-catalog-schema.test.ts   # expect: exit 0, 0 failed
test "$(ls drizzle/0035_*.sql | wc -l | tr -d ' ')" = 1   # expect: exit 0
grep -Eiq 'drop (table|column)' drizzle/0035_*.sql; test $? -eq 1   # expect: exit 0
grep -q 'libraryCatalogTables' scripts/db-check.ts   # expect: exit 0
pnpm db:migrate && pnpm db:check   # coordinadora
pnpm format && pnpm gate   # coordinadora
```

---

## E1-T2 — BT-02 Esquema de conocimiento, procedimientos y capa privada

**Archivos:** `schema-library-knowledge.ts`, `schema-library-procedures.ts`, `schema-library-private.ts` (nuevos), `scripts/db-check.ts`, `tests/integration/library-schema.test.ts` (nuevo), más `drizzle/0036_*.sql` y `meta/`.

### `schema-library-knowledge.ts` — importa `./schema-library-catalog.ts` y `./schema.ts`

| Tabla / export | Columnas | Índices y CHECK |
|---|---|---|
| `knowledgeArticles` (`knowledge_articles`) | `slug not null`, `title not null`, `category not null`, `topic text`, `language not null default 'es'`, `kind not null`, `status not null default 'borrador'`, `currentVersionId uuid` (`current_version_id`, `references((): AnyPgColumn => articleVersions.id)`), `createdBy → users` (null) | `uq_knowledge_articles_slug`; `idx_knowledge_articles_category_status`; `knowledge_articles_category_check` (ocho categorías); `knowledge_articles_kind_check`: `kind in ('articulo','procedimiento','diagnostico','compatibilidad')`; `knowledge_articles_status_check`: `status in ('borrador','publicado','archivado')` |
| `articleVersions` (`article_versions`) | `articleId → knowledge_articles not null`, `number integer not null`, `contentMd text not null`, `summary text not null default ''`, `sources jsonb not null default '[]'` (`$type<{ documentId?: string; sourceId?: string; note?: string }[]>`), `contentHash text not null`, `reviewedBy → users` (null), `publishedAt instant`, `validFrom date`, `validUntil date`, `supersedesVersionId uuid` (autorreferencia) | `uq_article_versions_article_number (article_id, number)`; `article_versions_number_check`: `number >= 1` |
| `articleVariantLinks` (`article_variant_links`) | `versionId → article_versions`, `variantId → component_variants` | `uq_article_variant_links_version_variant` |
| `diagnosticRules` (`diagnostic_rules`) | `versionId → article_versions`, `symptom text not null`, `prerequisites text`, `testsMd text not null`, `causes jsonb not null default '[]'` (`$type<{ cause: string; evidence: string; likelihood: "alta" \| "media" \| "baja" }[]>`), `actionsMd text not null`, `validFrom date`, `validUntil date` | `idx_diagnostic_rules_version` |
| `documentChunks` (`document_chunks`) | `sourceKind text not null`, `sourceId uuid not null`, `chunkIndex integer not null`, `text text not null`, `metadata jsonb not null default '{}'`, `scope text not null default 'global'` | `uq_document_chunks_source (source_kind, source_id, chunk_index)`; **`idx_document_chunks_fts` GIN `to_tsvector('spanish', text)`**; `document_chunks_source_kind_check`: `source_kind in ('article_version','document','specification','procedure')`; `document_chunks_scope_check`: `scope in ('global')` |

`export const libraryKnowledgeTables = [knowledgeArticles, articleVersions, articleVariantLinks, diagnosticRules, documentChunks] as const;`

### `schema-library-procedures.ts` — importa knowledge, catalog, schema

| Tabla / export | Columnas | Índices y CHECK |
|---|---|---|
| `procedures` | `versionId → article_versions not null`, `title not null`, `kind not null`, `risk not null`, `durationMinutes integer`, `prerequisites text`, `finalChecks text` | `uq_procedures_version`; `procedures_kind_check`: `kind in ('montaje','ajuste','mantenimiento','diagnostico','reparacion')`; `procedures_risk_check`: `risk in ('bajo','medio','alto','critico')`; `procedures_duration_check`: `duration_minutes is null or duration_minutes > 0` |
| `procedureSteps` (`procedure_steps`) | `procedureId → procedures`, `sequence integer not null`, `action text not null`, `tools text`, `consumables text`, `verification text`, `warning text`, `imageKey text` | `uq_procedure_steps_procedure_sequence`; `procedure_steps_sequence_check`: `sequence >= 1` |
| `procedureSpecs` (`procedure_specs`) | `procedureId → procedures`, `specificationId → technical_specifications` | `uq_procedure_specs_pair` |
| `compatibilityRules` (`compatibility_rules`) | `versionId → article_versions` (null), `relation text not null`, `conditions text`, `restrictions text`, `evidence text not null`, `sourceDocumentId → technical_documents` (null), `certainty text not null`, `reviewedOn date`, `status text not null default 'vigente'` | `compatibility_rules_relation_check`: `relation in ('oficial_confirmada','condicionada','incompatible','no_verificada')`; `compatibility_rules_certainty_check`: `certainty in ('alta','media','baja')`; `compatibility_rules_status_check`: `status in ('vigente','archivada')`; **`compatibility_rules_source_check`: `relation <> 'oficial_confirmada' or source_document_id is not null`** |
| `compatibilityRuleMembers` (`compatibility_rule_members`) | `ruleId → compatibility_rules`, `variantId → component_variants`, `role text not null` | `uq_compatibility_rule_members_rule_variant`; `idx_compatibility_rule_members_variant`; `compatibility_rule_members_role_check`: `role in ('shifter','cambio','cassette','cadena','plato','nucleo','freno','disco','otro')` |

`export const libraryProcedureTables = [procedures, procedureSteps, procedureSpecs, compatibilityRules, compatibilityRuleMembers] as const;`

### `schema-library-private.ts` — importa knowledge, catalog, `schema-orders.ts` (`workOrders`), `schema-taller.ts` (`bikes`), `schema.ts`

Helpers locales `branchReference()` y `creatorReference()` como en `schema-orders.ts`.

| Tabla / export | Columnas | Índices y CHECK |
|---|---|---|
| `knowledgeProposals` (`knowledge_proposals`) **B** | `authorId → users not null`, `kind not null`, `title not null`, `contentMd text not null`, `evidence text not null default ''`, `targetArticleId → knowledge_articles` (null), `targetVariantId → component_variants` (null), `status not null default 'draft'`, `submittedAt instant`, `withdrawnAt instant`, `publishedVersionId → article_versions` (null), `piiFlags jsonb not null default '[]'` (`$type<{ kind: string; match: string }[]>`) | `idx_knowledge_proposals_branch_status`; `idx_knowledge_proposals_status_submitted`; `knowledge_proposals_kind_check`: `kind in ('articulo','procedimiento','diagnostico','compatibilidad','especificacion','correccion')`; `knowledge_proposals_status_check`: los ocho estados `draft, submitted, needs_changes, in_review, approved, rejected, published, withdrawn`; **`knowledge_proposals_published_check`: `(status = 'published') = (published_version_id is not null)`** |
| `proposalReviews` (`proposal_reviews`) G | `proposalId → knowledge_proposals`, `reviewerId → users`, `decision not null`, `reason text not null default ''`, `checklist jsonb not null default '{}'` | `idx_proposal_reviews_proposal`; `proposal_reviews_decision_check`: `decision in ('in_review','needs_changes','approved','rejected','published')` |
| `publicationEvents` (`publication_events`) G | `articleId → knowledge_articles`, `versionId → article_versions` (null), `operation not null`, `actorId → users`, `justification text not null default ''` | `idx_publication_events_article`; `publication_events_operation_check`: `operation in ('publish','archive','rollback','import')` |
| `technicalDiagnoses` (`technical_diagnoses`) **B, V, CB** | `workOrderId → work_orders not null`, `bikeId → bikes not null`, `symptoms text not null`, `inspections jsonb not null default '[]'`, `hypotheses jsonb not null default '[]'`, `result text`, `status not null default 'borrador'`, `confirmedBy → users` (null), `confirmedAt instant`, `references jsonb not null default '[]'` (`$type<{ kind: string; id: string; versionNumber?: number }[]>`; nombre de columna `references`, propiedad TS `refs`), `aiInteractionId uuid` (null, sin FK) | `idx_technical_diagnoses_order_created`; `technical_diagnoses_status_check`: `status in ('borrador','confirmado')`; **`technical_diagnoses_confirmed_check`: `(status = 'confirmado') = (confirmed_at is not null)`** |
| `privateTechnicalNotes` (`private_technical_notes`) **B, V** | `authorId → users not null`, `bikeId → bikes` (null), `workOrderId → work_orders` (null), `contentMd text not null`, `scope text not null default 'taller'` | `idx_private_technical_notes_branch_created`; `private_technical_notes_scope_check`: `scope in ('personal','taller')` |
| `aiInteractions` (`ai_interactions`) **B** | `userId → users not null`, `scope text not null`, `workOrderId → work_orders` (null), `question text not null`, `answer text not null default ''`, `confidence text not null`, `citations jsonb not null default '[]'` (`$type<{ chunkId: string; sourceKind: string; sourceId: string; versionNumber?: number }[]>`), `provider text not null`, `model text not null default ''`, `promptVersion text not null`, `status text not null`, `tokensIn integer not null default 0`, `tokensOut integer not null default 0` | `idx_ai_interactions_branch_created`; `idx_ai_interactions_user_created`; `ai_interactions_scope_check`: `scope in ('biblioteca','orden')`; `ai_interactions_confidence_check`: `confidence in ('alta','media','baja','no_verificada')`; `ai_interactions_status_check`: `status in ('respondida','sin_evidencia','error','cuota')`; **`ai_interactions_order_check`: `scope <> 'orden' or work_order_id is not null`** |

`export const libraryPrivateTables = [knowledgeProposals, proposalReviews, publicationEvents, technicalDiagnoses, privateTechnicalNotes, aiInteractions] as const;`

`scripts/db-check.ts`: importar y agregar los tres arreglos.

### Pruebas (primero) — `tests/integration/library-schema.test.ts`
1. Las 16 tablas existen; los tres arreglos se recorren.
2. `compatibility_rules` `oficial_confirmada` sin `source_document_id` → rechaza; con documento → ok.
3. `knowledge_proposals` `published` sin `published_version_id` → rechaza; `draft` con `published_version_id` → rechaza; `draft` sin → ok.
4. `ai_interactions` `scope: 'orden'` sin `work_order_id` → rechaza.
5. `technical_diagnoses` `confirmado` sin `confirmed_at` → rechaza.
6. `document_chunks`: insertar dos trozos y consultar con `sql\`to_tsvector('spanish', ${documentChunks.text}) @@ plainto_tsquery('spanish', ${"cambios traseros"})\`` → devuelve el trozo con "cambio trasero". El SQL de `drizzle/0036_*.sql` contiene `to_tsvector`.
7. `knowledge_proposals`, `technical_diagnoses`, `private_technical_notes` y `ai_interactions` tienen `branch_id`; las demás tablas nuevas no.

### Verify
```bash
pnpm test tests/integration/library-schema.test.ts   # expect: exit 0, 0 failed
test "$(ls drizzle/0036_*.sql | wc -l | tr -d ' ')" = 1 && grep -q 'to_tsvector' drizzle/0036_*.sql
for f in src/server/db/schema-library-knowledge.ts src/server/db/schema-library-procedures.ts src/server/db/schema-library-private.ts; do test "$(wc -l < $f | tr -d ' ')" -lt 400 || exit 1; done
pnpm db:migrate && pnpm db:check   # coordinadora
pnpm format && pnpm gate   # coordinadora
```

---

## E1-T3 — BT-03 Acciones, `canCurate` y `rules.ts`

**Archivos:** `src/server/auth/permissions.ts`, `src/server/auth/admin-auth.ts`, `src/server/library/rules.ts` (nuevo), `src/server/library/access.ts` (nuevo), `tests/unit/permissions.test.ts` (edición autorizada), `tests/unit/library-rules.test.ts` (nuevo), `tests/integration/library-access.test.ts` (nuevo). Siete archivos: declarado.

### `permissions.ts`
Agregar al final de `ACTIONS`: `"library.view"`, `"library.ai"`, `"library.propose"`, `"library.curate"`. En `permissions`: las tres primeras `ROLES`; `"library.curate": administrators`. Total 40.

### `admin-auth.ts`
`SessionUser` gana `libraryCurator?: boolean`. `requireAdmin` selecciona también `libraryCurator: users.libraryCurator` y lo devuelve. Nada más cambia (firmas iguales).

### `src/server/library/rules.ts`
Exporta (solo constantes, tipos y funciones puras):
- `LIBRARY_CATEGORIES = ["transmision","frenos","suspension","ruedas","direccion","pedalier","electronica","herramientas"] as const`, `LibraryCategory`, `LIBRARY_CATEGORY_LABELS` (Transmisión, Frenos, Suspensión, Ruedas, Dirección, Pedalier, Electrónica, Herramientas).
- `VALIDATION_STATUSES = ["verificado","condicionado","desactualizado","en_revision","sin_dato_verificado"]`, `VALIDATION_LABELS` (Verificado, Condicionado, Desactualizado, En revisión, Sin dato verificado).
- `COMPATIBILITY_RELATIONS = ["oficial_confirmada","condicionada","incompatible","no_verificada"]`, `COMPATIBILITY_LABELS` (Oficial confirmada, Condicionada, Incompatible, No verificada).
- `COMPATIBILITY_ROLES = ["shifter","cambio","cassette","cadena","plato","nucleo","freno","disco","otro"]`, `COMPATIBILITY_ROLE_LABELS`.
- `SPEC_KINDS = ["torque","medida","aceite","volumen","presion","peso","otro"]`, `SPEC_KIND_LABELS` (Torque, Medida, Aceite, Volumen, Presión, Peso, Otro).
- `PROPOSAL_STATUSES` (los ocho), `PROPOSAL_LABELS` (Borrador, Enviada, Requiere cambios, En revisión, Aprobada, Rechazada, Publicada, Retirada), `PROPOSAL_TRANSITIONS`: `draft → [submitted, withdrawn]`, `submitted → [in_review, needs_changes, rejected, withdrawn]`, `needs_changes → [draft, withdrawn]`, `in_review → [needs_changes, approved, rejected]`, `approved → [published, rejected]`, `rejected → []`, `published → []`, `withdrawn → []`; `isProposalTransition(from, to)`.
- `PROPOSAL_KINDS` y etiquetas (Artículo, Procedimiento, Diagnóstico, Compatibilidad, Especificación, Corrección).
- `CONFIDENCE_LEVELS = ["alta","media","baja","no_verificada"]`, `CONFIDENCE_LABELS` (Alta, Media, Baja, No verificada).
- `ARTICLE_KINDS`, `PROCEDURE_KINDS`, `PROCEDURE_RISKS` con etiquetas.
- `AI_DAILY_QUOTA_PER_BRANCH = 200`, `AI_PER_USER_PER_MINUTE = 5`, `PROMPT_VERSION = "bt-1"`, `CHUNK_MAX_CHARS = 1200`.

### `src/server/library/access.ts`
```ts
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
export function canUseLibrary(user: SessionUser): boolean  // can(role, "library.view")
export function canCurate(user: SessionUser): boolean       // can(role, "library.curate") && user.libraryCurator === true
```

### Pruebas
- `tests/unit/permissions.test.ts` (edición autorizada BT-D7): agregar las cuatro acciones en `expected` para cada rol (`library.curate` solo owner/admin) y cambiar `36` por `40` en los dos `expect`.
- `tests/unit/library-rules.test.ts`: cada lista de etiquetas cubre exactamente su lista de valores; `isProposalTransition("approved","published")` true, `("published","draft")` false, `("draft","approved")` false; las cuotas son enteros positivos.
- `tests/integration/library-access.test.ts`: con PGlite, crear un `owner` con `library_curator = true` y otro sin; `loginAdmin` + `requireAdmin` devuelven `libraryCurator` true/false; `canCurate` true solo para el primero; un `mechanic` con la marca → false; `canUseLibrary` true para los cuatro roles.

### Verify
```bash
pnpm test tests/unit/permissions.test.ts tests/unit/library-rules.test.ts tests/integration/library-access.test.ts   # expect: 0 failed
pnpm format && pnpm gate   # coordinadora
```

---

## E1-T4 — BT-04 Paquete de contenido, importación idempotente y siembra

**Archivos:** `src/server/library/content-pack.ts`, `src/data/library/pack.json`, `scripts/library-import.ts` (nuevos), `package.json`, `tests/integration/library-pack.test.ts` (nuevo).

### `content-pack.ts`
- `libraryPackSchema` (zod 4, `strictObject`): `{ version: 1, generatedAt: iso datetime, manufacturers: [{ slug, name, aliases?: string[], officialSiteUrl?: url, status? }], families: [{ manufacturer: slug, slug, name, category }], models: [{ family: "<mfr-slug>/<family-slug>", code, name, componentType, generation?, speeds?, status? }], variants: [{ model: "<mfr-slug>/<family-slug>/<code>", code, revision?: "" , yearFrom?, yearTo?, attributes?, status? }], sources: [{ url, publisher, title, publishedOn?, reviewedOn?, authority, usagePolicy? , notes? }], documents: [{ canonicalUrl, revision?: "", title, manufacturer?: slug, source?: url, license?, docType, language?, variant?: "<mfr>/<family>/<model-code>/<variant-code>[@revision]", checksum?, status? }], specifications: [{ variant, kind, label, valueText, unit?, tolerance?, context?, sourceDocument?: canonicalUrl, validationStatus?, reviewedOn? }], tools: [{ code?, name, kind, category, manufacturer?, specification?, usage?, restrictions? }], articles: [{ slug, title, category, topic?, language?, kind, variants?: string[], version: { number: 1, contentMd, summary?, sources?: [{ document?: canonicalUrl, source?: url, note? }], validFrom? } }] }`. Validaciones cruzadas en `superRefine`: toda referencia por clave existe dentro del paquete; una especificación `verificado` exige `sourceDocument`.
- `importLibraryPack(db, actorId: string | null, pack: LibraryPack, now: Date, options: { dryRun: boolean })` → `{ ok: true, created: Record<string, number>, skipped: Record<string, number> } | { ok: false, code: "validation_error", issues: string[] }`. Una transacción; por cada entidad busca por su clave estable (slug / `(manufacturer, slug)` / `(family, code)` / `(model, code, revision)` / `url` / `(canonicalUrl, revision)` / `(variant, kind, label)` / `(name, kind)` / `slug`) y **solo inserta lo que falta**; nunca actualiza ni borra (una fila existente cuenta en `skipped`). Para un artículo nuevo crea `knowledge_articles` `publicado`, su `article_versions` número 1 con `contentHash` sha256 del contenido, `publishedAt: now`, `reviewedBy: actorId`, actualiza `currentVersionId`, crea `article_variant_links` y un `publication_events` `import` con `actorId` (si `actorId` es null, el evento no se escribe y se cuenta en `skipped.publicationEvents`). Con `dryRun`, hace la misma cuenta y lanza un error centinela `DryRunRollback` al final para revertir; afuera se traduce a `{ ok: true, … }`.
- `exportLibraryPack(db)` queda para BT-15; **no** se escribe aquí.

### `src/data/library/pack.json`
Contenido inicial **verificable y sin inventar valores**:
- Fabricantes: `shimano` (Shimano, https://si.shimano.com/), `sram` (SRAM, https://www.sram.com/), `fox` (FOX Factory, https://www.ridefox.com/). Alias: `["Shimano Inc."]`, `["SRAM LLC","RockShox"]`, `["Fox Racing Shox"]`.
- Ocho familias, una por categoría: `shimano/deore-xt` (transmision), `shimano/xt-brakes` (frenos, "Deore XT Frenos"), `fox/34` (suspension, "FOX 34"), `shimano/wh-mt` (ruedas, "WH-MT"), `shimano/pro-components` (direccion, "PRO"), `shimano/hollowtech-ii` (pedalier), `shimano/steps` (electronica, "SHIMANO STEPS"), `shimano/tl-tools` (herramientas, "TL herramientas").
- Modelos (código exacto, nombre, tipo, generación, velocidades): `RD-M8100-SGS` (Deore XT cambio trasero 12v, `cambio_trasero`, generación `M8100`, speeds 12), `CS-M8100-12` (cassette 12v), `CN-M8100` (cadena 12v), `SL-M8100-R` (shifter derecho 12v), `FC-M8100-1` (plato/biela 1x, `biela`), `BR-M8120` (freno de disco 4 pistones, `freno_disco`, speeds null). Variantes: una por modelo con `code` igual al código del modelo y `revision: ""`; `RD-M8100-SGS` además una variante `revision: "B"` solo si existe un dealer manual distinto — **no**: usar una sola variante por modelo. Para que la búsqueda distinga revisiones, el test crea la segunda; el paquete no inventa.
- Fuentes (2): `https://si.shimano.com/` (Shimano Service Instructions, oficial, enlace) y `https://www.sheldonbrown.com/` (Sheldon Brown, historico, enlace).
- Documentos (4, `license: enlace`, `docType: manual`, `language: en`): manuales del distribuidor de la serie M8100 en `si.shimano.com` por su URL de búsqueda por modelo, por ejemplo `https://si.shimano.com/#/es/search/Series?name=DEORE%20XT%20M8100` con `title` "Serie DEORE XT M8100 — Service Instructions", ligado al fabricante `shimano`; uno por `RD-M8100-SGS`, `CS-M8100-12`, `BR-M8120` (variant) y uno de la serie sin variante. `revision: ""`. Sin checksum.
- Especificaciones: para `RD-M8100-SGS` una `torque` con `label` "Tornillo de fijación al cuadro", `valueText` "", `unit` "Nm", `validationStatus: "sin_dato_verificado"`, `context` "Confirmar en el manual del distribuidor (enlace en Documentos)"; igual una `medida` "Capacidad total" `sin_dato_verificado`. **Ningún valor numérico.**
- Herramientas (3): `TL-CN10` (herramienta, "Herramienta para pasador de cadena", transmision), `TL-LR15` (herramienta, "Llave para anillo de cierre de cassette", transmision), consumible "Lubricante de cadena" (`kind: consumible`, `category: transmision`, sin fabricante).
- Un artículo `kind: articulo`, slug `transmision-12v-identificacion`, categoría `transmision`, título "Cómo identificar una transmisión Shimano de 12 velocidades", versión 1 con `contentMd` de 3 a 5 párrafos que explica **cómo leer el código del componente** (prefijos RD/CS/CN/SL/FC, serie M8100, sufijo SGS = jaula larga) y remite al manual oficial para torques y compatibilidad; `sources: [{ source: "https://si.shimano.com/" }]`; `variants: ["shimano/deore-xt/RD-M8100-SGS/RD-M8100-SGS"]`. Sin cifras técnicas.

### `scripts/library-import.ts`
Misma forma que `scripts/f2-check.ts` / `inventory-import.ts`: lee `DATABASE_URL` con `getDbEnv()`, acepta `--dry-run` y una ruta opcional de paquete (por defecto `src/data/library/pack.json`), valida con `libraryPackSchema` (inválido → imprime los issues y sale 1), conecta (falla → `No se pudo conectar: …` y sale 2), llama `importLibraryPack(db, null, pack, new Date(), { dryRun })`, imprime JSON con `created`/`skipped` y sale 0. `package.json`: `"library:import": "node --env-file-if-exists=.env scripts/library-import.ts"`.

### Pruebas — `tests/integration/library-pack.test.ts`
1. `pack.json` pasa `libraryPackSchema` y cumple los mínimos (3 fabricantes, 8 familias con las 8 categorías, 6 modelos, 6 variantes, 2 fuentes, 4 documentos, 1 artículo, 0 especificaciones `verificado` sin documento, 0 `valueText` con dígitos en especificaciones `sin_dato_verificado`).
2. Importar dos veces deja los mismos conteos en cada tabla; la segunda vez `created` es todo 0 y `skipped` suma lo anterior.
3. `dryRun: true` sobre base vacía devuelve `created` con los totales y deja 0 filas.
4. Un paquete con una variante que apunta a un modelo inexistente → `{ ok: false, code: "validation_error" }` con un issue que nombra la variante.
5. El artículo importado queda `publicado`, con `current_version_id` apuntando a la versión 1, `published_at` = `now`, y un `publication_events` `import` cuando `actorId` es un usuario real.

### Verify
```bash
pnpm test tests/integration/library-pack.test.ts   # expect: 0 failed
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/library-import.ts 2>&1)"; test $? -eq 2 && printf '%s' "$out" | grep -q 'No se pudo conectar'
pnpm library:import --dry-run && pnpm library:import && pnpm library:import   # coordinadora
pnpm format && pnpm gate   # coordinadora
```
