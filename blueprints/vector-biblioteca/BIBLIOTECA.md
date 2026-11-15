# FASE BIBLIOTECA — Biblioteca técnica compartida con capa privada por taller

> Definición de la fase, escrita por la sesión coordinadora el 15 de noviembre de 2026 a partir de `fuentes/ESPECIFICACION-ORIGINAL.md` (especificación del dueño, versión 1.0) y de la inspección del repositorio en `main` (`ee466b3`). La especificación original **no se modifica**; este documento la adapta al stack, a las reglas y a las decisiones ya tomadas (1–56, F2-D1–F2-D30). Las decisiones propias de esta fase se numeran `BT-D#`.
>
> Modo de trabajo pedido por el dueño: **automático**, con Codex implementando y Claude revisando (reparto de `docs/encargos/README.md`), sin detenerse entre tareas salvo bloqueo real.

## 1. Objetivo

Que cualquier usuario autenticado del taller consulte, desde `/taller/biblioteca`, componentes, especificaciones, procedimientos, compatibilidad, herramientas y documentación verificada; que proponga conocimiento que **solo un curador central publica**; que un asistente con citas responda en la biblioteca y dentro de una orden de trabajo con el contexto privado **solo del usuario autorizado**; y que el conocimiento global viaje a cualquier otra instalación del programa (decisión 56) sin mezclar datos privados.

**La fase está lista cuando** se cumplen los criterios de §6 y `pnpm gate` está en verde.

## 2. Decisiones cerradas de esta fase

| Id | Decisión | Por qué |
|---|---|---|
| BT-D1 | **La organización es la instalación (`branches`).** Las tablas privadas de la biblioteca llevan `branch_id NOT NULL` y se filtran por `actor.branchId`, como todo el taller. Las tablas del conocimiento **global** (catálogo, artículos, versiones, procedimientos, compatibilidad, documentos, fuentes, trozos indexados, revisiones y eventos de publicación) **no llevan `branch_id`**: es la única excepción declarada a la regla "toda tabla de operación lleva `branch_id`" de `.claude/rules/database.md`. No se introduce multi-tenant en una base: la decisión 56 sigue vigente. Entre instalaciones el conocimiento global viaja como **paquete de contenido versionado** (BT-D8). | La especificación pide biblioteca compartida y datos privados aislados; el repo ya decidió una instalación por taller. Las dos cosas se cumplen con tablas globales sin `branch_id` y un paquete exportable. |
| BT-D2 | **El administrador central es un usuario con la marca `users.library_curator`** (columna booleana aditiva, `false` por defecto) y rol `owner` o `admin`. Nuevas acciones en `permissions.ts`: `library.view`, `library.ai`, `library.propose` (los cuatro roles) y `library.curate` (`owner`, `admin`). Curar exige **ambas** cosas: `can(role, "library.curate")` y la marca (`canCurate(user)` en `src/server/library/access.ts`). `SessionUser` gana `libraryCurator?: boolean` (opcional, para no romper las pruebas que construyen el objeto). | Un rol nuevo obligaría a reemplazar el CHECK `users_role_check` (cambio no aditivo). La marca es aditiva y auditada. |
| BT-D3 | **Cuatro archivos de esquema nuevos al final de la cadena**, en este orden de importación: `schema-library-catalog.ts` ← `schema-library-knowledge.ts` ← `schema-library-procedures.ts` ← `schema-library-private.ts`. `schema-payments.ts` gana `bike_components.component_variant_id` (nullable, FK a `component_variants`) en la épica 06. Cada archivo < 400 líneas; arreglos `libraryCatalogTables`, `libraryKnowledgeTables`, `libraryProcedureTables`, `libraryPrivateTables` recorridos por `scripts/db-check.ts`. | Regla de `database.md`: una tabla que no cabe va a un archivo nuevo al final de la cadena. |
| BT-D4 | **Búsqueda lexical en Postgres sin extensiones**: detección de códigos exactos (`RD-M8100-SGS`), `ILIKE` sobre códigos y nombres, y `to_tsvector('spanish', …) @@ plainto_tsquery('spanish', …)` con `ts_rank` sobre `document_chunks.text`, con índice GIN de expresión. **Sin pgvector**: `CREATE EXTENSION` exige SQL a mano, prohibido por la política de migraciones. La recuperación queda detrás de `retrieve()` en `src/server/library/retrieval.ts` para agregar embeddings en una fase posterior sin tocar a quien la llama. | PGlite y Postgres 16 traen `spanish` (comprobado el 15-11-2026). Lo semántico es una mejora, no una condición del aislamiento ni de las citas. |
| BT-D5 | **Proveedor de IA inyectado y con modo sin modelo.** `AI_PROVIDER` ∈ {`none`, `anthropic`} (por defecto `none`), `ANTHROPIC_API_KEY` y `AI_MODEL` (por defecto `claude-sonnet-5-5`) leídos solo por `getAiEnv()` en `src/lib/env.ts`. Con `none` el asistente opera en **modo "solo fuentes"**: recupera, cita y resume de forma extractiva, con confianza `NO_VERIFICADA` o `MEDIA` según evidencia; es una función real, no un mock. Con `anthropic` llama a la Messages API con salida estructurada. La lógica de `src/server/library/**` recibe el proveedor como argumento (como `db` y `now`); las pruebas usan un proveedor falso en memoria. | No hay clave en el entorno; el taller debe poder usar la biblioteca sin IA externa; nada simulado en producción. |
| BT-D6 | **Documentos: metadatos y enlace por defecto.** `technical_documents.license` ∈ {`enlace`, `extracto_permitido`, `copia_autorizada`}; solo con `copia_autorizada` hay `storage_key` en el almacenamiento existente y visor dentro del taller. Los trozos indexados nacen de versiones de artículos, especificaciones, procedimientos y extractos ingresados por el curador bajo `extracto_permitido`. Ningún paso descarga ni republica material ajeno. El texto de los documentos es dato: nunca instrucción para el asistente. | §9 y §10.7 de la especificación. |
| BT-D7 | **Pruebas existentes que esta fase autoriza a modificar:** `tests/unit/permissions.test.ts` (36 → 40 acciones), `e2e/fixtures.ts` (ids `SEED.library*`) y `e2e/global-setup.ts` (`seedLibrary`, siembra mínima del catálogo global), excepción declarada a `.claude/rules/e2e.md`. Ninguna otra prueba existente cambia; si una falla, Codex se detiene y reporta. | Sin siembra global los specs de tablet no tienen qué buscar; la fase 2 ya usó la misma vía para las acciones. |
| BT-D8 | **Paquete de contenido** `src/data/library/pack.json` (zod en `src/server/library/content-pack.ts`), importado con `pnpm library:import [--dry-run]` de forma idempotente por claves estables (`slug`, `code`, `revision`) y exportado con `pnpm library:export` (solo contenido global publicado, nunca filas privadas). La siembra inicial trae identificadores públicos (fabricante, familia, modelo, variante), enlaces a documentación oficial y categorías; **ningún torque, aceite, presión ni compatibilidad sin fuente**: donde no hay fuente va `sin_dato_verificado` / `no_verificada`. | §9 y §11 de la especificación; permite que una instalación nueva reciba la biblioteca sin copiar la base. |
| BT-D9 | **Versiones inmutables.** `article_versions` publicadas no se actualizan: publicar crea la versión siguiente, conserva la anterior y registra `publication_events`. `APPROVED` y `PUBLISHED` son estados distintos de la propuesta; la publicación y la reindexación corren dentro de una transacción; si la indexación falla, la propuesta queda `APPROVED` y se reintenta. | §5 y §7.2 de la especificación. |
| BT-D10 | **La IA nunca escribe en la orden.** El diagnóstico se guarda solo por un POST explícito del usuario (`technical_diagnoses`, con `references` versionadas). Nada en `src/server/library/**` toca `work_orders`, líneas, pagos, aprobaciones ni estados. | §6.8 y §11 de la especificación; No negociables 12, 16. |
| BT-D11 | **Ninguna isla nueva.** Asistente, compatibilidad, propuestas y revisión son formularios POST que vuelven a renderizar en el servidor (`?hecho=…`), como la venta de mostrador. | `.claude/rules/taller-ui.md`. |
| BT-D12 | **Imágenes IMG-01 a IMG-10: sin material de terceros.** Las categorías llevan iconos lineales inline (SVG monocromo, `aria-hidden`) y los textos alternativos de la especificación quedan documentados en `blueprint.md` §7 para cuando el dueño entregue fotos propias o licenciadas. Ningún archivo binario nuevo. | §8 de la especificación. |
| BT-D13 | **Grupo de menú "Conocimiento"** en `TallerLayout.astro`: Biblioteca (`library.view`), Asistente (`library.ai`), Propuestas (`library.propose`), Revisión (`library.curate`, solo si `canCurate`). Pestaña "Biblioteca" en la orden (`ORDER_TABS`, `library.ai`). | §8 wireframe. |
| BT-D14 | **Cuotas de IA** en `src/server/library/rules.ts`: `AI_DAILY_QUOTA_PER_BRANCH = 200`, `AI_PER_USER_PER_MINUTE = 5`, contadas sobre `ai_interactions`; al superarlas el asistente responde `{ ok: false, code: "quota" }` sin llamar al proveedor. Tokens entrantes y salientes se guardan por interacción. | §10.9 de la especificación. |
| BT-D15 | **Nombres en inglés para tablas y columnas; textos en español de Chile**, como el resto del repo. Los nombres que la especificación da en inglés se conservan (`manufacturers`, `component_variants`, `knowledge_proposals`…). Los estados que la especificación da en mayúsculas (`OFICIAL_CONFIRMADA`, `DRAFT`) se guardan en minúsculas en los CHECK (`oficial_confirmada`, `draft`) y se etiquetan en español en `rules.ts`. | Regla 8 de `CLAUDE.md`; consistencia con `ORDER_STATUSES`. |

## 3. Lo que queda afuera y por qué

| Tema | Destino | Razón |
|---|---|---|
| Embeddings / pgvector | Fase posterior | Requiere `CREATE EXTENSION` (SQL a mano). La interfaz `retrieve()` lo admite después (BT-D4). |
| OCR y extracción automática de PDF, cola de trabajos | Fase posterior | Sin cola en el stack; la licencia de los manuales es por enlace (BT-D6). El curador ingresa extractos permitidos a mano. |
| Servicio de conocimiento separado (API pública, varios talleres en una base) | Fase posterior | Decisión 56. El módulo queda aislado en `src/server/library/**` y el contenido viaja como paquete (BT-D8). |
| Fotos IMG-01…10 | Dueño | Deben ser propias o licenciadas (BT-D12). |
| Rol de soporte con acceso temporal a datos privados | Fuera | Requiere política separada (§2 de la especificación). No se construye. |
| Publicación a producción | Dueño | Nunca automática. |

## 4. Reparto y método

Igual que la fase 2: un encargo por tarea (`docs/encargos/BT-NN-*.md`), Codex implementa con pruebas primero en su sandbox sin red (`format`, `check`, `test`, `build`), Claude revisa el diff, corre `pnpm db:migrate`, `pnpm db:check`, `pnpm format && pnpm gate` y commitea con tag `bt-NN`. El dueño sube y publica. Si Codex falla dos veces en una tarea, la tarea vuelve a Claude.

## 5. Variables de entorno nuevas

| Variable | Requerida | Uso |
|---|---|---|
| `AI_PROVIDER` | no (`none`) | `none` o `anthropic` |
| `ANTHROPIC_API_KEY` | solo con `anthropic` | clave del proveedor, solo en Secrets |
| `AI_MODEL` | no (`claude-sonnet-5-5`) | modelo del proveedor |

## 6. Criterios de aceptación de la fase

Seguridad
1. Un usuario de la sucursal A no obtiene diagnósticos, notas, interacciones de IA ni contexto de orden de la sucursal B por función de servidor, página ni recuperación del asistente (prueba negativa automatizada).
2. El curador no recibe filas privadas de ningún taller desde `src/server/library/**` salvo las de su propia sucursal con sus permisos normales.
3. Una propuesta con teléfono, RUT, correo o patente no se envía a revisión sin que el sistema la marque; el curador la ve marcada.
4. Un trozo de documento que contiene instrucciones ("ignora las reglas…") llega al proveedor como dato citado y nunca cambia la política del prompt (prueba sobre el prompt construido).

Funcionalidad
5. La búsqueda encuentra `RD-M8100-SGS` como coincidencia exacta y distingue sus variantes/revisiones.
6. La ficha de una variante muestra fuente, fecha de revisión, versión y estado de cada especificación.
7. Un procedimiento muestra herramientas, pasos numerados, controles finales y torques con fuente.
8. La compatibilidad de un conjunto devuelve `oficial_confirmada`, `condicionada`, `incompatible` o `no_verificada` con evidencia, y **nunca infiere por número de velocidades**.
9. Una propuesta `submitted` no aparece en búsqueda, fichas ni recuperación del asistente.
10. Publicar crea una versión nueva, conserva la anterior íntegra y deja un `publication_events`.
11. El asistente responde con citas válidas (ids de versión/trozo existentes) y, sin evidencia, declara `no_verificada` y pide datos.
12. Dentro de una orden, el asistente solo incluye contexto privado de esa orden si `canAccessOrder` lo permite.
13. Guardar un diagnóstico exige un POST explícito y conserva las referencias versionadas; la IA no cambia inventario, pagos, aprobaciones ni estado.
14. `pnpm library:import` es idempotente; `pnpm library:export` no incluye filas privadas.

Calidad
15. `pnpm gate` en verde; migraciones aplicadas en dev con `pnpm db:check` ok; sin secretos; archivos < 400 líneas; ninguna isla nueva; ningún hex nuevo; `SITE.name` en lugar del nombre literal.
16. README, `.env.example`, `CLAUDE.md`, `AGENTS.md`, `.claude/rules/database.md` y una regla nueva `.claude/rules/library.md` actualizados; reporte final en `docs/REPORTE-BIBLIOTECA.md`.

## 7. Cómo se construye

`blueprint.md` (arquitectura y mapa de pasos), `tasks.json` (tareas `BT-01` … `BT-24`, tags `bt-NN`) y `epics/01…07` (bloque por tarea). Cada paso toca como máximo 5 archivos (salvo donde el bloque lo declara), tiene Verify observable y, cuando toca una pantalla de tablet, un spec de Playwright.
