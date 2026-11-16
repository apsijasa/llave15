# Reporte final · Biblioteca técnica multiempresa

Fase Biblioteca, 15 de noviembre de 2026. Especificación del dueño: `blueprints/vector-biblioteca/fuentes/ESPECIFICACION-ORIGINAL.md`. Decisiones: `blueprints/vector-biblioteca/BIBLIOTECA.md` (BT-D1 a BT-D17). Tareas: `blueprints/vector-biblioteca/tasks.json` (BT-01 a BT-24, tags `bt-01` a `bt-24`). Nada publicado en producción: publica el dueño con `docs/ventanas/bt-v1.md`.

## 1. Componentes implementados

| Área | Qué quedó funcionando | Dónde |
|---|---|---|
| Esquema | 24 tablas nuevas en cuatro archivos al final de la cadena; marca `users.library_curator`; `bike_components.component_variant_id` | `src/server/db/schema-library-*.ts`, `schema.ts`, `schema-payments.ts` |
| Permisos | `library.view`, `library.ai`, `library.propose` (todos los roles), `library.curate` (dueño y administración); curador = permiso + marca | `src/server/auth/permissions.ts`, `src/server/library/access.ts` |
| Contenido | Paquete global versionado con importación idempotente, exportación sin filas privadas y siembra inicial sin valores técnicos inventados | `src/server/library/content-pack*.ts`, `src/data/library/pack.json`, `scripts/library-import.ts`, `scripts/library-export.ts` |
| Biblioteca | Inicio con buscador y ocho categorías; resultados con coincidencia exacta primero y filtros; ficha de variante con seis secciones; documentos por licencia | `/taller/biblioteca`, `/buscar`, `/componentes/[id]`, `/documentos/[id]` (+ `/archivo`) |
| Procedimientos | Pasos, herramientas, comprobaciones, advertencias, controles finales y torques con fuente | `/taller/biblioteca/procedimientos/[id]` |
| Compatibilidad | Veredicto por conjunto: oficial, condicionada, incompatible o no verificada; nunca por velocidades | `/taller/biblioteca/compatibilidad` |
| Herramientas | Búsqueda por operación y especificaciones por variante, con "Sin dato verificado" | `/taller/biblioteca/herramientas` |
| Gobernanza | Propuestas con detección de datos personales; revisión central con diferencia de versiones; publicación inmutable con evento y reindexación; archivo | `/taller/biblioteca/propuestas/**`, `/revision/**`, `proposals.ts`, `review.ts`, `publish.ts` |
| Asistente | Recuperación lexical `spanish` con alcance, citas, confianza, supuestos, siguiente verificación, guardia de cifras, cuotas y registro redactado; modo solo fuentes o Anthropic | `/taller/biblioteca/asistente`, `retrieval.ts`, `assistant.ts`, `ai-provider.ts` |
| Orden de trabajo | Pestaña Biblioteca: contexto técnico, componentes ligables a variantes, asistente con alcance de la orden, diagnóstico solo por acción explícita, confirmación | `/taller/ordenes/[id]/biblioteca`, `diagnoses.ts`, `technical-context.ts` |
| Operación | Chequeo de aislamiento e integridad | `scripts/library-check.ts`, `isolation-health.ts` |

## 2. Requisitos de la especificación (§14)

| Criterio | Estado | Evidencia |
|---|---|---|
| A no consulta orden, notas, historial ni conversaciones de B (UI, API, URL, IA) | Completo | `tests/integration/library-isolation.test.ts` (todas las funciones privadas desde B: `not_found`/`forbidden`, sin escrituras, sin textos de A en respuestas del asistente); páginas: `orden-biblioteca-page`, `biblioteca-propuestas-page` |
| El administrador global no lee datos privados sin autorización | Completo | `library-isolation.test.ts` ("el curador central"), `library-review.test.ts` (cola sin sucursal ni autor) |
| Usuario revocado pierde acceso | Completo | `library-isolation.test.ts` (desactivado y sesión revocada → `requireAdmin` nulo). Las respuestas son `no-store`; la biblioteca no usa caché propia |
| Contribución con nombres, teléfono, patente no se publica sin revisión | Completo | `library-pii.test.ts`, `library-review.test.ts` (`pii_unresolved` hasta confirmar) |
| Documentos maliciosos no ejecutan instrucciones | Completo | `library-ai-provider.test.ts` (política fija en `system`, fuentes escapadas) |
| Búsqueda encuentra código exacto y distingue variantes | Completo | `library-search.test.ts`, `e2e/biblioteca-busqueda.spec.ts` |
| Ficha muestra origen, fecha, versión y estado | Completo | `biblioteca-ficha-page.test.ts` |
| Procedimientos con herramientas, pasos y controles | Completo | `library-procedures.test.ts`, `biblioteca-procedimiento-page.test.ts` |
| Compatibilidad con evidencia o `NO_VERIFICADA` | Completo | `library-compatibility.test.ts` (incluye mismas velocidades → no verificada) |
| Propuesta no aparece antes de aprobación | Completo | `library-proposals.test.ts`, `library-retrieval.test.ts` |
| Publicación crea versión nueva y preserva la anterior | Completo | `library-publish.test.ts` (fila v1 idéntica tras publicar v2) |
| IA responde con citas válidas o declara incertidumbre | Completo | `library-assistant.test.ts`, `biblioteca-asistente-page.test.ts` |
| IA en orden solo usa contexto privado autorizado | Completo | `library-retrieval.test.ts`, `library-assistant.test.ts` |
| Guardar diagnóstico requiere acción humana y conserva fuentes versionadas | Completo | `library-diagnoses.test.ts`, `orden-biblioteca-page.test.ts`, `e2e/orden-biblioteca.spec.ts` |
| No rompe pagos, órdenes, autorizaciones ni descuentos | Completo | suite existente completa en verde; `library-diagnoses.test.ts` comprueba que la orden, líneas, pagos, aprobaciones, stock e historial no cambian |
| Lint, typecheck, unit/integration/E2E y build | Completo | `pnpm gate` en verde en cada tarea |
| Migraciones reproducibles y rollback documentado | Completo | `0035`–`0037` aplicadas en dev; `docs/ventanas/bt-v1.md` |
| Sin secretos en código, sin mocks en producción | Completo | clave solo por `getAiEnv()`; el modo `none` es un modo real (resumen extractivo con citas), no un simulador |
| Responsive, accesibilidad básica, estados vacío/error/carga | Completo | páginas de servidor con un `h1`, `label`, `fieldset`, avisos `role`, objetivos ≥ 48px, estados con forma y texto; probadas en tablet 820×1180 |
| Guías, ADR y runbook | Completo | `README.md` (§ Biblioteca técnica), `BIBLIOTECA.md`, `.claude/rules/library.md`, `docs/ventanas/bt-v1.md` |
| Preview validado; producción con autorización | Parcial | La validación en tablet corre contra el build local. Publicar en Replit lo hace el dueño |

## 3. Migraciones

| Migración | Contenido |
|---|---|
| `0035_huge_wild_child.sql` | Catálogo global (8 tablas) y `users.library_curator` |
| `0036_careless_junta.sql` | Conocimiento, procedimientos, compatibilidad y capa privada (16 tablas), índice GIN `to_tsvector('spanish', text)` |
| `0037_fantastic_donald_blake.sql` | `bike_components.component_variant_id` |

Todas aditivas y aplicadas en la base dev (`pnpm db:migrate`, `pnpm db:check` ok). Reversión: `docs/ventanas/bt-v1.md` § Reversión.

## 4. Comandos y resultados

| Comando | Resultado en la última corrida |
|---|---|
| `pnpm gate` (check + test + build + test:build + test:tablet + smoke) | Verde |
| `pnpm test` | 167 archivos, 2.099 pruebas, 0 fallas |
| `pnpm test:build` | 37 pruebas, 0 fallas |
| `pnpm test:tablet` | 34 pruebas en tablet, 0 fallas (5 nuevas de la biblioteca) |
| `pnpm smoke` | `{"ok":true,"db":true}` |
| `pnpm library:import` (dos veces) | Segunda corrida: 0 altas, índice reconstruido |
| `pnpm library:check` | `{"ok":true,…}` todos los conteos en 0; sin conexión sale 2 |

Al empezar la fase la suite tenía 1.730 pruebas; la biblioteca agrega 369 de unidad e integración y 5 de tablet.

## 5. Aislamiento entre organizaciones y alcance de la IA

- Organización = sucursal de la instalación (BT-D1, coherente con la decisión 56: una instalación por taller). Las tablas privadas tienen `branch_id NOT NULL` y cada consulta filtra por `actor.branchId`.
- La recuperación filtra el alcance **antes** de armar el prompt: solo versiones vigentes publicadas; contexto de orden solo si `canAccessOrder` lo permite; una orden ajena o inexistente responde lo mismo (`forbidden`).
- `library-isolation.test.ts` recorre 14 funciones privadas desde otra sucursal y comprueba que ninguna responde ni escribe (instantánea de seis tablas antes y después).
- `libraryIsolationHealth` permite comprobarlo sobre la base real (`pnpm library:check`).

## 6. Pantallas

Todas son HTML de servidor sin islas nuevas, con los tokens de `global.css`:

- `/taller/biblioteca` · `/buscar` · `/componentes/[id]` · `/documentos/[id]` · `/procedimientos/[id]` · `/compatibilidad` · `/herramientas` · `/asistente` · `/propuestas` (`/nueva`, `/[id]`) · `/revision` (`/[id]`) · pestaña `/taller/ordenes/[id]/biblioteca`.

**Verificación visual:** recorrida en tablet por Playwright (búsqueda, ficha, categoría, menú, consulta en la orden y diagnóstico) y renderizada con Container API en cada página. No tomé capturas manuales: levantar el servidor local contra la base E2E requería cargar `.env` en un comando, y el entorno no lo permitió. Recomiendo que el dueño las revise en el preview antes de publicar (tablet 820×1180 y escritorio, claro y oscuro).

**Imágenes IMG-01 a IMG-10:** no se usaron fotos de terceros (BT-D12). Las categorías llevan iconos lineales propios en SVG. Los textos alternativos quedan en `blueprint.md` §7 para cuando haya fotos propias o licenciadas.

## 7. Variables y servicios externos

| Variable | Necesaria | Nota |
|---|---|---|
| `AI_PROVIDER` | No (`none`) | `anthropic` activa el modelo de lenguaje |
| `ANTHROPIC_API_KEY` | Solo con `anthropic` | Solo en *Secrets* de Replit |
| `AI_MODEL` | No (`claude-opus-5-5`) | Modelo de la Messages API |

Sin `AI_PROVIDER=anthropic` no hay costos externos ni datos que salgan del servidor.

## 8. Riesgos abiertos, decisiones pendientes y pasos a producción

**Pendiente de decisión o permiso del dueño:**

1. **SDK oficial de Anthropic.** La guía de la API recomienda `@anthropic-ai/sdk`; el entorno no permitió agregar dependencias. El proveedor usa `fetch` y está aislado en `ai-provider.ts` (BT-D17). Cambiarlo es un archivo.
2. **Contenido técnico real.** El paquete trae identificadores y enlaces oficiales, pero ningún torque, aceite ni compatibilidad: deben cargarse como propuestas con su fuente y publicarse por el curador.
3. **Licencias de manuales.** Por defecto solo enlace; para extractos o copias se necesita permiso del editor.
4. **Fotos propias** para las categorías (IMG-01 a IMG-10).

**Fuera de alcance de esta fase** (BIBLIOTECA.md §3): embeddings/pgvector, OCR y cola de trabajos, servicio de conocimiento separado, rol de soporte con acceso temporal.

**Riesgos:** la búsqueda es lexical (sin sinónimos semánticos); las cuotas de IA son fijas en código (200 al día por sucursal, 5 por minuto por usuario).

**Pasos exactos hacia producción:** `docs/ventanas/bt-v1.md` (respaldo, `git reset --hard origin/main`, `install`, `db:migrate`, `db:check`, `library:import`, `library:check`, Republish, marcar al curador). Antes, el dueño sube `main` a GitHub; Claude no hace push ni publica.
