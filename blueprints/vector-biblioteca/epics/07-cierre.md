# Epic 07: Aislamiento, documentación y reporte

> Después de esta épica hay una suite que prueba que nada privado cruza entre sucursales ni llega al curador, un chequeo `pnpm library:check` para la base, la documentación al día (README, reglas, `CLAUDE.md`, `AGENTS.md`, ventana de publicación) y el reporte final con el formato de §16 de la especificación.

| | |
|---|---|
| **Epic id** | `07-cierre` |
| **Tasks** | `E7-T1` … `E7-T3` (pasos BT-22 … BT-24) |
| **Depends on** | `06-ordenes` |

---

## E7-T1 — BT-22 Suite de aislamiento y salud de la biblioteca

**Archivos:** `src/server/library/isolation-health.ts`, `scripts/library-check.ts`, `package.json`, `tests/integration/library-isolation.test.ts`, `tests/integration/library-health.test.ts`.

### `library-isolation.test.ts` (dos sucursales A y B, cada una con owner, mecánico y orden; un curador en A)
Para cada función privada de `src/server/library/**` (`proposalDetail`, `updateProposal`, `submitProposal`, `withdrawProposal`, `listMyProposals`, `saveDiagnosis`, `confirmDiagnosis`, `voidDiagnosis`, `listDiagnoses`, `orderTechnicalContext`, `linkComponentVariant`, `retrieve` con `orderId`, `askAssistant` con `scope: "orden"`, `recentInteractions`), el actor de B sobre recursos de A recibe `not_found` o `forbidden` y **no** se escribe ninguna fila (conteos antes/después). `reviewQueue` y `reviewDetail` del curador no exponen `branchId`, `authorId` ni nombres. Ninguna respuesta del asistente de B contiene texto de un diagnóstico o nota de A (sembrar una nota con una cadena única y buscarla en `JSON.stringify` del resultado). Usuario desactivado (`is_active = false`) o sesión revocada → `requireAdmin` devuelve `null`.

### `isolation-health.ts`
```ts
export type LibraryHealth = { ok: boolean; diagnosesCrossBranch: number; interactionsCrossBranch: number; notesCrossBranch: number; publishedWithoutVersion: number; verifiedWithoutSource: number; orphanChunks: number };
export async function libraryIsolationHealth(db: AppDb): Promise<LibraryHealth>;
```
Conteos con SQL parametrizado: diagnósticos cuya orden tiene otra `branch_id`; interacciones cuyo usuario o cuya orden es de otra sucursal; notas cuya orden o bici es de otra sucursal; artículos `publicado` sin `current_version_id`; especificaciones `verificado` sin documento; trozos `article_version` cuya versión no es la vigente de un artículo publicado. `ok` = todos en 0.

`scripts/library-check.ts`: como `scripts/f2-check.ts` (sale 0 sano, 1 con anomalías imprimiendo el JSON, 2 sin conexión con `No se pudo conectar`). `package.json`: `"library:check": "node --env-file-if-exists=.env scripts/library-check.ts"`.

### Verify
```bash
pnpm test tests/integration/library-isolation.test.ts tests/integration/library-health.test.ts
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/library-check.ts 2>&1)"; test $? -eq 2
pnpm library:check   # coordinadora, base dev
pnpm format && pnpm gate   # coordinadora
```

---

## E7-T2 — BT-23 Documentación, reglas y ventana de publicación

**Archivos (6, declarados):** `README.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/rules/database.md`, `.claude/rules/library.md` (nuevo), `docs/ventanas/bt-v1.md` (nuevo). Lo escribe la coordinadora (no Codex: son documentos de gobierno del repo).

- `README.md` → `## Biblioteca técnica`: qué es; cómo se usa (buscar, ficha, procedimientos, compatibilidad, herramientas, asistente, pestaña de la orden); curador (cómo marcar `library_curator` con SQL en la base dev o pedir a la coordinadora); paquete (`pnpm library:import`, `library:export`); asistente (`AI_PROVIDER`, cuotas, modo solo fuentes); chequeo `pnpm library:check`; qué no hace.
- `CLAUDE.md` y `AGENTS.md`: comandos `library:*`; cadena de esquema con los cuatro archivos; fila "Biblioteca" en "Dónde vive cada cosa"; variables `AI_*`; la regla diferida `library.md`; excepción BT-D1.
- `.claude/rules/database.md`: doce archivos de esquema; excepción BT-D1 (tablas globales sin `branch_id`); `document_chunks` es índice derivado y se regenera.
- `.claude/rules/library.md` (paths `src/server/library/**`, `src/pages/taller/biblioteca/**`, `src/components/taller/library/**`, `src/data/library/**`, `scripts/library-*.ts`): alcance por `actor.branchId` en tablas privadas; contenido global solo publicado; versiones inmutables; IA sin escritura (BT-D10); proveedor inyectado y nada de red en transacciones; PII redactada; fuentes como datos; nada de valores técnicos sin fuente; ninguna isla; `canCurate` en servidor.
- `docs/ventanas/bt-v1.md`: publicación de `0035`–`0037` (taller cerrado, respaldo, `db:migrate`, `db:check`, `library:import`, `library:check`, Republish) y reversión (detener, `drop table` en orden inverso de dependencias y `alter table … drop column` de `users.library_curator` y `bike_components.component_variant_id`, como contracción en una publicación aparte; SQL de referencia, ejecutado solo por el dueño).

### Verify
```bash
grep -q '## Biblioteca técnica' README.md && test -f docs/ventanas/bt-v1.md && test -f .claude/rules/library.md
grep -q 'schema-library-private' CLAUDE.md && grep -q 'schema-library-private' AGENTS.md && grep -q 'schema-library-private' .claude/rules/database.md
pnpm format && pnpm gate
```

---

## E7-T3 — BT-24 Reporte final

**Archivos:** `docs/REPORTE-BIBLIOTECA.md`, `blueprints/vector-biblioteca/tasks.json` (estados). Lo escribe la coordinadora con evidencia real: salida de `pnpm gate`, conteo de pruebas, migraciones aplicadas, resultado de `library:check`, capturas descritas de las pantallas (tablet y escritorio, claro y oscuro), variables, riesgos y pasos hacia producción.
