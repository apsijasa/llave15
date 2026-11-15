# Epic 02: Biblioteca base

> Después de esta épica el usuario entra a `/taller/biblioteca`, busca por código exacto, nombre o síntoma con filtros, abre la ficha de una variante con sus seis secciones, consulta un documento según su licencia, y todo eso está probado en tablet. El menú tiene el grupo "Conocimiento".

| | |
|---|---|
| **Epic id** | `02-biblioteca-base` |
| **Tasks** | `E2-T1` … `E2-T5` (pasos BT-05 … BT-09) |
| **Depends on** | `01-fundacion` |
| **Unlocks** | `03-procedimientos-compatibilidad` |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack y compuerta

Igual que la épica 01. Páginas Astro de servidor con `requireAdmin → can → zod → src/server/library/**`, `cache-control: no-store`, sin islas (BT-D11). Pruebas de página con Container API (`experimental_AstroContainer`) siguiendo `tests/integration/indicadores-page.test.ts` (mock de `getDb`, login real con `loginAdmin`, cookie `vb_admin_session`). Tablet: Playwright 820×1180 con `.tap()`.

**Reglas transversales:** pruebas primero; ≤ 5 archivos salvo donde el bloque lo declara; releer cada archivo antes de tocarlo; `SITE.name` (nunca el nombre literal); `db`, `actor`, `now` como argumentos; zod en toda entrada; importaciones relativas con `.ts`; `import type`; sin `enum`; archivos < 400 líneas, funciones < 50; solo constructor de consultas Drizzle o `sql` parametrizado; nunca `db.query.*`.

**Interfaz del taller (`.claude/rules/taller-ui.md`):** tokens de `global.css` solamente, ningún hex nuevo; radio 2px, reglas 1px, sin sombras; objetivos táctiles ≥ 48px; estados con forma + texto (`<span class="status status--…">`); un solo `h1`; `label` visible; `fieldset`/`legend`; avisos `role="status"` / `role="alert"`; los estilos de una sola página van en su `<style is:global>` bajo `.taller`; los compartidos en `src/styles/taller-components.css`; los de un componente en su propio `<style>`.

## Directory subtree

```
src/server/library/catalog.ts                 # NEW (E2-T1)
src/server/library/search.ts                  # NEW (E2-T1)
src/server/library/documents.ts               # NEW (E2-T4)
src/components/taller/library/CategoryIcon.astro   # NEW (E2-T2)
src/components/taller/library/LibraryStatus.astro  # NEW (E2-T2)
src/components/taller/library/LibraryTabs.astro    # NEW (E2-T3)
src/components/taller/library/SourceList.astro     # NEW (E2-T3)
src/pages/taller/biblioteca/index.astro       # NEW (E2-T2)
src/pages/taller/biblioteca/buscar.astro      # NEW (E2-T2)
src/pages/taller/biblioteca/componentes/[id].astro   # NEW (E2-T3)
src/pages/taller/biblioteca/documentos/[id].astro    # NEW (E2-T4)
src/layouts/TallerLayout.astro                # edit (E2-T2): grupo Conocimiento
src/styles/taller-components.css              # edit (E2-T2): estados de la biblioteca
e2e/fixtures.ts · e2e/global-setup.ts         # edit autorizado (E2-T5, BT-D7)
e2e/biblioteca-busqueda.spec.ts               # NEW (E2-T5)
tests/unit/library-detect-code.test.ts        # NEW (E2-T1)
tests/integration/library-search.test.ts · library-catalog.test.ts   # NEW (E2-T1)
tests/integration/biblioteca-pages.test.ts    # NEW (E2-T2)
tests/integration/biblioteca-ficha-page.test.ts   # NEW (E2-T3)
tests/integration/library-documents.test.ts · biblioteca-documento-page.test.ts   # NEW (E2-T4)
```

## Contratos consumidos

`SessionUser`, `requireAdmin`, `loginRedirect`, `SESSION_COOKIE` (`admin-auth.ts`) · `can`, `forbiddenResponse` (`permissions.ts`) · `canUseLibrary`, `canCurate` (`library/access.ts`) · constantes y etiquetas de `library/rules.ts` · tablas de `schema-library-*.ts` · `getDb` · `SITE` · `Card.astro`, `PageHeader.astro`, `TallerLayout.astro`.

---

## E2-T1 — BT-05 Catálogo y búsqueda en servidor

**Archivos:** `src/server/library/catalog.ts`, `src/server/library/search.ts`, `tests/unit/library-detect-code.test.ts`, `tests/integration/library-search.test.ts`, `tests/integration/library-catalog.test.ts`.

### `search.ts`

```ts
export const librarySearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  category: z.enum(LIBRARY_CATEGORIES).optional(),
  manufacturerId: z.uuid().optional(),
  status: z.enum(["vigente", "descontinuado", "en_revision"]).optional(),
});
export type LibrarySearch = z.infer<typeof librarySearchSchema>;
/** `RD-M8100-SGS`, `CS-M8100-12`, `TL-CN10` → código normalizado en mayúsculas; texto libre → null. */
export function detectExactCode(q: string): string | null;
export type ModelHit = { variantId: string; modelId: string; code: string; variantCode: string; revision: string; name: string; componentType: string; manufacturerName: string; familyName: string; category: string; status: string; speeds: number | null };
export type ArticleHit = { articleId: string; versionId: string; slug: string; title: string; category: string; kind: string; summary: string; versionNumber: number; publishedAt: Date | null; rank: number };
export type DocumentHit = { id: string; title: string; manufacturerName: string | null; docType: string; language: string; revision: string; license: string; status: string };
export type LibrarySearchResult = { exact: ModelHit[]; models: ModelHit[]; articles: ArticleHit[]; documents: DocumentHit[] };
export async function searchLibrary(db: AppDb, actor: SessionUser, input: LibrarySearch): Promise<{ ok: true } & LibrarySearchResult | { ok: false; code: "forbidden" }>;
```

- `detectExactCode`: recorta, pasa a mayúsculas, acepta `^[A-Z]{2,3}-[A-Z0-9]{2,}(?:-[A-Z0-9]+){0,3}$`; cualquier otra cosa → `null`.
- `exact`: variantes cuya `code` o cuyo `component_models.code` igualan el código detectado (`upper(...) = …`), todas sus revisiones, ordenadas por `revision`. Vacío si no se detectó código.
- `models`: hasta 20 variantes cuyo `code`, `component_models.code` o `component_models.name` hacen `ILIKE %q%` (escapando `%`, `_`, `\` como en `src/server/taller/search.ts`), excluyendo las ya devueltas en `exact`, con los filtros `category` (familia), `manufacturerId`, `status` (modelo). Orden: `code`.
- `articles`: artículos `status = 'publicado'` cuya versión vigente (`current_version_id`) hace match por FTS: `to_tsvector('spanish', title || ' ' || summary || ' ' || content_md) @@ plainto_tsquery('spanish', q)` **o** `title ILIKE %q%`; `rank = ts_rank(...)`; filtro `category`; orden `rank desc, title`; hasta 20. Las propuestas (`knowledge_proposals`) **no se consultan**: una `submitted` con el mismo texto nunca aparece.
- `documents`: `technical_documents` `status <> 'retirado'` con `title ILIKE %q%`, filtro `manufacturerId`; hasta 20.
- Sin `canUseLibrary(actor)` → `{ ok: false, code: "forbidden" }` sin consultar.

### `catalog.ts`

```ts
export async function listManufacturers(db: AppDb): Promise<Manufacturer[]>;                      // status activo, por nombre
export async function listFamilies(db: AppDb, category?: LibraryCategory): Promise<(ComponentFamily & { manufacturerName: string })[]>;
export async function listModels(db: AppDb, familyId: string): Promise<ComponentModel[]>;
export type VariantSheet = {
  manufacturer: Manufacturer; family: ComponentFamily; model: ComponentModel; variant: ComponentVariant;
  siblings: ComponentVariant[];                                   // otras variantes del mismo modelo
  specifications: (TechnicalSpecification & { sourceDocument: { id: string; title: string; canonicalUrl: string } | null })[];
  documents: TechnicalDocument[];                                 // variant_id = variante
  procedures: { procedureId: string; title: string; kind: string; risk: string; versionNumber: number; articleTitle: string }[];
  compatibility: { ruleId: string; relation: string; certainty: string; evidence: string; conditions: string | null; restrictions: string | null; members: { variantId: string; role: string; code: string }[] }[];
  versions: { articleId: string; slug: string; title: string; kind: string; number: number; publishedAt: Date | null; reviewedByName: string | null }[];
};
export async function variantSheet(db: AppDb, actor: SessionUser, variantId: string): Promise<{ ok: true; sheet: VariantSheet } | { ok: false; code: "forbidden" | "not_found" }>;
```

- `procedures`: `article_variant_links` → `article_versions` (solo si es la `current_version_id` de un artículo `publicado`) → `procedures`.
- `compatibility`: reglas `vigente` donde la variante es miembro, con todos sus miembros (código de variante).
- `versions`: versiones **publicadas** (`published_at not null`) de artículos ligados a la variante, orden `publishedAt desc`; `reviewedByName` por `leftJoin(users)`.

### Pruebas
- `tests/unit/library-detect-code.test.ts`: `"rd-m8100-sgs"` → `"RD-M8100-SGS"`; `" CS-M8100-12 "` → `"CS-M8100-12"`; `"TL-CN10"` ok; `"cadena salta"` → null; `"RD"` → null; `"RD-M8100-SGS-X-Y-Z-W"` → null.
- `library-search.test.ts` (PGlite; siembra directa con Drizzle: fabricante, familia transmision, modelo `RD-M8100-SGS` con variantes `""` y `B`, modelo `CS-M8100-12`, artículo publicado "El cambio trasero salta bajo carga" con `content_md`, otra sucursal y una `knowledge_proposals` `submitted` con el mismo texto): (1) `q: "rd-m8100-sgs"` → `exact` con 2 variantes ordenadas `""`, `"B"`, `models` sin repetirlas; (2) `q: "cambio trasero salta"` → `articles[0]` es el artículo, `rank > 0`; la propuesta no aparece en ningún arreglo; (3) filtro `category: "frenos"` deja `models` vacío; (4) un artículo `borrador` no aparece; (5) actor sin `library.view` (construir un `SessionUser` con rol válido y mockear… **no**: todos los roles tienen `library.view`; probar en su lugar que `canUseLibrary` se consulta usando un rol inválido forzado `as Role`) → `forbidden`.
- `library-catalog.test.ts`: `variantSheet` devuelve especificación con `sourceDocument` null cuando no hay fuente y con título cuando la hay; `siblings` trae la otra revisión; `procedures` solo de la versión vigente publicada; `compatibility` ignora reglas `archivada`; `versions` ordenadas; id inexistente → `not_found`.

### Verify
```bash
pnpm test tests/integration/library-search.test.ts tests/integration/library-catalog.test.ts tests/unit/library-detect-code.test.ts   # 0 failed
pnpm format && pnpm gate   # coordinadora
```

---

## E2-T2 — BT-06 Inicio, resultados y grupo de menú

**Archivos (7, declarados):** `src/pages/taller/biblioteca/index.astro`, `src/pages/taller/biblioteca/buscar.astro`, `src/components/taller/library/CategoryIcon.astro`, `src/components/taller/library/LibraryStatus.astro`, `src/layouts/TallerLayout.astro`, `src/styles/taller-components.css`, `tests/integration/biblioteca-pages.test.ts`.

### `TallerLayout.astro`
- `Props.user` pasa a `{ name: string; role: Role; libraryCurator?: boolean }` (compatible con `SessionUser`).
- Nuevo grupo **"Conocimiento"** después de "Gestión": `Biblioteca` → `/taller/biblioteca` (`library.view`), `Asistente` → `/taller/biblioteca/asistente` (`library.ai`), `Propuestas` → `/taller/biblioteca/propuestas` (`library.propose`), `Revisión` → `/taller/biblioteca/revision` (`library.curate`). El filtro del menú: `can(user.role, link.action) && (link.action !== "library.curate" || user.libraryCurator === true)` (el layout solo puede importar `permissions.ts`, no `access.ts`). `aria-current` también cuando `path` empieza con `link.href + "/"` **solo** para los enlaces de este grupo (las subrutas de la biblioteca marcan "Biblioteca").

### `CategoryIcon.astro`
Props `{ category: LibraryCategory }` (importa el tipo de `library/rules.ts` — es un tipo puro; permitido). Un `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">` por categoría, trazos lineales simples (engranaje, disco, horquilla, rueda, manubrio, biela, rayo, llave). Sin color propio: hereda `currentColor`.

### `LibraryStatus.astro`
Props `{ status: string; label: string }` → `<span class={`status status--${status}`}>{label}</span>`.

### `taller-components.css`
Agregar bajo `.taller`: `.status--verificado::before{content:"✓"}`, `.status--condicionado{border-style:dotted}` + `::before{content:"?"}`, `.status--desactualizado{border-style:dashed;background:repeating-linear-gradient(135deg,var(--surface) 0 4px,var(--hatch) 4px 5px)}` + `::before{content:"⌛"}`, `.status--en_revision{border-style:dashed}` + `::before{content:"◎"}`, `.status--sin_dato_verificado{border:3px double var(--ink)}` + `::before{content:"∅"}`; confianza: `.status--alta::before{content:"●"}`, `.status--media{border-style:dashed}` + `"◐"`, `.status--baja{border-style:dotted}` + `"○"`, `.status--no_verificada{border:3px double var(--ink)}` + `"∅"`; relaciones: `.status--oficial_confirmada::before{content:"✓"}`, `.status--condicionada{border-style:dotted}` + `"?"`, `.status--incompatible{border-style:dashed}` + `"×"`. Más `.taller .lib-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}` y `@media (min-width:900px){.taller .lib-categories{grid-template-columns:repeat(4,minmax(0,1fr))}}`, `.taller .lib-category{display:grid;gap:8px;min-height:96px;padding:16px;border:1px solid var(--rule);border-radius:2px;background:var(--surface);color:var(--ink);text-decoration:none}`, `.taller .lib-category:hover{border-color:var(--ink)}`, `.taller .lib-category svg{width:28px;height:28px}`. Ningún hex.

### `index.astro` (`/taller/biblioteca`)
Patrón de `src/pages/taller/buscar.astro`: `requireAdmin` → 303; `can(user.role,"library.view")` → 403; `no-store`. `TallerLayout` con `title={`Biblioteca — ${SITE.name}`}`, `path="/taller/biblioteca"`. Contenido: `PageHeader title="Biblioteca" subtitle="Componentes, procedimientos, compatibilidad y documentación verificada"`; `Card` con `form method="get" action="/taller/biblioteca/buscar"` y `label for="library-q"` "Fabricante, modelo, código, síntoma o palabra técnica", `input type="search" name="q" maxlength="120"`, botón "Buscar"; `nav aria-label="Categorías"` con `<a class="lib-category" href={`/taller/biblioteca/buscar?categoria=${c}`}>` por cada categoría (icono + etiqueta); `nav aria-label="Accesos rápidos"` con enlaces `btn ghost` filtrados por `can`: Asistente (`library.ai`, `/taller/biblioteca/asistente`), Compatibilidad (`/taller/biblioteca/compatibilidad`), Herramientas (`/taller/biblioteca/herramientas`), Propuestas (`library.propose`). Los destinos que aún no existen (asistente, compatibilidad, herramientas, propuestas) se enlazan igual: los crean pasos posteriores.

### `buscar.astro` (`/taller/biblioteca/buscar`)
Query zod: `q` opcional (si falta o es inválida, se muestra el formulario con los filtros y sin resultados; la categoría sola lista las familias de esa categoría con `listFamilies`), `categoria`, `fabricante`, `estado`. Formulario GET con los cuatro controles (`select` de fabricantes vía `listManufacturers`, de categorías, de estados) dentro de `fieldset` `legend` "Filtros". Resultados: si `exact.length > 0`, `Card title="Coincidencia exacta"` con tabla `dense` (Código · Variante/Revisión · Nombre · Fabricante · Estado con `LibraryStatus`) y enlace a `/taller/biblioteca/componentes/<variantId>`; luego `Card "Modelos"`, `Card "Artículos"` (título, categoría, versión, fecha), `Card "Documentos"`; vacío total → `<p class="muted">Sin resultados.</p>`. Etiquetas de estado: modelos con `status` del modelo (vigente → "Vigente" sólido sin icono; `en_revision`; `descontinuado` → usar `status--desactualizado` con etiqueta "Descontinuado").

### Pruebas — `biblioteca-pages.test.ts` (Container API)
(1) sin cookie → 303 a `/admin/login?next=%2Ftaller%2Fbiblioteca`; (2) mecánico → 200, un solo `<h1>`, ocho enlaces `lib-category`, el menú **no** tiene "Revisión"; (3) owner con `library_curator = true` → el menú tiene "Revisión"; (4) `/taller/biblioteca/buscar?q=RD-M8100-SGS` con datos sembrados → la tabla "Coincidencia exacta" contiene el código y el enlace a la ficha; (5) `?categoria=frenos` sin `q` → lista familias de frenos; (6) ningún hex en los archivos nuevos (test con `readFileSync` y regex `#[0-9a-fA-F]{3,6}\b` excluyendo `href="#`).

### Verify
```bash
pnpm test tests/integration/biblioteca-pages.test.ts
grep -Eq '#[0-9a-fA-F]{3,6}' src/pages/taller/biblioteca/index.astro src/pages/taller/biblioteca/buscar.astro src/components/taller/library/*.astro; test $? -eq 1
pnpm format && pnpm gate   # coordinadora
```

---

## E2-T3 — BT-07 Ficha de variante con secciones

**Archivos:** `src/pages/taller/biblioteca/componentes/[id].astro`, `src/components/taller/library/LibraryTabs.astro`, `src/components/taller/library/SourceList.astro`, `tests/integration/biblioteca-ficha-page.test.ts`.

- `LibraryTabs.astro`: props `{ base: string; active: string; tabs: readonly { key: string; label: string }[] }` → `nav aria-label="Secciones de la ficha"` con `<a href={`${base}?seccion=${key}`} aria-current>`; estilos copiados de `OrderTabs.astro` (clase `.lib-tabs`).
- `SourceList.astro`: props `{ items: { title: string; href: string | null; status?: string; statusLabel?: string; detail?: string }[] }` → `<ul class="log">` con enlace externo (`target="_blank" rel="noopener"`) cuando hay `href`, `LibraryStatus` cuando hay estado.
- Página: `z.uuid()` del id → 404 "Componente no encontrado."; `variantSheet` → `not_found` 404; `seccion` zod `enum(["resumen","especificaciones","compatibilidad","procedimientos","documentos","historial"]).default("resumen")`. Encabezado `PageHeader title={`${model.code}${variant.revision ? ` · rev. ${variant.revision}` : ""}`} subtitle={`${manufacturer.name} · ${family.name} · ${model.name}`}` con `LibraryStatus` del modelo. **Resumen:** `dl.data` con Tipo, Generación, Velocidades ("Sin dato" si null), Años, Código de variante, Atributos (lista de `attributes`), otras revisiones (`siblings` enlazadas), y el aviso `role="note"` "Los valores de ajuste, torque y compatibilidad valen solo para la variante exacta y con la fuente indicada." **Especificaciones:** tabla `dense` (Tipo · Dato · Valor · Unidad · Tolerancia · Contexto · Estado · Revisado · Fuente); valor vacío → "—"; estado con `LibraryStatus` + `VALIDATION_LABELS`. **Compatibilidad:** por regla: `LibraryStatus` de la relación, certeza, evidencia, condiciones/restricciones, miembros (rol · código con enlace). Vacío → "No hay reglas de compatibilidad registradas para esta variante: estado No verificada." con `status--no_verificada`. **Procedimientos:** lista con enlace a `/taller/biblioteca/procedimientos/<procedureId>` (la página la crea BT-10; el enlace va igual), tipo, riesgo, versión. **Documentos:** `SourceList` con estado y enlace a `/taller/biblioteca/documentos/<id>`. **Historial:** tabla Versión · Artículo · Fecha · Revisor.
- Pruebas (Container API): 303 sin sesión; id no uuid → 404; id inexistente → 404; mecánico con siembra → 200, un `h1`, seis pestañas, `seccion=especificaciones` muestra "Sin dato verificado" y el enlace a la fuente cuando existe; `seccion=historial` lista la versión 1 con el nombre del revisor.

### Verify
```bash
pnpm test tests/integration/biblioteca-ficha-page.test.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E2-T4 — BT-08 Documentos: acceso por licencia

**Archivos:** `src/server/library/documents.ts`, `src/pages/taller/biblioteca/documentos/[id].astro`, `tests/integration/library-documents.test.ts`, `tests/integration/biblioteca-documento-page.test.ts`.

```ts
export type DocumentAccess =
  | { ok: true; mode: "enlace"; document: TechnicalDocument & { manufacturerName: string | null; sourceTitle: string | null }; href: string }        // canonical_url
  | { ok: true; mode: "extracto"; document: …; href: string; excerpts: { chunkIndex: number; text: string }[] }   // chunks source_kind 'document'
  | { ok: true; mode: "visor"; document: …; href: string; mediaPath: string }                                      // `/taller/media/${storage_key}`
  | { ok: true; mode: "retirado"; document: … }                                                                     // sin href
  | { ok: false; code: "forbidden" | "not_found" };
export async function documentAccess(db: AppDb, actor: SessionUser, id: string): Promise<DocumentAccess>;
export async function listDocuments(db: AppDb, actor: SessionUser, filter: { manufacturerId?: string; variantId?: string }): Promise<DocumentHitLike[]>;
```
Reglas: `status = 'retirado'` → `retirado` aunque tenga licencia; `license = 'copia_autorizada'` con `storage_key` → `visor`; `extracto_permitido` → `extracto` (puede venir con 0 extractos); resto → `enlace`. Nunca se devuelve una URL del almacenamiento (solo `/taller/media/...`). Sin `canUseLibrary` → `forbidden`.

Página: `dl.data` con Título, Fabricante, Fuente, Tipo, Idioma, Revisión, Checksum ("Sin checksum"), Estado (`LibraryStatus`: vigente sólido, desactualizado, retirado → `status--incompatible` con etiqueta "Retirado"), Licencia (etiquetas: "Solo enlace", "Extracto permitido", "Copia autorizada"). Acción según modo: `a.btn` "Abrir el original" (`target=_blank rel=noopener`) en `enlace`/`extracto`/`visor`; en `extracto`, `Card "Extractos permitidos"` con cada trozo en `<blockquote>`; en `visor`, `<iframe title=… src={mediaPath}>` dentro de la card (solo si `mediaPath`); en `retirado`, aviso `role="alert"` "Documento retirado por el curador: no se enlaza al original." Nota fija al pie: "La documentación pertenece a su editor; se enlaza o se extracta solo con permiso."

Pruebas: los cuatro modos; `retirado` prevalece; `forbidden`; página 303/404/200 con los textos.

### Verify
```bash
pnpm test tests/integration/library-documents.test.ts tests/integration/biblioteca-documento-page.test.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E2-T5 — BT-09 Siembra E2E y spec de búsqueda en tablet

**Archivos (edición autorizada BT-D7):** `e2e/fixtures.ts`, `e2e/global-setup.ts`, `e2e/biblioteca-busqueda.spec.ts` (nuevo).

- `fixtures.ts`: agregar a `SEED`: `libraryManufacturerId: "00000000-0000-4000-8000-000000000081"`, `libraryFamilyId: …82`, `libraryModelId: …83`, `libraryVariantId: …84`, `librarySpecId: …85`, `libraryDocumentId: …86`, `libraryArticleId: …87`, `libraryVersionId: …88`.
- `global-setup.ts`: nueva función `seedLibrary(sql)` (≤ 50 líneas; si hace falta, dos funciones) que, si existen `manufacturers` y `knowledge_articles`, inserta: fabricante `shimano` "Shimano"; familia `deore-xt` "Deore XT" `transmision`; modelo `RD-M8100-SGS` "Cambio trasero Deore XT 12 velocidades" `cambio_trasero` generación `M8100` speeds 12; variante `RD-M8100-SGS` revisión `''`; especificación `torque` "Tornillo de fijación al cuadro" `value_text ''` unidad `Nm` `sin_dato_verificado`; documento `https://si.shimano.com/#/es/search/Series?name=DEORE%20XT%20M8100` licencia `enlace` tipo `manual` idioma `en` ligado a la variante; artículo `transmision-12v-identificacion` `publicado` kind `articulo` categoría `transmision` con versión 1 (`content_hash` cualquier sha256 hex fijo, `published_at now()`, `reviewed_by` = dueño), `current_version_id` y `article_variant_links`. Llamarla desde `globalSetup` después de `seedOrders`.
- `biblioteca-busqueda.spec.ts` (solo importa `@playwright/test` y `./fixtures.ts`):
  1. "El mecánico busca un código exacto y abre la ficha en tablet": `login(page, "mechanic", "/taller/biblioteca")`; `getByLabel(/Fabricante, modelo, código/)` `.fill("rd-m8100-sgs")`; `getByRole("button", { name: "Buscar" }).tap()`; `expect(page).toHaveURL(/\/taller\/biblioteca\/buscar\?/)`; la tabla "Coincidencia exacta" tiene la fila con `RD-M8100-SGS`; `getByRole("link", { name: "RD-M8100-SGS", exact: true }).first().tap()`; `expect(getByRole("heading", { level: 1 })).toContainText("RD-M8100-SGS")`; `getByRole("link", { name: "Especificaciones" }).tap()`; `expect(getByText("Sin dato verificado", { exact: true })).toBeVisible()`.
  2. "Una categoría lleva a resultados filtrados": login → `/taller/biblioteca` → `getByRole("link", { name: /Transmisión/ }).tap()` → URL `categoria=transmision` → el texto "Deore XT" visible.
  3. "El menú muestra Biblioteca y no Revisión para el mecánico": `getByRole("link", { name: "Biblioteca" })` visible; `getByRole("link", { name: "Revisión" })` count 0.

### Verify
```bash
pnpm build && pnpm test:tablet e2e/biblioteca-busqueda.spec.ts   # coordinadora
git diff HEAD --name-only -- e2e | LC_ALL=C sort | tr '\n' ' ' | grep -q 'e2e/biblioteca-busqueda.spec.ts e2e/fixtures.ts e2e/global-setup.ts'
pnpm format && pnpm gate   # coordinadora
```
