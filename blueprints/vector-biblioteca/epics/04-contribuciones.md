# Epic 04: Contribuciones y gobernanza

> Después de esta épica cualquier usuario propone conocimiento (borrador → enviada) con detección de datos personales; solo el curador central revisa, pide cambios, aprueba, rechaza y publica; publicar crea una versión nueva inmutable, conserva la anterior, deja un evento y reindexa en la misma transacción; y `pnpm library:export` produce el paquete del conocimiento global sin filas privadas.

| | |
|---|---|
| **Epic id** | `04-contribuciones` |
| **Tasks** | `E4-T1` … `E4-T3` (pasos BT-13 … BT-15) |
| **Depends on** | `03-procedimientos-compatibilidad` |
| **Unlocks** | `05-ia` |

Stack, compuerta, reglas transversales e interfaz: como la épica 02. Las funciones de escritura siguen `.claude/rules/taller-domain.md`: `db`, `actor`, `now`; permiso al comienzo con `{ ok: false, code: "forbidden" }` sin tocar filas; `recordAudit(tx, …)` dentro de la transacción; error centinela si algo falla después de escribir.

## Auditoría
`src/server/taller/audit.ts` gana en `AuditAction` (E4-T1): `"proposal.created"`, `"proposal.updated"`, `"proposal.submitted"`, `"proposal.withdrawn"`, `"proposal.reviewed"`, `"library.published"`, `"library.archived"`. `audit_log.branch_id` es NOT NULL: las acciones globales del curador se registran con la sucursal **del curador** (su propia instalación) y en `publication_events` sin sucursal.

---

## E4-T1 — BT-13 Propuestas: borrador, envío y datos personales

**Archivos:** `src/server/library/pii.ts`, `src/server/library/proposals.ts`, `src/server/taller/audit.ts` (solo el tipo `AuditAction`), `tests/unit/library-pii.test.ts`, `tests/integration/library-proposals.test.ts`.

### `pii.ts`
```ts
export type PiiFinding = { kind: "telefono" | "rut" | "correo" | "patente"; match: string };
export function detectPii(text: string): PiiFinding[];
```
Patrones: correo y RUT y teléfono **los mismos** que `audit.ts` (copiar las expresiones, no importarlas si no están exportadas; si se exportan, que `audit.ts` las exporte sin cambiar su comportamiento); patente chilena `\b(?:[B-DF-HJ-LP-TV-Z]{4}|[A-Z]{2})[ -]?\d{2}\b` en mayúsculas o minúsculas (formato nuevo `BCDF12` y antiguo `AB1234` → para el antiguo usar `\b[A-Z]{2}[ -]?\d{4}\b`). Devuelve un hallazgo por coincidencia, sin duplicados exactos.

### `proposals.ts`
```ts
export const proposalFormSchema = z.strictObject({
  kind: z.enum(PROPOSAL_KINDS),
  title: z.string().trim().min(5).max(160),
  contentMd: z.string().trim().min(20).max(20000),
  evidence: z.string().trim().max(4000).default(""),
  targetArticleId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  targetVariantId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});
export async function createProposal(db, actor, input: unknown, now): Promise<{ ok: true; id: string } | { ok: false; code: "forbidden" | "validation_error" | "invalid_target" }>;
export async function updateProposal(db, actor, id, input: unknown, now): Promise<{ ok: true } | { ok: false; code: "forbidden" | "validation_error" | "not_found" | "invalid_transition" | "invalid_target" }>;
export async function submitProposal(db, actor, id, now): Promise<{ ok: true; piiFlags: PiiFinding[] } | { ok: false; code: "forbidden" | "not_found" | "invalid_transition" }>;
export async function withdrawProposal(db, actor, id, now): Promise<{ ok: true } | { ok: false; code: … }>;
export async function listMyProposals(db, actor): Promise<ProposalSummary[]>;          // de la sucursal del actor, más recientes primero
export async function proposalDetail(db, actor, id): Promise<{ ok: true; proposal: KnowledgeProposal; reviews: { decision: string; reason: string; createdAt: Date; reviewerName: string | null }[]; authorName: string } | { ok: false; code: "not_found" | "forbidden" }>;
```
Reglas: permiso `library.propose`; toda consulta filtra `branch_id = actor.branchId` (otra sucursal → `not_found`); `targetArticleId`/`targetVariantId` deben existir (si no, `invalid_target`); `updateProposal` solo por el autor y solo en `draft` o `needs_changes` (en `needs_changes` vuelve a `draft`); `submitProposal` solo `draft` → `submitted`, calcula `detectPii(title + contentMd + evidence)` y lo guarda en `pii_flags`, `submitted_at = now`; `withdrawProposal` solo el autor y según `PROPOSAL_TRANSITIONS` → `withdrawn`, `withdrawn_at`. Transiciones validadas con `isProposalTransition`. Auditoría `proposal.*` con `details` `{ kind, title }` (pasa por `redactDetails`).

### Pruebas
- `library-pii.test.ts`: `"+56 9 1234 5678"` → telefono; `"12.345.678-5"` → rut; `"a@b.cl"` → correo; `"BCDF12"` y `"ab 1234"` → patente; texto técnico `"RD-M8100-SGS 12 velocidades"` → vacío.
- `library-proposals.test.ts`: crear → `draft`; enviar → `submitted` con `pii_flags` cuando el texto tiene teléfono; editar `submitted` → `invalid_transition`; poner manualmente `needs_changes`, editar → vuelve a `draft`; otro usuario de la misma sucursal no puede editar (`forbidden`); usuario de otra sucursal → `not_found` en detalle; retirar; `searchLibrary` con el título de la propuesta enviada no la devuelve; auditoría escrita.

### Verify
```bash
pnpm test tests/unit/library-pii.test.ts tests/integration/library-proposals.test.ts tests/integration/audit.test.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E4-T2 — BT-14 Revisión central y publicación versionada

**Archivos:** `src/server/library/review.ts`, `src/server/library/publish.ts`, `src/server/library/chunks.ts` (nuevo: solo `chunkText`, `reindexVersion`, `removeVersionChunks`), `tests/integration/library-review.test.ts`, `tests/integration/library-publish.test.ts`.

### `chunks.ts` (base; BT-16 lo extiende)
```ts
export function chunkText(text: string, max = CHUNK_MAX_CHARS): { index: number; text: string; section: string | null }[];
export async function reindexVersion(tx: AppDb, versionId: string): Promise<number>;      // borra los trozos de esa versión y crea los nuevos; devuelve cantidad
export async function removeArticleChunks(tx: AppDb, articleId: string): Promise<void>;   // borra trozos de todas las versiones del artículo
```
`chunkText`: corta por encabezados Markdown (`^#{1,6} `) y luego por párrafos, acumulando hasta `max`; un párrafo más largo se corta en límite de oración o de palabra; `section` = último encabezado visto. `reindexVersion` crea trozos `source_kind: 'article_version'`, `source_id: versionId`, `metadata: { articleId, slug, title, category, kind, versionNumber, section }` a partir de `title + summary + contentMd`. **Excepción declarada:** `document_chunks` es un índice derivado; borrar y recrear sus filas **no** viola "nunca se borra" (no es dato de negocio). Se documenta en `.claude/rules/library.md` (BT-23).

### `review.ts`
```ts
export async function reviewQueue(db, curator): Promise<{ ok: true; items: { id: string; kind: string; title: string; status: string; submittedAt: Date | null; piiCount: number; targetArticleTitle: string | null }[] } | { ok: false; code: "forbidden" }>;
export const reviewDecisionSchema = z.object({ decision: z.enum(["in_review","needs_changes","approved","rejected"]), reason: z.string().trim().max(2000).default(""), checklist: z.record(z.string(), z.boolean()).default({}) });
export async function reviewProposal(db, curator, id, input: unknown, now): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "invalid_transition" | "validation_error" | "reason_required" | "pii_unresolved" }>;
export async function reviewDetail(db, curator, id): Promise<{ ok: true; proposal: …; current: { versionId: string; number: number; contentMd: string } | null; reviews: … } | { ok: false; code: "forbidden" | "not_found" }>;
```
Reglas: `canCurate(curator)` o `forbidden` **antes** de consultar; la cola trae propuestas de **todas** las sucursales en `submitted`, `in_review`, `approved`, pero solo `id`, `kind`, `title`, `status`, `submittedAt`, cantidad de PII y título del artículo objetivo — **nunca** `branch_id`, autor ni datos del taller; `reviewDetail` agrega `contentMd`, `evidence`, `pii_flags` y la versión vigente del artículo objetivo (para el diff), sin autor ni sucursal. `needs_changes` y `rejected` exigen `reason` (≥ 5 caracteres) → si no, `reason_required`. `approved` con `pii_flags` no vacío exige `checklist.piiRevisada === true` → si no, `pii_unresolved`. Cada decisión escribe `proposal_reviews` y cambia el estado según `PROPOSAL_TRANSITIONS`. Auditoría `proposal.reviewed`.

### `publish.ts`
```ts
export const publishInputSchema = z.object({ justification: z.string().trim().max(1000).default(""), slug: z.string().regex(/^[a-z0-9-]{3,80}$/).optional(), category: z.enum(LIBRARY_CATEGORIES).optional() });
export async function publishProposal(db, curator, proposalId, input: unknown, now): Promise<{ ok: true; articleId: string; versionId: string; versionNumber: number } | { ok: false; code: "forbidden" | "not_found" | "invalid_transition" | "validation_error" | "slug_taken" | "index_failed" }>;
export async function archiveArticle(db, curator, articleId, justification: string, now): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "already_archived" }>;
export async function articleVersions(db, articleId): Promise<{ id: string; number: number; publishedAt: Date | null; contentHash: string }[]>;
```
`publishProposal` (una transacción): propuesta `approved` (si no, `invalid_transition`); si tiene `target_article_id`, la versión nueva es `max(number) + 1` de ese artículo con `supersedes_version_id` = vigente; si no, crea `knowledge_articles` con `slug` (input o derivado del título, normalizado sin tildes; choque → `slug_taken`), `category` (input; obligatoria si no hay artículo objetivo → `validation_error`), `kind` según la propuesta (`especificacion`/`correccion` → `articulo`), `status 'publicado'`. La versión nueva: `content_md` = contenido de la propuesta, `summary` = primeras 280 letras sin Markdown, `sources` = `[{ note: evidence }]` si hay evidencia, `content_hash` sha256, `reviewed_by` = curador, `published_at = now`. Actualiza `current_version_id`, `status 'publicado'`; si la propuesta tiene `target_variant_id`, `article_variant_links`. Escribe `publication_events` `publish` con `justification`, `proposal_reviews` `published`, propuesta `published` + `published_version_id`. Llama `reindexVersion(tx, versionId)`; si lanza, el error centinela `IndexFailed` revierte todo y afuera devuelve `index_failed` (la propuesta sigue `approved`). Auditoría `library.published`. **Nunca** `update` sobre una fila de `article_versions` existente.
`archiveArticle`: `status 'archivado'`, `removeArticleChunks`, evento `archive`, auditoría `library.archived`.

### Pruebas
- `library-review.test.ts`: no curador (owner sin marca, mecánico) → `forbidden` en cola, detalle y decisión; la cola trae propuestas de dos sucursales y ningún objeto tiene `branchId`/`authorId`; `needs_changes` sin motivo → `reason_required`; `approved` con PII sin checklist → `pii_unresolved`; con checklist → `approved`; transición inválida → `invalid_transition`.
- `library-publish.test.ts`: publicar propuesta nueva crea artículo + versión 1 + evento + trozos (`document_chunks` > 0) y la propuesta queda `published`; publicar una corrección sobre ese artículo crea versión 2, la versión 1 queda **idéntica** (comparar fila completa antes y después), `current_version_id` = v2 y los trozos apuntan a v2; si `reindexVersion` lanza (`vi.spyOn` sobre el módulo o inyectar texto que dispare un error controlado: preferir exportar un parámetro opcional `indexer` en `publishProposal` con valor por defecto `reindexVersion`), la propuesta sigue `approved` y no hay versión nueva; `archiveArticle` deja 0 trozos y `searchLibrary` no lo devuelve; `chunkText` corta por encabezados y respeta el máximo.

### Verify
```bash
pnpm test tests/integration/library-review.test.ts tests/integration/library-publish.test.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E4-T3 — BT-15 Pantallas de propuestas y revisión; exportación

**Archivos (10, declarados):** `src/pages/taller/biblioteca/propuestas/index.astro`, `…/propuestas/nueva.astro`, `…/propuestas/[id].astro`, `src/pages/taller/biblioteca/revision/index.astro`, `…/revision/[id].astro`, `scripts/library-export.ts`, `package.json`, `tests/integration/biblioteca-propuestas-page.test.ts`, `tests/integration/biblioteca-revision-page.test.ts`, `tests/integration/library-export.test.ts`. Además `exportLibraryPack` en `src/server/library/content-pack.ts` (o en `content-pack-export.ts` si `content-pack.ts` pasa de 350 líneas) — 11 archivos, declarados.

### Propuestas (`library.propose`)
- `index`: `PageHeader "Propuestas"` con acción `a.btn` "Nueva propuesta"; tabla de `listMyProposals` (Título · Tipo · Estado con `status--<estado>` y `PROPOSAL_LABELS` · Enviada · Autor). Estados con forma: `draft` sólido, `submitted` discontinuo, `needs_changes` punteado, `in_review` "◎", `approved` doble, `rejected`/`withdrawn` rayado, `published` "✓" — agregar estas clases en el `<style is:global>` de la página bajo `.taller`, con tokens.
- `nueva`: formulario POST (`isAllowedOrigin`) con `select` Tipo, `input` Título, `textarea` Contenido (Markdown) `rows=12`, `textarea` Fuente o evidencia, `select` Artículo a corregir (opcional, artículos publicados), `select` Variante (opcional); errores por campo con `aria-invalid`/`aria-describedby`; éxito → 303 `/taller/biblioteca/propuestas/<id>?hecho=creada`. Nota fija: "No incluya nombres de clientes, teléfonos, patentes ni fotos de personas. Las propuestas no se publican sin revisión central."
- `[id]`: detalle (estado, tipo, contenido en `<pre class="proposal-md">` con `white-space: pre-wrap`, evidencia), aviso `role="alert"` con la lista de PII si `pii_flags` no está vacío, historial de revisiones (decisión · motivo · fecha), y botones según estado y autoría: Editar (formulario igual a `nueva` precargado, `action=update`), Enviar a revisión (`action=submit`), Retirar (`action=withdraw`). Avisos `?hecho=creada|guardada|enviada|retirada` con `role="status"`.

### Revisión (`library.curate` + `canCurate`, si no → 403)
- `index`: tabla de `reviewQueue` (Título · Tipo · Estado · Enviada · Datos personales "N detectados" con `status--no_verificada` si N > 0) con enlace al detalle.
- `[id]`: `reviewDetail`; diff línea a línea entre la versión vigente y la propuesta: función pura local `lineDiff(a, b)` (LCS sobre líneas, máx. 400 líneas por lado, si no "Diferencia demasiado grande: compare los textos completos") renderizada como `<ol class="diff">` con `<ins>`/`<del>` y prefijos "+"/"−" (forma + texto, no solo color). Formulario de decisión (`fieldset legend="Decisión"` con radios `in_review`, `needs_changes`, `approved`, `rejected`, `textarea` Motivo, checkbox "Revisé los datos personales detectados" visible si hay PII) y, si `approved`, formulario Publicar (slug opcional, categoría si no hay artículo objetivo, justificación) que llama `publishProposal`; `index_failed` → aviso "No se pudo indexar: la propuesta sigue aprobada. Intenta de nuevo."

### Exportación
`exportLibraryPack(db): Promise<LibraryPack>` arma el paquete desde las tablas **globales** solamente (fabricantes, familias, modelos, variantes, fuentes, documentos sin `storage_key`, especificaciones, herramientas y artículos `publicado` con su versión **vigente** como `version: { number: 1, … }` y su procedimiento si lo tiene); jamás lee `knowledge_proposals`, `technical_diagnoses`, `private_technical_notes`, `ai_interactions`. El resultado pasa `libraryPackSchema`. `scripts/library-export.ts [ruta]` escribe el JSON (por defecto a stdout), sale 2 si no conecta. `package.json`: `"library:export": "node --env-file-if-exists=.env scripts/library-export.ts"`.

### Pruebas
- `biblioteca-propuestas-page.test.ts`: 303; GET nueva 200; POST inválido 422 con mensajes; POST válido 303 al detalle; detalle con PII muestra el aviso; POST sin Origin → 403; otra sucursal → 404.
- `biblioteca-revision-page.test.ts`: owner sin marca → 403; curador → 200 con la cola; detalle muestra diff con `<ins>`; decisión `needs_changes` sin motivo → mensaje; publicar → 303 y el artículo existe.
- `library-export.test.ts`: importar `pack.json` → exportar → el resultado pasa el schema, re-importarlo en una base nueva da los mismos conteos globales; con propuestas, diagnósticos e interacciones sembradas, el JSON exportado no contiene sus títulos ni ids (búsqueda de texto en `JSON.stringify`).

### Verify
```bash
pnpm test tests/integration/biblioteca-propuestas-page.test.ts tests/integration/biblioteca-revision-page.test.ts tests/integration/library-export.test.ts
pnpm format && pnpm gate   # coordinadora
```
