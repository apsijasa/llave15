# Epic 06: Integración con las órdenes de trabajo

> Después de esta épica cada orden tiene la pestaña "Biblioteca": contexto técnico de la bici y sus componentes (ligables a una variante del catálogo), el asistente con alcance de la orden solo para quien puede ver esa orden, un checklist de pruebas y un diagnóstico técnico que se guarda únicamente por acción explícita, con referencias versionadas. Nada toca precios, pagos, aprobaciones, inventario ni estado de la orden.

| | |
|---|---|
| **Epic id** | `06-ordenes` |
| **Tasks** | `E6-T1` … `E6-T3` (pasos BT-19 … BT-21) |
| **Depends on** | `05-ia` |
| **Unlocks** | `07-cierre` |

Stack, compuerta, reglas transversales e interfaz: como la épica 02. La orden es de tablet (820×1180). **No negociables que tocan esta épica:** 9 (nada se borra: `voided_at`), 12 (el mecánico nunca cambia un precio), 16 (pagos no se editan); y BT-D10: `src/server/library/**` no escribe en `work_orders`, `work_order_items`, `payments`, `work_order_approvals`, `stock_movements` ni cambia estados.

---

## E6-T1 — BT-19 Diagnósticos técnicos y contexto de la orden

**Archivos (6, declarados):** `src/server/db/schema-payments.ts`, `src/server/library/diagnoses.ts`, `src/server/library/technical-context.ts`, `src/server/taller/audit.ts` (solo el tipo), `tests/integration/library-diagnoses.test.ts`, `tests/integration/library-technical-context.test.ts`, más `drizzle/0037_*.sql`.

**Cambio de cadena declarado:** `schema-payments.ts` importa `componentVariants` de `schema-library-catalog.ts` (que solo importa `schema.ts`): no hay ciclo. Columna `componentVariantId: uuid("component_variant_id").references(() => componentVariants.id, { onDelete: "restrict" })` (nullable) en `bike_components`, más índice `idx_bike_components_variant`. `pnpm db:generate` → una migración `0037` aditiva.

### `diagnoses.ts`
```ts
export const diagnosisFormSchema = z.strictObject({
  symptoms: z.string().trim().min(3).max(2000),
  inspections: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(2).max(120), done: z.boolean(), result: z.string().trim().max(500).default("") })).max(20).default([]),
  hypotheses: z.array(z.object({ text: z.string().trim().min(3).max(500), evidence: z.string().trim().max(500).default(""), confidence: z.enum(CONFIDENCE_LEVELS) })).max(10).default([]),
  result: z.string().trim().max(2000).nullish().transform((v) => v || null),
  references: z.array(z.object({ kind: z.enum(["article_version","specification","procedure","document","variant"]), id: z.uuid(), versionNumber: z.number().int().positive().optional() })).max(30).default([]),
  aiInteractionId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});
export const DIAGNOSIS_INSPECTIONS: readonly { key: string; label: string }[];   // checklist sugerido (ver abajo); vive en library/rules.ts? No: aquí, porque es dato de UI del módulo
export async function saveDiagnosis(db, actor, orderId, input: unknown, now): Promise<{ ok: true; id: string } | { ok: false; code: "forbidden" | "not_found" | "validation_error" | "invalid_reference" | "order_closed" }>;
export async function confirmDiagnosis(db, actor, diagnosisId, now): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "already_confirmed" }>;
export async function voidDiagnosis(db, actor, diagnosisId, now): Promise<{ ok: true } | { ok: false; code: … }>;
export async function listDiagnoses(db, actor, orderId): Promise<{ ok: true; items: (TechnicalDiagnosis & { authorName: string; confirmedByName: string | null })[] } | { ok: false; code: "forbidden" | "not_found" }>;
```
`DIAGNOSIS_INSPECTIONS`: `desgaste_cadena` "Medir desgaste de cadena", `cassette_platos` "Revisar dientes de cassette y platos", `patilla` "Revisar alineación de la patilla", `ajuste_cambio` "Revisar ajuste de tensión e indexación", `reproduccion` "Reproducir el síntoma de forma segura", `frenos_pastillas` "Revisar pastillas y discos", `juego_direccion` "Revisar juego de dirección", `suspension_fugas` "Revisar fugas y recorrido de suspensión".
Reglas: permiso `library.ai`; la orden se carga con `branch_id = actor.branchId`, `voided_at is null` y `canAccessOrder` (si no existe → `not_found`; si no es accesible → `forbidden`); orden en `TERMINAL_STATUSES` → `order_closed`; cada `reference` debe existir en su tabla (`article_versions`, `technical_specifications`, `procedures`, `technical_documents`, `component_variants`) → si no, `invalid_reference`; para `article_version` se completa `versionNumber` desde la base; `aiInteractionId`, si viene, debe ser una `ai_interactions` de la misma sucursal → si no, `invalid_reference`. Inserta `technical_diagnoses` `borrador` con `bike_id` de la orden, `created_by`. `confirmDiagnosis` exige `library.ai` y acceso a la orden; fija `confirmado`, `confirmed_by`, `confirmed_at`. `voidDiagnosis`: `voided_at`/`voided_by` (permiso `items.void` o el autor del borrador). Auditoría `diagnosis.saved`, `diagnosis.confirmed`, `diagnosis.voided` (agregar al tipo). **No** toca `work_orders.diagnosis` (el campo de texto de la orden sigue siendo del taller).

### `technical-context.ts`
```ts
export type OrderTechnicalContext = { order: { id: string; number: number; status: string; requestedService: string }; bike: { id: string; brand: string; model: string; bikeType: string; year: number | null; size: string | null }; components: { id: string; componentType: string; brand: string; model: string; serialNumber: string | null; installedAt: string; variant: { id: string; code: string; revision: string; modelName: string } | null }[]; diagnoses: { id: string; symptoms: string; status: string; createdAt: Date }[] };
export async function orderTechnicalContext(db, actor, orderId): Promise<{ ok: true; context: OrderTechnicalContext } | { ok: false; code: "forbidden" | "not_found" }>;
export async function linkComponentVariant(db, actor, componentId, variantId: string | null, now): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "invalid_variant" }>;
```
`components`: los `bike_components` vigentes y no reemplazados de la bici. `linkComponentVariant`: permiso `components.manage`, componente de la sucursal y de una orden accesible, actualiza solo `component_variant_id`, auditoría `component.variant_linked`. **Nunca** devuelve datos del cliente. `retrieval.ts` (BT-16) se actualiza en este paso para incluir `variantId` de los componentes? **No:** `retrieval.ts` no está en la lista; deja `variantId: null` hasta BT-22, que lo amplía si hace falta (no es criterio de aceptación).

### Pruebas
- `library-diagnoses.test.ts`: guardar con referencias válidas (completa `versionNumber`); referencia inexistente → `invalid_reference`; interacción de otra sucursal → `invalid_reference`; orden de otra sucursal → `not_found`; mecánico sin acceso → `forbidden`; orden `entregada` → `order_closed`; confirmar fija campos y el CHECK se respeta; confirmar dos veces → `already_confirmed`; **ninguna** columna de `work_orders` cambió (comparar fila antes/después) y no hay filas nuevas en `work_order_items`, `payments`, `work_order_approvals`, `stock_movements`, `work_order_status_history`.
- `library-technical-context.test.ts`: contexto con componente ligado a variante; sin claves de cliente; otra sucursal → `not_found`; `linkComponentVariant` liga y desliga; variante inexistente → `invalid_variant`.

### Verify
```bash
pnpm test tests/integration/library-diagnoses.test.ts tests/integration/library-technical-context.test.ts tests/integration/components.test.ts
test "$(ls drizzle/0037_*.sql | wc -l | tr -d ' ')" = 1
pnpm db:migrate && pnpm db:check   # coordinadora
pnpm format && pnpm gate   # coordinadora
```

---

## E6-T2 — BT-20 Pestaña Biblioteca en la orden

**Archivos:** `src/pages/taller/ordenes/[id]/biblioteca.astro`, `src/lib/taller-tabs.ts`, `src/components/taller/library/DiagnosisChecklist.astro`, `tests/integration/orden-biblioteca-page.test.ts`.

- `taller-tabs.ts`: agregar `{ suffix: "biblioteca", label: "Biblioteca", permission: "library.ai" }` después de "Componentes".
- `DiagnosisChecklist.astro`: props `{ items: readonly { key: string; label: string }[]; checked?: readonly string[] }` → `fieldset` `legend="Pruebas realizadas"` con `.options` de checkboxes `name="inspection"` `value={key}` dentro de `label` (objetivos ≥ 48px, ya cubiertos por `.taller .options label`).
- Página `/taller/ordenes/[id]/biblioteca` (patrón de `src/pages/taller/ordenes/[id]/componentes.astro`): `requireAdmin` → 303; POST `isAllowedOrigin`; `can("library.ai")` → 403; `orderTechnicalContext` (`forbidden` → 403, `not_found` → 404). `PageHeader title={formatOrderNumber(n)}` con estado y `OrderTabs active="biblioteca"`. Secciones:
  1. `Card "Contexto técnico"`: bici (marca, modelo, tipo, año, talla) y tabla de componentes (Tipo · Marca · Modelo · Variante del catálogo con enlace a la ficha o "Sin identificar"). Si el usuario tiene `components.manage`, cada fila sin variante ofrece un formulario corto `action=link` con `select` de variantes (máx. 200) y botón "Identificar". 
  2. `Card "Preguntar al asistente"`: `textarea` "Síntoma o pregunta" prellenado con `order.requestedService`; botón "Consultar" (`action=ask`). Tras el POST: respuesta, `ConfidenceCard`, fuentes enlazadas, y **formulario "Agregar al diagnóstico"** (`action=save`) con: `textarea` Síntomas (prellenado con la pregunta), `DiagnosisChecklist`, `textarea` Resultado (opcional), checkboxes de referencias (cada cita, marcada por defecto, `name="ref"` `value="<kind>:<id>"`), `input hidden` `aiInteractionId`, botón "Agregar al diagnóstico". La respuesta del asistente **no** se guarda como diagnóstico hasta este POST.
  3. `Card "Diagnóstico sin asistente"`: el mismo formulario `action=save` vacío (para registrar sin IA).
  4. `Card "Diagnósticos de esta orden"`: lista con estado (`status--borrador`/`status--confirmado` con forma), síntomas, pruebas hechas, resultado, referencias (enlaces), autor, fecha, y botón "Confirmar diagnóstico" (`action=confirm`, `name=diagnosisId`) en los borradores.
  Éxitos → 303 `?hecho=diagnostico|confirmado|identificado`. Aviso fijo `role="note"`: "El asistente no cambia precios, inventario, aprobaciones ni el estado de la orden. Los trabajos adicionales siguen necesitando la aprobación del cliente."
- El proveedor como en BT-18 (`providerFromEnv` con fallback a `noneProvider`).
- Pruebas (Container API, `AI_PROVIDER` forzado a `none`): 303; mecánico sin acceso → 403; orden de otra sucursal → 404; owner GET 200 con la pestaña activa y la tarjeta de contexto; POST `ask` muestra la respuesta y el formulario "Agregar al diagnóstico" y **no** crea `technical_diagnoses`; POST `save` crea el diagnóstico con las referencias marcadas y redirige; POST `confirm` lo confirma; `work_orders` sin cambios; `taller-tabs.ts` contiene `biblioteca`.

### Verify
```bash
pnpm test tests/integration/orden-biblioteca-page.test.ts
grep -q 'biblioteca' src/lib/taller-tabs.ts
pnpm format && pnpm gate   # coordinadora
```

---

## E6-T3 — BT-21 Spec de tablet: asistente en la orden y diagnóstico

**Archivos:** `e2e/orden-biblioteca.spec.ts` (nuevo). Solo importa `@playwright/test` y `./fixtures.ts`. Usa `SEED.orderRecibidaId` (asignada al mecánico) y la siembra de biblioteca de BT-09. El servidor E2E corre sin `AI_PROVIDER` → modo solo fuentes.

1. "El mecánico consulta la biblioteca desde su orden y guarda un diagnóstico": `login(page, "mechanic", `/taller/ordenes/${SEED.orderRecibidaId}/biblioteca`)`; ve `heading` nivel 2 "Contexto técnico"; `getByLabel("Síntoma o pregunta").fill("¿Cómo identifico el RD-M8100-SGS?")`; `getByRole("button", { name: "Consultar" }).tap()`; ve el texto "Confianza" y una lista de fuentes con al menos un enlace; en el formulario "Agregar al diagnóstico" marca la prueba "Reproducir el síntoma de forma segura" (`getByLabel(...).tap()`); `getByRole("button", { name: "Agregar al diagnóstico" }).tap()`; `expect(page).toHaveURL(/hecho=diagnostico/)`; `getByRole("status")` tiene "Diagnóstico guardado."; la lista "Diagnósticos de esta orden" contiene "Borrador".
2. "El mecánico no abre la biblioteca de una orden ajena": crear nada; ir a `/taller/ordenes/${SEED.orderListaId}/biblioteca` (asignada al mecánico pero `lista_para_retirar` — accesible). Para el caso ajeno usar la respuesta HTTP: `page.request.get(`/taller/ordenes/00000000-0000-4000-8000-0000000000ff/biblioteca`)` → 404.

### Verify
```bash
pnpm build && pnpm test:tablet e2e/orden-biblioteca.spec.ts   # coordinadora
pnpm format && pnpm gate   # coordinadora
```
