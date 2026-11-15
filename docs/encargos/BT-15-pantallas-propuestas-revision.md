# BT-15 · Proposal and review screens; export

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-15 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E4-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E4-T3` de `blueprints/vector-biblioteca/epics/04-contribuciones.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; `.claude/rules/database.md` (scripts) y el patrón de `scripts/f2-check.ts`; y como patrón y contrato: `src/pages/taller/biblioteca/*.astro`, `src/server/library/proposals.ts`, `review.ts`, `publish.ts`, `content-pack.ts`, `scripts/library-import.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/biblioteca/propuestas/index.astro`
- `src/pages/taller/biblioteca/propuestas/nueva.astro`
- `src/pages/taller/biblioteca/propuestas/[id].astro`
- `src/pages/taller/biblioteca/revision/index.astro`
- `src/pages/taller/biblioteca/revision/[id].astro`
- `scripts/library-export.ts`
- `src/server/library/content-pack.ts`
- `package.json`
- `tests/integration/biblioteca-propuestas-page.test.ts`
- `tests/integration/biblioteca-revision-page.test.ts`
- `tests/integration/library-export.test.ts`

## Criterios de aceptación

1. WHEN un usuario abre `/taller/biblioteca/propuestas/nueva` THE SYSTEM SHALL mostrar formulario con tipo, título, contenido, fuente/evidencia y artículo o variante objetivo; el POST crea el borrador y redirige a `/[id]?hecho=creada`
2. WHEN abre `/taller/biblioteca/propuestas/[id]` THE SYSTEM SHALL mostrar estado, hallazgos de PII como aviso, acciones Enviar/Retirar/Editar según transición y las observaciones del curador
3. WHEN el curador abre `/taller/biblioteca/revision` THE SYSTEM SHALL ver la cola `submitted`/`in_review`/`approved` de todas las sucursales con solo título, tipo, fecha y marcas de PII (sin datos del taller); `/[id]` muestra el diff contra la versión vigente y botones Observaciones/Aprobar/Rechazar/Publicar
4. WHEN un usuario sin `canCurate` abre `/taller/biblioteca/revision` THE SYSTEM SHALL responder 403
5. WHEN corre `pnpm library:export` THE SYSTEM SHALL escribir un paquete válido con el contenido global publicado y ninguna fila privada

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/biblioteca-propuestas-page.test.ts tests/integration/biblioteca-revision-page.test.ts tests/integration/library-export.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
