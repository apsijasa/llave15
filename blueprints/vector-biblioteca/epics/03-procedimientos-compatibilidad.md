# Epic 03: Procedimientos, compatibilidad, herramientas y especificaciones

> Después de esta épica hay procedimientos paso a paso con herramientas, controles y torques con fuente; un comparador de compatibilidad por conjunto que nunca infiere por número de velocidades; y una búsqueda de herramientas y especificaciones que muestra `Sin dato verificado` cuando no hay fuente.

| | |
|---|---|
| **Epic id** | `03-procedimientos-compatibilidad` |
| **Tasks** | `E3-T1` … `E3-T3` (pasos BT-10 … BT-12) |
| **Depends on** | `02-biblioteca-base` |
| **Unlocks** | `04-contribuciones` |

Stack, compuerta, reglas transversales e interfaz del taller: iguales a la épica 02 (léela si no la tienes: `epics/02-biblioteca-base.md`, secciones "Stack y compuerta" y "Interfaz del taller"). Páginas `requireAdmin → can("library.view") → zod → src/server/library/**`, `no-store`, sin islas. Pruebas de página con Container API.

---

## E3-T1 — BT-10 Procedimientos paso a paso

**Archivos (6, declarados):** `src/server/library/procedures.ts` (nuevo), `src/server/library/content-pack.ts` (extender), `src/data/library/pack.json` (agregar un procedimiento), `src/pages/taller/biblioteca/procedimientos/[id].astro` (nuevo), `tests/integration/library-procedures.test.ts`, `tests/integration/biblioteca-procedimiento-page.test.ts`.

### `procedures.ts`
```ts
export type ProcedureDetail = {
  procedure: Procedure; article: { id: string; slug: string; title: string; category: string };
  version: { id: string; number: number; publishedAt: Date | null; reviewedByName: string | null; sources: ArticleVersion["sources"] };
  variants: { id: string; code: string; revision: string; modelName: string }[];
  steps: ProcedureStep[];                                   // por sequence
  specs: (TechnicalSpecification & { sourceDocument: { id: string; title: string; canonicalUrl: string } | null })[];
};
export async function procedureDetail(db: AppDb, actor: SessionUser, id: string): Promise<{ ok: true; detail: ProcedureDetail } | { ok: false; code: "forbidden" | "not_found" }>;
```
Un procedimiento es visible solo si su `version_id` es la `current_version_id` de un artículo `publicado`; si no, `not_found`.

### Paquete
`libraryPackSchema` gana un campo opcional por artículo `procedure: { title, kind, risk, durationMinutes?, prerequisites?, finalChecks?, steps: [{ sequence, action, tools?, consumables?, verification?, warning? }], specs?: [{ variant, kind, label }] }` (las `specs` referencian especificaciones del paquete por `(variant, kind, label)`). Al crear la versión 1 del artículo, `importLibraryPack` crea también `procedures`, `procedure_steps` y `procedure_specs`; idempotente porque solo corre cuando el artículo es nuevo.

`pack.json` agrega el artículo `kind: "procedimiento"`, slug `cadena-12v-revision-desgaste`, categoría `transmision`, título "Revisión de desgaste de cadena de 12 velocidades", versión 1 con `contentMd` breve y `sources: [{ source: "https://www.sheldonbrown.com/" }]`, ligado a `CN-M8100`, y su `procedure`: `kind: "mantenimiento"`, `risk: "bajo"`, `durationMinutes: 10`, `prerequisites: "Bicicleta en el soporte, cadena limpia"`, `finalChecks: "Registrar la medición en la orden y comparar con el límite del fabricante"`, pasos (4): limpiar un tramo de cadena; medir con un indicador de desgaste de cadena (herramienta "Indicador de desgaste de cadena"); comparar la lectura con el límite indicado por el fabricante de la cadena (verificación: "Usar el límite del manual del fabricante; no usar un valor genérico"); si supera el límite, proponer reemplazo de cadena y revisar cassette y platos (advertencia: "Una cadena muy gastada puede saltar bajo carga en el cassette nuevo"). Ninguna cifra de límite (el límite queda en el manual). `specs` vacío.

### Página
`/taller/biblioteca/procedimientos/[id]`: `PageHeader title={procedure.title} subtitle={article.title}` con `LibraryStatus` del riesgo (bajo sólido, medio punteado, alto discontinuo, crítico doble; etiquetas "Riesgo bajo/medio/alto/crítico"). Grid `.proc-cols` (1 columna; ≥ 900px `2fr 1fr`). Columna principal: `dl.data` (Tipo, Duración indicativa "N min" o "Sin dato", Versión N · fecha · revisor), `Card "Requisitos previos"`, `Card "Pasos"` con `<ol class="proc-steps">` (cada `li`: acción; "Herramientas:", "Consumibles:", "Comprobación:" en `dl` cuando existan; advertencia en `<p role="note" class="proc-warning">` con borde izquierdo doble de 6px `var(--ink)`), `Card "Controles finales"`. Panel lateral `aside aria-label="Herramientas y torques"`: lista única de herramientas de todos los pasos; tabla de `specs` (Dato · Valor · Unidad · Estado · Fuente) — vacío → "Este procedimiento no tiene torques registrados: consulte el manual del fabricante." ; `Card "Alcance"` con variantes enlazadas a sus fichas; `Card "Fuentes"` con `SourceList` (documentos por id y fuentes por url).

### Pruebas
- `library-procedures.test.ts`: detalle con pasos ordenados (insertados desordenados); `specs` con fuente; versión no vigente → `not_found`; artículo `archivado` → `not_found`; `importLibraryPack` del paquete real crea 1 procedimiento con 4 pasos y repetirlo no duplica.
- `biblioteca-procedimiento-page.test.ts`: 303 sin sesión; 404 id inválido; 200 con `h1`, `<ol>` con N `li`, `role="note"` en la advertencia y el texto del panel lateral vacío.

### Verify
```bash
pnpm test tests/integration/library-procedures.test.ts tests/integration/biblioteca-procedimiento-page.test.ts tests/integration/library-pack.test.ts
pnpm format && pnpm gate   # coordinadora (y `pnpm library:import` sobre la base dev)
```

---

## E3-T2 — BT-11 Compatibilidad por conjunto

**Archivos:** `src/server/library/compatibility.ts`, `src/pages/taller/biblioteca/compatibilidad.astro`, `src/data/library/pack.json` (sin reglas nuevas: ver abajo), `tests/integration/library-compatibility.test.ts`, `tests/integration/biblioteca-compatibilidad-page.test.ts`.

### `compatibility.ts`
```ts
export const compatibilityCheckSchema = z.object({
  members: z.array(z.object({ role: z.enum(COMPATIBILITY_ROLES), variantId: z.uuid() })).min(2).max(8),
});
export type CompatibilityVerdict = {
  relation: CompatibilityRelation;                 // oficial_confirmada | condicionada | incompatible | no_verificada
  members: { role: string; variantId: string; code: string; modelName: string; speeds: number | null }[];
  rules: { ruleId: string; relation: string; certainty: string; evidence: string; conditions: string | null; restrictions: string | null; sourceDocument: { id: string; title: string; canonicalUrl: string } | null; reviewedOn: string | null; coveredVariantIds: string[] }[];
  uncovered: string[];                             // variantIds que ninguna regla aplicable cubre
  explanation: string;                             // texto en español
};
export async function checkCompatibility(db: AppDb, actor: SessionUser, input: unknown): Promise<{ ok: true; verdict: CompatibilityVerdict } | { ok: false; code: "forbidden" | "validation_error" | "not_found" }>;
export async function listVariantsForRole(db: AppDb, role: CompatibilityRole): Promise<{ id: string; label: string }[]>;   // por component_type del modelo
```
Algoritmo: una regla `vigente` **aplica** si **todos sus miembros** están en el conjunto pedido (una regla de 2 componentes aplica a un conjunto de 4 que los contiene). Veredicto: si alguna regla aplicable es `incompatible` → `incompatible`; si no, si existen reglas aplicables y juntas cubren **todas** las variantes del conjunto y todas son `oficial_confirmada` → `oficial_confirmada`; si cubren todo y alguna es `condicionada` → `condicionada`; en cualquier otro caso → `no_verificada` (con `uncovered`). **El número de velocidades no participa** en la decisión (se muestra solo como dato). `explanation`: "Combinación confirmada por documentación oficial.", "Compatible solo bajo las condiciones indicadas.", "La documentación indica que no son compatibles.", "No hay evidencia verificada para esta combinación exacta. Que tengan la misma cantidad de velocidades no basta: identifique cada variante y consulte el manual." Variante inexistente → `not_found`.

`listVariantsForRole`: mapa rol → `component_type` (`shifter` → `shifter`, `cambio` → `cambio_trasero`, `cassette` → `cassette`, `cadena` → `cadena`, `plato` → `biela`, `nucleo` → `nucleo`, `freno` → `freno_disco`, `disco` → `disco`); etiqueta `code + (revision ? " rev. " + revision : "") + " — " + model.name`.

`pack.json`: el paquete **no** trae reglas de compatibilidad (no hay documento citado que las respalde con exactitud). Agregar al paquete el `componentType` `shifter` al modelo `SL-M8100-R` y `cassette`, `cadena`, `biela` a los demás si no lo están ya, para que los selects tengan opciones.

### Página `/taller/biblioteca/compatibilidad`
GET: formulario con un `select` por rol (`shifter`, `cambio`, `cassette`, `cadena`, `plato`, `nucleo`), cada uno con opción vacía "No incluir" y `label` con `COMPATIBILITY_ROLE_LABELS`; `fieldset legend="Conjunto a comparar"`; botón "Comparar". POST (con `isAllowedOrigin`): arma `members` con los no vacíos; < 2 → aviso `role="alert"` "Elige al menos dos componentes."; resultado: `Card title="Resultado"` con `LibraryStatus` de la relación (etiqueta `COMPATIBILITY_LABELS`) grande, `explanation`, tabla de miembros (Rol · Código · Modelo · Velocidades), tabla de reglas (Relación · Certeza · Evidencia · Condiciones/restricciones · Fuente · Revisado), y lista de `uncovered` como "Sin evidencia para: …". La página repone los selects con lo elegido.

### Pruebas
- `library-compatibility.test.ts` (siembra propia): (a) dos variantes 12v sin reglas → `no_verificada`, `uncovered` con ambas; (b) regla `oficial_confirmada` con documento que cubre ambas → `oficial_confirmada`; (c) conjunto de 3 con una regla oficial de 2 → `no_verificada` y `uncovered` con la tercera; (d) regla `condicionada` + oficial cubriendo todo → `condicionada`; (e) una `incompatible` aplicable prevalece; (f) regla `archivada` se ignora; (g) dos variantes de 11v y 12v sin reglas → `no_verificada` (igual que (a): velocidades no deciden); (h) id inexistente → `not_found`; (i) `members` de 1 → `validation_error`.
- `biblioteca-compatibilidad-page.test.ts`: GET 200 con seis selects; POST sin Origin válido → 403; POST con dos variantes sin reglas → texto "No verificada" y la explicación de velocidades.

### Verify
```bash
pnpm test tests/integration/library-compatibility.test.ts tests/integration/biblioteca-compatibilidad-page.test.ts tests/integration/library-pack.test.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E3-T3 — BT-12 Herramientas y especificaciones

**Archivos:** `src/server/library/specifications.ts`, `src/pages/taller/biblioteca/herramientas.astro`, `tests/integration/library-specifications.test.ts`, `tests/integration/biblioteca-herramientas-page.test.ts`.

```ts
export const specLookupSchema = z.object({
  variantId: z.uuid().optional(),
  kind: z.enum(SPEC_KINDS).optional(),
  operation: z.string().trim().min(2).max(120).optional(),
});
export type SpecRow = { id: string | null; variantId: string; kind: string; label: string; valueText: string; unit: string | null; tolerance: string | null; context: string | null; validationStatus: string; reviewedOn: string | null; sourceDocument: { id: string; title: string; canonicalUrl: string } | null };
export type ToolRow = { id: string; name: string; code: string | null; kind: "herramienta" | "consumible"; category: string; specification: string | null; usage: string | null; restrictions: string | null; manufacturerName: string | null };
export async function lookupSpecifications(db: AppDb, actor: SessionUser, input: unknown): Promise<{ ok: true; specs: SpecRow[]; tools: ToolRow[] } | { ok: false; code: "forbidden" | "validation_error" | "not_found" }>;
```
- Con `variantId`: todas sus especificaciones (filtradas por `kind` si viene). Si se pidió `kind` y la variante **no** tiene ninguna de ese tipo, devolver **una fila sintética** `{ id: null, kind, label: SPEC_KIND_LABELS[kind], valueText: "", validationStatus: "sin_dato_verificado", … }`. Una especificación con `valueText` vacío se devuelve con `validationStatus` `sin_dato_verificado` aunque la base diga otra cosa.
- Con `operation`: herramientas y consumibles donde `to_tsvector('spanish', name || ' ' || coalesce(usage,'') || ' ' || coalesce(specification,''))` hace match con `plainto_tsquery('spanish', operation)` **o** `name ILIKE %operation%`; hasta 30, por categoría y nombre. Sin `operation`, `tools` vacío.
- Variante inexistente → `not_found`.

Página `/taller/biblioteca/herramientas`: formulario GET con `label` "Operación o componente" (`operation`), `select` "Variante" (opción vacía + variantes por código, máx. 200), `select` "Tipo de dato" (opción vacía + `SPEC_KIND_LABELS`); botón "Buscar". Resultados: `Card "Especificaciones"` tabla (Dato · Valor · Unidad · Tolerancia · Contexto · Estado · Fuente) donde `valueText` vacío se muestra "—" y el estado `LibraryStatus` "Sin dato verificado"; `Card "Herramientas y consumibles"` tabla (Nombre · Código · Tipo · Uso · Especificación · Restricciones). Aviso fijo `role="note"`: "Un torque, una presión o un aceite solo valen para la variante exacta y con su fuente. Si dice Sin dato verificado, consulte el manual oficial antes de ajustar."

Pruebas: fila sintética cuando falta el tipo; `valueText` vacío fuerza `sin_dato_verificado`; búsqueda por operación "cadena" encuentra `TL-CN10` y el lubricante (siembra propia); página 200 con el aviso y la etiqueta.

### Verify
```bash
pnpm test tests/integration/library-specifications.test.ts tests/integration/biblioteca-herramientas-page.test.ts
pnpm format && pnpm gate   # coordinadora
```
