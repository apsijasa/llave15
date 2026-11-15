# BT-14 · Central review and versioned publication

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-14 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E4-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E4-T2` de `blueprints/vector-biblioteca/epics/04-contribuciones.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; y como patrón y contrato: `src/server/library/proposals.ts`, `src/server/library/access.ts`, `src/server/library/content-pack.ts` (sha256), `src/server/library/search.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/review.ts`
- `src/server/library/publish.ts`
- `src/server/library/chunks.ts`
- `tests/integration/library-review.test.ts`
- `tests/integration/library-publish.test.ts`

## Criterios de aceptación

1. WHEN un usuario sin `canCurate` llama `reviewQueue` o `reviewProposal` THE SYSTEM SHALL devolver `forbidden` sin leer filas privadas
2. WHEN el curador decide `needs_changes` o `rejected` THE SYSTEM SHALL guardar `proposal_reviews` con motivo y cambiar el estado; `approved` deja `approved` sin publicar
3. WHEN `publishProposal` corre sobre una `approved` THE SYSTEM SHALL crear la versión siguiente del artículo (o el artículo), conservar la anterior íntegra, actualizar `current_version_id`, escribir `publication_events`, marcar la propuesta `published` con `published_version_id` y reindexar en la misma transacción
4. WHEN la indexación lanza THE SYSTEM SHALL dejar la propuesta `approved` y ninguna versión nueva
5. WHEN `archiveArticle` corre THE SYSTEM SHALL dejar el artículo `archivado`, sus trozos fuera de búsqueda y un evento `archive`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-review.test.ts tests/integration/library-publish.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
