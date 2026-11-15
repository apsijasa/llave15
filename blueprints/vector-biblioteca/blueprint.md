# Vector Bikes — Fase Biblioteca: Biblioteca técnica compartida — Blueprint de cambio

> Escrito por la sesión coordinadora el 2026-11-15 (modo brownfield, a mano, sobre `main` `ee466b3`).
> Fuente autoritativa: `BIBLIOTECA.md` (decisiones BT-D1…BT-D15) y `fuentes/ESPECIFICACION-ORIGINAL.md`.
> Identificadores: paso `BT-NN` (01…24), tarea `E<épica>-T<n>` en `tasks.json`, tag `bt-NN`.

Construcción supervisada: encargo por tarea en `docs/encargos/BT-NN-*.md`, Codex implementa con pruebas primero, Claude revisa, corre `pnpm db:migrate`, `pnpm db:check`, `pnpm format && pnpm gate` y commitea. **Cada paso relee los archivos que toca.** Regla transversal: ningún texto para el usuario escribe el nombre del taller literal (`SITE.name`).

---

## 1. Visión general

### Estado actual
`main` `ee466b3`: fase 2 cerrada (36 tareas). Esquema en ocho archivos (`schema.ts` … `schema-payments.ts`), 40 tablas, migraciones `0000`–`0034`. Dominio en `src/server/taller/**`; sesión `requireAdmin`, permisos `can(role, action)` con 36 acciones; auditoría `recordAudit`; páginas `/taller/**` servidor con dos islas (fotos, firma). Pruebas: Vitest + PGlite (migra desde `drizzle/`), Container API para páginas, Playwright tablet, smoke. Sin biblioteca, sin IA, sin `fetch` a proveedores de modelos.

### Estado objetivo
Mismo proyecto. Módulo `src/server/library/**` (aislado, sin importar `src/server/taller/**` salvo `audit.ts`, `status.ts#canAccessOrder` y `rules.ts` para etiquetas de bici), cuatro archivos de esquema nuevos, 4 acciones nuevas, marca `users.library_curator`, paquete de contenido `src/data/library/pack.json`, páginas `/taller/biblioteca/**` y pestaña `/taller/ordenes/[id]/biblioteca`, asistente con proveedor inyectado, propuestas con revisión central, exportación/importación del conocimiento global.

### Usuarios
| Persona | Qué hace en la biblioteca |
|---|---|
| Mecánico (tablet) | Busca, lee fichas y procedimientos, consulta al asistente en la biblioteca y en sus órdenes, guarda diagnósticos, propone conocimiento |
| Recepción / administración | Lo mismo; además notas privadas del taller |
| Dueño / admin con `library_curator` | Revisa propuestas, publica versiones, archiva, exporta el paquete |

## 2. Stack
Sin dependencias nuevas. Postgres FTS `spanish` (BT-D4). Proveedor de IA por `fetch` nativo a la Messages API de Anthropic (BT-D5), sin SDK. Node 24, pnpm 12.4.2, Astro 7, Drizzle 0.45, zod 4, Vitest, Playwright.

## 3. Estructura de directorios (delta)

```
src/server/db/schema-library-catalog.ts      # NEW BT-01: manufacturers, component_families, component_models, component_variants, technical_specifications, tools_consumables, knowledge_sources, technical_documents
src/server/db/schema-library-knowledge.ts    # NEW BT-02: knowledge_articles, article_versions, article_variant_links, diagnostic_rules, document_chunks
src/server/db/schema-library-procedures.ts   # NEW BT-02: procedures, procedure_steps, procedure_specs, compatibility_rules, compatibility_rule_members
src/server/db/schema-library-private.ts      # NEW BT-02: knowledge_proposals, proposal_reviews, publication_events, technical_diagnoses, private_technical_notes, ai_interactions
src/server/db/schema.ts                      # edit BT-01: users.library_curator
src/server/db/schema-payments.ts             # edit BT-19: bike_components.component_variant_id
scripts/db-check.ts                          # edit BT-01, BT-02
src/server/auth/permissions.ts               # edit BT-03 (4 acciones)
src/server/auth/admin-auth.ts                # edit BT-03 (SessionUser.libraryCurator)
src/server/library/rules.ts                  # NEW BT-03: categorías, estados, confianza, etiquetas, cuotas
src/server/library/access.ts                 # NEW BT-03: canCurate, canUseLibrary
src/server/library/content-pack.ts           # NEW BT-04: zod del paquete, importLibraryPack, exportLibraryPack
src/data/library/pack.json                   # NEW BT-04
scripts/library-import.ts · library-export.ts   # NEW BT-04 / BT-15
src/server/library/catalog.ts                # NEW BT-05: fabricantes, familias, modelos, ficha de variante
src/server/library/search.ts                 # NEW BT-05: detectCode, searchLibrary
src/server/library/documents.ts              # NEW BT-08: documentAccess, listDocuments
src/server/library/procedures.ts             # NEW BT-10
src/server/library/compatibility.ts          # NEW BT-11
src/server/library/specifications.ts         # NEW BT-12
src/server/library/pii.ts · proposals.ts     # NEW BT-13
src/server/library/review.ts · publish.ts    # NEW BT-14
src/server/library/chunks.ts · retrieval.ts  # NEW BT-16
src/server/library/ai-provider.ts · assistant.ts   # NEW BT-17
src/server/library/diagnoses.ts · technical-context.ts   # NEW BT-19
src/server/library/isolation-health.ts       # NEW BT-22
src/lib/env.ts                               # edit BT-17 (getAiEnv)
src/lib/taller-tabs.ts                       # edit BT-20
src/layouts/TallerLayout.astro               # edit BT-06 (grupo Conocimiento)
src/components/taller/library/CategoryIcon.astro · LibraryTabs.astro · ConfidenceCard.astro · SourceList.astro · LibraryStatus.astro   # NEW
src/pages/taller/biblioteca/index.astro · buscar.astro                     # NEW BT-06
src/pages/taller/biblioteca/componentes/[id].astro                        # NEW BT-07
src/pages/taller/biblioteca/documentos/[id].astro                         # NEW BT-08
src/pages/taller/biblioteca/procedimientos/[id].astro                     # NEW BT-10
src/pages/taller/biblioteca/compatibilidad.astro                          # NEW BT-11
src/pages/taller/biblioteca/herramientas.astro                            # NEW BT-12
src/pages/taller/biblioteca/propuestas/{index,nueva,[id]}.astro           # NEW BT-15
src/pages/taller/biblioteca/revision/{index,[id]}.astro                   # NEW BT-15
src/pages/taller/biblioteca/asistente.astro                               # NEW BT-18
src/pages/taller/ordenes/[id]/biblioteca.astro                            # NEW BT-20
e2e/biblioteca-busqueda.spec.ts · orden-biblioteca.spec.ts               # NEW BT-09, BT-21
e2e/fixtures.ts · e2e/global-setup.ts                                     # edit autorizado BT-09 (BT-D7)
tests/unit/permissions.test.ts                                            # edit autorizado BT-03 (BT-D7)
tests/integration/library-*.test.ts                                       # NEW por paso
.claude/rules/library.md · README.md · .env.example · CLAUDE.md · AGENTS.md   # BT-23
docs/REPORTE-BIBLIOTECA.md                                                # BT-24
```

## 4. Modelo de datos

Convenciones: **G** = tabla global (sin `branch_id`, BT-D1) · **B** = `branch_id uuid not null → branches restrict` · **V** = `voided_at` + `voided_by → users` · **CB** = `created_by uuid not null → users`. Todas con `id uuid defaultRandom()`, `created_at`, `updated_at`. CHECK con prefijo de tabla. FKs `restrict`. Texto en minúsculas en los CHECK.

### 4.1 `schema-library-catalog.ts` (BT-01) — importa solo `schema.ts`

| Tabla | Campos | Restricciones |
|---|---|---|
| `manufacturers` G | `slug text not null`, `name text not null`, `aliases jsonb not null default '[]'` (string[]), `official_site_url text`, `status text not null default 'activo'` | único `slug`; CHECK `status in ('activo','inactivo')` |
| `component_families` G | `manufacturer_id → manufacturers`, `slug not null`, `name not null`, `category not null` | único `(manufacturer_id, slug)`; CHECK `category in ('transmision','frenos','suspension','ruedas','direccion','pedalier','electronica','herramientas')` |
| `component_models` G | `family_id → component_families`, `code text not null` (exacto, ej. `RD-M8100-SGS`), `name not null`, `component_type text not null` (ej. `cambio_trasero`), `generation text`, `speeds integer`, `status not null default 'vigente'` | único `(family_id, code)`; índice `code`; CHECK `status in ('vigente','descontinuado','en_revision')`, `speeds is null or speeds between 1 and 14` |
| `component_variants` G | `model_id → component_models`, `code text not null` (SKU/variante; puede igualar al modelo), `revision text not null default ''`, `year_from integer`, `year_to integer`, `attributes jsonb not null default '{}'`, `status not null default 'vigente'` | único `(model_id, code, revision)`; índice `code`; CHECK estado igual al modelo; `year_to is null or year_from is null or year_to >= year_from` |
| `knowledge_sources` G | `publisher not null`, `title not null`, `url text not null`, `published_on date`, `reviewed_on date`, `authority not null`, `usage_policy not null default 'enlace'`, `notes text` | único `url`; CHECK `authority in ('oficial','comunidad_verificada','comunidad','historico')`, `usage_policy in ('enlace','extracto_permitido','copia_autorizada')` |
| `technical_documents` G | `title not null`, `manufacturer_id → manufacturers` (null), `source_id → knowledge_sources` (null), `canonical_url not null`, `license not null default 'enlace'`, `doc_type not null`, `language not null default 'es'`, `variant_id → component_variants` (null), `revision text not null default ''`, `checksum text`, `storage_key text`, `status not null default 'vigente'` | único `(canonical_url, revision)`; CHECK `license in ('enlace','extracto_permitido','copia_autorizada')`, `doc_type in ('manual','despiece','boletin','guia','otro')`, `status in ('vigente','desactualizado','retirado')`, **`storage_key is null or license = 'copia_autorizada'`** |
| `technical_specifications` G | `variant_id → component_variants`, `kind not null`, `label not null`, `value_text text not null`, `unit text`, `tolerance text`, `context text`, `source_document_id → technical_documents` (null), `validation_status not null default 'en_revision'`, `reviewed_on date` | índice `(variant_id, kind)`; CHECK `kind in ('torque','medida','aceite','volumen','presion','peso','otro')`, `validation_status in ('verificado','condicionado','desactualizado','en_revision','sin_dato_verificado')`, **`validation_status <> 'verificado' or source_document_id is not null`** |
| `tools_consumables` G | `manufacturer_id` (null), `code text`, `name not null`, `kind not null`, `category not null` (misma lista de categorías), `specification text`, `usage text`, `restrictions text` | CHECK `kind in ('herramienta','consumible')`; índice `(category, name)` |

Además en `schema.ts` (BT-01): `users.library_curator boolean not null default false`.

### 4.2 `schema-library-knowledge.ts` (BT-02) — importa catalog y schema

| Tabla | Campos | Restricciones |
|---|---|---|
| `knowledge_articles` G | `slug not null`, `title not null`, `category not null`, `topic text`, `language not null default 'es'`, `kind not null`, `status not null default 'borrador'`, `current_version_id uuid` (→ `article_versions`, autorreferencia con `AnyPgColumn`), `created_by → users` (null) | único `slug`; CHECK `kind in ('articulo','procedimiento','diagnostico','compatibilidad')`, `status in ('borrador','publicado','archivado')` |
| `article_versions` G | `article_id → knowledge_articles`, `number integer not null`, `content_md text not null`, `summary text not null default ''`, `sources jsonb not null default '[]'` ({documentId?, sourceId?, note}[]), `content_hash text not null`, `reviewed_by → users` (null), `published_at timestamptz`, `valid_from date`, `valid_until date`, `supersedes_version_id uuid` (→ misma tabla) | único `(article_id, number)`; CHECK `number >= 1` |
| `article_variant_links` G | `version_id → article_versions`, `variant_id → component_variants` | único `(version_id, variant_id)` |
| `diagnostic_rules` G | `version_id → article_versions`, `symptom text not null`, `prerequisites text`, `tests_md text not null`, `causes jsonb not null default '[]'` ({cause, evidence, likelihood}[]), `actions_md text not null`, `valid_from date`, `valid_until date` | índice `version_id` |
| `document_chunks` G | `source_kind not null`, `source_id uuid not null`, `chunk_index integer not null`, `text text not null`, `metadata jsonb not null default '{}'`, `scope text not null default 'global'` | único `(source_kind, source_id, chunk_index)`; índice GIN `using gin (to_tsvector('spanish', text))`; CHECK `source_kind in ('article_version','document','specification','procedure')`, `scope in ('global')` |

### 4.3 `schema-library-procedures.ts` (BT-02) — importa knowledge, catalog, schema

| Tabla | Campos | Restricciones |
|---|---|---|
| `procedures` G | `version_id → article_versions`, `title not null`, `kind not null`, `risk not null`, `duration_minutes integer`, `prerequisites text`, `final_checks text` | único `version_id`; CHECK `kind in ('montaje','ajuste','mantenimiento','diagnostico','reparacion')`, `risk in ('bajo','medio','alto','critico')`, `duration_minutes is null or duration_minutes > 0` |
| `procedure_steps` G | `procedure_id → procedures`, `sequence integer not null`, `action text not null`, `tools text`, `consumables text`, `verification text`, `warning text`, `image_key text` | único `(procedure_id, sequence)`; CHECK `sequence >= 1` |
| `procedure_specs` G | `procedure_id → procedures`, `specification_id → technical_specifications` | único par |
| `compatibility_rules` G | `version_id → article_versions` (null), `relation not null`, `conditions text`, `restrictions text`, `evidence text not null`, `source_document_id → technical_documents` (null), `certainty not null`, `reviewed_on date`, `status not null default 'vigente'` | CHECK `relation in ('oficial_confirmada','condicionada','incompatible','no_verificada')`, `certainty in ('alta','media','baja')`, `status in ('vigente','archivada')`, **`relation <> 'oficial_confirmada' or source_document_id is not null`** |
| `compatibility_rule_members` G | `rule_id → compatibility_rules`, `variant_id → component_variants`, `role not null` | único `(rule_id, variant_id)`; CHECK `role in ('shifter','cambio','cassette','cadena','plato','nucleo','freno','disco','otro')` |

### 4.4 `schema-library-private.ts` (BT-02) — importa knowledge, catalog, orders, taller, schema

| Tabla | Campos | Restricciones |
|---|---|---|
| `knowledge_proposals` B | `author_id → users not null`, `kind not null`, `title not null`, `content_md text not null`, `evidence text not null default ''`, `target_article_id → knowledge_articles` (null), `target_variant_id → component_variants` (null), `status not null default 'draft'`, `submitted_at`, `withdrawn_at`, `published_version_id → article_versions` (null), `pii_flags jsonb not null default '[]'` | índices `(branch_id, status)`, `(status, submitted_at)`; CHECK `kind in ('articulo','procedimiento','diagnostico','compatibilidad','especificacion','correccion')`, `status in ('draft','submitted','needs_changes','in_review','approved','rejected','published','withdrawn')`, `(status = 'published') = (published_version_id is not null)` |
| `proposal_reviews` G | `proposal_id → knowledge_proposals`, `reviewer_id → users`, `decision not null`, `reason text not null default ''`, `checklist jsonb not null default '{}'` | índice `proposal_id`; CHECK `decision in ('in_review','needs_changes','approved','rejected','published')` |
| `publication_events` G | `article_id → knowledge_articles`, `version_id → article_versions` (null), `operation not null`, `actor_id → users`, `justification text not null default ''` | CHECK `operation in ('publish','archive','rollback','import')` |
| `technical_diagnoses` B, V, CB | `work_order_id → work_orders`, `bike_id → bikes`, `symptoms text not null`, `inspections jsonb not null default '[]'` ({key,label,done,result}[]), `hypotheses jsonb not null default '[]'` ({text,evidence,confidence}[]), `result text`, `status not null default 'borrador'`, `confirmed_by → users` (null), `confirmed_at`, `references jsonb not null default '[]'` ({kind,id,versionNumber?}[]), `ai_interaction_id uuid` (null) | índice `(work_order_id, created_at)`; CHECK `status in ('borrador','confirmado')`, `(status = 'confirmado') = (confirmed_at is not null)` |
| `private_technical_notes` B, V | `author_id → users`, `bike_id → bikes` (null), `work_order_id → work_orders` (null), `content_md text not null`, `scope not null default 'taller'` | CHECK `scope in ('personal','taller')` |
| `ai_interactions` B | `user_id → users`, `scope not null`, `work_order_id → work_orders` (null), `question text not null`, `answer text not null default ''`, `confidence not null`, `citations jsonb not null default '[]'`, `provider not null`, `model text not null default ''`, `prompt_version text not null`, `status not null`, `tokens_in integer not null default 0`, `tokens_out integer not null default 0` | índices `(branch_id, created_at)`, `(user_id, created_at)`; CHECK `scope in ('biblioteca','orden')`, `confidence in ('alta','media','baja','no_verificada')`, `status in ('respondida','sin_evidencia','error','cuota')`, `scope <> 'orden' or work_order_id is not null` |

### 4.5 `schema-payments.ts` (BT-19)
`bike_components.component_variant_id uuid → component_variants` (null). Importa `componentVariants` de `schema-library-catalog.ts`.

### Migraciones
`0035` (BT-01), `0036` (BT-02), `0037` (BT-19). Todas aditivas. Reversión: `drop table` de las tablas nuevas y `drop column` de las dos columnas, documentado en `docs/ventanas/bt-v1.md` (BT-23).

## 5. Módulos y contratos (`src/server/library/**`)

Toda función recibe `db: AppDb`, el `actor: SessionUser` cuando hay autoría o alcance, y `now: Date`. Errores esperables como `{ ok: false, code }`. Nunca `new Date()`.

| Módulo | Exporta | Contrato |
|---|---|---|
| `rules.ts` | `LIBRARY_CATEGORIES`, `LIBRARY_CATEGORY_LABELS`, `VALIDATION_STATUSES`, `VALIDATION_LABELS`, `COMPATIBILITY_RELATIONS`, `COMPATIBILITY_LABELS`, `PROPOSAL_STATUSES`, `PROPOSAL_LABELS`, `PROPOSAL_TRANSITIONS`, `CONFIDENCE_LEVELS`, `CONFIDENCE_LABELS`, `SPEC_KINDS`, `SPEC_KIND_LABELS`, `AI_DAILY_QUOTA_PER_BRANCH = 200`, `AI_PER_USER_PER_MINUTE = 5`, `PROMPT_VERSION = "bt-1"` | constantes y etiquetas en español |
| `access.ts` | `canCurate(user)`, `canUseLibrary(user)` | `canCurate = can(role,'library.curate') && user.libraryCurator === true` |
| `content-pack.ts` | `libraryPackSchema`, `importLibraryPack(db, actorId, pack, now, { dryRun })`, `exportLibraryPack(db)` | import idempotente por claves estables; export solo tablas G publicadas |
| `catalog.ts` | `listManufacturers`, `listFamilies(category?)`, `listModels(familyId)`, `variantSheet(db, variantId)` → `{ ok, manufacturer, family, model, variant, specifications[], documents[], procedures[], compatibility[], versions[] }` | solo contenido publicado (`status in vigente/publicado`) |
| `search.ts` | `detectExactCode(q)`, `searchLibrary(db, actor, { q, category?, manufacturerId?, status?, language? })` → `{ exact: Hit[], models: Hit[], articles: Hit[], documents: Hit[] }` | exacto primero; ILIKE; FTS sobre chunks |
| `documents.ts` | `documentAccess(db, actor, id)` → `{ ok, mode: 'enlace' \| 'extracto' \| 'visor', document }` | nunca URL de almacenamiento pública |
| `procedures.ts` | `procedureDetail(db, id)` → pasos, herramientas, torques con `source` | |
| `compatibility.ts` | `checkCompatibility(db, variantIds)` → `{ members[], rules[], verdict }` | sin regla → `no_verificada`; velocidades no deciden |
| `specifications.ts` | `lookupSpecifications(db, { variantId?, operation? })` → specs y herramientas; valor ausente → `sin_dato_verificado` | |
| `pii.ts` | `detectPii(text)` → `{ kind, match }[]` (teléfono, RUT, correo, patente) | reutiliza patrones de `audit.ts` |
| `proposals.ts` | `proposalFormSchema`, `createProposal`, `updateProposal`, `submitProposal`, `withdrawProposal`, `listMyProposals`, `proposalDetail` | alcance `actor.branchId`; autor edita solo en `draft`/`needs_changes` |
| `review.ts` | `reviewQueue(db, curator)`, `reviewProposal(db, curator, id, decision, reason, now)` | exige `canCurate` |
| `publish.ts` | `publishProposal(db, curator, proposalId, now)`, `publishVersion(db, curator, articleId, content, now)`, `archiveArticle` | versión nueva + evento + reindex en una transacción |
| `chunks.ts` | `chunkText(text)`, `reindexVersion(tx, versionId)`, `reindexSpecifications(tx, variantId)` | trozos ≤ 1200 caracteres con metadatos (`title`, `section`, `versionNumber`) |
| `retrieval.ts` | `retrieve(db, actor, { question, orderId? , limit })` → `{ global: Chunk[], private: PrivateContext \| null }` | privado solo si `canAccessOrder` y misma sucursal |
| `ai-provider.ts` | `AiProvider` interfaz `{ name, complete(request) }`, `noneProvider`, `createAnthropicProvider(env, fetchImpl)` | `complete` devuelve `{ answer, confidence, citations: chunkId[], assumptions, nextCheck, tokensIn, tokensOut }` |
| `assistant.ts` | `askAssistant(db, actor, provider, { question, scope, orderId? }, now)` → `{ ok, interactionId, answer, confidence, citations[], assumptions, nextCheck }` \| `{ ok:false, code: 'quota' \| 'forbidden' \| 'validation_error' }` | cuota → sin llamar al proveedor; guardia numérica; prompt con las fuentes como datos |
| `diagnoses.ts` | `diagnosisFormSchema`, `saveDiagnosis`, `confirmDiagnosis`, `listDiagnoses` | `canAccessOrder`; referencias versionadas |
| `technical-context.ts` | `orderTechnicalContext(db, actor, orderId)` → bici, componentes (con variante si está ligada), diagnósticos previos | `{ ok:false, code:'forbidden' }` fuera de la sucursal |
| `isolation-health.ts` | `libraryIsolationHealth(db)` → conteos de anomalías (interacciones sin sucursal del usuario, diagnósticos de orden ajena) | para el reporte y `scripts/library-check.ts` |

## 6. Rutas (todas `requireAdmin → can → zod → src/server/library/**`, `no-store`, `noindex`)

| Ruta | Permiso | Contenido |
|---|---|---|
| `/taller/biblioteca` | `library.view` | buscador, 8 categorías, accesos rápidos |
| `/taller/biblioteca/buscar?q=&categoria=&fabricante=&estado=` | `library.view` | exacto arriba, filtros, etiquetas de estado |
| `/taller/biblioteca/componentes/[id]?seccion=` | `library.view` | ficha con secciones Resumen · Especificaciones · Compatibilidad · Procedimientos · Documentos · Historial |
| `/taller/biblioteca/documentos/[id]` | `library.view` | metadatos, licencia, enlace o visor |
| `/taller/biblioteca/procedimientos/[id]` | `library.view` | pasos + panel de herramientas/torques |
| `/taller/biblioteca/compatibilidad` (GET/POST) | `library.view` | conjunto de variantes → veredicto con evidencia |
| `/taller/biblioteca/herramientas?operacion=&variante=` | `library.view` | herramientas, consumibles, especificaciones |
| `/taller/biblioteca/asistente` (GET/POST) | `library.ai` | chat con fuentes y tarjeta de confianza; historial de la sucursal |
| `/taller/biblioteca/propuestas`, `/nueva`, `/[id]` (POST) | `library.propose` | borrador, enviar, retirar, ver observaciones |
| `/taller/biblioteca/revision`, `/[id]` (POST) | `library.curate` + `canCurate` | cola, decisión, diff de versiones, publicar |
| `/taller/ordenes/[id]/biblioteca` (GET/POST) | `library.ai` + `canAccessOrder` | contexto, pregunta, "Agregar al diagnóstico", checklist, historial |

## 7. Diseño visual

Tokens de `global.css`, sin hex nuevos. Grid de categorías 2/4 columnas (`.lib-categories`). Etiquetas de estado con forma + texto: `status--verificado` (sólido, "✓"), `status--condicionado` (punteado, "?"), `status--desactualizado` (rayado `--hatch`, "⌛"), `status--en_revision` (discontinuo, "◎"), `status--sin_dato_verificado` (doble, "∅"); confianza: `status--alta`, `status--media`, `status--baja`, `status--no_verificada`. Iconos de categoría: SVG lineal inline, `aria-hidden="true"`, en `CategoryIcon.astro`. Textos alternativos IMG-01…IMG-10 (para fotos propias futuras): taller con herramientas y componentes; transmisión con cassette y desviador; sistema de freno de disco; mecánico inspeccionando horquilla; rueda en centrador; componentes de transmisión para verificar compatibilidad; herramientas de precisión; manual técnico de un componente; asistente consultando fuentes verificadas; diagnóstico asistido dentro de una orden.

## 8. Seguridad

1. Sucursal del actor desde la sesión; nunca del formulario. 2. Toda función privada filtra por `actor.branchId`; `canAccessOrder` antes de incluir una orden en el contexto. 3. El recuperador filtra alcance **antes** de armar el prompt. 4. El prompt separa política (sistema) de fuentes (datos entre delimitadores) y pide ignorar instrucciones dentro de las fuentes; prueba de que una fuente con "ignora las reglas" no altera el bloque de política. 5. Cuotas BT-D14. 6. `ai_interactions` sin PII (pregunta y respuesta pasan por `redactDetails` antes de guardarse). 7. Secretos solo en `getAiEnv()`. 8. Documentos con `storage_key` se sirven por `/taller/media/[...key]` con sesión.

## 9. ORDEN DE CONSTRUCCIÓN

| Paso | Tarea | Título | Esquema | Tablet |
|---|---|---|---|---|
| BT-01 | E1-T1 | Esquema del catálogo global y marca de curador (`0035`) | sí | |
| BT-02 | E1-T2 | Esquema de conocimiento, procedimientos y capa privada (`0036`) | sí | |
| BT-03 | E1-T3 | Acciones, `canCurate`, `rules.ts` de la biblioteca | | |
| BT-04 | E1-T4 | Paquete de contenido, importación idempotente y siembra inicial | | |
| BT-05 | E2-T1 | Catálogo y búsqueda en servidor | | |
| BT-06 | E2-T2 | Inicio y resultados de la biblioteca, menú "Conocimiento" | | |
| BT-07 | E2-T3 | Ficha de variante con secciones | | |
| BT-08 | E2-T4 | Documentos: acceso por licencia | | |
| BT-09 | E2-T5 | Siembra E2E y spec de búsqueda en tablet | | sí |
| BT-10 | E3-T1 | Procedimientos paso a paso | | |
| BT-11 | E3-T2 | Compatibilidad por conjunto | | |
| BT-12 | E3-T3 | Herramientas y especificaciones | | |
| BT-13 | E4-T1 | Propuestas: borrador, envío, PII | | |
| BT-14 | E4-T2 | Revisión central y publicación versionada | | |
| BT-15 | E4-T3 | Pantallas de propuestas y revisión; exportación | | |
| BT-16 | E5-T1 | Trozos e indexación; recuperación con alcance | | |
| BT-17 | E5-T2 | Proveedor de IA y asistente con citas y cuotas | | |
| BT-18 | E5-T3 | Pantalla del asistente; variables de entorno | | |
| BT-19 | E6-T1 | Diagnósticos técnicos y contexto de la orden (`0037`) | sí | |
| BT-20 | E6-T2 | Pestaña Biblioteca en la orden | | |
| BT-21 | E6-T3 | Spec de tablet: asistente en la orden y diagnóstico | | sí |
| BT-22 | E7-T1 | Suite de aislamiento y salud de la biblioteca | | |
| BT-23 | E7-T2 | Documentación, reglas y ventana de publicación | | |
| BT-24 | E7-T3 | Reporte final | | |

Reglas de un paso: ≤ 5 archivos (salvo donde el bloque lo declara), pruebas primero, Verify observable, `pnpm format && pnpm gate` al cierre, checkpoint `git add --` con rutas nombradas (y `drizzle` en pasos de esquema), tag `bt-NN`.

## 10. Pruebas

Unitarias (zod, PII, detectCode, chunkText, guardia numérica, prompt), integración con PGlite (cada módulo, con dos sucursales y pruebas negativas), Container API para cada página nueva (200 con permiso, 403 sin permiso, 303 sin sesión), Playwright tablet (búsqueda y ficha; asistente en orden y diagnóstico), smoke (sin cambios). Datos de prueba: sembrados en cada test; `pack.json` se valida con su zod en un test.

## 11. Riesgos

| Riesgo | Tratamiento |
|---|---|
| Codex sin red: no corre migraciones ni Playwright | Claude las corre al revisar |
| `spanish` FTS en PGlite vs Postgres 16 | comprobado en PGlite; mismo diccionario estándar |
| Sin clave de IA en el entorno | modo `none` real; proveedor probado con `fetch` falso |
| Material con copyright | enlaces y extractos permitidos (BT-D6) |
| Tamaño de la fase | 24 pasos chicos, cada uno con gate |

## 12. Registro de decisiones
Ver `BIBLIOTECA.md` §2 (BT-D1…BT-D15). Las decisiones que surjan durante la construcción se agregan ahí con fecha.
